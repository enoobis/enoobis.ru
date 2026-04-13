use std::path::PathBuf;

use axum::{
    extract::{DefaultBodyLimit, Multipart, Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::{
    auth::AuthUser,
    error::{AppError, AppResult},
    state::AppState,
};

#[derive(Serialize)]
pub struct MeResponse {
    pub id: String,
    pub email: String,
    pub nickname: String,
    pub role: String,
    pub status: String,
    pub bio: String,
    pub wallpaper_url: String,
    pub avatar_url: String,
    pub favorite_course_ids: Vec<String>,
}

#[derive(Deserialize)]
pub struct UpdateProfileBody {
    pub bio: Option<String>,
    pub wallpaper_url: Option<String>,
    /// Внешний URL аватара; пустая строка — сброс (в т.ч. удаление загруженного файла).
    pub avatar_url: Option<String>,
    pub favorite_course_ids: Option<Vec<String>>,
}

#[derive(Serialize)]
pub struct PublicProfile {
    pub nickname: String,
    pub role: String,
    pub bio: String,
    pub wallpaper_url: String,
    pub avatar_url: String,
    pub favorite_courses: Vec<FavoriteCourseDto>,
    pub achievements: Vec<AchievementDto>,
}

#[derive(Serialize)]
pub struct FavoriteCourseDto {
    pub id: String,
    pub title: String,
}

#[derive(Serialize)]
pub struct AchievementDto {
    pub slug: String,
    pub name: String,
    pub description: String,
    pub icon_url: String,
    pub earned_at: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/me/avatar",
            post(upload_avatar).layer(DefaultBodyLimit::max(3 * 1024 * 1024)),
        )
        .route("/api/me", get(me).patch(update_me))
        .route("/api/profile/:nickname", get(public_profile))
}

fn sniff_image_ext(buf: &[u8]) -> Result<&'static str, AppError> {
    if buf.len() < 12 {
        return Err(AppError::BadRequest("file too small".into()));
    }
    if buf.starts_with(&[0xff, 0xd8, 0xff]) {
        return Ok("jpg");
    }
    if buf.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Ok("png");
    }
    if buf.starts_with(b"GIF87a") || buf.starts_with(b"GIF89a") {
        return Ok("gif");
    }
    if &buf[0..4] == b"RIFF" && buf.len() >= 12 && &buf[8..12] == b"WEBP" {
        return Ok("webp");
    }
    Err(AppError::BadRequest(
        "allowed: JPEG, PNG, GIF, WebP".into(),
    ))
}

fn avatars_dir(state: &AppState) -> PathBuf {
    state.uploads_serve_root.join("avatars")
}

fn remove_uploaded_avatars_for_user(state: &AppState, user_id: &str) {
    let dir = avatars_dir(state);
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with(user_id) && name.contains('.') {
            let _ = std::fs::remove_file(e.path());
        }
    }
}

async fn upload_avatar(
    State(state): State<AppState>,
    user: AuthUser,
    mut multipart: Multipart,
) -> AppResult<Json<serde_json::Value>> {
    let mut file_bytes: Option<Vec<u8>> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("");
        if name != "file" && name != "avatar" {
            continue;
        }
        let data = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(e.to_string()))?;
        if data.len() > 2_000_000 {
            return Err(AppError::BadRequest("max 2 MB".into()));
        }
        file_bytes = Some(data.to_vec());
        break;
    }
    let buf = file_bytes.ok_or_else(|| AppError::BadRequest("missing file field (file or avatar)".into()))?;

    let ext = sniff_image_ext(&buf)?;
    remove_uploaded_avatars_for_user(&state, &user.id);

    let dir = avatars_dir(&state);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::BadRequest(format!("mkdir: {e}")))?;

    let filename = format!("{}.{}", user.id, ext);
    let disk_path = dir.join(&filename);
    tokio::fs::write(&disk_path, &buf)
        .await
        .map_err(|e| AppError::BadRequest(format!("write: {e}")))?;

    let public_path = format!("/uploads/avatars/{filename}");
    sqlx::query("UPDATE users SET avatar_url = ? WHERE id = ?")
        .bind(&public_path)
        .bind(&user.id)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({ "avatar_url": public_path })))
}

