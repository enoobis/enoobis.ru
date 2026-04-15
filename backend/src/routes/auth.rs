use axum::{
    extract::State,
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    auth::{hash_password, mint_token, verify_password},
    error::{AppError, AppResult},
    state::AppState,
};

#[derive(Deserialize)]
pub struct RegisterBody {
    pub email: String,
    pub password: String,
    pub nickname: String,
    #[serde(default)]
    pub invite_code: Option<String>,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserDto,
}

#[derive(Serialize)]
pub struct RegisterResponse {
    pub pending: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<UserDto>,
    pub message: Option<String>,
}

#[derive(Serialize)]
pub struct UserDto {
    pub id: String,
    pub email: String,
    pub nickname: String,
    pub role: String,
    pub status: String,
}

#[derive(Deserialize)]
pub struct LoginBody {
    pub email: String,
    pub password: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/register", post(register))
        .route("/api/login", post(login))
}

async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterBody>,
) -> AppResult<Json<RegisterResponse>> {
    if body.email.is_empty() || body.password.len() < 8 {
        return Err(AppError::BadRequest(
            "email required, password min 8 chars".into(),
        ));
    }
    if !is_valid_nickname(&body.nickname) {
        return Err(AppError::BadRequest(
            "nickname: 3-32 chars, letters, digits, underscore".into(),
        ));
    }

    let mut role = "student".to_string();

    let mut status = "pending";
    let mut tx = state.pool.begin().await?;

    if let Some(code) = body.invite_code.as_ref().map(|c| c.trim()).filter(|c| !c.is_empty()) {
        let row = sqlx::query(
            "SELECT id, max_uses, used_count, target_role FROM invite_links WHERE code = ?",
        )
        .bind(code)
        .fetch_optional(&mut *tx)
        .await?;

        if let Some(r) = row {
            let id: String = r.try_get("id")?;
            let max_uses: i64 = r.try_get("max_uses")?;
            let used: i64 = r.try_get("used_count")?;
            let invite_role: String = r.try_get("target_role")?;
            if used >= max_uses {
                return Err(AppError::BadRequest("invite exhausted".into()));
            }
            sqlx::query("UPDATE invite_links SET used_count = used_count + 1 WHERE id = ?")
                .bind(&id)
                .execute(&mut *tx)
                .await?;
            status = "approved";
            role = if invite_role == "teacher" {
                "teacher".into()
            } else {
                "student".into()
            };
        } else {
            return Err(AppError::BadRequest("invalid invite code".into()));
        }
    }

    let id = Uuid::new_v4().to_string();
    let hash = hash_password(&body.password)?;
    let now = chrono::Utc::now().to_rfc3339();

    let res = sqlx::query(
        "INSERT INTO users (id, email, password_hash, nickname, role, status, bio, wallpaper_url, avatar_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, '', '', '', ?)",
    )
    .bind(&id)
    .bind(&body.email)
    .bind(&hash)
    .bind(&body.nickname)
    .bind(&role)
    .bind(status)
    .bind(&now)
    .execute(&mut *tx)
    .await;

    if res.is_err() {
        tx.rollback().await.ok();
        return Err(AppError::Conflict("email or nickname taken".into()));
    }

    tx.commit().await?;

    if status == "approved" {
        seed_default_invites(&state.pool, &id).await?;
    }

    if status == "pending" {
        return Ok(Json(RegisterResponse {
            pending: true,
            token: None,
            user: None,
            message: Some("Ожидайте одобрения администратора".into()),
        }));
    }

    grant_welcome_achievement(&state.pool, &id).await.ok();

    let token = mint_token(&id, &role, &state.jwt_secret, 30)?;
    Ok(Json(RegisterResponse {
        pending: false,
        token: Some(token),
        user: Some(UserDto {
            id,
            email: body.email,
            nickname: body.nickname,
            role,
            status: "approved".into(),
        }),
        message: None,
    }))
}

async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginBody>,
) -> AppResult<Json<AuthResponse>> {
    let row = sqlx::query(
        "SELECT id, email, nickname, role, status, password_hash FROM users WHERE email = ?",
    )
    .bind(&body.email)
    .fetch_optional(&state.pool)
    .await?;

    let r = row.ok_or(AppError::Unauthorized)?;
    let id: String = r.try_get("id")?;
    let email: String = r.try_get("email")?;
    let nickname: String = r.try_get("nickname")?;
    let role: String = r.try_get("role")?;
    let status: String = r.try_get("status")?;
    let ph: String = r.try_get("password_hash")?;

    if !verify_password(&body.password, &ph)? {
        return Err(AppError::Unauthorized);
    }
    if status != "approved" {
        return Err(AppError::Forbidden);
    }

    let token = mint_token(&id, &role, &state.jwt_secret, 30)?;
    Ok(Json(AuthResponse {
        token,
        user: UserDto {
            id,
            email,
            nickname,
            role,
            status,
        },
    }))
}

fn is_valid_nickname(n: &str) -> bool {
    let len = n.chars().count();
    if !(3..=32).contains(&len) {
        return false;
    }
    n.chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_')
}

pub async fn seed_default_invites(pool: &sqlx::SqlitePool, user_id: &str) -> Result<(), sqlx::Error> {
    let now = chrono::Utc::now().to_rfc3339();
    for role in ["student", "teacher"] {
        let id = Uuid::new_v4().to_string();
        let code = Uuid::new_v4().simple().to_string();
        sqlx::query(
            "INSERT INTO invite_links (id, code, owner_user_id, target_role, max_uses, used_count, created_at)
             VALUES (?, ?, ?, ?, 1, 0, ?)",
        )
        .bind(&id)
        .bind(&code)
        .bind(user_id)
        .bind(role)
        .bind(&now)
        .execute(pool)
        .await?;
    }
    Ok(())
}

pub async fn grant_welcome_achievement(
    pool: &sqlx::SqlitePool,
    user_id: &str,
) -> Result<(), sqlx::Error> {
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, earned_at)
         SELECT ?, id, ? FROM achievements WHERE slug = 'welcome'",
    )
    .bind(user_id)
    .bind(&now)
    .execute(pool)
    .await?;
    Ok(())
}
