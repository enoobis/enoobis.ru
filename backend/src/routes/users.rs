use std::path::PathBuf;

use axum::{
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use chrono::Datelike;

use crate::{
    auth::{hash_password, verify_password},
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
    pub theme_preference: String,
    pub language_preference: String,
    pub font_preference: String,
    pub full_name: String,
    pub website_url: String,
    pub social_links: Vec<SocialLink>,
    pub birthday: String,
    pub country: String,
    pub created_at: String,
    pub last_seen_at: String,
    pub favorite_course_ids: Vec<String>,
}

#[derive(Deserialize)]
pub struct UpdateProfileBody {
    pub bio: Option<String>,
    pub wallpaper_url: Option<String>,
    /// Внешний URL аватара; пустая строка — сброс (в т.ч. удаление загруженного файла).
    pub avatar_url: Option<String>,
    pub theme_preference: Option<String>,
    pub language_preference: Option<String>,
    pub font_preference: Option<String>,
    pub full_name: Option<String>,
    pub website_url: Option<String>,
    pub social_links: Option<Vec<SocialLink>>,
    pub birthday: Option<String>,
    pub country: Option<String>,
    pub favorite_course_ids: Option<Vec<String>>,
}

#[derive(Serialize)]
pub struct PublicProfile {
    pub nickname: String,
    pub role: String,
    pub bio: String,
    pub wallpaper_url: String,
    pub avatar_url: String,
    pub theme_preference: String,
    pub language_preference: String,
    pub font_preference: String,
    pub full_name: String,
    pub website_url: String,
    pub social_links: Vec<SocialLink>,
    pub birthday: String,
    pub country: String,
    pub created_at: String,
    pub last_seen_at: String,
    pub favorite_courses: Vec<FavoriteCourseDto>,
    pub achievements: Vec<AchievementDto>,
    pub followers_count: i64,
    pub following_count: i64,
    pub grade_overview: GradeOverviewDto,
}

#[derive(Serialize)]
pub struct GradeOverviewDto {
    pub courses_count: i64,
    pub assignments_graded: i64,
    pub points_earned: i64,
    pub points_total: i64,
    pub average_percent: f64,
}

#[derive(Serialize)]
pub struct FollowState {
    pub following: bool,
}

#[derive(Serialize)]
pub struct FollowUserDto {
    pub id: String,
    pub nickname: String,
    pub avatar_url: String,
}

#[derive(Deserialize)]
pub struct TrackActivityBody {
    pub seconds: i64,
}

#[derive(Deserialize)]
pub struct UpdatePrivacyBody {
    pub profile_visibility: Option<String>,
    pub activity_visibility: Option<String>,
    pub media_visibility: Option<String>,
    pub show_birthday: Option<bool>,
    pub show_country: Option<bool>,
}

#[derive(Serialize)]
pub struct PrivacySettingsResponse {
    pub profile_visibility: String,
    pub activity_visibility: String,
    pub media_visibility: String,
    pub show_birthday: bool,
    pub show_country: bool,
}

#[derive(Deserialize)]
pub struct ChangePasswordBody {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Deserialize)]
pub struct UpdateNotificationSettingsBody {
    pub email_enabled: Option<bool>,
    pub push_enabled: Option<bool>,
    pub course_updates: Option<bool>,
    pub assignment_deadlines: Option<bool>,
    pub grades_released: Option<bool>,
    pub new_followers: Option<bool>,
    pub marketing_news: Option<bool>,
}

#[derive(Serialize)]
pub struct NotificationSettingsResponse {
    pub email_enabled: bool,
    pub push_enabled: bool,
    pub course_updates: bool,
    pub assignment_deadlines: bool,
    pub grades_released: bool,
    pub new_followers: bool,
    pub marketing_news: bool,
}

#[derive(Deserialize)]
pub struct ActivityQuery {
    pub year: Option<i32>,
}

#[derive(Serialize)]
pub struct ActivityDayDto {
    pub day: String,
    pub seconds_spent: i64,
}

