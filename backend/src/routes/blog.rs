use std::path::PathBuf;

use axum::{
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    routing::{get, patch, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Row, Sqlite};
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
    pub slug: String,
    pub excerpt: String,
    pub cover_image_url: String,
    pub status: String,
    pub author_nickname: String,
    pub created_at: String,
    pub published_at: Option<String>,
    pub updated_at: String,
    pub tags: Vec<String>,
    pub categories: Vec<String>,
    pub like_count: i64,
    pub comment_count: i64,
}

#[derive(Serialize)]
pub struct BlogPostDto {
    pub id: String,
    pub title: String,
    pub slug: String,
    pub excerpt: String,
    pub body: String,
    pub cover_image_url: String,
    pub status: String,
    pub author_id: String,
    pub author_nickname: String,
    pub created_at: String,
    pub published_at: Option<String>,
    pub updated_at: String,
    pub tags: Vec<String>,
    pub categories: Vec<String>,
    pub image_urls: Vec<String>,
    pub like_count: i64,
    pub bookmark_count: i64,
    pub comment_count: i64,
    pub liked_by_me: bool,
    pub bookmarked_by_me: bool,
    pub can_edit: bool,
}

#[derive(Serialize)]
pub struct TaxonomyItem {
    pub slug: String,
    pub name: String,
    pub post_count: i64,
}

#[derive(Serialize)]
pub struct CommentDto {
    pub id: String,
    pub post_id: String,
    pub user_id: String,
    pub author_nickname: String,
    pub body: String,
    pub status: String,
    pub parent_comment_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct PagedPosts {
    pub items: Vec<BlogListItem>,
    pub page: i64,
    pub page_size: i64,
    pub total: i64,
}

#[derive(Serialize)]
pub struct MyPostState {
    pub liked: bool,
    pub bookmarked: bool,
    pub can_edit: bool,
}

pub fn public_router() -> Router<AppState> {
    Router::new()
        .route("/api/blog", get(list_posts).post(create_post))
        .route("/api/blog/:id", get(get_post).patch(update_post).delete(delete_post))
        .route("/api/blog/:id/edit", get(get_post_for_edit))
        .route("/api/blog/:id/publish", post(publish_post))
        .route("/api/blog/:id/archive", post(archive_post))
        .route("/api/blog/mine", get(list_my_posts))
        .route("/api/blog/author/:nickname", get(list_author_posts))
        .route("/api/blog/tags", get(list_tags))
        .route("/api/blog/categories", get(list_categories))
        .route("/api/blog/:id/comments", get(list_comments).post(create_comment))
        .route(
            "/api/blog/comments/:id",
            patch(update_comment).delete(delete_comment),
        )
        .route("/api/blog/comments/:id/report", post(report_comment))
        .route("/api/blog/:id/report", post(report_post))
        .route("/api/blog/:id/like", post(like_post).delete(unlike_post))
        .route(
            "/api/blog/:id/bookmark",
            post(bookmark_post).delete(unbookmark_post),
        )
        .route("/api/blog/bookmarks/me", get(list_my_bookmarks))
        .route("/api/blog/:id/me", get(my_state_for_post))
        .route(
            "/api/blog/upload-image",
            post(upload_blog_image).layer(DefaultBodyLimit::max(5 * 1024 * 1024)),
        )
}

#[derive(Deserialize)]
pub struct CreateBlogBody {
    pub title: String,
    pub body: String,
    pub excerpt: Option<String>,
    pub slug: Option<String>,
    pub cover_image_url: Option<String>,
    pub status: Option<String>,
    pub tags: Option<Vec<String>>,
    pub categories: Option<Vec<String>>,
}

#[derive(Deserialize)]
pub struct UpdateBlogBody {
    pub title: Option<String>,
    pub body: Option<String>,
    pub excerpt: Option<String>,
    pub slug: Option<String>,
    pub cover_image_url: Option<String>,
    pub status: Option<String>,
    pub tags: Option<Vec<String>>,
    pub categories: Option<Vec<String>>,
}

#[derive(Deserialize)]
pub struct ListQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub q: Option<String>,
    pub tag: Option<String>,
    pub category: Option<String>,
    pub author: Option<String>,
}

#[derive(Deserialize)]
pub struct CommentBody {
    pub body: String,
    pub parent_comment_id: Option<String>,
}

#[derive(Deserialize)]
pub struct ReportBody {
    pub reason: String,
}

