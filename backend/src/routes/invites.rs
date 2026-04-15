use axum::{
    extract::State,
    routing::get,
    Json, Router,
};
use serde::Serialize;
use sqlx::Row;

use crate::{
    auth::AuthUser,
    error::AppResult,
    state::AppState,
};

#[derive(Serialize)]
pub struct InviteLinkDto {
    pub id: String,
    pub code: String,
    pub target_role: String,
    pub max_uses: i64,
    pub used_count: i64,
    pub remaining: i64,
    pub created_at: String,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/me/invites", get(list_my_invites))
}

async fn list_invites_inner(pool: &sqlx::SqlitePool, user_id: &str) -> AppResult<Vec<InviteLinkDto>> {
    let rows = sqlx::query(
        "SELECT id, code, target_role, max_uses, used_count, created_at FROM invite_links WHERE owner_user_id = ? ORDER BY created_at DESC",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let mut out = Vec::new();
    for r in rows {
        let max_uses: i64 = r.try_get("max_uses")?;
        let used: i64 = r.try_get("used_count")?;
        out.push(InviteLinkDto {
            id: r.try_get("id")?,
            code: r.try_get("code")?,
            target_role: r.try_get("target_role")?,
            max_uses,
            used_count: used,
            remaining: (max_uses - used).max(0),
            created_at: r.try_get("created_at")?,
        });
    }
    Ok(out)
}

async fn list_my_invites(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Vec<InviteLinkDto>>> {
    Ok(Json(list_invites_inner(&state.pool, &user.id).await?))
}
