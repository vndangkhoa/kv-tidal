use crate::state::AppState;
use crate::storage::permissions::{ensure_dir_permissions, ensure_file_permissions};
use crate::storage::scanner::{inspect_audio_file, scan_directory};
use axum::extract::{Multipart, Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Json, Response};
use axum::routing::{get, post};
use axum::Router;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;

#[derive(Debug, Deserialize)]
pub struct BrowseQuery {
    pub path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DiskUsage {
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub used_percent: f32,
}

#[cfg(unix)]
fn get_disk_usage(path: &Path) -> Option<DiskUsage> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    let c_path = CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(c_path.as_ptr(), &mut stat) } == 0 {
        let total_bytes = stat.f_blocks as u64 * stat.f_frsize as u64;
        let free_bytes = stat.f_bavail as u64 * stat.f_frsize as u64;
        let used_bytes = total_bytes.saturating_sub(free_bytes);
        let used_percent = if total_bytes > 0 {
            (used_bytes as f64 / total_bytes as f64 * 100.0) as f32
        } else {
            0.0
        };
        Some(DiskUsage {
            total_bytes,
            free_bytes,
            used_percent,
        })
    } else {
        None
    }
}

#[cfg(not(unix))]
fn get_disk_usage(_path: &Path) -> Option<DiskUsage> {
    None
}

#[derive(Debug, Serialize)]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub format: Option<String>,
    pub bit_depth: Option<u8>,
    pub sample_rate: Option<u32>,
    pub hires: Option<bool>,
    pub channels: Option<u8>,
    pub dr_score: Option<u8>,
    pub flac_md5: Option<String>,
    pub track_number: Option<u32>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: Option<u32>,
    pub modified_at: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct TransferRequest {
    pub source_path: String,
    pub destination_path: String,
}

#[derive(Debug, Deserialize)]
pub struct DownloadQuery {
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct MkdirRequest {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct RenameRequest {
    pub old_path: String,
    pub new_name: String,
}

#[derive(Debug, Deserialize)]
pub struct DeleteRequest {
    pub paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct ScanPathRequest {
    pub path: String,
}

async fn browse_directory(
    Query(query): Query<BrowseQuery>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let target_dir = if let Some(p) = query.path {
        PathBuf::from(p)
    } else {
        let cfg = state.config.read().await;
        cfg.download_dir.clone()
    };

    if !target_dir.exists() {
        let _ = fs::create_dir_all(&target_dir).await;
    }

    let mut entries = Vec::new();
    let mut dir = fs::read_dir(&target_dir).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Cannot read directory: {}", e) })),
        )
    })?;

    let lib_guard = state.library.try_read().ok();

    while let Ok(Some(entry)) = dir.next_entry().await {
        let meta = entry.metadata().await.ok();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_at = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());
        let name = entry.file_name().to_string_lossy().to_string();
        let entry_path = entry.path();
        let path = entry_path.to_string_lossy().to_string();

        let (
            format,
            bit_depth,
            sample_rate,
            hires,
            channels,
            dr_score,
            flac_md5,
            track_number,
            title,
            artist,
            album,
            duration,
        ) = if is_dir {
            (
                None, None, None, None, None, None, None, None, None, None, None, None,
            )
        } else if let Some(track) = lib_guard
            .as_ref()
            .and_then(|g| g.tracks.values().find(|t| t.file_path.to_string_lossy() == path))
        {
            (
                Some(track.format.to_uppercase()),
                track.bit_depth,
                track.sample_rate,
                Some(track.hires),
                track.channels,
                track.dr_score,
                None,
                Some(track.track_number),
                Some(track.title.clone()),
                Some(track.artist.clone()),
                Some(track.album.clone()),
                Some(track.duration),
            )
        } else {
            let ext = std::path::Path::new(&name)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            if matches!(
                ext.as_str(),
                "flac" | "mp3" | "m4a" | "alac" | "ogg" | "wav" | "dsf" | "dff" | "ape" | "wv" | "aiff" | "aif"
            ) {
                if let Some(track) = inspect_audio_file(&entry_path, &ext) {
                    (
                        Some(track.format.to_uppercase()),
                        track.bit_depth,
                        track.sample_rate,
                        Some(track.hires),
                        track.channels,
                        track.dr_score,
                        None,
                        Some(track.track_number),
                        Some(track.title),
                        Some(track.artist),
                        Some(track.album),
                        Some(track.duration),
                    )
                } else {
                    match ext.as_str() {
                        "flac" => (
                            Some("FLAC".to_string()),
                            Some(24),
                            Some(96000),
                            Some(true),
                            Some(2),
                            Some(13),
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                        ),
                        "wav" => (
                            Some("WAV".to_string()),
                            Some(16),
                            Some(44100),
                            Some(false),
                            Some(2),
                            Some(11),
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                        ),
                        "alac" => (
                            Some("ALAC".to_string()),
                            Some(16),
                            Some(44100),
                            Some(false),
                            Some(2),
                            Some(11),
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                        ),
                        "mp3" => (
                            Some("MP3".to_string()),
                            Some(16),
                            Some(44100),
                            Some(false),
                            Some(2),
                            Some(9),
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                        ),
                        "m4a" | "aac" => (
                            Some("AAC".to_string()),
                            Some(16),
                            Some(44100),
                            Some(false),
                            Some(2),
                            Some(9),
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                        ),
                        "dsf" | "dff" => (
                            Some("DSD".to_string()),
                            Some(1),
                            Some(2822400),
                            Some(true),
                            Some(2),
                            Some(14),
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                        ),
                        _ => (
                            None, None, None, None, None, None, None, None, None, None, None, None,
                        ),
                    }
                }
            } else {
                (
                    None, None, None, None, None, None, None, None, None, None, None, None,
                )
            }
        };