fn require_writer(user: &AuthUser) -> AppResult<()> {
    if user.status != "approved" {
        return Err(AppError::Forbidden);
    }
    if user.role != "teacher" && user.role != "admin" {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

fn require_approved(user: &AuthUser) -> AppResult<()> {
    if user.status != "approved" {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

fn normalize_status(status: Option<&str>, default_status: &str) -> AppResult<String> {
    let s = status.unwrap_or(default_status).trim().to_lowercase();
    match s.as_str() {
        "draft" | "published" | "archived" => Ok(s),
        _ => Err(AppError::BadRequest(
            "status must be draft, published, or archived".into(),
        )),
    }
}

fn clamp_pagination(page: Option<i64>, page_size: Option<i64>) -> (i64, i64) {
    let p = page.unwrap_or(1).max(1);
    let ps = page_size.unwrap_or(10).clamp(1, 50);
    (p, ps)
}

fn make_excerpt(body: &str) -> String {
    let cleaned = body.replace('\n', " ").trim().to_string();
    cleaned.chars().take(220).collect::<String>()
}

fn slugify(input: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in input.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    while out.starts_with('-') {
        out.remove(0);
    }
    if out.is_empty() {
        "post".into()
    } else {
        out
    }
}

async fn unique_slug(pool: &sqlx::SqlitePool, base: &str, except_post_id: Option<&str>) -> Result<String, sqlx::Error> {
    let trimmed = slugify(base);
    let mut candidate = trimmed.clone();
    let mut i = 2;
    loop {
        let exists = if let Some(except) = except_post_id {
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM blog_posts WHERE slug = ? AND id != ?",
            )
            .bind(&candidate)
            .bind(except)
            .fetch_one(pool)
            .await?
        } else {
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM blog_posts WHERE slug = ?")
                .bind(&candidate)
                .fetch_one(pool)
                .await?
        };
        if exists == 0 {
            return Ok(candidate);
        }
        candidate = format!("{trimmed}-{i}");
        i += 1;
    }
}

async fn load_terms_for_post(pool: &sqlx::SqlitePool, post_id: &str, kind: &str) -> Result<Vec<String>, sqlx::Error> {
    let sql = if kind == "tag" {
        "SELECT t.slug as slug
         FROM blog_post_tags pt
         JOIN blog_tags t ON t.id = pt.tag_id
         WHERE pt.post_id = ?
         ORDER BY t.slug"
    } else {
        "SELECT c.slug as slug
         FROM blog_post_categories pc
         JOIN blog_categories c ON c.id = pc.category_id
         WHERE pc.post_id = ?
         ORDER BY c.slug"
    };
    let rows = sqlx::query(sql).bind(post_id).fetch_all(pool).await?;
    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        out.push(r.try_get("slug")?);
    }
    Ok(out)
}

async fn load_images_for_post(pool: &sqlx::SqlitePool, post_id: &str) -> Result<Vec<String>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT url FROM blog_post_images WHERE post_id = ? ORDER BY created_at DESC",
    )
    .bind(post_id)
    .fetch_all(pool)
    .await?;
    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        out.push(r.try_get("url")?);
    }
    Ok(out)
}

