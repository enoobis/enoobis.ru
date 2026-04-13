use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{AppError, AppResult},
    state::AppState,
};

#[derive(Serialize)]
pub struct BlogListItem {
    pub id: String,
    pub title: String,
    pub author_nickname: String,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct BlogPostDto {
    pub id: String,
    pub title: String,
    pub body: String,
    pub author_nickname: String,
    pub created_at: String,
}

pub fn public_router() -> Router<AppState> {
    Router::new()
        .route("/api/blog", get(list_posts).post(create_post))
        .route("/api/blog/:id", get(get_post))
}

#[derive(Deserialize)]
pub struct CreateBlogBody {
    pub title: String,
    pub body: String,
}

async fn create_post(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateBlogBody>,
) -> AppResult<Json<BlogPostDto>> {
    if user.status != "approved" {
        return Err(AppError::Forbidden);
    }
    if user.role != "teacher" && user.role != "admin" {
        return Err(AppError::Forbidden);
    }
    if body.title.trim().is_empty() {
        return Err(AppError::BadRequest("title required".into()));
    }

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO blog_posts (id, author_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&user.id)
    .bind(&body.title)
    .bind(&body.body)
    .bind(&now)
    .execute(&state.pool)
    .await?;

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM blog_posts WHERE author_id = ?")
        .bind(&user.id)
        .fetch_one(&state.pool)
        .await?;

    if count == 1 {
        let now2 = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, earned_at)
             SELECT ?, id, ? FROM achievements WHERE slug = 'author'",
        )
        .bind(&user.id)
        .bind(&now2)
        .execute(&state.pool)
        .await?;
    }

    let r = sqlx::query(
        "SELECT p.id, p.title, p.body, p.created_at, u.nickname as nn
         FROM blog_posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(BlogPostDto {
        id: r.try_get("id")?,
        title: r.try_get("title")?,
        body: r.try_get("body")?,
        author_nickname: r.try_get("nn")?,
        created_at: r.try_get("created_at")?,
    }))
}

async fn list_posts(State(state): State<AppState>) -> AppResult<Json<Vec<BlogListItem>>> {
    let rows = sqlx::query(
        "SELECT p.id as id, p.title as title, p.created_at as created_at, u.nickname as nn
         FROM blog_posts p JOIN users u ON u.id = p.author_id
         ORDER BY p.created_at DESC",
    )
    .fetch_all(&state.pool)
    .await?;

    let mut out = Vec::new();
    for r in rows {
        out.push(BlogListItem {
            id: r.try_get("id")?,
            title: r.try_get("title")?,
            author_nickname: r.try_get("nn")?,
            created_at: r.try_get("created_at")?,
        });
    }
    Ok(Json(out))
}

async fn get_post(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<BlogPostDto>> {
    let r = sqlx::query(
        "SELECT p.id, p.title, p.body, p.created_at, u.nickname as nn
         FROM blog_posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?;

    let r = r.ok_or(crate::error::AppError::NotFound)?;
    Ok(Json(BlogPostDto {
        id: r.try_get("id")?,
        title: r.try_get("title")?,
        body: r.try_get("body")?,
        author_nickname: r.try_get("nn")?,
        created_at: r.try_get("created_at")?,
    }))
}