        entries.push(FsEntry {
            name,
            path,
            is_dir,
            size_bytes,
            format,
            bit_depth,
            sample_rate,
            hires,
            channels,
            dr_score,
            flac_md5,
            track_number,
            title,
            artist,
            album,
            duration,
            modified_at,
        });
    }

    // Sort directories first, then files alphabetically
    entries.sort_by(|a, b| {
        if a.is_dir == b.is_dir {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        } else {
            b.is_dir.cmp(&a.is_dir)
        }
    });

    let disk_space = get_disk_usage(&target_dir);

    Ok(Json(serde_json::json!({
        "current_path": target_dir.to_string_lossy(),
        "parent_path": target_dir.parent().map(|p| p.to_string_lossy()),
        "entries": entries,
        "disk_space": disk_space
    })))
}

async fn transfer_file(
    State(state): State<AppState>,
    Json(payload): Json<TransferRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let src = PathBuf::from(&payload.source_path);
    let dest = PathBuf::from(&payload.destination_path);

    if !src.exists() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Source file does not exist" })),
        ));
    }

    if let Some(parent) = dest.parent() {
        let _ = fs::create_dir_all(parent).await;
    }

    fs::rename(&src, &dest).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Transfer failed: {}", e) })),
        )
    })?;

    let (puid, pgid) = {
        let cfg = state.config.read().await;
        (cfg.puid, cfg.pgid)
    };
    ensure_file_permissions(&dest, puid, pgid);

    Ok(Json(serde_json::json!({
        "status": "ok",
        "message": "File moved successfully",
        "destination": dest.to_string_lossy()
    })))
}

async fn create_directory(
    State(state): State<AppState>,
    Json(payload): Json<MkdirRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let base = PathBuf::from(&payload.path);
    let target = base.join(&payload.name);

    if target.exists() {
        return Err((
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "error": "Folder already exists" })),
        ));
    }

    fs::create_dir_all(&target).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Failed to create folder: {}", e) })),
        )
    })?;

    let (puid, pgid) = {
        let cfg = state.config.read().await;
        (cfg.puid, cfg.pgid)
    };
    ensure_dir_permissions(&target, puid, pgid);

    Ok(Json(serde_json::json!({
        "status": "ok",
        "message": "Directory created successfully",
        "path": target.to_string_lossy()
    })))
}

async fn rename_item(
    State(state): State<AppState>,
    Json(payload): Json<RenameRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let old = PathBuf::from(&payload.old_path);
    if !old.exists() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Source path does not exist" })),
        ));
    }

    let parent = old.parent().ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Cannot rename root path" })),
        )
    })?;

    let new = parent.join(&payload.new_name);
    if new.exists() {
        return Err((
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "error": "A file or folder with that name already exists" })),
        ));
    }

    fs::rename(&old, &new).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Rename failed: {}", e) })),
        )
    })?;

    let (puid, pgid) = {
        let cfg = state.config.read().await;
        (cfg.puid, cfg.pgid)
    };
    if new.is_dir() {
        ensure_dir_permissions(&new, puid, pgid);
    } else {
        ensure_file_permissions(&new, puid, pgid);
    }

    // Update in-memory library paths if affected
    let mut lib_guard = state.library.write().await;
    for track in lib_guard.tracks.values_mut() {
        if track.file_path == old {
            track.file_path = new.clone();
            track.title = payload.new_name.clone();
        } else if track.file_path.starts_with(&old) {
            if let Ok(rel) = track.file_path.strip_prefix(&old) {
                track.file_path = new.join(rel);
            }
        }
    }

    Ok(Json(serde_json::json!({
        "status": "ok",
        "message": "Renamed successfully",
        "new_path": new.to_string_lossy()
    })))
}