async fn me(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<MeResponse>> {
    let r = sqlx::query(
        "SELECT id, email, nickname, role, status, bio, wallpaper_url, avatar_url FROM users WHERE id = ?",
    )
    .bind(&user.id)
    .fetch_one(&state.pool)
    .await?;

    let favs: Vec<(String,)> =
        sqlx::query_as("SELECT course_id FROM user_favorite_courses WHERE user_id = ?")
            .bind(&user.id)
            .fetch_all(&state.pool)
            .await?;

    Ok(Json(MeResponse {
        id: r.try_get("id")?,
        email: r.try_get("email")?,
        nickname: r.try_get("nickname")?,
        role: r.try_get("role")?,
        status: r.try_get("status")?,
        bio: r.try_get("bio")?,
        wallpaper_url: r.try_get("wallpaper_url")?,
        avatar_url: r.try_get("avatar_url")?,
        favorite_course_ids: favs.into_iter().map(|t| t.0).collect(),
    }))
}

async fn update_me(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<UpdateProfileBody>,
) -> AppResult<Json<MeResponse>> {
    if let Some(bio) = &body.bio {
        let b: String = bio.chars().take(2000).collect();
        sqlx::query("UPDATE users SET bio = ? WHERE id = ?")
            .bind(&b)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(w) = &body.wallpaper_url {
        let w: String = w.chars().take(500).collect();
        sqlx::query("UPDATE users SET wallpaper_url = ? WHERE id = ?")
            .bind(&w)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(a) = &body.avatar_url {
        let a = a.chars().take(500).collect::<String>();
        if a.is_empty() {
            remove_uploaded_avatars_for_user(&state, &user.id);
            sqlx::query("UPDATE users SET avatar_url = '' WHERE id = ?")
                .bind(&user.id)
                .execute(&state.pool)
                .await?;
        } else {
            remove_uploaded_avatars_for_user(&state, &user.id);
            sqlx::query("UPDATE users SET avatar_url = ? WHERE id = ?")
                .bind(&a)
                .bind(&user.id)
                .execute(&state.pool)
                .await?;
        }
    }
    if let Some(ids) = &body.favorite_course_ids {
        let mut tx = state.pool.begin().await?;
        sqlx::query("DELETE FROM user_favorite_courses WHERE user_id = ?")
            .bind(&user.id)
            .execute(&mut *tx)
            .await?;
        for cid in ids.iter().take(12) {
            let ok: Option<(String,)> = sqlx::query_as("SELECT id FROM courses WHERE id = ?")
                .bind(cid)
                .fetch_optional(&mut *tx)
                .await?;
            if ok.is_some() {
                sqlx::query(
                    "INSERT OR IGNORE INTO user_favorite_courses (user_id, course_id) VALUES (?, ?)",
                )
                .bind(&user.id)
                .bind(cid)
                .execute(&mut *tx)
                .await?;
            }
        }
        tx.commit().await?;
    }

    me(State(state), user).await
}

async fn public_profile(
    State(state): State<AppState>,
    Path(nickname): Path<String>,
) -> AppResult<Json<PublicProfile>> {
    let r = sqlx::query(
        "SELECT id, nickname, role, bio, wallpaper_url, avatar_url FROM users WHERE nickname = ? AND status = 'approved'",
    )
    .bind(&nickname)
    .fetch_optional(&state.pool)
    .await?;

    let r = r.ok_or(AppError::NotFound)?;
    let uid: String = r.try_get("id")?;

    let fav_rows = sqlx::query(
        "SELECT c.id, c.title FROM user_favorite_courses f
         JOIN courses c ON c.id = f.course_id WHERE f.user_id = ?",
    )
    .bind(&uid)
    .fetch_all(&state.pool)
    .await?;

    let mut favorite_courses = Vec::new();
    for fr in fav_rows {
        favorite_courses.push(FavoriteCourseDto {
            id: fr.try_get("id")?,
            title: fr.try_get("title")?,
        });
    }

    let ach_rows = sqlx::query(
        "SELECT a.slug, a.name, a.description, a.icon_url, ua.earned_at
         FROM user_achievements ua
         JOIN achievements a ON a.id = ua.achievement_id
         WHERE ua.user_id = ? ORDER BY ua.earned_at DESC",
    )
    .bind(&uid)
    .fetch_all(&state.pool)
    .await?;

    let mut achievements = Vec::new();
    for ar in ach_rows {
        achievements.push(AchievementDto {
            slug: ar.try_get("slug")?,
            name: ar.try_get("name")?,
            description: ar.try_get("description")?,
            icon_url: ar.try_get("icon_url")?,
            earned_at: ar.try_get("earned_at")?,
        });
    }

    Ok(Json(PublicProfile {
        nickname: r.try_get("nickname")?,
        role: r.try_get("role")?,
        bio: r.try_get("bio")?,
        wallpaper_url: r.try_get("wallpaper_url")?,
        avatar_url: r.try_get("avatar_url")?,
        favorite_courses,
        achievements,
    }))
}