#[derive(Serialize)]
pub struct ActivitySummaryDto {
    pub year: i32,
    pub registration_year: i32,
    pub current_year: i32,
    pub total_seconds: i64,
    pub days: Vec<ActivityDayDto>,
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

#[derive(Serialize, Deserialize, Clone)]
pub struct SocialLink {
    pub name: String,
    pub url: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/me/avatar",
            post(upload_avatar).layer(DefaultBodyLimit::max(3 * 1024 * 1024)),
        )
        .route(
            "/api/me/wallpaper",
            post(upload_wallpaper).layer(DefaultBodyLimit::max(6 * 1024 * 1024)),
        )
        .route("/api/me/activity", post(track_activity))
        .route("/api/me/privacy", get(get_privacy_settings).patch(update_privacy_settings))
        .route("/api/me/notifications", get(get_notification_settings).patch(update_notification_settings))
        .route("/api/me/password", post(change_password))
        .route("/api/me", get(me).patch(update_me))
        .route(
            "/api/profile/:nickname/follow",
            post(follow_profile).delete(unfollow_profile),
        )
        .route("/api/profile/:nickname/following/me", get(my_follow_state))
        .route("/api/profile/:nickname/followers", get(list_followers))
        .route("/api/profile/:nickname/following", get(list_following))
        .route("/api/profile/:nickname/activity", get(profile_activity))
        .route("/api/profile/:nickname", get(public_profile))
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Visibility {
    Public,
    Followers,
    Private,
}

fn parse_visibility(raw: &str) -> Option<Visibility> {
    match raw {
        "public" => Some(Visibility::Public),
        "followers" => Some(Visibility::Followers),
        "private" => Some(Visibility::Private),
        _ => None,
    }
}

fn require_visibility<'a>(raw: &'a str, field: &str) -> AppResult<&'a str> {
    match raw {
        "public" | "followers" | "private" => Ok(raw),
        _ => Err(AppError::BadRequest(format!(
            "{field} must be public|followers|private"
        ))),
    }
}

async fn ensure_privacy_row(state: &AppState, user_id: &str) -> AppResult<()> {
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT OR IGNORE INTO user_privacy_settings
         (user_id, profile_visibility, activity_visibility, media_visibility, show_birthday, show_country, updated_at)
         VALUES (?, 'public', 'public', 'public', 1, 1, ?)",
    )
    .bind(user_id)
    .bind(&now)
    .execute(&state.pool)
    .await?;
    Ok(())
}

async fn ensure_notification_row(state: &AppState, user_id: &str) -> AppResult<()> {
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT OR IGNORE INTO user_notification_settings
         (user_id, email_enabled, push_enabled, course_updates, assignment_deadlines, grades_released, new_followers, marketing_news, updated_at)
         VALUES (?, 1, 0, 1, 1, 1, 1, 0, ?)",
    )
    .bind(user_id)
    .bind(&now)
    .execute(&state.pool)
    .await?;
    Ok(())
}

async fn is_follower(state: &AppState, viewer_id: &str, target_id: &str) -> AppResult<bool> {
    let row: Option<(i64,)> = sqlx::query_as(
        "SELECT 1 FROM user_follows WHERE follower_user_id = ? AND following_user_id = ? LIMIT 1",
    )
    .bind(viewer_id)
    .bind(target_id)
    .fetch_optional(&state.pool)
    .await?;
    Ok(row.is_some())
}

