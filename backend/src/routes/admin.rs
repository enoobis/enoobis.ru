use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{AppError, AppResult},
    routes::auth::{grant_welcome_achievement, seed_default_invites},
    state::AppState,
};

#[derive(Serialize)]
pub struct PendingUser {
    pub id: String,
    pub email: String,
    pub nickname: String,
    pub role: String,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct AddInvitesBody {
    pub count: u32,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/admin/pending", get(list_pending))
        .route("/api/admin/users/:id/approve", post(approve))
        .route("/api/admin/users/:id/reject", post(reject))
        .route("/api/admin/users/:id/invites", post(add_invites_for_user))
}

fn require_admin(user: &AuthUser) -> AppResult<()> {
    if user.role != "admin" {
        return Err(AppError::Forbidden);
    }
    if user.status != "approved" {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

async fn list_pending(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Vec<PendingUser>>> {
    require_admin(&user)?;
    let rows = sqlx::query(
        "SELECT id, email, nickname, role, created_at FROM users WHERE status = 'pending' ORDER BY created_at",
    )
    .fetch_all(&state.pool)
    .await?;

    let mut out = Vec::new();
    for r in rows {
        out.push(PendingUser {
            id: r.try_get("id")?,
            email: r.try_get("email")?,
            nickname: r.try_get("nickname")?,
            role: r.try_get("role")?,
            created_at: r.try_get("created_at")?,
        });
    }
    Ok(Json(out))
}

async fn approve(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&user)?;
    let mut tx = state.pool.begin().await?;
    let n = sqlx::query("UPDATE users SET status = 'approved' WHERE id = ? AND status = 'pending'")
        .bind(&id)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    if n == 0 {
        tx.rollback().await.ok();
        return Err(AppError::NotFound);
    }

    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM invite_links WHERE owner_user_id = ?")
            .bind(&id)
            .fetch_one(&mut *tx)
            .await?;

    tx.commit().await?;

    if count == 0 {
        seed_default_invites(&state.pool, &id).await?;
    }
    grant_welcome_achievement(&state.pool, &id).await.ok();

    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn reject(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&user)?;
    let n = sqlx::query("UPDATE users SET status = 'rejected' WHERE id = ? AND status = 'pending'")
        .bind(&id)
        .execute(&state.pool)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn add_invites_for_user(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<AddInvitesBody>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&user)?;
    let c = body.count.min(50).max(1);
    let now = chrono::Utc::now().to_rfc3339();
    for _ in 0..c {
        let lid = Uuid::new_v4().to_string();
        let code = Uuid::new_v4().simple().to_string();
        sqlx::query(
            "INSERT INTO invite_links (id, code, owner_user_id, max_uses, used_count, created_at)
             VALUES (?, ?, ?, 1, 0, ?)",
        )
        .bind(&lid)
        .bind(&code)
        .bind(&id)
        .bind(&now)
        .execute(&state.pool)
        .await?;
    }
    Ok(Json(serde_json::json!({ "ok": true, "added": c })))
}
