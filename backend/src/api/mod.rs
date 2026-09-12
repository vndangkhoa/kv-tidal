pub mod artists;
pub mod devices;
pub mod download;
pub mod fs;
pub mod library;
pub mod lyrics;
pub mod recommendations;
pub mod search;
pub mod search_tracker;
pub mod stream;
pub mod trending;

use crate::state::AppState;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new()
        .nest("/artists", artists::router())
        .nest("/trending", trending::router())
        .nest("/search", search::router())
        .nest("/download", download::router())
        .nest("/library", library::router())
        .nest("/fs", fs::router())
        .nest("/stream", stream::router())
        .nest("/lyrics", lyrics::router())
        .nest("/recommendations", recommendations::router())
        .nest("/devices", devices::router())
}

