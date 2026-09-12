use crate::state::AppState;
use crate::trending::refresh_all_trending;
use axum::extract::{Query, State};
use axum::response::Json;
use axum::routing::{get, post};
use axum::Router;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct TrendingQuery {
    pub region: Option<String>,
}

async fn get_trending(
    Query(query): Query<TrendingQuery>,
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let trending = state.trending.read().await;
    match query.region.as_deref() {
        Some("vn") => Json(serde_json::json!({
            "tracks": trending.vietnam,
            "albums": trending.vietnam_albums,
            "last_updated": trending.last_updated
        })),
        Some("global") => Json(serde_json::json!({
            "tracks": trending.global,
            "albums": trending.global_albums,
            "last_updated": trending.last_updated
        })),
        _ => Json(serde_json::json!({
            "vietnam": trending.vietnam,
            "global": trending.global,
            "vietnam_albums": trending.vietnam_albums,
            "global_albums": trending.global_albums,
            "last_updated": trending.last_updated
        })),
    }
}

#[derive(Debug, Deserialize)]
pub struct AlbumLookupQuery {
    pub id: String,
}

async fn get_album_tracks(
    Query(query): Query<AlbumLookupQuery>,
) -> Json<serde_json::Value> {
    let client = reqwest::Client::new();
    let url = format!("https://itunes.apple.com/lookup?id={}&entity=song", query.id);
    if let Ok(resp) = client.get(&url).send().await {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            if let Some(results) = json.get("results").and_then(|r| r.as_array()) {
                let collection = results.iter().find(|i| i.get("wrapperType").and_then(|w| w.as_str()) == Some("collection"));
                let tracks: Vec<_> = results.iter().filter(|i| i.get("wrapperType").and_then(|w| w.as_str()) == Some("track")).collect();
                return Json(serde_json::json!({
                    "collection": collection,
                    "tracks": tracks
                }));
            }
        }
    }
    Json(serde_json::json!({ "tracks": [] }))
}

async fn force_refresh_trending(State(state): State<AppState>) -> Json<serde_json::Value> {
    match refresh_all_trending(&state.trending).await {
        Ok(_) => Json(serde_json::json!({ "status": "ok", "message": "Trending refreshed successfully" })),
        Err(e) => Json(serde_json::json!({ "status": "error", "message": e.to_string() })),
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_trending))
        .route("/album", get(get_album_tracks))
        .route("/refresh", post(force_refresh_trending))
}