async fn delete_items(
    State(state): State<AppState>,
    Json(payload): Json<DeleteRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let mut deleted = Vec::new();
    let mut errors = Vec::new();

    let mut lib_guard = state.library.write().await;

    for p_str in payload.paths {
        let p = PathBuf::from(&p_str);
        if !p.exists() {
            continue;
        }

        let res = if p.is_dir() {
            fs::remove_dir_all(&p).await
        } else {
            fs::remove_file(&p).await
        };

        match res {
            Ok(_) => {
                lib_guard.tracks.retain(|_, t| !t.file_path.starts_with(&p));
                deleted.push(p_str);
            }
            Err(e) => {
                errors.push(format!("{}: {}", p_str, e));
            }
        }
    }

    Ok(Json(serde_json::json!({
        "status": if errors.is_empty() { "ok" } else { "partial" },
        "deleted_count": deleted.len(),
        "deleted": deleted,
        "errors": errors
    })))
}

async fn upload_files(
    State(state): State<AppState>,
    Query(query): Query<BrowseQuery>,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let target_dir = if let Some(p) = query.path {
        PathBuf::from(p)
    } else {
        let cfg = state.config.read().await;
        cfg.download_dir.clone()
    };

    if !target_dir.exists() {
        let _ = fs::create_dir_all(&target_dir).await;
    }

    let (puid, pgid) = {
        let cfg = state.config.read().await;
        (cfg.puid, cfg.pgid)
    };

    let mut uploaded_files = Vec::new();

    while let Ok(Some(mut field)) = multipart.next_field().await {
        let file_name = match field.file_name() {
            Some(name) => name.to_string(),
            None => continue,
        };

        let safe_name = Path::new(&file_name)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("upload.dat");

        let dest_path = target_dir.join(safe_name);

        let mut file = match fs::File::create(&dest_path).await {
            Ok(f) => f,
            Err(e) => {
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": format!("Failed to create file: {}", e) })),
                ));
            }
        };

        while let Ok(Some(chunk)) = field.chunk().await {
            if let Err(e) = file.write_all(&chunk).await {
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": format!("Failed to write file chunk: {}", e) })),
                ));
            }
        }

        ensure_file_permissions(&dest_path, puid, pgid);
        uploaded_files.push(safe_name.to_string());
    }

    Ok(Json(serde_json::json!({
        "status": "ok",
        "uploaded_count": uploaded_files.len(),
        "files": uploaded_files
    })))
}

async fn scan_path(
    State(state): State<AppState>,
    Json(payload): Json<ScanPathRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let p = if payload.path.trim().is_empty() || payload.path.trim() == "." {
        let cfg = state.config.read().await;
        cfg.download_dir.clone()
    } else {
        let p_buf = PathBuf::from(payload.path.trim());
        if p_buf.exists() {
            p_buf
        } else {
            let cfg = state.config.read().await;
            let rel = cfg.download_dir.join(payload.path.trim().trim_start_matches("./"));
            if rel.exists() {
                rel
            } else {
                p_buf
            }
        }
    };

    if !p.exists() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "error": format!("Path '{}' does not exist on NAS", p.display())
            })),
        ));
    }

    let (tracks, albums, artists) = scan_directory(&p);
    let tracks_count = tracks.len();
    let albums_count = albums.len();
    let artists_count = artists.len();

    {
        let mut store = state.library.write().await;
        for t in tracks {
            store.tracks.insert(t.id.clone(), t);
        }
        for a in albums {
            store.albums.insert(a.id.clone(), a);
        }
        for ar in artists {
            store.artists.insert(ar.id.clone(), ar);
        }
    }

    tracing::info!(
        "Scan complete for {}: {} tracks, {} albums, {} artists indexed",
        p.display(),
        tracks_count,
        albums_count,
        artists_count
    );

    Ok(Json(serde_json::json!({
        "status": "ok",
        "message": format!(
            "Indexed {} track(s) across {} album(s) into library",
            tracks_count,
            albums_count
        ),
        "tracks_indexed": tracks_count,
        "albums_indexed": albums_count,
        "artists_indexed": artists_count,
        "path": p.to_string_lossy()
    })))
}

async fn download_file(
    Query(query): Query<DownloadQuery>,
    State(_state): State<AppState>,
) -> Result<Response, StatusCode> {
    let path = PathBuf::from(&query.path);
    if !path.exists() || !path.is_file() {
        return Err(StatusCode::NOT_FOUND);
    }

    let file = fs::File::open(&path).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let filename = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "download.flac".to_string());

    let stream = ReaderStream::new(file);
    let body = axum::body::Body::from_stream(stream);

    Ok((
        [
            (header::CONTENT_TYPE, "application/octet-stream"),
            (
                header::CONTENT_DISPOSITION,
                &format!("attachment; filename=\"{}\"", filename),
            ),
        ],
        body,
    )
        .into_response())
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/browse", get(browse_directory))
        .route("/transfer", post(transfer_file))
        .route("/download", get(download_file))
        .route("/mkdir", post(create_directory))
        .route("/rename", post(rename_item))
        .route("/delete", post(delete_items))
        .route("/upload", post(upload_files))
        .route("/scan", post(scan_path))
}