fn can_view_visibility(level: Visibility, is_self: bool, is_follower: bool) -> bool {
    match level {
        Visibility::Public => true,
        Visibility::Followers => is_self || is_follower,
        Visibility::Private => is_self,
    }
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

fn wallpapers_dir(state: &AppState) -> PathBuf {
    state.uploads_serve_root.join("wallpapers")
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

fn remove_uploaded_wallpapers_for_user(state: &AppState, user_id: &str) {
    let dir = wallpapers_dir(state);
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

fn parse_social_links(raw: &str) -> Vec<SocialLink> {
    serde_json::from_str::<Vec<SocialLink>>(raw).unwrap_or_default()
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

async fn upload_wallpaper(
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
        if name != "file" && name != "wallpaper" {
            continue;
        }
        let data = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(e.to_string()))?;
        if data.len() > 5_000_000 {
            return Err(AppError::BadRequest("max 5 MB".into()));
        }
        file_bytes = Some(data.to_vec());
        break;
    }
    let buf = file_bytes.ok_or_else(|| AppError::BadRequest("missing file field (file or wallpaper)".into()))?;

    let ext = sniff_image_ext(&buf)?;
    remove_uploaded_wallpapers_for_user(&state, &user.id);

    let dir = wallpapers_dir(&state);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::BadRequest(format!("mkdir: {e}")))?;

    let filename = format!("{}.{}", user.id, ext);
    let disk_path = dir.join(&filename);
    tokio::fs::write(&disk_path, &buf)
        .await
        .map_err(|e| AppError::BadRequest(format!("write: {e}")))?;

    let public_path = format!("/uploads/wallpapers/{filename}");
    sqlx::query("UPDATE users SET wallpaper_url = ? WHERE id = ?")
        .bind(&public_path)
        .bind(&user.id)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({ "wallpaper_url": public_path })))
}

