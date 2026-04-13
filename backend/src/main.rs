mod auth;
mod error;
mod routes;
mod state;

use std::net::SocketAddr;
use std::path::PathBuf;

use axum::{response::Html, routing::get, Router};
use sqlx::SqlitePool;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tracing_subscriber::EnvFilter;
use uuid::Uuid;

async fn seed_admin(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role = 'admin'")
        .fetch_one(pool)
        .await?;
    if n > 0 {
        return Ok(());
    }
    let id = Uuid::new_v4().to_string();
    let hash = crate::auth::hash_password("Admin123!").expect("hash admin");
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, nickname, role, status, bio, wallpaper_url, created_at)
         VALUES (?, ?, ?, 'admin', 'admin', 'approved', 'Системный администратор', '', ?)",
    )
    .bind(&id)
    .bind("admin@edu.local")
    .bind(&hash)
    .bind(&now)
    .execute(pool)
    .await?;
    crate::routes::auth::seed_default_invites(pool, &id).await?;
    Ok(())
}

/// Собранный фронт: рядом с крейтом `../frontend/dist`, переменная `STATIC_DIR` или cwd.
fn resolve_static_dir() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("STATIC_DIR") {
        let pb = PathBuf::from(p);
        if pb.join("index.html").is_file() {
            return pb.canonicalize().ok().or(Some(pb));
        }
    }
    let beside = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../frontend/dist");
    if beside.join("index.html").is_file() {
        return beside.canonicalize().ok().or(Some(beside));
    }
    for rel in ["../frontend/dist", "frontend/dist", "edu-platform/frontend/dist"] {
        let pb = PathBuf::from(rel);
        if pb.join("index.html").is_file() {
            return pb.canonicalize().ok().or(Some(pb));
        }
    }
    None
}

async fn api_only_stub() -> Html<&'static str> {
    Html(
        r#"<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>EduSteam</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.5;background:#0c0e14;color:#e8ecf4}
    a{color:#5eead4} code{background:#1c2230;padding:.1rem .35rem;border-radius:4px}
  </style>
</head>
<body>
  <h1>Статика не собрана</h1>
  <p>Выполните из каталога <code>edu-platform/frontend</code>:</p>
  <pre style="background:#1c2230;padding:1rem;border-radius:8px">npm install && npm run build</pre>
  <p>Затем снова запустите бэкенд — интерфейс отдаётся с этого же процесса (порт см. лог).</p>
  <p><a href="/api/blog">/api/blog</a> (JSON)</p>
</body>
</html>"#,
    )
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    dotenvy::dotenv().ok();
    let db_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:edu.db?mode=rwc".into());
    let pool = SqlitePool::connect(&db_url).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;

    seed_admin(&pool).await?;

    let jwt_secret =
        std::env::var("JWT_SECRET").unwrap_or_else(|_| "dev-secret-change-me".into());
    let app_state = state::AppState { pool, jwt_secret };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api = routes::api_router();

    let app = if let Some(dir) = resolve_static_dir() {
        let index = dir.join("index.html");
        tracing::info!(path = %dir.display(), "serving SPA static files");
        let static_svc = ServeDir::new(&dir).not_found_service(ServeFile::new(index));
        Router::new()
            .merge(api)
            .fallback_service(static_svc)
            .layer(cors)
            .with_state(app_state)
    } else {
        tracing::warn!("frontend/dist not found — only API + stub at /");
        Router::new()
            .route("/", get(api_only_stub))
            .merge(api)
            .layer(cors)
            .with_state(app_state)
    };

    let preferred: u16 = std::env::var("PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(80);

    let (listener, bound_port) = bind_listener(preferred).await?;
    tracing::info!("listening on http://127.0.0.1:{bound_port} (http://localhost:{bound_port})");
    if bound_port != 80 {
        tracing::warn!(
            "чтобы открывался именно http://127.0.0.1/ без порта, нужен порт 80 (см. README в репозитории или cap_net_bind_service)"
        );
    }
    axum::serve(listener, app).await?;
    Ok(())
}

async fn bind_listener(preferred: u16) -> anyhow::Result<(tokio::net::TcpListener, u16)> {
    let fallbacks: &[u16] = match preferred {
        80 => &[80, 3000, 8080],
        p => &[p, 3000, 8080],
    };

    for &port in fallbacks {
        let addr = SocketAddr::from(([0, 0, 0, 0], port));
        match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => return Ok((l, port)),
            Err(e) if port == preferred => {
                if e.kind() == std::io::ErrorKind::PermissionDenied && port == 80 {
                    tracing::warn!(
                        "порт 80: отказано в доступе — запустите с правами или: sudo setcap 'cap_net_bind_service=+ep' target/debug/edu-platform-backend"
                    );
                } else if e.kind() == std::io::ErrorKind::AddrInUse {
                    tracing::warn!(port, "порт занят");
                } else {
                    tracing::warn!(port, error = %e, "bind failed");
                }
            }
            Err(e) => tracing::debug!(port, error = %e, "bind failed, try next"),
        }
    }
    anyhow::bail!("не удалось занять ни один из портов: {:?}", fallbacks);
}