async fn set_tags(pool: &sqlx::SqlitePool, post_id: &str, tags: &[String]) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM blog_post_tags WHERE post_id = ?")
        .bind(post_id)
        .execute(&mut *tx)
        .await?;
    for t in tags.iter().take(12) {
        let name = t.trim();
        if name.is_empty() {
            continue;
        }
        let slug = slugify(name);
        sqlx::query(
            "INSERT OR IGNORE INTO blog_tags (id, slug, name) VALUES (?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&slug)
        .bind(name)
        .execute(&mut *tx)
        .await?;
        let tag_id: String = sqlx::query_scalar("SELECT id FROM blog_tags WHERE slug = ?")
            .bind(&slug)
            .fetch_one(&mut *tx)
            .await?;
        sqlx::query(
            "INSERT OR IGNORE INTO blog_post_tags (post_id, tag_id) VALUES (?, ?)",
        )
        .bind(post_id)
        .bind(&tag_id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

async fn set_categories(pool: &sqlx::SqlitePool, post_id: &str, categories: &[String]) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM blog_post_categories WHERE post_id = ?")
        .bind(post_id)
        .execute(&mut *tx)
        .await?;
    for c in categories.iter().take(6) {
        let name = c.trim();
        if name.is_empty() {
            continue;
        }
        let slug = slugify(name);
        sqlx::query(
            "INSERT OR IGNORE INTO blog_categories (id, slug, name) VALUES (?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&slug)
        .bind(name)
        .execute(&mut *tx)
        .await?;
        let category_id: String =
            sqlx::query_scalar("SELECT id FROM blog_categories WHERE slug = ?")
                .bind(&slug)
                .fetch_one(&mut *tx)
                .await?;
        sqlx::query(
            "INSERT OR IGNORE INTO blog_post_categories (post_id, category_id) VALUES (?, ?)",
        )
        .bind(post_id)
        .bind(&category_id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

async fn post_dto(
    state: &AppState,
    post_id: &str,
    viewer: Option<&AuthUser>,
    include_unpublished: bool,
) -> AppResult<BlogPostDto> {
    let sql = if include_unpublished {
        "SELECT p.id, p.title, p.slug, p.excerpt, p.body, p.cover_image_url, p.status,
                p.author_id, p.created_at, p.published_at, p.updated_at, p.is_deleted,
                u.nickname as author_nickname
         FROM blog_posts p
         JOIN users u ON u.id = p.author_id
         WHERE p.id = ?"
    } else {
        "SELECT p.id, p.title, p.slug, p.excerpt, p.body, p.cover_image_url, p.status,
                p.author_id, p.created_at, p.published_at, p.updated_at, p.is_deleted,
                u.nickname as author_nickname
         FROM blog_posts p
         JOIN users u ON u.id = p.author_id
         WHERE p.id = ? AND p.status = 'published' AND p.is_deleted = 0"
    };
    let r = sqlx::query(sql)
        .bind(post_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;

    let is_deleted: i64 = r.try_get("is_deleted")?;
    if is_deleted != 0 {
        return Err(AppError::NotFound);
    }

    let author_id: String = r.try_get("author_id")?;
    let liked_by_me = if let Some(v) = viewer {
        let c: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM blog_post_likes WHERE post_id = ? AND user_id = ?",
        )
        .bind(post_id)
        .bind(&v.id)
        .fetch_one(&state.pool)
        .await?;
        c > 0
    } else {
        false
    };
    let bookmarked_by_me = if let Some(v) = viewer {
        let c: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM blog_post_bookmarks WHERE post_id = ? AND user_id = ?",
        )
        .bind(post_id)
        .bind(&v.id)
        .fetch_one(&state.pool)
        .await?;
        c > 0
    } else {
        false
    };

    let like_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM blog_post_likes WHERE post_id = ?")
            .bind(post_id)
            .fetch_one(&state.pool)
            .await?;
    let bookmark_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM blog_post_bookmarks WHERE post_id = ?")
            .bind(post_id)
            .fetch_one(&state.pool)
            .await?;
    let comment_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM blog_comments WHERE post_id = ? AND status = 'visible'",
    )
    .bind(post_id)
    .fetch_one(&state.pool)
    .await?;

    let tags = load_terms_for_post(&state.pool, post_id, "tag").await?;
    let categories = load_terms_for_post(&state.pool, post_id, "category").await?;
    let image_urls = load_images_for_post(&state.pool, post_id).await?;

    let can_edit = viewer
        .map(|v| v.role == "admin" || (v.id == author_id && v.status == "approved"))
        .unwrap_or(false);

    Ok(BlogPostDto {
        id: r.try_get("id")?,
        title: r.try_get("title")?,
        slug: r.try_get("slug")?,
        excerpt: r.try_get("excerpt")?,
        body: r.try_get("body")?,
        cover_image_url: r.try_get("cover_image_url")?,
        status: r.try_get("status")?,
        author_id,
        author_nickname: r.try_get("author_nickname")?,
        created_at: r.try_get("created_at")?,
        published_at: r.try_get("published_at")?,
        updated_at: r.try_get("updated_at")?,
        tags,
        categories,
        image_urls,
        like_count,
        bookmark_count,
        comment_count,
        liked_by_me,
        bookmarked_by_me,
        can_edit,
    })
}

async fn create_post(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateBlogBody>,
) -> AppResult<Json<BlogPostDto>> {
    require_writer(&user)?;
    let title = body.title.trim();
    let content = body.body.trim();
    if title.is_empty() || content.is_empty() {
        return Err(AppError::BadRequest("title and body required".into()));
    }
    if title.chars().count() > 180 {
        return Err(AppError::BadRequest("title too long (max 180)".into()));
    }
    let status = normalize_status(body.status.as_deref(), "draft")?;
    let slug_seed = body.slug.unwrap_or_else(|| title.to_string());
    let slug = unique_slug(&state.pool, &slug_seed, None).await?;
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let excerpt = body
        .excerpt
        .unwrap_or_else(|| make_excerpt(content))
        .chars()
        .take(240)
        .collect::<String>();
    let cover = body
        .cover_image_url
        .unwrap_or_default()
        .chars()
        .take(500)
        .collect::<String>();
    let published_at = if status == "published" {
        Some(now.clone())
    } else {
        None
    };

    sqlx::query(
        "INSERT INTO blog_posts (
            id, author_id, title, slug, excerpt, body, cover_image_url, status,
            created_at, updated_at, published_at, is_deleted
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
    )
    .bind(&id)
    .bind(&user.id)
    .bind(title)
    .bind(&slug)
    .bind(&excerpt)
    .bind(content)
    .bind(&cover)
    .bind(&status)
    .bind(&now)
    .bind(&now)
    .bind(&published_at)
    .execute(&state.pool)
    .await?;

    if let Some(tags) = body.tags {
        set_tags(&state.pool, &id, &tags).await?;
    }
    if let Some(categories) = body.categories {
        set_categories(&state.pool, &id, &categories).await?;
    }

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

    Ok(Json(post_dto(&state, &id, Some(&user), true).await?))
}

async fn list_posts(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<PagedPosts>> {
    let (page, page_size) = clamp_pagination(q.page, q.page_size);
    let offset = (page - 1) * page_size;

    let mut count_qb: QueryBuilder<Sqlite> = QueryBuilder::new(
        "SELECT COUNT(*) as total
         FROM blog_posts p
         JOIN users u ON u.id = p.author_id
         WHERE p.status = 'published' AND p.is_deleted = 0",
    );
    let mut list_qb: QueryBuilder<Sqlite> = QueryBuilder::new(
        "SELECT p.id, p.title, p.slug, p.excerpt, p.cover_image_url, p.status, p.created_at, p.published_at, p.updated_at,
                u.nickname as author_nickname
         FROM blog_posts p
         JOIN users u ON u.id = p.author_id
         WHERE p.status = 'published' AND p.is_deleted = 0",
    );

    if let Some(tag) = q.tag.as_ref().map(|v| v.trim()).filter(|v| !v.is_empty()) {
        count_qb.push(
            " AND EXISTS (
                SELECT 1 FROM blog_post_tags pt
                JOIN blog_tags t ON t.id = pt.tag_id
                WHERE pt.post_id = p.id AND t.slug = ",
        );
        count_qb.push_bind(slugify(tag));
        count_qb.push(")");

        list_qb.push(
            " AND EXISTS (
                SELECT 1 FROM blog_post_tags pt
                JOIN blog_tags t ON t.id = pt.tag_id
                WHERE pt.post_id = p.id AND t.slug = ",
        );
        list_qb.push_bind(slugify(tag));
        list_qb.push(")");
    }
    if let Some(category) = q
        .category
        .as_ref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    {
        count_qb.push(
            " AND EXISTS (
                SELECT 1 FROM blog_post_categories pc
                JOIN blog_categories c ON c.id = pc.category_id
                WHERE pc.post_id = p.id AND c.slug = ",
        );
        count_qb.push_bind(slugify(category));
        count_qb.push(")");

        list_qb.push(
            " AND EXISTS (
                SELECT 1 FROM blog_post_categories pc
                JOIN blog_categories c ON c.id = pc.category_id
                WHERE pc.post_id = p.id AND c.slug = ",
        );
        list_qb.push_bind(slugify(category));
        list_qb.push(")");
    }
    if let Some(author) = q.author.as_ref().map(|v| v.trim()).filter(|v| !v.is_empty()) {
        count_qb.push(" AND u.nickname = ");
        count_qb.push_bind(author.to_string());
        list_qb.push(" AND u.nickname = ");
        list_qb.push_bind(author.to_string());
    }
    if let Some(search) = q.q.as_ref().map(|v| v.trim()).filter(|v| !v.is_empty()) {
        let like = format!("%{search}%");
        count_qb.push(
            " AND (
                p.id IN (SELECT post_id FROM blog_posts_fts WHERE blog_posts_fts MATCH ",
        );
        count_qb.push_bind(search.to_string());
        count_qb.push(") OR p.title LIKE ");
        count_qb.push_bind(like.clone());
        count_qb.push(" OR p.body LIKE ");
        count_qb.push_bind(like.clone());
        count_qb.push(")");

        list_qb.push(
            " AND (
                p.id IN (SELECT post_id FROM blog_posts_fts WHERE blog_posts_fts MATCH ",
        );
        list_qb.push_bind(search.to_string());
        list_qb.push(") OR p.title LIKE ");
        list_qb.push_bind(like.clone());
        list_qb.push(" OR p.body LIKE ");
        list_qb.push_bind(like);
        list_qb.push(")");
    }

    list_qb.push(" ORDER BY COALESCE(p.published_at, p.created_at) DESC LIMIT ");
    list_qb.push_bind(page_size);
    list_qb.push(" OFFSET ");
    list_qb.push_bind(offset);

    let total_row = count_qb.build().fetch_one(&state.pool).await?;
    let total: i64 = total_row.try_get("total")?;
    let rows = list_qb.build().fetch_all(&state.pool).await?;

    let mut items = Vec::with_capacity(rows.len());
    for r in rows {
        let id: String = r.try_get("id")?;
        let tags = load_terms_for_post(&state.pool, &id, "tag").await?;
        let categories = load_terms_for_post(&state.pool, &id, "category").await?;
        let like_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM blog_post_likes WHERE post_id = ?")
                .bind(&id)
                .fetch_one(&state.pool)
                .await?;
        let comment_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM blog_comments WHERE post_id = ? AND status = 'visible'",
        )
        .bind(&id)
        .fetch_one(&state.pool)
        .await?;
        items.push(BlogListItem {
            id,
            title: r.try_get("title")?,
            slug: r.try_get("slug")?,
            excerpt: r.try_get("excerpt")?,
            cover_image_url: r.try_get("cover_image_url")?,
            status: r.try_get("status")?,
            author_nickname: r.try_get("author_nickname")?,
            created_at: r.try_get("created_at")?,
            published_at: r.try_get("published_at")?,
            updated_at: r.try_get("updated_at")?,
            tags,
            categories,
            like_count,
            comment_count,
        });
    }

    Ok(Json(PagedPosts {
        items,
        page,
        page_size,
        total,
    }))
}

async fn list_my_posts(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<PagedPosts>> {
    require_writer(&user)?;
    let (page, page_size) = clamp_pagination(q.page, q.page_size);
    let offset = (page - 1) * page_size;
    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM blog_posts WHERE author_id = ? AND is_deleted = 0",
    )
    .bind(&user.id)
    .fetch_one(&state.pool)
    .await?;
    let rows = sqlx::query(
        "SELECT p.id, p.title, p.slug, p.excerpt, p.cover_image_url, p.status, p.created_at, p.published_at, p.updated_at,
                u.nickname as author_nickname
         FROM blog_posts p
         JOIN users u ON u.id = p.author_id
         WHERE p.author_id = ? AND p.is_deleted = 0
         ORDER BY p.updated_at DESC
         LIMIT ? OFFSET ?",
    )
    .bind(&user.id)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    let mut items = Vec::with_capacity(rows.len());
    for r in rows {
        let id: String = r.try_get("id")?;
        items.push(BlogListItem {
            id: id.clone(),
            title: r.try_get("title")?,
            slug: r.try_get("slug")?,
            excerpt: r.try_get("excerpt")?,
            cover_image_url: r.try_get("cover_image_url")?,
            status: r.try_get("status")?,
            author_nickname: r.try_get("author_nickname")?,
            created_at: r.try_get("created_at")?,
            published_at: r.try_get("published_at")?,
            updated_at: r.try_get("updated_at")?,
            tags: load_terms_for_post(&state.pool, &id, "tag").await?,
            categories: load_terms_for_post(&state.pool, &id, "category").await?,
            like_count: sqlx::query_scalar("SELECT COUNT(*) FROM blog_post_likes WHERE post_id = ?")
                .bind(&id)
                .fetch_one(&state.pool)
                .await?,
            comment_count: sqlx::query_scalar(
                "SELECT COUNT(*) FROM blog_comments WHERE post_id = ? AND status = 'visible'",
            )
            .bind(&id)
            .fetch_one(&state.pool)
            .await?,
        });
    }
    Ok(Json(PagedPosts {
        items,
        page,
        page_size,
        total,
    }))
}

async fn list_author_posts(
    State(state): State<AppState>,
    Path(nickname): Path<String>,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<PagedPosts>> {
    let (page, page_size) = clamp_pagination(q.page, q.page_size);
    let offset = (page - 1) * page_size;
    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)
         FROM blog_posts p
         JOIN users u ON u.id = p.author_id
         WHERE u.nickname = ? AND p.status = 'published' AND p.is_deleted = 0",
    )
    .bind(&nickname)
    .fetch_one(&state.pool)
    .await?;
    let rows = sqlx::query(
        "SELECT p.id, p.title, p.slug, p.excerpt, p.cover_image_url, p.status, p.created_at, p.published_at, p.updated_at,
                u.nickname as author_nickname
         FROM blog_posts p
         JOIN users u ON u.id = p.author_id
         WHERE u.nickname = ? AND p.status = 'published' AND p.is_deleted = 0
         ORDER BY COALESCE(p.published_at, p.created_at) DESC
         LIMIT ? OFFSET ?",
    )
    .bind(&nickname)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;
    let mut items = Vec::new();
    for r in rows {
        let id: String = r.try_get("id")?;
        items.push(BlogListItem {
            id: id.clone(),
            title: r.try_get("title")?,
            slug: r.try_get("slug")?,
            excerpt: r.try_get("excerpt")?,
            cover_image_url: r.try_get("cover_image_url")?,
            status: r.try_get("status")?,
            author_nickname: r.try_get("author_nickname")?,
            created_at: r.try_get("created_at")?,
            published_at: r.try_get("published_at")?,
            updated_at: r.try_get("updated_at")?,
            tags: load_terms_for_post(&state.pool, &id, "tag").await?,
            categories: load_terms_for_post(&state.pool, &id, "category").await?,
            like_count: sqlx::query_scalar("SELECT COUNT(*) FROM blog_post_likes WHERE post_id = ?")
                .bind(&id)
                .fetch_one(&state.pool)
                .await?,
            comment_count: sqlx::query_scalar(
                "SELECT COUNT(*) FROM blog_comments WHERE post_id = ? AND status = 'visible'",
            )
            .bind(&id)
            .fetch_one(&state.pool)
            .await?,
        });
    }

    Ok(Json(PagedPosts {
        items,
        page,
        page_size,
        total,
    }))
}

async fn get_post(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<BlogPostDto>> {
    Ok(Json(post_dto(&state, &id, None, false).await?))
}

async fn get_post_for_edit(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<BlogPostDto>> {
    require_writer(&user)?;
    let post = post_dto(&state, &id, Some(&user), true).await?;
    if user.role != "admin" && post.author_id != user.id {
        return Err(AppError::Forbidden);
    }
    Ok(Json(post))
}

async fn update_post(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<UpdateBlogBody>,
) -> AppResult<Json<BlogPostDto>> {
    require_writer(&user)?;
    let r = sqlx::query(
        "SELECT author_id, title, body, excerpt, slug, cover_image_url, status, published_at
         FROM blog_posts WHERE id = ? AND is_deleted = 0",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let author_id: String = r.try_get("author_id")?;
    if user.role != "admin" && user.id != author_id {
        return Err(AppError::Forbidden);
    }

    let title = body
        .title
        .unwrap_or_else(|| r.try_get::<String, _>("title").unwrap_or_default())
        .chars()
        .take(180)
        .collect::<String>();
    if title.trim().is_empty() {
        return Err(AppError::BadRequest("title required".into()));
    }
    let current_body: String = r.try_get("body")?;
    let content = body.body.unwrap_or(current_body);
    if content.trim().is_empty() {
        return Err(AppError::BadRequest("body required".into()));
    }
    let current_status: String = r.try_get("status")?;
    let status = normalize_status(body.status.as_deref(), &current_status)?;
    let slug_seed = body.slug.unwrap_or_else(|| title.clone());
    let slug = unique_slug(&state.pool, &slug_seed, Some(&id)).await?;
    let excerpt = body
        .excerpt
        .unwrap_or_else(|| make_excerpt(&content))
        .chars()
        .take(240)
        .collect::<String>();
    let cover = body
        .cover_image_url
        .unwrap_or_else(|| r.try_get::<String, _>("cover_image_url").unwrap_or_default())
        .chars()
        .take(500)
        .collect::<String>();
    let now = chrono::Utc::now().to_rfc3339();
    let current_published: Option<String> = r.try_get("published_at")?;
    let published = if status == "published" {
        Some(current_published.unwrap_or_else(|| now.clone()))
    } else {
        None
    };

    sqlx::query(
        "UPDATE blog_posts
         SET title = ?, body = ?, excerpt = ?, slug = ?, cover_image_url = ?, status = ?, published_at = ?, updated_at = ?
         WHERE id = ?",
    )
    .bind(&title)
    .bind(&content)
    .bind(&excerpt)
    .bind(&slug)
    .bind(&cover)
    .bind(&status)
    .bind(&published)
    .bind(&now)
    .bind(&id)
    .execute(&state.pool)
    .await?;

    if let Some(tags) = body.tags {
        set_tags(&state.pool, &id, &tags).await?;
    }
    if let Some(categories) = body.categories {
        set_categories(&state.pool, &id, &categories).await?;
    }

    Ok(Json(post_dto(&state, &id, Some(&user), true).await?))
}

async fn publish_post(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_writer(&user)?;
    let r = sqlx::query("SELECT author_id FROM blog_posts WHERE id = ? AND is_deleted = 0")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;
    let author_id: String = r.try_get("author_id")?;
    if user.role != "admin" && user.id != author_id {
        return Err(AppError::Forbidden);
    }
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE blog_posts
         SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ?
         WHERE id = ?",
    )
    .bind(&now)
    .bind(&now)
    .bind(&id)
    .execute(&state.pool)
    .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn archive_post(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_writer(&user)?;
    let r = sqlx::query("SELECT author_id FROM blog_posts WHERE id = ? AND is_deleted = 0")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;
    let author_id: String = r.try_get("author_id")?;
    if user.role != "admin" && user.id != author_id {
        return Err(AppError::Forbidden);
    }
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE blog_posts
         SET status = 'archived', updated_at = ?
         WHERE id = ?",
    )
    .bind(&now)
    .bind(&id)
    .execute(&state.pool)
    .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn delete_post(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_writer(&user)?;
    let r = sqlx::query("SELECT author_id FROM blog_posts WHERE id = ? AND is_deleted = 0")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;
    let author_id: String = r.try_get("author_id")?;
    if user.role != "admin" && user.id != author_id {
        return Err(AppError::Forbidden);
    }
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE blog_posts
         SET is_deleted = 1, status = 'archived', updated_at = ?
         WHERE id = ?",
    )
    .bind(&now)
    .bind(&id)
    .execute(&state.pool)
    .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn list_tags(State(state): State<AppState>) -> AppResult<Json<Vec<TaxonomyItem>>> {
    let rows = sqlx::query(
        "SELECT t.slug, t.name, COUNT(pt.post_id) as post_count
         FROM blog_tags t
         LEFT JOIN blog_post_tags pt ON pt.tag_id = t.id
         LEFT JOIN blog_posts p ON p.id = pt.post_id AND p.status = 'published' AND p.is_deleted = 0
         GROUP BY t.id, t.slug, t.name
         ORDER BY post_count DESC, t.slug",
    )
    .fetch_all(&state.pool)
    .await?;
    let mut out = Vec::new();
    for r in rows {
        out.push(TaxonomyItem {
            slug: r.try_get("slug")?,
            name: r.try_get("name")?,
            post_count: r.try_get("post_count")?,
        });
    }
    Ok(Json(out))
}

async fn list_categories(State(state): State<AppState>) -> AppResult<Json<Vec<TaxonomyItem>>> {
    let rows = sqlx::query(
        "SELECT c.slug, c.name, COUNT(pc.post_id) as post_count
         FROM blog_categories c
         LEFT JOIN blog_post_categories pc ON pc.category_id = c.id
         LEFT JOIN blog_posts p ON p.id = pc.post_id AND p.status = 'published' AND p.is_deleted = 0
         GROUP BY c.id, c.slug, c.name
         ORDER BY post_count DESC, c.slug",
    )
    .fetch_all(&state.pool)
    .await?;
    let mut out = Vec::new();
    for r in rows {
        out.push(TaxonomyItem {
            slug: r.try_get("slug")?,
            name: r.try_get("name")?,
            post_count: r.try_get("post_count")?,
        });
    }
    Ok(Json(out))
}

async fn list_comments(
    State(state): State<AppState>,
    Path(post_id): Path<String>,
) -> AppResult<Json<Vec<CommentDto>>> {
    let rows = sqlx::query(
        "SELECT c.id, c.post_id, c.user_id, c.body, c.status, c.parent_comment_id, c.created_at, c.updated_at, u.nickname as author_nickname
         FROM blog_comments c
         JOIN users u ON u.id = c.user_id
         JOIN blog_posts p ON p.id = c.post_id
         WHERE c.post_id = ? AND c.status = 'visible' AND p.status = 'published' AND p.is_deleted = 0
         ORDER BY c.created_at ASC",
    )
    .bind(&post_id)
    .fetch_all(&state.pool)
    .await?;
    let mut out = Vec::new();
    for r in rows {
        out.push(CommentDto {
            id: r.try_get("id")?,
            post_id: r.try_get("post_id")?,
            user_id: r.try_get("user_id")?,
            author_nickname: r.try_get("author_nickname")?,
            body: r.try_get("body")?,
            status: r.try_get("status")?,
            parent_comment_id: r.try_get("parent_comment_id")?,
            created_at: r.try_get("created_at")?,
            updated_at: r.try_get("updated_at")?,
        });
    }
    Ok(Json(out))
}

async fn create_comment(
    State(state): State<AppState>,
    user: AuthUser,
    Path(post_id): Path<String>,
    Json(body): Json<CommentBody>,
) -> AppResult<Json<CommentDto>> {
    require_approved(&user)?;
    let text = body.body.trim();
    if text.is_empty() {
        return Err(AppError::BadRequest("comment body required".into()));
    }
    let exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM blog_posts WHERE id = ? AND status = 'published' AND is_deleted = 0",
    )
    .bind(&post_id)
    .fetch_one(&state.pool)
    .await?;
    if exists == 0 {
        return Err(AppError::NotFound);
    }
    let now = chrono::Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO blog_comments (id, post_id, user_id, parent_comment_id, body, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'visible', ?, ?)",
    )
    .bind(&id)
    .bind(&post_id)
    .bind(&user.id)
    .bind(&body.parent_comment_id)
    .bind(text)
    .bind(&now)
    .bind(&now)
    .execute(&state.pool)
    .await?;

    let r = sqlx::query(
        "SELECT c.id, c.post_id, c.user_id, c.body, c.status, c.parent_comment_id, c.created_at, c.updated_at, u.nickname as author_nickname
         FROM blog_comments c
         JOIN users u ON u.id = c.user_id
         WHERE c.id = ?",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(CommentDto {
        id: r.try_get("id")?,
        post_id: r.try_get("post_id")?,
        user_id: r.try_get("user_id")?,
        author_nickname: r.try_get("author_nickname")?,
        body: r.try_get("body")?,
        status: r.try_get("status")?,
        parent_comment_id: r.try_get("parent_comment_id")?,
        created_at: r.try_get("created_at")?,
        updated_at: r.try_get("updated_at")?,
    }))
}

async fn update_comment(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<CommentBody>,
) -> AppResult<Json<CommentDto>> {
    require_approved(&user)?;
    let text = body.body.trim();
    if text.is_empty() {
        return Err(AppError::BadRequest("comment body required".into()));
    }
    let r = sqlx::query("SELECT user_id FROM blog_comments WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;
    let author_id: String = r.try_get("user_id")?;
    if user.role != "admin" && author_id != user.id {
        return Err(AppError::Forbidden);
    }
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query("UPDATE blog_comments SET body = ?, updated_at = ? WHERE id = ?")
        .bind(text)
        .bind(&now)
        .bind(&id)
        .execute(&state.pool)
        .await?;
    let row = sqlx::query(
        "SELECT c.id, c.post_id, c.user_id, c.body, c.status, c.parent_comment_id, c.created_at, c.updated_at, u.nickname as author_nickname
         FROM blog_comments c
         JOIN users u ON u.id = c.user_id
         WHERE c.id = ?",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(CommentDto {
        id: row.try_get("id")?,
        post_id: row.try_get("post_id")?,
        user_id: row.try_get("user_id")?,
        author_nickname: row.try_get("author_nickname")?,
        body: row.try_get("body")?,
        status: row.try_get("status")?,
        parent_comment_id: row.try_get("parent_comment_id")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    }))
}

async fn delete_comment(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_approved(&user)?;
    let r = sqlx::query("SELECT user_id FROM blog_comments WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;
    let author_id: String = r.try_get("user_id")?;
    if user.role != "admin" && author_id != user.id {
        return Err(AppError::Forbidden);
    }
    sqlx::query("DELETE FROM blog_comments WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn like_post(
    State(state): State<AppState>,
    user: AuthUser,
    Path(post_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_approved(&user)?;
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT OR IGNORE INTO blog_post_likes (user_id, post_id, created_at) VALUES (?, ?, ?)",
    )
    .bind(&user.id)
    .bind(&post_id)
    .bind(&now)
    .execute(&state.pool)
    .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn unlike_post(
    State(state): State<AppState>,
    user: AuthUser,
    Path(post_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_approved(&user)?;
    sqlx::query("DELETE FROM blog_post_likes WHERE user_id = ? AND post_id = ?")
        .bind(&user.id)
        .bind(&post_id)
        .execute(&state.pool)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn bookmark_post(
    State(state): State<AppState>,
    user: AuthUser,
    Path(post_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_approved(&user)?;
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT OR IGNORE INTO blog_post_bookmarks (user_id, post_id, created_at) VALUES (?, ?, ?)",
    )
    .bind(&user.id)
    .bind(&post_id)
    .bind(&now)
    .execute(&state.pool)
    .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn unbookmark_post(
    State(state): State<AppState>,
    user: AuthUser,
    Path(post_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_approved(&user)?;
    sqlx::query("DELETE FROM blog_post_bookmarks WHERE user_id = ? AND post_id = ?")
        .bind(&user.id)
        .bind(&post_id)
        .execute(&state.pool)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn my_state_for_post(
    State(state): State<AppState>,
    user: AuthUser,
    Path(post_id): Path<String>,
) -> AppResult<Json<MyPostState>> {
    require_approved(&user)?;
    let liked: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM blog_post_likes WHERE user_id = ? AND post_id = ?",
    )
    .bind(&user.id)
    .bind(&post_id)
    .fetch_one(&state.pool)
    .await?;
    let bookmarked: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM blog_post_bookmarks WHERE user_id = ? AND post_id = ?",
    )
    .bind(&user.id)
    .bind(&post_id)
    .fetch_one(&state.pool)
    .await?;
    let author_id: Option<String> = sqlx::query_scalar("SELECT author_id FROM blog_posts WHERE id = ?")
        .bind(&post_id)
        .fetch_optional(&state.pool)
        .await?;
    let can_edit = author_id
        .map(|aid| user.role == "admin" || (user.status == "approved" && aid == user.id))
        .unwrap_or(false);
    Ok(Json(MyPostState {
        liked: liked > 0,
        bookmarked: bookmarked > 0,
        can_edit,
    }))
}

async fn list_my_bookmarks(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<PagedPosts>> {
    require_approved(&user)?;
    let (page, page_size) = clamp_pagination(q.page, q.page_size);
    let offset = (page - 1) * page_size;
    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)
         FROM blog_post_bookmarks b
         JOIN blog_posts p ON p.id = b.post_id
         WHERE b.user_id = ? AND p.status = 'published' AND p.is_deleted = 0",
    )
    .bind(&user.id)
    .fetch_one(&state.pool)
    .await?;
    let rows = sqlx::query(
        "SELECT p.id, p.title, p.slug, p.excerpt, p.cover_image_url, p.status, p.created_at, p.published_at, p.updated_at,
                u.nickname as author_nickname
         FROM blog_post_bookmarks b
         JOIN blog_posts p ON p.id = b.post_id
         JOIN users u ON u.id = p.author_id
         WHERE b.user_id = ? AND p.status = 'published' AND p.is_deleted = 0
         ORDER BY b.created_at DESC
         LIMIT ? OFFSET ?",
    )
    .bind(&user.id)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    let mut items = Vec::new();
    for r in rows {
        let id: String = r.try_get("id")?;
        items.push(BlogListItem {
            id: id.clone(),
            title: r.try_get("title")?,
            slug: r.try_get("slug")?,
            excerpt: r.try_get("excerpt")?,
            cover_image_url: r.try_get("cover_image_url")?,
            status: r.try_get("status")?,
            author_nickname: r.try_get("author_nickname")?,
            created_at: r.try_get("created_at")?,
            published_at: r.try_get("published_at")?,
            updated_at: r.try_get("updated_at")?,
            tags: load_terms_for_post(&state.pool, &id, "tag").await?,
            categories: load_terms_for_post(&state.pool, &id, "category").await?,
            like_count: sqlx::query_scalar("SELECT COUNT(*) FROM blog_post_likes WHERE post_id = ?")
                .bind(&id)
                .fetch_one(&state.pool)
                .await?,
            comment_count: sqlx::query_scalar(
                "SELECT COUNT(*) FROM blog_comments WHERE post_id = ? AND status = 'visible'",
            )
            .bind(&id)
            .fetch_one(&state.pool)
            .await?,
        });
    }
    Ok(Json(PagedPosts {
        items,
        page,
        page_size,
        total,
    }))
}

async fn report_post(
    State(state): State<AppState>,
    user: AuthUser,
    Path(post_id): Path<String>,
    Json(body): Json<ReportBody>,
) -> AppResult<Json<serde_json::Value>> {
    require_approved(&user)?;
    let reason = body.reason.trim();
    if reason.is_empty() {
        return Err(AppError::BadRequest("reason required".into()));
    }
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO blog_reports (
            id, target_type, target_post_id, target_comment_id, reporter_user_id, reason, status, created_at
         ) VALUES (?, 'post', ?, NULL, ?, ?, 'open', ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&post_id)
    .bind(&user.id)
    .bind(reason)
    .bind(&now)
    .execute(&state.pool)
    .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn report_comment(
    State(state): State<AppState>,
    user: AuthUser,
    Path(comment_id): Path<String>,
    Json(body): Json<ReportBody>,
) -> AppResult<Json<serde_json::Value>> {
    require_approved(&user)?;
    let reason = body.reason.trim();
    if reason.is_empty() {
        return Err(AppError::BadRequest("reason required".into()));
    }
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO blog_reports (
            id, target_type, target_post_id, target_comment_id, reporter_user_id, reason, status, created_at
         )
         SELECT ?, 'comment', c.post_id, c.id, ?, ?, 'open', ?
         FROM blog_comments c WHERE c.id = ?",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&user.id)
    .bind(reason)
    .bind(&now)
    .bind(&comment_id)
    .execute(&state.pool)
    .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
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
    if &buf[0..4] == b"RIFF" && &buf[8..12] == b"WEBP" {
        return Ok("webp");
    }
    Err(AppError::BadRequest(
        "allowed: JPEG, PNG, GIF, WebP".into(),
    ))
}

fn blog_images_dir(state: &AppState) -> PathBuf {
    state.uploads_serve_root.join("blog")
}

async fn upload_blog_image(
    State(state): State<AppState>,
    user: AuthUser,
    mut multipart: Multipart,
) -> AppResult<Json<serde_json::Value>> {
    require_writer(&user)?;
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut post_id: Option<String> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("");
        if name == "post_id" {
            let val = field
                .text()
                .await
                .map_err(|e| AppError::BadRequest(e.to_string()))?;
            if !val.trim().is_empty() {
                post_id = Some(val.trim().to_string());
            }
            continue;
        }
        if name != "file" && name != "image" {
            continue;
        }
        let data = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(e.to_string()))?;
        if data.len() > 4_000_000 {
            return Err(AppError::BadRequest("max 4 MB".into()));
        }
        file_bytes = Some(data.to_vec());
        break;
    }
    let buf = file_bytes.ok_or_else(|| AppError::BadRequest("missing image file".into()))?;
    let ext = sniff_image_ext(&buf)?;
    let dir = blog_images_dir(&state);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::BadRequest(format!("mkdir: {e}")))?;
    let filename = format!("{}-{}.{}", user.id, Uuid::new_v4().simple(), ext);
    let disk_path = dir.join(&filename);
    tokio::fs::write(&disk_path, &buf)
        .await
        .map_err(|e| AppError::BadRequest(format!("write: {e}")))?;
    let public_path = format!("/uploads/blog/{filename}");
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO blog_post_images (id, post_id, uploader_user_id, url, created_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(post_id)
    .bind(&user.id)
    .bind(&public_path)
    .bind(&now)
    .execute(&state.pool)
    .await?;
    Ok(Json(serde_json::json!({ "url": public_path })))
}

#[cfg(test)]
mod tests {
    use super::{normalize_status, require_writer, slugify};
    use crate::auth::AuthUser;

    #[test]
    fn slugify_generates_stable_slug() {
        assert_eq!(slugify("Hello, Blog Platform!"), "hello-blog-platform");
        assert_eq!(slugify("___"), "post");
    }

    #[test]
    fn status_parser_accepts_supported_values() {
        assert_eq!(normalize_status(Some("draft"), "published").unwrap(), "draft");
        assert_eq!(
            normalize_status(Some("published"), "draft").unwrap(),
            "published"
        );
        assert!(normalize_status(Some("weird"), "draft").is_err());
    }

    #[test]
    fn writer_guard_requires_approved_teacher_or_admin() {
        let student = AuthUser {
            id: "u1".into(),
            role: "student".into(),
            status: "approved".into(),
        };
        let teacher_pending = AuthUser {
            id: "u2".into(),
            role: "teacher".into(),
            status: "pending".into(),
        };
        let admin_ok = AuthUser {
            id: "u3".into(),
            role: "admin".into(),
            status: "approved".into(),
        };
        assert!(require_writer(&student).is_err());
        assert!(require_writer(&teacher_pending).is_err());
        assert!(require_writer(&admin_ok).is_ok());
    }
}