async fn me(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<MeResponse>> {
    let r = sqlx::query(
        "SELECT id, email, nickname, role, status, bio, wallpaper_url, avatar_url, theme_preference, language_preference, font_preference, full_name, website_url, social_links_json, birthday, country, created_at, last_seen_at FROM users WHERE id = ?",
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
        theme_preference: r.try_get("theme_preference")?,
        language_preference: r.try_get("language_preference")?,
        font_preference: r.try_get("font_preference")?,
        full_name: r.try_get("full_name")?,
        website_url: r.try_get("website_url")?,
        social_links: parse_social_links(&r.try_get::<String, _>("social_links_json")?),
        birthday: r.try_get("birthday")?,
        country: r.try_get("country")?,
        created_at: r.try_get("created_at")?,
        last_seen_at: r.try_get("last_seen_at")?,
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
    if let Some(t) = &body.theme_preference {
        let v = match t.as_str() {
            "black" | "graphite" | "contrast" => t.as_str(),
            _ => return Err(AppError::BadRequest("theme must be black|graphite|contrast".into())),
        };
        sqlx::query("UPDATE users SET theme_preference = ? WHERE id = ?")
            .bind(v)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(l) = &body.language_preference {
        let v = match l.as_str() {
            "ru" | "en" => l.as_str(),
            _ => return Err(AppError::BadRequest("language must be ru|en".into())),
        };
        sqlx::query("UPDATE users SET language_preference = ? WHERE id = ?")
            .bind(v)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(f) = &body.font_preference {
        let v = match f.as_str() {
            "compact" | "normal" | "large" => f.as_str(),
            _ => return Err(AppError::BadRequest("font must be compact|normal|large".into())),
        };
        sqlx::query("UPDATE users SET font_preference = ? WHERE id = ?")
            .bind(v)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.full_name {
        let val: String = v.chars().take(120).collect();
        sqlx::query("UPDATE users SET full_name = ? WHERE id = ?")
            .bind(&val)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.website_url {
        let val: String = v.chars().take(280).collect();
        sqlx::query("UPDATE users SET website_url = ? WHERE id = ?")
            .bind(&val)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(links) = &body.social_links {
        let mut out: Vec<SocialLink> = Vec::new();
        for link in links.iter().take(12) {
            let name: String = link.name.trim().chars().take(50).collect();
            let url: String = link.url.trim().chars().take(280).collect();
            if name.is_empty() || url.is_empty() {
                continue;
            }
            out.push(SocialLink { name, url });
        }
        let encoded = serde_json::to_string(&out)
            .map_err(|e| AppError::BadRequest(format!("social links encode failed: {e}")))?;
        sqlx::query("UPDATE users SET social_links_json = ? WHERE id = ?")
            .bind(&encoded)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.birthday {
        let val: String = v.chars().take(40).collect();
        sqlx::query("UPDATE users SET birthday = ? WHERE id = ?")
            .bind(&val)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.country {
        let val: String = v.chars().take(80).collect();
        sqlx::query("UPDATE users SET country = ? WHERE id = ?")
            .bind(&val)
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
    viewer: Option<AuthUser>,
    Path(nickname): Path<String>,
) -> AppResult<Json<PublicProfile>> {
    let r = sqlx::query(
        "SELECT id, nickname, role, bio, wallpaper_url, avatar_url, theme_preference, language_preference, font_preference, full_name, website_url, social_links_json, birthday, country, created_at, last_seen_at FROM users WHERE nickname = ? AND status = 'approved'",
    )
    .bind(&nickname)
    .fetch_optional(&state.pool)
    .await?;

    let r = r.ok_or(AppError::NotFound)?;
    let uid: String = r.try_get("id")?;
    ensure_privacy_row(&state, &uid).await?;
    let privacy_row = sqlx::query(
        "SELECT profile_visibility, activity_visibility, media_visibility, show_birthday, show_country
         FROM user_privacy_settings WHERE user_id = ?",
    )
    .bind(&uid)
    .fetch_one(&state.pool)
    .await?;
    let profile_visibility = parse_visibility(&privacy_row.try_get::<String, _>("profile_visibility")?)
        .unwrap_or(Visibility::Public);
    let activity_visibility = parse_visibility(&privacy_row.try_get::<String, _>("activity_visibility")?)
        .unwrap_or(Visibility::Public);
    let media_visibility = parse_visibility(&privacy_row.try_get::<String, _>("media_visibility")?)
        .unwrap_or(Visibility::Public);
    let show_birthday = privacy_row.try_get::<i64, _>("show_birthday")? != 0;
    let show_country = privacy_row.try_get::<i64, _>("show_country")? != 0;
    let is_self = viewer.as_ref().map(|v| v.id == uid).unwrap_or(false);
    let is_following = if let Some(v) = viewer.as_ref() {
        if !is_self {
            is_follower(&state, &v.id, &uid).await?
        } else {
            false
        }
    } else {
        false
    };
    if !can_view_visibility(profile_visibility, is_self, is_following) {
        return Err(AppError::Forbidden);
    }
    let can_view_activity = can_view_visibility(activity_visibility, is_self, is_following);
    let can_view_media = can_view_visibility(media_visibility, is_self, is_following);

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

    let followers_count: i64 =
        sqlx::query_scalar("SELECT COUNT(1) FROM user_follows WHERE following_user_id = ?")
            .bind(&uid)
            .fetch_one(&state.pool)
            .await?;

    let following_count: i64 =
        sqlx::query_scalar("SELECT COUNT(1) FROM user_follows WHERE follower_user_id = ?")
            .bind(&uid)
            .fetch_one(&state.pool)
            .await?;

    let grade_row = sqlx::query(
        "SELECT
            COUNT(*) as assignments_graded,
            COALESCE(SUM(s.grade_points), 0) as points_earned,
            COALESCE(SUM(a.max_points), 0) as points_total,
            COUNT(DISTINCT a.course_id) as courses_count
         FROM course_assignment_submissions s
         JOIN course_assignments a ON a.id = s.assignment_id
         WHERE s.student_id = ? AND s.grade_points IS NOT NULL",
    )
    .bind(&uid)
    .fetch_one(&state.pool)
    .await?;
    let assignments_graded: i64 = grade_row.try_get("assignments_graded")?;
    let points_earned: i64 = grade_row.try_get("points_earned")?;
    let points_total: i64 = grade_row.try_get("points_total")?;
    let courses_count: i64 = grade_row.try_get("courses_count")?;
    let average_percent = if points_total > 0 {
        (points_earned as f64 * 100.0) / points_total as f64
    } else {
        0.0
    };

    Ok(Json(PublicProfile {
        nickname: r.try_get("nickname")?,
        role: r.try_get("role")?,
        bio: r.try_get("bio")?,
        wallpaper_url: if can_view_media {
            r.try_get("wallpaper_url")?
        } else {
            String::new()
        },
        avatar_url: if can_view_media {
            r.try_get("avatar_url")?
        } else {
            String::new()
        },
        theme_preference: r.try_get("theme_preference")?,
        language_preference: r.try_get("language_preference")?,
        font_preference: r.try_get("font_preference")?,
        full_name: r.try_get("full_name")?,
        website_url: r.try_get("website_url")?,
        social_links: parse_social_links(&r.try_get::<String, _>("social_links_json")?),
        birthday: if can_view_activity && show_birthday {
            r.try_get("birthday")?
        } else {
            String::new()
        },
        country: if can_view_activity && show_country {
            r.try_get("country")?
        } else {
            String::new()
        },
        created_at: r.try_get("created_at")?,
        last_seen_at: if can_view_activity {
            r.try_get("last_seen_at")?
        } else {
            String::new()
        },
        favorite_courses: if can_view_media {
            favorite_courses
        } else {
            Vec::new()
        },
        achievements,
        followers_count,
        following_count,
        grade_overview: GradeOverviewDto {
            courses_count,
            assignments_graded,
            points_earned,
            points_total,
            average_percent,
        },
    }))
}

async fn follow_profile(
    State(state): State<AppState>,
    user: AuthUser,
    Path(nickname): Path<String>,
) -> AppResult<Json<FollowState>> {
    let target_id: Option<(String,)> =
        sqlx::query_as("SELECT id FROM users WHERE nickname = ? AND status = 'approved'")
            .bind(&nickname)
            .fetch_optional(&state.pool)
            .await?;
    let target_id = target_id
        .map(|t| t.0)
        .ok_or(AppError::NotFound)?;
    if target_id == user.id {
        return Err(AppError::BadRequest("cannot follow yourself".into()));
    }
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT OR IGNORE INTO user_follows (follower_user_id, following_user_id, created_at)
         VALUES (?, ?, ?)",
    )
    .bind(&user.id)
    .bind(&target_id)
    .bind(&now)
    .execute(&state.pool)
    .await?;
    Ok(Json(FollowState { following: true }))
}

async fn unfollow_profile(
    State(state): State<AppState>,
    user: AuthUser,
    Path(nickname): Path<String>,
) -> AppResult<Json<FollowState>> {
    let target_id: Option<(String,)> =
        sqlx::query_as("SELECT id FROM users WHERE nickname = ? AND status = 'approved'")
            .bind(&nickname)
            .fetch_optional(&state.pool)
            .await?;
    let target_id = target_id
        .map(|t| t.0)
        .ok_or(AppError::NotFound)?;
    if target_id == user.id {
        return Err(AppError::BadRequest("cannot unfollow yourself".into()));
    }
    sqlx::query("DELETE FROM user_follows WHERE follower_user_id = ? AND following_user_id = ?")
        .bind(&user.id)
        .bind(&target_id)
        .execute(&state.pool)
        .await?;
    Ok(Json(FollowState { following: false }))
}

async fn my_follow_state(
    State(state): State<AppState>,
    user: AuthUser,
    Path(nickname): Path<String>,
) -> AppResult<Json<FollowState>> {
    let target_id: Option<(String,)> =
        sqlx::query_as("SELECT id FROM users WHERE nickname = ? AND status = 'approved'")
            .bind(&nickname)
            .fetch_optional(&state.pool)
            .await?;
    let target_id = target_id
        .map(|t| t.0)
        .ok_or(AppError::NotFound)?;
    if target_id == user.id {
        return Ok(Json(FollowState { following: false }));
    }
    let row: Option<(i64,)> = sqlx::query_as(
        "SELECT 1 FROM user_follows WHERE follower_user_id = ? AND following_user_id = ? LIMIT 1",
    )
    .bind(&user.id)
    .bind(&target_id)
    .fetch_optional(&state.pool)
    .await?;
    Ok(Json(FollowState {
        following: row.is_some(),
    }))
}

async fn list_followers(
    State(state): State<AppState>,
    Path(nickname): Path<String>,
) -> AppResult<Json<Vec<FollowUserDto>>> {
    let target_id: Option<(String,)> =
        sqlx::query_as("SELECT id FROM users WHERE nickname = ? AND status = 'approved'")
            .bind(&nickname)
            .fetch_optional(&state.pool)
            .await?;
    let target_id = target_id.map(|t| t.0).ok_or(AppError::NotFound)?;

    let rows = sqlx::query(
        "SELECT u.id, u.nickname, u.avatar_url
         FROM user_follows f
         JOIN users u ON u.id = f.follower_user_id
         WHERE f.following_user_id = ?
         ORDER BY f.created_at DESC
         LIMIT 12",
    )
    .bind(&target_id)
    .fetch_all(&state.pool)
    .await?;

    let mut out = Vec::new();
    for r in rows {
        out.push(FollowUserDto {
            id: r.try_get("id")?,
            nickname: r.try_get("nickname")?,
            avatar_url: r.try_get("avatar_url")?,
        });
    }
    Ok(Json(out))
}

async fn list_following(
    State(state): State<AppState>,
    Path(nickname): Path<String>,
) -> AppResult<Json<Vec<FollowUserDto>>> {
    let target_id: Option<(String,)> =
        sqlx::query_as("SELECT id FROM users WHERE nickname = ? AND status = 'approved'")
            .bind(&nickname)
            .fetch_optional(&state.pool)
            .await?;
    let target_id = target_id.map(|t| t.0).ok_or(AppError::NotFound)?;

    let rows = sqlx::query(
        "SELECT u.id, u.nickname, u.avatar_url
         FROM user_follows f
         JOIN users u ON u.id = f.following_user_id
         WHERE f.follower_user_id = ?
         ORDER BY f.created_at DESC
         LIMIT 12",
    )
    .bind(&target_id)
    .fetch_all(&state.pool)
    .await?;

    let mut out = Vec::new();
    for r in rows {
        out.push(FollowUserDto {
            id: r.try_get("id")?,
            nickname: r.try_get("nickname")?,
            avatar_url: r.try_get("avatar_url")?,
        });
    }
    Ok(Json(out))
}

async fn track_activity(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<TrackActivityBody>,
) -> AppResult<Json<serde_json::Value>> {
    if body.seconds <= 0 {
        return Ok(Json(serde_json::json!({ "ok": true })));
    }
    let seconds = body.seconds.clamp(1, 600);
    let day = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO user_daily_activity (user_id, day, seconds_spent, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, day) DO UPDATE SET
            seconds_spent = user_daily_activity.seconds_spent + excluded.seconds_spent,
            updated_at = excluded.updated_at",
    )
    .bind(&user.id)
    .bind(&day)
    .bind(seconds)
    .bind(&now)
    .execute(&state.pool)
    .await?;
    sqlx::query("UPDATE users SET last_seen_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&user.id)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn get_privacy_settings(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<PrivacySettingsResponse>> {
    ensure_privacy_row(&state, &user.id).await?;
    let row = sqlx::query(
        "SELECT profile_visibility, activity_visibility, media_visibility, show_birthday, show_country
         FROM user_privacy_settings WHERE user_id = ?",
    )
    .bind(&user.id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(PrivacySettingsResponse {
        profile_visibility: row.try_get("profile_visibility")?,
        activity_visibility: row.try_get("activity_visibility")?,
        media_visibility: row.try_get("media_visibility")?,
        show_birthday: row.try_get::<i64, _>("show_birthday")? != 0,
        show_country: row.try_get::<i64, _>("show_country")? != 0,
    }))
}

async fn update_privacy_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<UpdatePrivacyBody>,
) -> AppResult<Json<PrivacySettingsResponse>> {
    ensure_privacy_row(&state, &user.id).await?;
    let now = chrono::Utc::now().to_rfc3339();
    if let Some(v) = body.profile_visibility.as_deref() {
        let ok = require_visibility(v, "profile_visibility")?;
        sqlx::query("UPDATE user_privacy_settings SET profile_visibility = ?, updated_at = ? WHERE user_id = ?")
            .bind(ok)
            .bind(&now)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = body.activity_visibility.as_deref() {
        let ok = require_visibility(v, "activity_visibility")?;
        sqlx::query("UPDATE user_privacy_settings SET activity_visibility = ?, updated_at = ? WHERE user_id = ?")
            .bind(ok)
            .bind(&now)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = body.media_visibility.as_deref() {
        let ok = require_visibility(v, "media_visibility")?;
        sqlx::query("UPDATE user_privacy_settings SET media_visibility = ?, updated_at = ? WHERE user_id = ?")
            .bind(ok)
            .bind(&now)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = body.show_birthday {
        sqlx::query("UPDATE user_privacy_settings SET show_birthday = ?, updated_at = ? WHERE user_id = ?")
            .bind(if v { 1 } else { 0 })
            .bind(&now)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = body.show_country {
        sqlx::query("UPDATE user_privacy_settings SET show_country = ?, updated_at = ? WHERE user_id = ?")
            .bind(if v { 1 } else { 0 })
            .bind(&now)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    get_privacy_settings(State(state), user).await
}

async fn change_password(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<ChangePasswordBody>,
) -> AppResult<Json<serde_json::Value>> {
    if body.new_password.len() < 8 {
        return Err(AppError::BadRequest("new password min 8 chars".into()));
    }
    if body.new_password == body.current_password {
        return Err(AppError::BadRequest(
            "new password must differ from current".into(),
        ));
    }
    let current_hash: Option<(String,)> = sqlx::query_as("SELECT password_hash FROM users WHERE id = ?")
        .bind(&user.id)
        .fetch_optional(&state.pool)
        .await?;
    let current_hash = current_hash.ok_or(AppError::Unauthorized)?.0;
    if !verify_password(&body.current_password, &current_hash)? {
        return Err(AppError::BadRequest("current password is incorrect".into()));
    }
    let next_hash = hash_password(&body.new_password)?;
    sqlx::query("UPDATE users SET password_hash = ? WHERE id = ?")
        .bind(&next_hash)
        .bind(&user.id)
        .execute(&state.pool)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn get_notification_settings(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<NotificationSettingsResponse>> {
    ensure_notification_row(&state, &user.id).await?;
    let row = sqlx::query(
        "SELECT email_enabled, push_enabled, course_updates, assignment_deadlines, grades_released, new_followers, marketing_news
         FROM user_notification_settings WHERE user_id = ?",
    )
    .bind(&user.id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(NotificationSettingsResponse {
        email_enabled: row.try_get::<i64, _>("email_enabled")? != 0,
        push_enabled: row.try_get::<i64, _>("push_enabled")? != 0,
        course_updates: row.try_get::<i64, _>("course_updates")? != 0,
        assignment_deadlines: row.try_get::<i64, _>("assignment_deadlines")? != 0,
        grades_released: row.try_get::<i64, _>("grades_released")? != 0,
        new_followers: row.try_get::<i64, _>("new_followers")? != 0,
        marketing_news: row.try_get::<i64, _>("marketing_news")? != 0,
    }))
}

async fn update_notification_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<UpdateNotificationSettingsBody>,
) -> AppResult<Json<NotificationSettingsResponse>> {
    ensure_notification_row(&state, &user.id).await?;
    let now = chrono::Utc::now().to_rfc3339();
    if let Some(v) = body.email_enabled {
        sqlx::query("UPDATE user_notification_settings SET email_enabled = ?, updated_at = ? WHERE user_id = ?")
            .bind(if v { 1 } else { 0 })
            .bind(&now)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = body.push_enabled {
        sqlx::query("UPDATE user_notification_settings SET push_enabled = ?, updated_at = ? WHERE user_id = ?")
            .bind(if v { 1 } else { 0 })
            .bind(&now)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = body.course_updates {
        sqlx::query("UPDATE user_notification_settings SET course_updates = ?, updated_at = ? WHERE user_id = ?")
            .bind(if v { 1 } else { 0 })
            .bind(&now)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = body.assignment_deadlines {
        sqlx::query("UPDATE user_notification_settings SET assignment_deadlines = ?, updated_at = ? WHERE user_id = ?")
            .bind(if v { 1 } else { 0 })
            .bind(&now)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = body.grades_released {
        sqlx::query("UPDATE user_notification_settings SET grades_released = ?, updated_at = ? WHERE user_id = ?")
            .bind(if v { 1 } else { 0 })
            .bind(&now)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = body.new_followers {
        sqlx::query("UPDATE user_notification_settings SET new_followers = ?, updated_at = ? WHERE user_id = ?")
            .bind(if v { 1 } else { 0 })
            .bind(&now)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = body.marketing_news {
        sqlx::query("UPDATE user_notification_settings SET marketing_news = ?, updated_at = ? WHERE user_id = ?")
            .bind(if v { 1 } else { 0 })
            .bind(&now)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    get_notification_settings(State(state), user).await
}

async fn profile_activity(
    State(state): State<AppState>,
    viewer: Option<AuthUser>,
    Path(nickname): Path<String>,
    Query(q): Query<ActivityQuery>,
) -> AppResult<Json<ActivitySummaryDto>> {
    let user_row: Option<(String, String)> =
        sqlx::query_as("SELECT id, created_at FROM users WHERE nickname = ? AND status = 'approved'")
            .bind(&nickname)
            .fetch_optional(&state.pool)
            .await?;
    let (uid, created_at) = user_row.ok_or(AppError::NotFound)?;
    ensure_privacy_row(&state, &uid).await?;
    let privacy_row = sqlx::query(
        "SELECT activity_visibility FROM user_privacy_settings WHERE user_id = ?",
    )
    .bind(&uid)
    .fetch_one(&state.pool)
    .await?;
    let activity_visibility = parse_visibility(&privacy_row.try_get::<String, _>("activity_visibility")?)
        .unwrap_or(Visibility::Public);
    let is_self = viewer.as_ref().map(|v| v.id == uid).unwrap_or(false);
    let is_following = if let Some(v) = viewer.as_ref() {
        if !is_self {
            is_follower(&state, &v.id, &uid).await?
        } else {
            false
        }
    } else {
        false
    };
    if !can_view_visibility(activity_visibility, is_self, is_following) {
        return Err(AppError::Forbidden);
    }

    let current_year = chrono::Utc::now().year();
    let registration_year = created_at
        .get(0..4)
        .and_then(|s| s.parse::<i32>().ok())
        .unwrap_or(current_year)
        .clamp(1970, current_year);
    let year = q
        .year
        .unwrap_or(current_year)
        .clamp(registration_year, current_year);
    let from = format!("{year}-01-01");
    let to = format!("{}-01-01", year + 1);

    let rows = sqlx::query(
        "SELECT day, seconds_spent
         FROM user_daily_activity
         WHERE user_id = ? AND day >= ? AND day < ?
         ORDER BY day ASC",
    )
    .bind(&uid)
    .bind(&from)
    .bind(&to)
    .fetch_all(&state.pool)
    .await?;

    let mut total_seconds = 0_i64;
    let mut days = Vec::new();
    for r in rows {
        let secs: i64 = r.try_get("seconds_spent")?;
        total_seconds += secs;
        days.push(ActivityDayDto {
            day: r.try_get("day")?,
            seconds_spent: secs,
        });
    }

    Ok(Json(ActivitySummaryDto {
        year,
        registration_year,
        current_year,
        total_seconds,
        days,
    }))
}
