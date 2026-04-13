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
    state::AppState,
};

#[derive(Serialize)]
pub struct CourseDto {
    pub id: String,
    pub title: String,
    pub description: String,
    pub is_open: bool,
    pub teacher_id: String,
    pub teacher_nickname: String,
    pub created_at: String,
    pub enrolled: bool,
}

#[derive(Deserialize)]
pub struct CreateCourseBody {
    pub title: String,
    pub description: Option<String>,
    pub is_open: bool,
}

#[derive(Deserialize)]
pub struct PatchCourseBody {
    pub title: Option<String>,
    pub description: Option<String>,
    pub is_open: Option<bool>,
}

#[derive(Deserialize)]
pub struct SetStudentsBody {
    pub student_ids: Vec<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/courses", get(list_courses).post(create_course))
        .route(
            "/api/courses/:id",
            get(get_course).patch(patch_course).delete(delete_course),
        )
        .route("/api/courses/:id/enroll", post(enroll).delete(unenroll))
        .route("/api/courses/:id/students", post(set_closed_students))
}

fn require_approved(user: &AuthUser) -> AppResult<()> {
    if user.status != "approved" {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

async fn list_courses(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Vec<CourseDto>>> {
    require_approved(&user)?;
    let rows = sqlx::query(
        "SELECT c.id, c.title, c.description, c.is_open, c.teacher_id, c.created_at, u.nickname as tn
         FROM courses c JOIN users u ON u.id = c.teacher_id",
    )
    .fetch_all(&state.pool)
    .await?;

    let enrolled_ids: Vec<(String,)> =
        sqlx::query_as("SELECT course_id FROM course_students WHERE student_id = ?")
            .bind(&user.id)
            .fetch_all(&state.pool)
            .await?;

    let enrolled_set: std::collections::HashSet<String> =
        enrolled_ids.into_iter().map(|t| t.0).collect();

    let mut out = Vec::new();
    for r in rows {
        let id: String = r.try_get("id")?;
        let teacher_id: String = r.try_get("teacher_id")?;
        let is_open: i64 = r.try_get("is_open")?;
        let open = is_open != 0;

        let visible = open
            || teacher_id == user.id
            || enrolled_set.contains(&id);
        if !visible {
            continue;
        }

        let enrolled = teacher_id == user.id || enrolled_set.contains(&id);
        out.push(CourseDto {
            id: id.clone(),
            title: r.try_get("title")?,
            description: r.try_get("description")?,
            is_open: open,
            teacher_id: teacher_id.clone(),
            teacher_nickname: r.try_get("tn")?,
            created_at: r.try_get("created_at")?,
            enrolled,
        });
    }
    Ok(Json(out))
}

async fn get_course(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<CourseDto>> {
    require_approved(&user)?;
    let r = sqlx::query(
        "SELECT c.id, c.title, c.description, c.is_open, c.teacher_id, c.created_at, u.nickname as tn
         FROM courses c JOIN users u ON u.id = c.teacher_id WHERE c.id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?;

    let r = r.ok_or(AppError::NotFound)?;
    let teacher_id: String = r.try_get("teacher_id")?;
    let is_open: i64 = r.try_get("is_open")?;
    let open = is_open != 0;

    let en: Option<(String,)> =
        sqlx::query_as("SELECT student_id FROM course_students WHERE course_id = ? AND student_id = ?")
            .bind(&id)
            .bind(&user.id)
            .fetch_optional(&state.pool)
            .await?;

    let visible = open || teacher_id == user.id || en.is_some();
    if !visible {
        return Err(AppError::NotFound);
    }

    Ok(Json(CourseDto {
        id: r.try_get("id")?,
        title: r.try_get("title")?,
        description: r.try_get("description")?,
        is_open: open,
        teacher_id: teacher_id.clone(),
        teacher_nickname: r.try_get("tn")?,
        created_at: r.try_get("created_at")?,
        enrolled: teacher_id == user.id || en.is_some(),
    }))
}

async fn create_course(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateCourseBody>,
) -> AppResult<Json<CourseDto>> {
    require_approved(&user)?;
    if user.role != "teacher" && user.role != "admin" {
        return Err(AppError::Forbidden);
    }
    if body.title.trim().is_empty() {
        return Err(AppError::BadRequest("title required".into()));
    }
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let desc = body.description.clone().unwrap_or_default();
    let is_open = if body.is_open { 1 } else { 0 };

    sqlx::query(
        "INSERT INTO courses (id, teacher_id, title, description, is_open, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&user.id)
    .bind(&body.title)
    .bind(&desc)
    .bind(is_open)
    .bind(&now)
    .execute(&state.pool)
    .await?;

    let r = sqlx::query(
        "SELECT c.id, c.title, c.description, c.is_open, c.teacher_id, c.created_at, u.nickname as tn
         FROM courses c JOIN users u ON u.id = c.teacher_id WHERE c.id = ?",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await?;

    let is_open: i64 = r.try_get("is_open")?;
    Ok(Json(CourseDto {
        id: r.try_get("id")?,
        title: r.try_get("title")?,
        description: r.try_get("description")?,
        is_open: is_open != 0,
        teacher_id: r.try_get("teacher_id")?,
        teacher_nickname: r.try_get("tn")?,
        created_at: r.try_get("created_at")?,
        enrolled: true,
    }))
}

async fn patch_course(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<PatchCourseBody>,
) -> AppResult<Json<CourseDto>> {
    require_approved(&user)?;
    let tid: String = sqlx::query_scalar("SELECT teacher_id FROM courses WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;

    if tid != user.id && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    if let Some(t) = &body.title {
        sqlx::query("UPDATE courses SET title = ? WHERE id = ?")
            .bind(t)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(d) = &body.description {
        sqlx::query("UPDATE courses SET description = ? WHERE id = ?")
            .bind(d)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(io) = body.is_open {
        sqlx::query("UPDATE courses SET is_open = ? WHERE id = ?")
            .bind(if io { 1 } else { 0 })
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    get_course(State(state), user, Path(id)).await
}

async fn delete_course(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_approved(&user)?;
    let tid: String = sqlx::query_scalar("SELECT teacher_id FROM courses WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;

    if tid != user.id && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    sqlx::query("DELETE FROM courses WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn enroll(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_approved(&user)?;
    let (is_open, teacher_id): (i64, String) =
        sqlx::query_as("SELECT is_open, teacher_id FROM courses WHERE id = ?")
            .bind(&id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or(AppError::NotFound)?;

    if teacher_id == user.id {
        return Ok(Json(serde_json::json!({ "ok": true })));
    }

    if is_open == 0 {
        return Err(AppError::BadRequest(
            "closed course: teacher must add you".into(),
        ));
    }

    sqlx::query(
        "INSERT OR IGNORE INTO course_students (course_id, student_id) VALUES (?, ?)",
    )
    .bind(&id)
    .bind(&user.id)
    .execute(&state.pool)
    .await?;

    grant_scholar_if_first(&state.pool, &user.id).await.ok();

    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn grant_scholar_if_first(pool: &sqlx::SqlitePool, user_id: &str) -> Result<(), sqlx::Error> {
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM course_students WHERE student_id = ?")
        .bind(user_id)
        .fetch_one(pool)
        .await?;

    if n == 1 {
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, earned_at)
             SELECT ?, id, ? FROM achievements WHERE slug = 'scholar'",
        )
        .bind(user_id)
        .bind(&now)
        .execute(pool)
        .await?;
    }
    Ok(())
}

async fn unenroll(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_approved(&user)?;
    sqlx::query("DELETE FROM course_students WHERE course_id = ? AND student_id = ?")
        .bind(&id)
        .bind(&user.id)
        .execute(&state.pool)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn set_closed_students(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<SetStudentsBody>,
) -> AppResult<Json<serde_json::Value>> {
    require_approved(&user)?;
    let (is_open, teacher_id): (i64, String) =
        sqlx::query_as("SELECT is_open, teacher_id FROM courses WHERE id = ?")
            .bind(&id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or(AppError::NotFound)?;

    if teacher_id != user.id && user.role != "admin" {
        return Err(AppError::Forbidden);
    }
    if is_open != 0 {
        return Err(AppError::BadRequest(
            "only for closed courses".into(),
        ));
    }

    let mut tx = state.pool.begin().await?;
    sqlx::query("DELETE FROM course_students WHERE course_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;

    for sid in &body.student_ids {
        let ok: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM users WHERE id = ? AND status = 'approved' AND role IN ('student','teacher')",
        )
        .bind(sid)
        .fetch_optional(&mut *tx)
        .await?;
        if ok.is_some() {
            sqlx::query(
                "INSERT OR IGNORE INTO course_students (course_id, student_id) VALUES (?, ?)",
            )
            .bind(&id)
            .bind(sid)
            .execute(&mut *tx)
            .await?;
        }
    }
    tx.commit().await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}
