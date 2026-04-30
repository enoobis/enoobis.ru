use std::path::PathBuf;

use sqlx::SqlitePool;

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub jwt_secret: String,
    /// Каталог, из которого отдаётся `/uploads/...` (внутри — `avatars/`).
    pub uploads_serve_root: PathBuf,
}
