mod admin;
pub mod auth;
mod blog;
mod courses;
mod invites;
mod users;

use axum::Router;

use crate::state::AppState;

pub fn api_router() -> Router<AppState> {
    Router::new()
        .merge(blog::public_router())
        .merge(auth::router())
        .merge(users::router())
        .merge(courses::router())
        .merge(invites::router())
        .merge(admin::router())
}
