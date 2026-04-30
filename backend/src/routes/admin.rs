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

#[derive(Serialize)]
pub struct AdminUserRow {
    pub id: String,
    pub email: String,
    pub nickname: String,
    pub role: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct AddInvitesBody {
    pub count: u32,
    pub target_role: Option<String>,
}

#[derive(Deserialize)]
pub struct SetUserRoleBody {
    pub role: String,
}

#[derive(Deserialize)]
pub struct ResolveReportBody {
    pub status: String,
}

#[derive(Serialize)]
pub struct BlogReportDto {
    pub id: String,
    pub target_type: String,
    pub target_post_id: Option<String>,
    pub target_comment_id: Option<String>,
    pub reporter_user_id: String,
    pub reason: String,
    pub status: String,
    pub created_at: String,
    pub resolved_at: Option<String>,
    pub resolved_by: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/admin/pending", get(list_pending))
        .route("/api/admin/users", get(list_users))
        .route("/api/admin/users/:id/approve", post(approve))
        .route("/api/admin/users/:id/reject", post(reject))
        .route("/api/admin/users/:id/invites", post(add_invites_for_user))
        .route("/api/admin/users/:id/role", post(set_user_role))
        .route("/api/admin/blog/reports", get(list_blog_reports))
        .route("/api/admin/blog/reports/:id/resolve", post(resolve_blog_report))
        .route("/api/admin/blog/posts/:id/hide", post(hide_post))
        .route("/api/admin/blog/comments/:id/hide", post(hide_comment))
        .route("/api/admin/blog/comments/:id/restore", post(restore_comment))
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

async fn list_users(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Vec<AdminUserRow>>> {
    require_admin(&user)?;
    let rows = sqlx::query(
        "SELECT id, email, nickname, role, status, created_at
         FROM users
         ORDER BY
           CASE role WHEN 'admin' THEN 0 WHEN 'teacher' THEN 1 ELSE 2 END,
           created_at DESC
         LIMIT 1000",
    )
    .fetch_all(&state.pool)
    .await?;

    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        out.push(AdminUserRow {
            id: r.try_get("id")?,
            email: r.try_get("email")?,
            nickname: r.try_get("nickname")?,
            role: r.try_get("role")?,
            status: r.try_get("status")?,
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
    let target_role = match body.target_role.as_deref() {
        Some("teacher") => "teacher",
        _ => "student",
    };
    let now = chrono::Utc::now().to_rfc3339();
    for _ in 0..c {
        let lid = Uuid::new_v4().to_string();
        let code = Uuid::new_v4().simple().to_string();
        sqlx::query(
            "INSERT INTO invite_links (id, code, owner_user_id, target_role, max_uses, used_count, created_at)
             VALUES (?, ?, ?, ?, 1, 0, ?)",
        )
        .bind(&lid)
        .bind(&code)
        .bind(&id)
        .bind(target_role)
        .bind(&now)
        .execute(&state.pool)
        .await?;
    }
    Ok(Json(serde_json::json!({ "ok": true, "added": c, "target_role": target_role })))
}

async fn set_user_role(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<SetUserRoleBody>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&user)?;
    let role = match body.role.as_str() {
        "teacher" => "teacher",
        "student" => "student",
        _ => return Err(AppError::BadRequest("role must be student or teacher".into())),
    };
    let n = sqlx::query("UPDATE users SET role = ? WHERE id = ? AND role != 'admin'")
        .bind(role)
        .bind(&id)
        .execute(&state.pool)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true, "role": role })))
}

async fn list_blog_reports(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Vec<BlogReportDto>>> {
    require_admin(&user)?;
    let rows = sqlx::query(
        "SELECT id, target_type, target_post_id, target_comment_id, reporter_user_id, reason, status, created_at, resolved_at, resolved_by
         FROM blog_reports
         ORDER BY
           CASE status WHEN 'open' THEN 0 ELSE 1 END,
           created_at DESC
         LIMIT 300",
    )
    .fetch_all(&state.pool)
    .await?;
    let mut out = Vec::new();
    for r in rows {
        out.push(BlogReportDto {
            id: r.try_get("id")?,
            target_type: r.try_get("target_type")?,
            target_post_id: r.try_get("target_post_id")?,
            target_comment_id: r.try_get("target_comment_id")?,
            reporter_user_id: r.try_get("reporter_user_id")?,
            reason: r.try_get("reason")?,
            status: r.try_get("status")?,
            created_at: r.try_get("created_at")?,
            resolved_at: r.try_get("resolved_at")?,
            resolved_by: r.try_get("resolved_by")?,
        });
    }
    Ok(Json(out))
}

async fn resolve_blog_report(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<ResolveReportBody>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&user)?;
    let status = body.status.trim().to_lowercase();
    if status != "resolved" && status != "dismissed" {
        return Err(AppError::BadRequest(
            "status must be resolved or dismissed".into(),
        ));
    }
    let now = chrono::Utc::now().to_rfc3339();
    let n = sqlx::query(
        "UPDATE blog_reports
         SET status = ?, resolved_at = ?, resolved_by = ?
         WHERE id = ?",
    )
    .bind(&status)
    .bind(&now)
    .bind(&user.id)
    .bind(&id)
    .execute(&state.pool)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn hide_post(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&user)?;
    let now = chrono::Utc::now().to_rfc3339();
    let n = sqlx::query(
        "UPDATE blog_posts
         SET is_deleted = 1, status = 'archived', updated_at = ?
         WHERE id = ?",
    )
    .bind(&now)
    .bind(&id)
    .execute(&state.pool)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn hide_comment(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&user)?;
    let n = sqlx::query("UPDATE blog_comments SET status = 'hidden' WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn restore_comment(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&user)?;
    let n = sqlx::query("UPDATE blog_comments SET status = 'visible' WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}
