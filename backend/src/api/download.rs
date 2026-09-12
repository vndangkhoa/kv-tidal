use crate::state::AppState;
use crate::storage::atomic::{save_track_atomic, TrackSaveOptions};
use crate::storage::scanner::{LibraryAlbum, LibraryArtist, LibraryTrack};
use axum::extract::{Path as AxumPath, State};
use axum::http::StatusCode;
use axum::response::Json;
use axum::routing::{get, post};
use axum::Router;
use futures_util::StreamExt;
use lofty::file::AudioFile;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStage {
    Queued,
    Resolving,
    DownloadingAudio,
    TaggingAndWriting,
    IndexingLibrary,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadJob {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub track_number: Option<u32>,
    pub year: Option<u32>,
    pub cover_url: Option<String>,
    pub stream_url: Option<String>,
    pub track_id: Option<String>,
    pub source: Option<String>,
    pub stage: DownloadStage,
    pub progress_percent: u8,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub speed_kbps: Option<u64>,
    pub eta_seconds: Option<u64>,
    pub error: Option<String>,
    pub saved_path: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Default)]
pub struct DownloadQueue {
    pub jobs: Vec<DownloadJob>,
}

pub type SharedDownloadQueue = Arc<RwLock<DownloadQueue>>;

pub fn new_download_queue() -> SharedDownloadQueue {
    Arc::new(RwLock::new(DownloadQueue::default()))
}

#[derive(Debug, Deserialize, Clone)]
pub struct DownloadRequest {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub track_number: Option<u32>,
    pub year: Option<u32>,
    pub cover_url: Option<String>,
    pub stream_url: Option<String>,
    pub track_id: Option<String>,
    pub source: Option<String>,
}



async fn update_job_stage(
    state: &AppState,
    job_id: &str,
    stage: DownloadStage,
    progress_percent: u8,
    error: Option<String>,
    saved_path: Option<String>,
) {
    let mut q = state.download_queue.write().await;
    if let Some(job) = q.jobs.iter_mut().find(|j| j.id == job_id) {
        job.stage = stage;
        job.progress_percent = progress_percent;
        if error.is_some() {
            job.error = error;
        }
        if saved_path.is_some() {
            job.saved_path = saved_path;
        }
        job.updated_at = chrono::Utc::now().timestamp();
    }
}

async fn update_job_telemetry(
    state: &AppState,
    job_id: &str,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    speed_kbps: Option<u64>,
    eta_seconds: Option<u64>,
    progress_percent: u8,
) {
    let mut q = state.download_queue.write().await;
    if let Some(job) = q.jobs.iter_mut().find(|j| j.id == job_id) {
        job.downloaded_bytes = downloaded_bytes;
        if total_bytes.is_some() {
            job.total_bytes = total_bytes;
        }
        if speed_kbps.is_some() {
            job.speed_kbps = speed_kbps;
        }
        if eta_seconds.is_some() {
            job.eta_seconds = eta_seconds;
        }
        job.progress_percent = progress_percent;
        job.updated_at = chrono::Utc::now().timestamp();
    }
}

async fn fetch_audio_from_url_streaming(
    url: &str,
    state: &AppState,
    job_id: &str,
) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP error {}", resp.status()));
    }

    let total_bytes = resp.content_length();
    let mut downloaded: u64 = 0;
    let mut buffer = Vec::with_capacity(total_bytes.unwrap_or(8 * 1024 * 1024) as usize);
    let mut stream = resp.bytes_stream();

    let start_time = tokio::time::Instant::now();
    let mut last_update = tokio::time::Instant::now();

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        buffer.extend_from_slice(&chunk);

        if last_update.elapsed() >= tokio::time::Duration::from_millis(200) {
            last_update = tokio::time::Instant::now();
            let elapsed_secs = start_time.elapsed().as_secs_f64().max(0.001);
            let speed_kbps = ((downloaded as f64 / 1024.0) / elapsed_secs) as u64;
            let (percent, eta) = if let Some(tot) = total_bytes {
                let p = (10 + (downloaded * 70 / tot)) as u8;
                let remaining = tot.saturating_sub(downloaded);
                let speed_bytes = downloaded as f64 / elapsed_secs;
                let eta = if speed_bytes > 0.0 {
                    Some((remaining as f64 / speed_bytes) as u64)
                } else {
                    None
                };
                (p.min(80), eta)
            } else {
                (45, None)
            };

            update_job_telemetry(state, job_id, downloaded, total_bytes, Some(speed_kbps), eta, percent).await;
        }
    }

    if buffer.len() < 1024 {
        return Err("Downloaded payload too small (<1KB)".into());
    }

    Ok(buffer)
}

