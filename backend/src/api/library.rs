use crate::config::LibraryConfig;
use crate::state::AppState;
use crate::storage::scanner::scan_directory;
use axum::extract::{Query, State};
use axum::http::header;
use axum::response::{IntoResponse, Json, Response};
use axum::routing::{get, post};
use axum::Router;
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::Arc;

fn ascii_case_insensitive_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let mut it_a = a.bytes().map(|b| b.to_ascii_lowercase());
    let mut it_b = b.bytes().map(|b| b.to_ascii_lowercase());
    loop {
        match (it_a.next(), it_b.next()) {
            (Some(x), Some(y)) => match x.cmp(&y) {
                std::cmp::Ordering::Equal => continue,
                other => return other,
            },
            (None, Some(_)) => return std::cmp::Ordering::Less,
            (Some(_), None) => return std::cmp::Ordering::Greater,
            (None, None) => return std::cmp::Ordering::Equal,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct AddLibraryRequest {
    pub name: String,
    pub path: String,
    pub is_download_target: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct RemoveLibraryRequest {
    pub path: String,
}

async fn get_library_summary(State(state): State<AppState>) -> Json<serde_json::Value> {
    let lib = state.library.read().await;
    let cfg = state.config.read().await;

    let artists: Vec<_> = lib.artists.values().cloned().collect();
    let albums: Vec<_> = lib.albums.values().cloned().collect();
    let tracks_count = lib.tracks.len();
    let hires_count = lib.tracks.values().filter(|t| t.hires).count();

    Json(serde_json::json!({
        "mapped_folders": cfg.libraries,
        "total_tracks": tracks_count,
        "total_hires": hires_count,
        "total_albums": albums.len(),
        "total_artists": artists.len(),
        "artists": artists,
        "albums": albums,
        "port": cfg.port,
        "subsonic_user": cfg.subsonic_user,
        "download_dir": cfg.download_dir,
    }))
}

async fn get_library_tracks(State(state): State<AppState>) -> Response {
    // 1. Fast path: check pre-serialized JSON cache under read lock (<1ms response)
    {
        let lib = state.library.read().await;
        if let Some(ref cached) = lib.cached_tracks_json {
            return (
                [
                    (header::CONTENT_TYPE, "application/json"),
                    (header::CACHE_CONTROL, "public, max-age=60"),
                ],
                cached.to_string(),
            ).into_response();
        }
    }

    // 2. Cache miss: sort without heap allocations and cache serialized JSON string
    let mut lib = state.library.write().await;
    if let Some(ref cached) = lib.cached_tracks_json {
        return (
            [
                (header::CONTENT_TYPE, "application/json"),
                (header::CACHE_CONTROL, "public, max-age=60"),
            ],
            cached.to_string(),
        ).into_response();
    }

    let mut tracks: Vec<_> = lib.tracks.values().cloned().collect();
    tracks.sort_by(|a, b| ascii_case_insensitive_cmp(&a.title, &b.title));
    let json_str = serde_json::to_string(&serde_json::json!({ "tracks": tracks }))
        .unwrap_or_else(|_| "{\"tracks\":[]}".to_string());
    let arc_json = Arc::new(json_str);
    lib.cached_tracks_json = Some(arc_json.clone());

    (
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CACHE_CONTROL, "public, max-age=60"),
        ],
        arc_json.to_string(),
    ).into_response()
}

#[derive(Debug, Deserialize)]
pub struct AlbumTracksQuery {
    pub id: String,
}

async fn get_album_details(
    Query(query): Query<AlbumTracksQuery>,
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let lib = state.library.read().await;
    let clean_id = query.id.trim_start_matches("album-");
    let album = lib.albums.values().find(|a| a.id == clean_id || a.id == query.id).cloned();

    if let Some(alb) = album {
        let mut tracks: Vec<_> = lib.tracks.values()
            .filter(|t| t.album.eq_ignore_ascii_case(&alb.name) && (alb.artist.is_empty() || t.artist.eq_ignore_ascii_case(&alb.artist)))
            .cloned()
            .collect();
        tracks.sort_by(|a, b| {
            a.track_number.cmp(&b.track_number)
                .then_with(|| ascii_case_insensitive_cmp(&a.title, &b.title))
        });
        return Json(serde_json::json!({
            "album": alb,
            "tracks": tracks
        }));
    }

    Json(serde_json::json!({
        "album": null,
        "tracks": []
    }))
}

async fn add_library_path(
    State(state): State<AppState>,
    Json(payload): Json<AddLibraryRequest>,
) -> Json<serde_json::Value> {
    let p = PathBuf::from(&payload.path);
    let is_download_target = payload.is_download_target.unwrap_or(false);

    {
        let mut cfg = state.config.write().await;
        if is_download_target {
            for l in &mut cfg.libraries {
                l.is_download_target = false;
            }
            cfg.download_dir = p.clone();
        }
        if let Some(existing) = cfg.libraries.iter_mut().find(|l| l.path == p) {
            existing.name = payload.name.clone();
            existing.is_download_target = is_download_target;
        } else {
            cfg.libraries.push(LibraryConfig {
                name: payload.name.clone(),
                path: p.clone(),
                is_download_target,
                watch_changes: true,
            });
        }
        let config_path = std::env::var("CONFIG_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| cfg.data_dir.join("config.json"));
        let _ = cfg.save(&config_path);
    }

    // Trigger immediate scan of this new library path in background
    let lib_store = state.library.clone();
    tokio::spawn(async move {
        let (tracks, albums, artists) = scan_directory(&p);
        let mut store = lib_store.write().await;
        for t in tracks {
            store.tracks.insert(t.id.clone(), t);
        }
        for a in albums {
            store.albums.insert(a.id.clone(), a);
        }
        for ar in artists {
            store.artists.insert(ar.id.clone(), ar);
        }
        store.cached_tracks_json = None;
    });

    Json(serde_json::json!({ "status": "ok", "message": "Library path added and scan initiated" }))
}

async fn trigger_rescan(State(state): State<AppState>) -> Json<serde_json::Value> {
    let cfg = state.config.read().await;
    let libraries = cfg.libraries.clone();
    drop(cfg);

    let lib_store = state.library.clone();
    tokio::spawn(async move {
        let mut all_tracks = Vec::new();
        let mut all_albums = Vec::new();
        let mut all_artists = Vec::new();
        for lib in libraries {
            if lib.path.exists() {
                let (tracks, albums, artists) = scan_directory(&lib.path);
                all_tracks.extend(tracks);
                all_albums.extend(albums);
                all_artists.extend(artists);
            }
        }
        let mut store = lib_store.write().await;
        store.tracks.clear();
        store.albums.clear();
        store.artists.clear();
        store.cached_tracks_json = None;
        for t in all_tracks {
            store.tracks.insert(t.id.clone(), t);
        }
        for a in all_albums {
            store.albums.insert(a.id.clone(), a);
        }
        for ar in all_artists {
            store.artists.insert(ar.id.clone(), ar);
        }
    });

    Json(serde_json::json!({ "status": "ok", "message": "Rescan initiated across all libraries" }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_library_summary))
        .route("/tracks", get(get_library_tracks))
        .route("/album", get(get_album_details))
        .route("/add", post(add_library_path))
        .route("/scan", post(trigger_rescan))
}
