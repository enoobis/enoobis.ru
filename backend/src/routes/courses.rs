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

#[derive(Serialize, Clone)]
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

#[derive(Serialize)]
pub struct CourseMemberDto {
    pub id: String,
    pub nickname: String,
    pub role: String,
}

#[derive(Serialize)]
pub struct CourseStreamPostDto {
    pub id: String,
    pub course_id: String,
    pub author_id: String,
    pub author_nickname: String,
    pub body: String,
    pub created_at: String,
}

#[derive(Serialize, Clone)]
pub struct AssignmentSubmissionMineDto {
    pub id: String,
    pub content: String,
    pub status: String,
    pub grade_points: Option<i64>,
    pub teacher_comment: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct AssignmentDto {
    pub id: String,
    pub course_id: String,
    pub author_id: String,
    pub author_nickname: String,
    pub title: String,
    pub description: String,
    pub due_at: String,
    pub max_points: i64,
    pub created_at: String,
    pub my_submission: Option<AssignmentSubmissionMineDto>,
}

#[derive(Serialize)]
pub struct AssignmentSubmissionDto {
    pub id: String,
    pub assignment_id: String,
    pub student_id: String,
    pub student_nickname: String,
    pub content: String,
    pub status: String,
    pub grade_points: Option<i64>,
    pub teacher_comment: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct CourseClassroomDto {
    pub course: CourseDto,
    pub is_teacher: bool,
    pub stream: Vec<CourseStreamPostDto>,
    pub assignments: Vec<AssignmentDto>,
    pub members: Vec<CourseMemberDto>,
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

#[derive(Deserialize)]
pub struct CreateStreamPostBody {
    pub body: String,
}

#[derive(Deserialize)]
pub struct CreateAssignmentBody {
    pub title: String,
    pub description: Option<String>,
    pub due_at: Option<String>,
    pub max_points: Option<i64>,
}

#[derive(Deserialize)]
pub struct SubmitAssignmentBody {
    pub content: String,
}

#[derive(Deserialize)]
pub struct GradeSubmissionBody {
    pub grade_points: i64,
    pub teacher_comment: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/courses", get(list_courses).post(create_course))
        .route(
            "/api/courses/:id",
            get(get_course).patch(patch_course).delete(delete_course),
        )
        .route("/api/courses/:id/classroom", get(get_classroom))
        .route("/api/courses/:id/stream", post(create_stream_post))
        .route("/api/courses/:id/assignments", post(create_assignment))
        .route(
            "/api/courses/:id/assignments/:assignment_id/submit",
            post(submit_assignment),
        )
        .route(
            "/api/courses/:id/assignments/:assignment_id/submissions",
            get(list_assignment_submissions),
        )
        .route(
            "/api/courses/:id/assignments/:assignment_id/submissions/:submission_id/grade",
            post(grade_submission),
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

async fn load_course_access(
    state: &AppState,
    user: &AuthUser,
    course_id: &str,
) -> AppResult<(CourseDto, bool)> {
    let r = sqlx::query(
        "SELECT c.id, c.title, c.description, c.is_open, c.teacher_id, c.created_at, u.nickname as tn
         FROM courses c JOIN users u ON u.id = c.teacher_id WHERE c.id = ?",
    )
    .bind(course_id)
    .fetch_optional(&state.pool)
    .await?;
    let r = r.ok_or(AppError::NotFound)?;

    let teacher_id: String = r.try_get("teacher_id")?;
    let is_open: i64 = r.try_get("is_open")?;
    let open = is_open != 0;

    let en: Option<(String,)> =
        sqlx::query_as("SELECT student_id FROM course_students WHERE course_id = ? AND student_id = ?")
            .bind(course_id)
            .bind(&user.id)
            .fetch_optional(&state.pool)
            .await?;

    let enrolled = teacher_id == user.id || en.is_some();
    let visible = open || enrolled;
    if !visible {
        return Err(AppError::NotFound);
    }

    Ok((
        CourseDto {
            id: r.try_get("id")?,
            title: r.try_get("title")?,
            description: r.try_get("description")?,
            is_open: open,
            teacher_id: teacher_id.clone(),
            teacher_nickname: r.try_get("tn")?,
            created_at: r.try_get("created_at")?,
            enrolled,
        },
        teacher_id == user.id || user.role == "admin",
    ))
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

    let enrolled_set: std::collections::HashSet<String> = enrolled_ids.into_iter().map(|t| t.0).collect();
    let mut out = Vec::new();
    for r in rows {
        let id: String = r.try_get("id")?;
        let teacher_id: String = r.try_get("teacher_id")?;
        let is_open: i64 = r.try_get("is_open")?;
        let open = is_open != 0;
        let visible = open || teacher_id == user.id || enrolled_set.contains(&id);
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
    let (course, _) = load_course_access(&state, &user, &id).await?;
    Ok(Json(course))
}

async fn get_classroom(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<CourseClassroomDto>> {
    require_approved(&user)?;
    let (course, is_teacher) = load_course_access(&state, &user, &id).await?;

    let stream_rows = sqlx::query(
        "SELECT s.id, s.course_id, s.author_id, u.nickname as author_nickname, s.body, s.created_at
         FROM course_stream_posts s
         JOIN users u ON u.id = s.author_id
         WHERE s.course_id = ?
         ORDER BY s.created_at DESC
         LIMIT 200",
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    let mut stream = Vec::new();
    for r in stream_rows {
        stream.push(CourseStreamPostDto {
            id: r.try_get("id")?,
            course_id: r.try_get("course_id")?,
            author_id: r.try_get("author_id")?,
            author_nickname: r.try_get("author_nickname")?,
            body: r.try_get("body")?,
            created_at: r.try_get("created_at")?,
        });
    }

    let assignment_rows = sqlx::query(
        "SELECT a.id, a.course_id, a.author_id, u.nickname as author_nickname, a.title, a.description, a.due_at, a.max_points, a.created_at
         FROM course_assignments a
         JOIN users u ON u.id = a.author_id
         WHERE a.course_id = ?
         ORDER BY a.created_at DESC",
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    let mut assignments = Vec::new();
    for r in assignment_rows {
        let assignment_id: String = r.try_get("id")?;
        let my_submission_row = sqlx::query(
            "SELECT id, content, status, grade_points, teacher_comment, created_at, updated_at
             FROM course_assignment_submissions
             WHERE assignment_id = ? AND student_id = ?",
        )
        .bind(&assignment_id)
        .bind(&user.id)
        .fetch_optional(&state.pool)
        .await?;

        let my_submission = my_submission_row.map(|s| AssignmentSubmissionMineDto {
            id: s.try_get("id").unwrap_or_default(),
            content: s.try_get("content").unwrap_or_default(),
            status: s.try_get("status").unwrap_or_else(|_| "submitted".to_string()),
            grade_points: s.try_get("grade_points").ok(),
            teacher_comment: s.try_get("teacher_comment").unwrap_or_default(),
            created_at: s.try_get("created_at").unwrap_or_default(),
            updated_at: s.try_get("updated_at").unwrap_or_default(),
        });

        assignments.push(AssignmentDto {
            id: assignment_id,
            course_id: r.try_get("course_id")?,
            author_id: r.try_get("author_id")?,
            author_nickname: r.try_get("author_nickname")?,
            title: r.try_get("title")?,
            description: r.try_get("description")?,
            due_at: r.try_get("due_at")?,
            max_points: r.try_get("max_points")?,
            created_at: r.try_get("created_at")?,
            my_submission,
        });
    }

    let member_rows = sqlx::query(
        "SELECT u.id, u.nickname, u.role
         FROM course_students cs
         JOIN users u ON u.id = cs.student_id
         WHERE cs.course_id = ?
         ORDER BY u.nickname ASC",
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    let mut members = Vec::new();
    members.push(CourseMemberDto {
        id: course.teacher_id.clone(),
        nickname: course.teacher_nickname.clone(),
        role: "teacher".to_string(),
    });
    for r in member_rows {
        members.push(CourseMemberDto {
            id: r.try_get("id")?,
            nickname: r.try_get("nickname")?,
            role: r.try_get("role")?,
        });
    }

    Ok(Json(CourseClassroomDto {
        course,
        is_teacher,
        stream,
        assignments,
        members,
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

    let (course, _) = load_course_access(&state, &user, &id).await?;
    Ok(Json(course))
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
    let (course, _) = load_course_access(&state, &user, &id).await?;
    Ok(Json(course))
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
        return Err(AppError::BadRequest("closed course: teacher must add you".into()));
    }
    sqlx::query("INSERT OR IGNORE INTO course_students (course_id, student_id) VALUES (?, ?)")
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
        return Err(AppError::BadRequest("only for closed courses".into()));
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
            sqlx::query("INSERT OR IGNORE INTO course_students (course_id, student_id) VALUES (?, ?)")
                .bind(&id)
                .bind(sid)
                .execute(&mut *tx)
                .await?;
        }
    }
    tx.commit().await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn create_stream_post(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<CreateStreamPostBody>,
) -> AppResult<Json<CourseStreamPostDto>> {
    require_approved(&user)?;
    let (course, _is_teacher) = load_course_access(&state, &user, &id).await?;
    if !course.enrolled {
        return Err(AppError::Forbidden);
    }
    let text = body.body.trim();
    if text.is_empty() {
        return Err(AppError::BadRequest("post body required".into()));
    }
    let post_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO course_stream_posts (id, course_id, author_id, body, created_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&post_id)
    .bind(&id)
    .bind(&user.id)
    .bind(text)
    .bind(&now)
    .execute(&state.pool)
    .await?;
    let author_nickname: String = sqlx::query_scalar("SELECT nickname FROM users WHERE id = ?")
        .bind(&user.id)
        .fetch_optional(&state.pool)
        .await?
        .unwrap_or_default();
    Ok(Json(CourseStreamPostDto {
        id: post_id,
        course_id: id,
        author_id: user.id,
        author_nickname,
        body: text.to_string(),
        created_at: now,
    }))
}

async fn create_assignment(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<CreateAssignmentBody>,
) -> AppResult<Json<AssignmentDto>> {
    require_approved(&user)?;
    let (_course, is_teacher) = load_course_access(&state, &user, &id).await?;
    if !is_teacher {
        return Err(AppError::Forbidden);
    }
    let title = body.title.trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("title required".into()));
    }
    let description = body.description.unwrap_or_default();
    let due_at = body.due_at.unwrap_or_default();
    let max_points = body.max_points.unwrap_or(100).clamp(1, 1000);
    let assignment_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO course_assignments (id, course_id, author_id, title, description, due_at, max_points, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&assignment_id)
    .bind(&id)
    .bind(&user.id)
    .bind(title)
    .bind(&description)
    .bind(&due_at)
    .bind(max_points)
    .bind(&now)
    .execute(&state.pool)
    .await?;
    let author_nickname: String = sqlx::query_scalar("SELECT nickname FROM users WHERE id = ?")
        .bind(&user.id)
        .fetch_optional(&state.pool)
        .await?
        .unwrap_or_default();
    Ok(Json(AssignmentDto {
        id: assignment_id,
        course_id: id,
        author_id: user.id,
        author_nickname,
        title: title.to_string(),
        description,
        due_at,
        max_points,
        created_at: now,
        my_submission: None,
    }))
}

async fn submit_assignment(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, assignment_id)): Path<(String, String)>,
    Json(body): Json<SubmitAssignmentBody>,
) -> AppResult<Json<AssignmentSubmissionMineDto>> {
    require_approved(&user)?;
    let (course, _is_teacher) = load_course_access(&state, &user, &id).await?;
    if !course.enrolled {
        return Err(AppError::Forbidden);
    }
    let exists: Option<(String,)> =
        sqlx::query_as("SELECT id FROM course_assignments WHERE id = ? AND course_id = ?")
            .bind(&assignment_id)
            .bind(&id)
            .fetch_optional(&state.pool)
            .await?;
    if exists.is_none() {
        return Err(AppError::NotFound);
    }
    let content = body.content.trim();
    if content.is_empty() {
        return Err(AppError::BadRequest("submission content required".into()));
    }
    let now = chrono::Utc::now().to_rfc3339();
    let existing_id: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM course_assignment_submissions WHERE assignment_id = ? AND student_id = ?",
    )
    .bind(&assignment_id)
    .bind(&user.id)
    .fetch_optional(&state.pool)
    .await?;
    let submission_id = existing_id
        .map(|v| v.0)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    sqlx::query(
        "INSERT INTO course_assignment_submissions
         (id, assignment_id, student_id, content, status, grade_points, teacher_comment, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'submitted', NULL, '', ?, ?)
         ON CONFLICT(assignment_id, student_id) DO UPDATE SET
           content = excluded.content,
           status = 'submitted',
           grade_points = NULL,
           teacher_comment = '',
           updated_at = excluded.updated_at",
    )
    .bind(&submission_id)
    .bind(&assignment_id)
    .bind(&user.id)
    .bind(content)
    .bind(&now)
    .bind(&now)
    .execute(&state.pool)
    .await?;

    Ok(Json(AssignmentSubmissionMineDto {
        id: submission_id,
        content: content.to_string(),
        status: "submitted".to_string(),
        grade_points: None,
        teacher_comment: String::new(),
        created_at: now.clone(),
        updated_at: now,
    }))
}

async fn list_assignment_submissions(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, assignment_id)): Path<(String, String)>,
) -> AppResult<Json<Vec<AssignmentSubmissionDto>>> {
    require_approved(&user)?;
    let (_course, is_teacher) = load_course_access(&state, &user, &id).await?;
    if !is_teacher {
        return Err(AppError::Forbidden);
    }
    let exists: Option<(String,)> =
        sqlx::query_as("SELECT id FROM course_assignments WHERE id = ? AND course_id = ?")
            .bind(&assignment_id)
            .bind(&id)
            .fetch_optional(&state.pool)
            .await?;
    if exists.is_none() {
        return Err(AppError::NotFound);
    }
    let rows = sqlx::query(
        "SELECT s.id, s.assignment_id, s.student_id, u.nickname as student_nickname, s.content, s.status, s.grade_points, s.teacher_comment, s.created_at, s.updated_at
         FROM course_assignment_submissions s
         JOIN users u ON u.id = s.student_id
         WHERE s.assignment_id = ?
         ORDER BY s.updated_at DESC",
    )
    .bind(&assignment_id)
    .fetch_all(&state.pool)
    .await?;
    let mut out = Vec::new();
    for r in rows {
        out.push(AssignmentSubmissionDto {
            id: r.try_get("id")?,
            assignment_id: r.try_get("assignment_id")?,
            student_id: r.try_get("student_id")?,
            student_nickname: r.try_get("student_nickname")?,
            content: r.try_get("content")?,
            status: r.try_get("status")?,
            grade_points: r.try_get("grade_points").ok(),
            teacher_comment: r.try_get("teacher_comment")?,
            created_at: r.try_get("created_at")?,
            updated_at: r.try_get("updated_at")?,
        });
    }
    Ok(Json(out))
}

async fn grade_submission(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, assignment_id, submission_id)): Path<(String, String, String)>,
    Json(body): Json<GradeSubmissionBody>,
) -> AppResult<Json<AssignmentSubmissionDto>> {
    require_approved(&user)?;
    let (_course, is_teacher) = load_course_access(&state, &user, &id).await?;
    if !is_teacher {
        return Err(AppError::Forbidden);
    }
    let max_points: i64 =
        sqlx::query_scalar("SELECT max_points FROM course_assignments WHERE id = ? AND course_id = ?")
            .bind(&assignment_id)
            .bind(&id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or(AppError::NotFound)?;
    if body.grade_points < 0 || body.grade_points > max_points {
        return Err(AppError::BadRequest(format!(
            "grade must be between 0 and {max_points}"
        )));
    }
    let now = chrono::Utc::now().to_rfc3339();
    let comment = body.teacher_comment.clone().unwrap_or_default();
    let updated = sqlx::query(
        "UPDATE course_assignment_submissions
         SET status = 'graded', grade_points = ?, teacher_comment = ?, updated_at = ?
         WHERE id = ? AND assignment_id = ?",
    )
    .bind(body.grade_points)
    .bind(&comment)
    .bind(&now)
    .bind(&submission_id)
    .bind(&assignment_id)
    .execute(&state.pool)
    .await?
    .rows_affected();
    if updated == 0 {
        return Err(AppError::NotFound);
    }
    let r = sqlx::query(
        "SELECT s.id, s.assignment_id, s.student_id, u.nickname as student_nickname, s.content, s.status, s.grade_points, s.teacher_comment, s.created_at, s.updated_at
         FROM course_assignment_submissions s
         JOIN users u ON u.id = s.student_id
         WHERE s.id = ?",
    )
    .bind(&submission_id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(AssignmentSubmissionDto {
        id: r.try_get("id")?,
        assignment_id: r.try_get("assignment_id")?,
        student_id: r.try_get("student_id")?,
        student_nickname: r.try_get("student_nickname")?,
        content: r.try_get("content")?,
        status: r.try_get("status")?,
        grade_points: r.try_get("grade_points").ok(),
        teacher_comment: r.try_get("teacher_comment")?,
        created_at: r.try_get("created_at")?,
        updated_at: r.try_get("updated_at")?,
    }))
}