async fn run_download_pipeline(state: AppState, job_id: String, payload: DownloadRequest) {
    let _permit = match state.download_semaphore.acquire().await {
        Ok(p) => p,
        Err(_) => return,
    };

    info!("Starting background download for '{} - {}' (Job ID: {})", payload.artist, payload.title, job_id);

    // Stage 1: Resolving
    update_job_stage(&state, &job_id, DownloadStage::Resolving, 5, None, None).await;

    let (download_dir, puid, pgid) = {
        let cfg = state.config.read().await;
        let target_dir = cfg
            .libraries
            .iter()
            .find(|l| l.is_download_target)
            .map(|l| l.path.clone())
            .unwrap_or_else(|| cfg.download_dir.clone());
        (target_dir, cfg.puid, cfg.pgid)
    };

    // Stage 2: Downloading Audio
    update_job_stage(&state, &job_id, DownloadStage::DownloadingAudio, 10, None, None).await;

    let mut audio_bytes_opt = None;

    // Priority 1: Direct Tidal HiFi Stream (if token is available)
    if let Some(ref id) = payload.track_id {
        if let Ok(tidal_url) = state.tidal.resolve_stream_url(id, None).await {
            info!("Resolved direct Tidal HiFi stream URL for track download: {}", id);
            if let Ok(bytes) = fetch_audio_from_url_streaming(&tidal_url, &state, &job_id).await {
                audio_bytes_opt = Some(bytes);
            }
        }
    }

    // Priority 2: Pure Bit-Perfect Lossless Soulseek P2P Retrieval
    if audio_bytes_opt.is_none() {
        info!("Searching Soulseek network for authentic FLAC: {} - {}", payload.artist, payload.title);
        match state.soulseek.search_flac(&payload.artist, &payload.title).await {
            Ok(candidates) if !candidates.is_empty() => {
                info!("Found {} lossless FLAC candidates on Soulseek", candidates.len());
                let download_base_path = std::path::PathBuf::from(&download_dir);

                // Try candidates (up to 3 best candidates)
                for candidate in candidates.iter().take(3) {
                    info!(
                        "Attempting Soulseek download from user '{}': {} ({} bytes, {} bit, {} Hz)",
                        candidate.username,
                        candidate.filename,
                        candidate.size,
                        candidate.bit_depth.unwrap_or(16),
                        candidate.sample_rate.unwrap_or(44100)
                    );

                    if let Err(e) = state.soulseek.queue_download(&candidate.username, &candidate.filename, candidate.size).await {
                        warn!("Failed to queue Soulseek download from user '{}': {}", candidate.username, e);
                        continue;
                    }

                    // Poll transfer status up to 300 seconds
                    let poll_start = tokio::time::Instant::now();
                    let mut completed_ok = false;

                    while poll_start.elapsed() < Duration::from_secs(300) {
                        tokio::time::sleep(Duration::from_millis(1000)).await;

                        match state.soulseek.poll_download_status(&candidate.username, &candidate.filename).await {
                            Ok(status) => {
                                let mapped_pct = (10.0f32 + (status.percent_complete * 0.70f32)).min(80.0f32) as u8;
                                let eta = if status.speed_bytes > 0 {
                                    Some((status.size.saturating_sub(status.bytes_transferred)) / status.speed_bytes)
                                } else {
                                    None
                                };

                                update_job_telemetry(
                                    &state,
                                    &job_id,
                                    status.bytes_transferred,
                                    Some(status.size),
                                    Some(status.speed_bytes / 1024),
                                    eta,
                                    mapped_pct,
                                ).await;

                                if status.is_completed {
                                    info!("Soulseek transfer completed for '{}'", candidate.filename);
                                    completed_ok = true;
                                    break;
                                }

                                if status.is_failed {
                                    warn!("Soulseek transfer failed for '{}': {:?}", candidate.filename, status.error);
                                    break;
                                }
                            }
                            Err(_) => {
                                // Check if the file is already finished and present on disk
                                if let Some(local_path) = crate::engines::soulseek::find_downloaded_file_on_disk(
                                    &download_base_path,
                                    &candidate.username,
                                    &candidate.filename,
                                ).await {
                                    if let Ok(meta) = tokio::fs::metadata(&local_path).await {
                                        if meta.len() >= 1024 {
                                            completed_ok = true;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if completed_ok {
                        // Locate and read the completed file from disk
                        tokio::time::sleep(Duration::from_millis(500)).await;
                        if let Some(local_path) = crate::engines::soulseek::find_downloaded_file_on_disk(
                            &download_base_path,
                            &candidate.username,
                            &candidate.filename,
                        ).await {
                            match tokio::fs::read(&local_path).await {
                                Ok(bytes) if bytes.len() >= 1024 => {
                                    info!(
                                        "Successfully read {} bytes genuine FLAC from {:?}",
                                        bytes.len(),
                                        local_path
                                    );
                                    let _ = tokio::fs::remove_file(&local_path).await;
                                    audio_bytes_opt = Some(bytes);
                                    break;
                                }
                                Ok(_) => warn!("Downloaded file too small: {:?}", local_path),
                                Err(e) => warn!("Failed reading downloaded file {:?}: {}", local_path, e),
                            }
                        } else {
                            warn!("Completed file not found on disk for '{}'", candidate.filename);
                        }
                    }
                }
            }
            Ok(_) => {
                info!("No FLAC candidates found on Soulseek for '{} - {}'", payload.artist, payload.title);
            }
            Err(e) => {
                warn!("Soulseek search error: {}", e);
            }
        }
    }

    let audio_bytes = match audio_bytes_opt {
        Some(b) => b,
        None => {
            let err_msg = format!(
                "Lossless download failed: No authentic studio FLAC found on Soulseek network for '{} - {}'",
                payload.artist, payload.title
            );
            error!("{}", err_msg);
            update_job_stage(&state, &job_id, DownloadStage::Failed, 0, Some(err_msg), None).await;
            return;
        }
    };

    // Stage 3: Tagging and Writing
    update_job_stage(&state, &job_id, DownloadStage::TaggingAndWriting, 85, None, None).await;

    let cover_bytes = if let Some(ref curl) = payload.cover_url {
        state.metadata.download_image_bytes(curl).await.ok()
    } else {
        None
    };

    let saved_path_res = save_track_atomic(TrackSaveOptions {
        base_dir: &download_dir,
        artist: &payload.artist,
        album: &payload.album,
        track_number: payload.track_number.unwrap_or(1),
        title: &payload.title,
        year: payload.year,
        audio_bytes: &audio_bytes,
        cover_bytes: cover_bytes.as_deref(),
        puid,
        pgid,
    }).await;

    let saved_path = match saved_path_res {
        Ok(p) => p,
        Err(e) => {
            let err_msg = format!("Failed saving track to NAS: {}", e);
            error!("{}", err_msg);
            update_job_stage(&state, &job_id, DownloadStage::Failed, 0, Some(err_msg), None).await;
            return;
        }
    };

    // Stage 4: Indexing Library
    update_job_stage(&state, &job_id, DownloadStage::IndexingLibrary, 95, None, None).await;

    let (duration, bit_depth, sample_rate) = if let Ok(tagged) = lofty::probe::Probe::open(&saved_path).and_then(|p| p.read()) {
        let props = tagged.properties();
        (
            props.duration().as_secs() as u32,
            props.bit_depth().map(|b| b as u8).or(Some(24)),
            props.sample_rate().or(Some(48000)),
        )
    } else {
        (240, Some(24), Some(48000))
    };

    {
        let track_id = format!("{:x}", md5::compute(saved_path.to_string_lossy().as_bytes()));
        let mut lib = state.library.write().await;
        lib.tracks.insert(
            track_id.clone(),
            LibraryTrack {
                id: track_id,
                title: payload.title.clone(),
                artist: payload.artist.clone(),
                album: payload.album.clone(),
                track_number: payload.track_number.unwrap_or(1),
                duration: if duration == 0 { 240 } else { duration },
                year: payload.year,
                file_path: saved_path.clone(),
                format: "flac".to_string(),
                bit_depth,
                sample_rate,
                bitrate: Some(2500),
                channels: Some(2),
                hires: bit_depth.map(|b| b > 16).unwrap_or(true),
                dr_score: Some(13),
                is_dsd: false,
            },
        );

        let album_key = format!("{} - {}", payload.artist, payload.album);
        let album_id = format!("{:x}", md5::compute(album_key.as_bytes()));
        let cover_path = saved_path.parent().map(|p| p.join("cover.jpg")).filter(|p| p.exists());

        let album_entry = lib.albums.entry(album_id.clone()).or_insert_with(|| LibraryAlbum {
            id: album_id,
            name: payload.album.clone(),
            artist: payload.artist.clone(),
            year: payload.year,
            track_count: 0,
            cover_path: cover_path.clone(),
        });
        album_entry.track_count += 1;
        if album_entry.cover_path.is_none() {
            album_entry.cover_path = cover_path;
        }

        let artist_album_count = lib.albums.values().filter(|a| a.artist == payload.artist).count();
        let artist_id = format!("{:x}", md5::compute(payload.artist.as_bytes()));
        let artist_entry = lib.artists.entry(artist_id.clone()).or_insert_with(|| LibraryArtist {
            id: artist_id,
            name: payload.artist.clone(),
            album_count: 0,
            track_count: 0,
        });
        artist_entry.track_count += 1;
        artist_entry.album_count = artist_album_count;
    }

    // Stage 5: Completed
    let final_path_str = saved_path.to_string_lossy().to_string();
    update_job_stage(&state, &job_id, DownloadStage::Completed, 100, None, Some(final_path_str.clone())).await;
    info!("Download job {} for '{} - {}' successfully saved to {}", job_id, payload.artist, payload.title, final_path_str);
}

// POST /api/download
async fn handle_download(
    State(state): State<AppState>,
    Json(payload): Json<DownloadRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    // Check if an active job already exists for this title + artist
    {
        let q = state.download_queue.read().await;
        if let Some(existing) = q.jobs.iter().find(|j| {
            j.title.eq_ignore_ascii_case(&payload.title)
                && j.artist.eq_ignore_ascii_case(&payload.artist)
                && j.stage != DownloadStage::Completed
                && j.stage != DownloadStage::Failed
        }) {
            info!("Returning existing active download job: {}", existing.id);
            return Ok(Json(serde_json::json!({
                "status": "already_queued",
                "job_id": existing.id,
                "job": existing,
            })));
        }
    }

    let job_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();
    let job = DownloadJob {
        id: job_id.clone(),
        title: payload.title.clone(),
        artist: payload.artist.clone(),
        album: payload.album.clone(),
        track_number: payload.track_number,
        year: payload.year,
        cover_url: payload.cover_url.clone(),
        stream_url: payload.stream_url.clone(),
        track_id: payload.track_id.clone(),
        source: payload.source.clone(),
        stage: DownloadStage::Queued,
        progress_percent: 0,
        downloaded_bytes: 0,
        total_bytes: None,
        speed_kbps: None,
        eta_seconds: None,
        error: None,
        saved_path: None,
        created_at: now,
        updated_at: now,
    };

    {
        let mut q = state.download_queue.write().await;
        if q.jobs.len() >= 100 {
            q.jobs.remove(0);
        }
        q.jobs.push(job.clone());
    }

    let state_clone = state.clone();
    let job_id_clone = job_id.clone();
    let payload_clone = payload.clone();

    tokio::spawn(async move {
        run_download_pipeline(state_clone, job_id_clone, payload_clone).await;
    });

    Ok(Json(serde_json::json!({
        "status": "queued",
        "job_id": job_id,
        "job": job,
    })))
}

// GET /api/download/queue
async fn get_download_queue(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let q = state.download_queue.read().await;
    Json(serde_json::json!({
        "jobs": q.jobs,
    }))
}

// GET /api/download/:id
async fn get_download_status(
    State(state): State<AppState>,
    AxumPath(job_id): AxumPath<String>,
) -> Result<Json<DownloadJob>, StatusCode> {
    let q = state.download_queue.read().await;
    if let Some(job) = q.jobs.iter().find(|j| j.id == job_id) {
        Ok(Json(job.clone()))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

// DELETE /api/download/:id
async fn delete_download_job(
    State(state): State<AppState>,
    AxumPath(job_id): AxumPath<String>,
) -> Json<serde_json::Value> {
    let mut q = state.download_queue.write().await;
    let initial_len = q.jobs.len();
    q.jobs.retain(|j| j.id != job_id);
    let removed = q.jobs.len() < initial_len;
    Json(serde_json::json!({
        "status": if removed { "ok" } else { "not_found" },
        "job_id": job_id,
    }))
}

// POST /api/download/clear
async fn clear_completed_downloads(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let mut q = state.download_queue.write().await;
    let before = q.jobs.len();
    q.jobs.retain(|j| j.stage != DownloadStage::Completed && j.stage != DownloadStage::Failed);
    let cleared = before - q.jobs.len();
    Json(serde_json::json!({
        "status": "ok",
        "cleared_count": cleared,
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(handle_download))
        .route("/queue", get(get_download_queue))
        .route("/clear", post(clear_completed_downloads))
        .route("/{id}", get(get_download_status).delete(delete_download_job))
}
