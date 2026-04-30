use std::path::PathBuf;

use axum::{
    extract::{DefaultBodyLimit, Multipart, Path, State},
    routing::{get, patch, post},
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
    pub course_code: String,
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
pub struct CourseStreamCommentDto {
    pub id: String,
    pub post_id: String,
    pub course_id: String,
    pub author_id: String,
    pub author_nickname: String,
    pub body: String,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct CourseStreamPostDto {
    pub id: String,
    pub course_id: String,
    pub author_id: String,
    pub author_nickname: String,
    pub body: String,
    pub created_at: String,
    pub comments: Vec<CourseStreamCommentDto>,
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
    pub lecture_id: Option<String>,
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

#[derive(Serialize, Clone)]
pub struct LectureAttachmentDto {
    pub id: String,
    pub file_name: String,
    pub url: String,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct LectureDto {
    pub id: String,
    pub course_id: String,
    pub author_id: String,
    pub author_nickname: String,
    pub title: String,
    pub body_text: String,
    pub video_url: String,
    pub created_at: String,
    pub attachments: Vec<LectureAttachmentDto>,
}

#[derive(Serialize)]
pub struct CourseClassroomDto {
    pub course: CourseDto,
    pub is_teacher: bool,
    pub stream: Vec<CourseStreamPostDto>,
    pub assignments: Vec<AssignmentDto>,
    pub lectures: Vec<LectureDto>,
    pub members: Vec<CourseMemberDto>,
}

#[derive(Deserialize)]
pub struct CreateCourseBody {
    pub title: String,
    pub description: Option<String>,
    pub is_open: bool,
}

#[derive(Deserialize)]
pub struct JoinByCodeBody {
    pub code: String,
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
pub struct CreateStreamCommentBody {
    pub body: String,
}

#[derive(Deserialize)]
pub struct CreateAssignmentBody {
    pub title: String,
    pub description: Option<String>,
    pub due_at: Option<String>,
    pub max_points: Option<i64>,
    pub lecture_id: Option<String>,
}

#[derive(Deserialize)]
pub struct PatchAssignmentBody {
    pub title: Option<String>,
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

#[derive(Deserialize)]
pub struct LectureAttachmentInput {
    pub file_name: String,
    pub url: String,
}

#[derive(Deserialize)]
pub struct CreateLectureTaskBody {
    pub title: String,
    pub description: Option<String>,
    pub due_at: Option<String>,
    pub max_points: Option<i64>,
}

#[derive(Deserialize)]
pub struct CreateLectureBody {
    pub title: String,
    pub body_text: Option<String>,
    pub video_url: Option<String>,
    pub attachments: Option<Vec<LectureAttachmentInput>>,
    pub task: Option<CreateLectureTaskBody>,
}

#[derive(Deserialize)]
pub struct PatchLectureBody {
    pub title: Option<String>,
    pub body_text: Option<String>,
    pub video_url: Option<String>,
    pub attachments: Option<Vec<LectureAttachmentInput>>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/courses", get(list_courses).post(create_course))
        .route("/api/courses/join-by-code", post(join_by_code))
        .route(
            "/api/courses/:id",
            get(get_course).patch(patch_course).delete(delete_course),
        )
        .route("/api/courses/:id/classroom", get(get_classroom))
        .route("/api/courses/:id/stream", post(create_stream_post))
        .route(
            "/api/courses/:id/stream/:post_id/comments",
            post(create_stream_comment),
        )
        .route(
            "/api/courses/:id/lectures/upload",
            post(upload_lecture_file).layer(DefaultBodyLimit::max(22 * 1024 * 1024)),
        )
        .route("/api/courses/:id/lectures", post(create_lecture))
        .route(
            "/api/courses/:id/lectures/:lecture_id",
            patch(patch_lecture),
        )
        .route("/api/courses/:id/assignments", post(create_assignment))
        .route(
            "/api/courses/:id/assignments/:assignment_id",
            patch(patch_assignment),
        )
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

async fn ensure_lecture_in_course(
    pool: &sqlx::SqlitePool,
    course_id: &str,
    lecture_id: &str,
) -> AppResult<()> {
    let ok: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM course_lectures WHERE id = ? AND course_id = ?",
    )
    .bind(lecture_id)
    .bind(course_id)
    .fetch_optional(pool)
    .await?;
    if ok.is_none() {
        return Err(AppError::BadRequest("invalid lecture_id for course".into()));
    }
    Ok(())
}

async fn lecture_has_visible_content(
    pool: &sqlx::SqlitePool,
    lecture_id: &str,
    body_trim: &str,
    video_trim: &str,
    attach_count: usize,
) -> Result<bool, sqlx::Error> {
    let tasks: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM course_assignments WHERE lecture_id = ?")
        .bind(lecture_id)
        .fetch_one(pool)
        .await?;
    Ok(
        !body_trim.is_empty()
            || !video_trim.is_empty()
            || attach_count > 0
            || tasks > 0,
    )
}

async fn load_assignment_dto_for_user(
    state: &AppState,
    user: &AuthUser,
    course_id: &str,
    assignment_id: &str,
) -> AppResult<AssignmentDto> {
    let r = sqlx::query(
        "SELECT a.id, a.course_id, a.author_id, u.nickname as author_nickname, a.title, a.description, a.due_at, a.max_points, a.created_at, a.lecture_id
         FROM course_assignments a
         JOIN users u ON u.id = a.author_id
         WHERE a.id = ? AND a.course_id = ?",
    )
    .bind(assignment_id)
    .bind(course_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;
    let aid: String = r.try_get("id")?;
    let my_submission_row = sqlx::query(
        "SELECT id, content, status, grade_points, teacher_comment, created_at, updated_at
         FROM course_assignment_submissions
         WHERE assignment_id = ? AND student_id = ?",
    )
    .bind(&aid)
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
    Ok(AssignmentDto {
        id: aid,
        course_id: r.try_get("course_id")?,
        author_id: r.try_get("author_id")?,
        author_nickname: r.try_get("author_nickname")?,
        title: r.try_get("title")?,
        description: r.try_get("description")?,
        due_at: r.try_get("due_at")?,
        max_points: r.try_get("max_points")?,
        created_at: r.try_get("created_at")?,
        lecture_id: r.try_get::<Option<String>, &str>("lecture_id")?,
        my_submission,
    })
}

async fn load_course_access(
    state: &AppState,
    user: &AuthUser,
    course_id: &str,
) -> AppResult<(CourseDto, bool)> {
    let r = sqlx::query(
        "SELECT c.id, c.course_code, c.title, c.description, c.is_open, c.teacher_id, c.created_at, u.nickname as tn
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
            course_code: r.try_get("course_code")?,
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
        "SELECT c.id, c.course_code, c.title, c.description, c.is_open, c.teacher_id, c.created_at, u.nickname as tn
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
            course_code: r.try_get("course_code")?,
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
        let post_id: String = r.try_get("id")?;
        let comment_rows = sqlx::query(
            "SELECT c.id, c.post_id, c.course_id, c.author_id, u.nickname as author_nickname, c.body, c.created_at
             FROM course_stream_comments c
             JOIN users u ON u.id = c.author_id
             WHERE c.post_id = ?
             ORDER BY c.created_at ASC",
        )
        .bind(&post_id)
        .fetch_all(&state.pool)
        .await?;
        let mut comments = Vec::new();
        for c in comment_rows {
            comments.push(CourseStreamCommentDto {
                id: c.try_get("id")?,
                post_id: c.try_get("post_id")?,
                course_id: c.try_get("course_id")?,
                author_id: c.try_get("author_id")?,
                author_nickname: c.try_get("author_nickname")?,
                body: c.try_get("body")?,
                created_at: c.try_get("created_at")?,
            });
        }
        stream.push(CourseStreamPostDto {
            id: post_id,
            course_id: r.try_get("course_id")?,
            author_id: r.try_get("author_id")?,
            author_nickname: r.try_get("author_nickname")?,
            body: r.try_get("body")?,
            created_at: r.try_get("created_at")?,
            comments,
        });
    }

    let assignment_rows = sqlx::query(
        "SELECT a.id, a.course_id, a.author_id, u.nickname as author_nickname, a.title, a.description, a.due_at, a.max_points, a.created_at, a.lecture_id
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
            lecture_id: r.try_get::<Option<String>, &str>("lecture_id")?,
            my_submission,
        });
    }

    let lecture_rows = sqlx::query(
        "SELECT l.id, l.course_id, l.author_id, u.nickname as author_nickname, l.title, l.body_text, l.video_url, l.created_at
         FROM course_lectures l
         JOIN users u ON u.id = l.author_id
         WHERE l.course_id = ?
         ORDER BY l.created_at DESC",
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    let mut lectures = Vec::new();
    for r in lecture_rows {
        let lecture_id: String = r.try_get("id")?;
        let att_rows = sqlx::query(
            "SELECT id, file_name, url, created_at FROM course_lecture_attachments WHERE lecture_id = ? ORDER BY created_at ASC",
        )
        .bind(&lecture_id)
        .fetch_all(&state.pool)
        .await?;
        let mut attachments = Vec::new();
        for a in att_rows {
            attachments.push(LectureAttachmentDto {
                id: a.try_get("id")?,
                file_name: a.try_get("file_name")?,
                url: a.try_get("url")?,
                created_at: a.try_get("created_at")?,
            });
        }
        lectures.push(LectureDto {
            id: lecture_id,
            course_id: r.try_get("course_id")?,
            author_id: r.try_get("author_id")?,
            author_nickname: r.try_get("author_nickname")?,
            title: r.try_get("title")?,
            body_text: r.try_get("body_text")?,
            video_url: r.try_get("video_url")?,
            created_at: r.try_get("created_at")?,
            attachments,
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
        lectures,
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
    let code = Uuid::new_v4()
        .simple()
        .to_string()
        .chars()
        .take(6)
        .collect::<String>()
        .to_uppercase();
    let now = chrono::Utc::now().to_rfc3339();
    let desc = body.description.clone().unwrap_or_default();
    let is_open = if body.is_open { 1 } else { 0 };

    sqlx::query(
        "INSERT INTO courses (id, teacher_id, course_code, title, description, is_open, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&user.id)
    .bind(&code)
    .bind(&body.title)
    .bind(&desc)
    .bind(is_open)
    .bind(&now)
    .execute(&state.pool)
    .await?;

    let (course, _) = load_course_access(&state, &user, &id).await?;
    Ok(Json(course))
}

async fn join_by_code(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<JoinByCodeBody>,
) -> AppResult<Json<CourseDto>> {
    require_approved(&user)?;
    let code = body.code.trim().to_uppercase();
    if code.is_empty() {
        return Err(AppError::BadRequest("course code required".into()));
    }
    let row = sqlx::query("SELECT id, teacher_id FROM courses WHERE course_code = ?")
        .bind(&code)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("invalid course code".into()))?;
    let course_id: String = row.try_get("id")?;
    let teacher_id: String = row.try_get("teacher_id")?;
    if teacher_id != user.id {
        sqlx::query("INSERT OR IGNORE INTO course_students (course_id, student_id) VALUES (?, ?)")
            .bind(&course_id)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
        grant_scholar_if_first(&state.pool, &user.id).await.ok();
    }
    let (course, _) = load_course_access(&state, &user, &course_id).await?;
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

fn lecture_uploads_dir(state: &AppState) -> PathBuf {
    state.uploads_serve_root.join("course-lectures")
}

fn allowed_lecture_upload_ext(ext: &str) -> bool {
    matches!(
        ext,
        "pdf" | "zip" | "txt" | "md" | "png" | "jpg" | "jpeg" | "gif" | "webp" | "doc"
            | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "odt" | "rar" | "7z" | "mp3" | "wav"
            | "mp4"
    )
}

fn valid_lecture_attachment_public_url(url: &str) -> bool {
    const PREFIX: &str = "/uploads/course-lectures/";
    url.starts_with(PREFIX) && !url.contains("..")
}

fn extension_from_upload_filename(name: &str) -> Option<String> {
    let base = name.rsplit(['/', '\\']).next()?;
    let ext = base.rsplit('.').next()?;
    if ext == base || ext.is_empty() {
        return None;
    }
    Some(ext.to_ascii_lowercase())
}

async fn upload_lecture_file(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    mut multipart: Multipart,
) -> AppResult<Json<serde_json::Value>> {
    require_approved(&user)?;
    let (_course, is_teacher) = load_course_access(&state, &user, &id).await?;
    if !is_teacher {
        return Err(AppError::Forbidden);
    }
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut orig_name: Option<String> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        if field.name() != Some("file") {
            continue;
        }
        if let Some(fname) = field.file_name() {
            if !fname.trim().is_empty() {
                orig_name = Some(fname.to_string());
            }
        }
        let data = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(e.to_string()))?;
        if data.len() > 20 * 1024 * 1024 {
            return Err(AppError::BadRequest("max 20 MB".into()));
        }
        file_bytes = Some(data.to_vec());
        break;
    }
    let buf = file_bytes.ok_or_else(|| AppError::BadRequest("missing file".into()))?;
    let oname = orig_name.unwrap_or_else(|| "file".to_string());
    let ext = extension_from_upload_filename(&oname).ok_or_else(|| {
        AppError::BadRequest("file must have an allowed extension (e.g. pdf, zip, mp4)".into())
    })?;
    if !allowed_lecture_upload_ext(&ext) {
        return Err(AppError::BadRequest("unsupported file type".into()));
    }
    let dir = lecture_uploads_dir(&state);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::BadRequest(format!("mkdir: {e}")))?;
    let filename = format!("{}-{}.{}", user.id, Uuid::new_v4().simple(), ext);
    let disk_path = dir.join(&filename);
    tokio::fs::write(&disk_path, &buf)
        .await
        .map_err(|e| AppError::BadRequest(format!("write: {e}")))?;
    let public_path = format!("/uploads/course-lectures/{filename}");
    Ok(Json(serde_json::json!({
        "url": public_path,
        "file_name": oname
    })))
}

async fn create_lecture(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<CreateLectureBody>,
) -> AppResult<Json<LectureDto>> {
    require_approved(&user)?;
    let (_course, is_teacher) = load_course_access(&state, &user, &id).await?;
    if !is_teacher {
        return Err(AppError::Forbidden);
    }
    let title = body.title.trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("title required".into()));
    }
    let body_text = body.body_text.unwrap_or_default();
    let video_url = body.video_url.unwrap_or_default();
    let body_trim = body_text.trim();
    let video_trim = video_url.trim();
    if !video_trim.is_empty()
        && !video_trim.starts_with("http://")
        && !video_trim.starts_with("https://")
    {
        return Err(AppError::BadRequest("video_url must be http(s)".into()));
    }
    let attachments_in: &[LectureAttachmentInput] = match &body.attachments {
        Some(v) => v.as_slice(),
        None => &[],
    };
    let task_title_nonempty = body
        .task
        .as_ref()
        .map(|t| !t.title.trim().is_empty())
        .unwrap_or(false);
    if body_trim.is_empty()
        && video_trim.is_empty()
        && attachments_in.is_empty()
        && !task_title_nonempty
    {
        return Err(AppError::BadRequest(
            "add text, video URL, attachment, or a lecture task".into(),
        ));
    }
    for a in attachments_in {
        let n = a.file_name.trim();
        let u = a.url.trim();
        if n.is_empty() || u.is_empty() {
            return Err(AppError::BadRequest("attachment file_name and url required".into()));
        }
        if n.len() > 240 {
            return Err(AppError::BadRequest("file_name too long".into()));
        }
        if !valid_lecture_attachment_public_url(u) {
            return Err(AppError::BadRequest("attachment url must be from this course upload".into()));
        }
    }
    let lecture_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let mut tx = state.pool.begin().await?;
    sqlx::query(
        "INSERT INTO course_lectures (id, course_id, author_id, title, body_text, video_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&lecture_id)
    .bind(&id)
    .bind(&user.id)
    .bind(title)
    .bind(body_trim)
    .bind(video_trim)
    .bind(&now)
    .execute(&mut *tx)
    .await?;
    let mut attachments = Vec::new();
    for a in attachments_in {
        let att_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO course_lecture_attachments (id, lecture_id, file_name, url, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&att_id)
        .bind(&lecture_id)
        .bind(a.file_name.trim())
        .bind(a.url.trim())
        .bind(&now)
        .execute(&mut *tx)
        .await?;
        attachments.push(LectureAttachmentDto {
            id: att_id,
            file_name: a.file_name.trim().to_string(),
            url: a.url.trim().to_string(),
            created_at: now.clone(),
        });
    }
    if let Some(ref task) = body.task {
        let tt = task.title.trim();
        if !tt.is_empty() {
            let assignment_id = Uuid::new_v4().to_string();
            let desc = task.description.clone().unwrap_or_default();
            let due = task.due_at.clone().unwrap_or_default();
            let max_points = task.max_points.unwrap_or(100).clamp(1, 1000);
            sqlx::query(
                "INSERT INTO course_assignments (id, course_id, author_id, title, description, due_at, max_points, lecture_id, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&assignment_id)
            .bind(&id)
            .bind(&user.id)
            .bind(tt)
            .bind(&desc)
            .bind(&due)
            .bind(max_points)
            .bind(&lecture_id)
            .bind(&now)
            .execute(&mut *tx)
            .await?;
        }
    }
    tx.commit().await?;
    let author_nickname: String = sqlx::query_scalar("SELECT nickname FROM users WHERE id = ?")
        .bind(&user.id)
        .fetch_optional(&state.pool)
        .await?
        .unwrap_or_default();
    Ok(Json(LectureDto {
        id: lecture_id,
        course_id: id,
        author_id: user.id,
        author_nickname,
        title: title.to_string(),
        body_text: body_trim.to_string(),
        video_url: video_trim.to_string(),
        created_at: now,
        attachments,
    }))
}

async fn patch_lecture(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, lecture_id)): Path<(String, String)>,
    Json(body): Json<PatchLectureBody>,
) -> AppResult<Json<LectureDto>> {
    require_approved(&user)?;
    let (_course, is_teacher) = load_course_access(&state, &user, &id).await?;
    if !is_teacher {
        return Err(AppError::Forbidden);
    }
    let exists: Option<(String,)> =
        sqlx::query_as("SELECT id FROM course_lectures WHERE id = ? AND course_id = ?")
            .bind(&lecture_id)
            .bind(&id)
            .fetch_optional(&state.pool)
            .await?;
    if exists.is_none() {
        return Err(AppError::NotFound);
    }
    if let Some(ref t) = body.title {
        let nt = t.trim();
        if nt.is_empty() {
            return Err(AppError::BadRequest("title required".into()));
        }
        sqlx::query("UPDATE course_lectures SET title = ? WHERE id = ? AND course_id = ?")
            .bind(nt)
            .bind(&lecture_id)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(b) = &body.body_text {
        sqlx::query("UPDATE course_lectures SET body_text = ? WHERE id = ? AND course_id = ?")
            .bind(b)
            .bind(&lecture_id)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref v) = body.video_url {
        let vt = v.trim();
        if !vt.is_empty()
            && !vt.starts_with("http://")
            && !vt.starts_with("https://")
        {
            return Err(AppError::BadRequest("video_url must be http(s)".into()));
        }
        sqlx::query("UPDATE course_lectures SET video_url = ? WHERE id = ? AND course_id = ?")
            .bind(vt)
            .bind(&lecture_id)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(atts) = &body.attachments {
        for a in atts {
            let n = a.file_name.trim();
            let u = a.url.trim();
            if n.is_empty() || u.is_empty() {
                return Err(AppError::BadRequest("attachment file_name and url required".into()));
            }
            if n.len() > 240 {
                return Err(AppError::BadRequest("file_name too long".into()));
            }
            if !valid_lecture_attachment_public_url(u) {
                return Err(AppError::BadRequest(
                    "attachment url must be from this course upload".into(),
                ));
            }
        }
        let now = chrono::Utc::now().to_rfc3339();
        let mut tx = state.pool.begin().await?;
        sqlx::query("DELETE FROM course_lecture_attachments WHERE lecture_id = ?")
            .bind(&lecture_id)
            .execute(&mut *tx)
            .await?;
        for a in atts {
            let att_id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO course_lecture_attachments (id, lecture_id, file_name, url, created_at) VALUES (?, ?, ?, ?, ?)",
            )
            .bind(&att_id)
            .bind(&lecture_id)
            .bind(a.file_name.trim())
            .bind(a.url.trim())
            .bind(&now)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
    }
    let row = sqlx::query("SELECT body_text, video_url FROM course_lectures WHERE id = ?")
        .bind(&lecture_id)
        .fetch_one(&state.pool)
        .await?;
    let merged_body: String = row.try_get("body_text")?;
    let merged_video: String = row.try_get("video_url")?;
    let attach_n: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM course_lecture_attachments WHERE lecture_id = ?")
            .bind(&lecture_id)
            .fetch_one(&state.pool)
            .await?;
    if !(lecture_has_visible_content(
        &state.pool,
        &lecture_id,
        merged_body.trim(),
        merged_video.trim(),
        attach_n as usize,
    )
    .await?)
    {
        return Err(AppError::BadRequest(
            "lecture must keep text, video, attachments, or at least one linked task".into(),
        ));
    }
    let r = sqlx::query(
        "SELECT l.id, l.course_id, l.author_id, u.nickname as author_nickname, l.title, l.body_text, l.video_url, l.created_at
         FROM course_lectures l
         JOIN users u ON u.id = l.author_id
         WHERE l.id = ?",
    )
    .bind(&lecture_id)
    .fetch_one(&state.pool)
    .await?;
    let att_rows = sqlx::query(
        "SELECT id, file_name, url, created_at FROM course_lecture_attachments WHERE lecture_id = ? ORDER BY created_at ASC",
    )
    .bind(&lecture_id)
    .fetch_all(&state.pool)
    .await?;
    let mut attachments = Vec::new();
    for a in att_rows {
        attachments.push(LectureAttachmentDto {
            id: a.try_get("id")?,
            file_name: a.try_get("file_name")?,
            url: a.try_get("url")?,
            created_at: a.try_get("created_at")?,
        });
    }
    Ok(Json(LectureDto {
        id: r.try_get("id")?,
        course_id: r.try_get("course_id")?,
        author_id: r.try_get("author_id")?,
        author_nickname: r.try_get("author_nickname")?,
        title: r.try_get("title")?,
        body_text: r.try_get("body_text")?,
        video_url: r.try_get("video_url")?,
        created_at: r.try_get("created_at")?,
        attachments,
    }))
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
        comments: Vec::new(),
    }))
}

async fn create_stream_comment(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, post_id)): Path<(String, String)>,
    Json(body): Json<CreateStreamCommentBody>,
) -> AppResult<Json<CourseStreamCommentDto>> {
    require_approved(&user)?;
    let (course, _is_teacher) = load_course_access(&state, &user, &id).await?;
    if !course.enrolled {
        return Err(AppError::Forbidden);
    }
    let post_exists: Option<(String,)> =
        sqlx::query_as("SELECT id FROM course_stream_posts WHERE id = ? AND course_id = ?")
            .bind(&post_id)
            .bind(&id)
            .fetch_optional(&state.pool)
            .await?;
    if post_exists.is_none() {
        return Err(AppError::NotFound);
    }
    let text = body.body.trim();
    if text.is_empty() {
        return Err(AppError::BadRequest("comment body required".into()));
    }
    let comment_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO course_stream_comments (id, post_id, course_id, author_id, body, created_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&comment_id)
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
    Ok(Json(CourseStreamCommentDto {
        id: comment_id,
        post_id,
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
    let lecture_bind = body.lecture_id.as_ref().and_then(|s| {
        let t = s.trim();
        if t.is_empty() {
            None
        } else {
            Some(t.to_string())
        }
    });
    if let Some(ref lid) = lecture_bind {
        ensure_lecture_in_course(&state.pool, &id, lid).await?;
    }
    let description = body.description.unwrap_or_default();
    let due_at = body.due_at.unwrap_or_default();
    let max_points = body.max_points.unwrap_or(100).clamp(1, 1000);
    let assignment_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO course_assignments (id, course_id, author_id, title, description, due_at, max_points, lecture_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&assignment_id)
    .bind(&id)
    .bind(&user.id)
    .bind(title)
    .bind(&description)
    .bind(&due_at)
    .bind(max_points)
    .bind(lecture_bind.as_deref())
    .bind(&now)
    .execute(&state.pool)
    .await?;
    let dto = load_assignment_dto_for_user(&state, &user, &id, &assignment_id).await?;
    Ok(Json(dto))
}

async fn patch_assignment(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, assignment_id)): Path<(String, String)>,
    Json(body): Json<PatchAssignmentBody>,
) -> AppResult<Json<AssignmentDto>> {
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
    if let Some(ref t) = body.title {
        let nt = t.trim();
        if nt.is_empty() {
            return Err(AppError::BadRequest("title required".into()));
        }
        sqlx::query("UPDATE course_assignments SET title = ? WHERE id = ? AND course_id = ?")
            .bind(nt)
            .bind(&assignment_id)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(d) = &body.description {
        sqlx::query("UPDATE course_assignments SET description = ? WHERE id = ? AND course_id = ?")
            .bind(d)
            .bind(&assignment_id)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(d) = &body.due_at {
        sqlx::query("UPDATE course_assignments SET due_at = ? WHERE id = ? AND course_id = ?")
            .bind(d)
            .bind(&assignment_id)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(mp) = body.max_points {
        let max_points = mp.clamp(1, 1000);
        sqlx::query("UPDATE course_assignments SET max_points = ? WHERE id = ? AND course_id = ?")
            .bind(max_points)
            .bind(&assignment_id)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    let dto = load_assignment_dto_for_user(&state, &user, &id, &assignment_id).await?;
    Ok(Json(dto))
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
