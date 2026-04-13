use axum::{
    extract::{Path, State},
    routing::get,
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
    pub favorite_course_ids: Vec<String>,
}

#[derive(Deserialize)]
pub struct UpdateProfileBody {
    pub bio: Option<String>,
    pub wallpaper_url: Option<String>,
    pub favorite_course_ids: Option<Vec<String>>,
}

#[derive(Serialize)]
pub struct PublicProfile {
    pub nickname: String,
    pub role: String,
    pub bio: String,
    pub wallpaper_url: String,
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
        .route("/api/me", get(me).patch(update_me))
        .route("/api/profile/:nickname", get(public_profile))
}

async fn me(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<MeResponse>> {
    let r = sqlx::query(
        "SELECT id, email, nickname, role, status, bio, wallpaper_url FROM users WHERE id = ?",
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
        "SELECT id, nickname, role, bio, wallpaper_url FROM users WHERE nickname = ? AND status = 'approved'",
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
        favorite_courses,
        achievements,
    }))
}
