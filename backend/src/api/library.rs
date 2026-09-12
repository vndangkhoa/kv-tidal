use crate::config::LibraryConfig;
use crate::state::AppState;
use crate::storage::scanner::scan_directory;
use axum::extract::State;
use axum::response::Json;
use axum::routing::{get, post};
use axum::Router;
use serde::Deserialize;
use std::path::PathBuf;

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

async fn get_library_tracks(State(state): State<AppState>) -> Json<serde_json::Value> {
    let lib = state.library.read().await;
    let mut tracks: Vec<_> = lib.tracks.values().cloned().collect();
    tracks.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Json(serde_json::json!({ "tracks": tracks }))
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
        .route("/add", post(add_library_path))
        .route("/scan", post(trigger_rescan))
}
