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
    Paused,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadJob {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub track_number: Option<u32>,
    pub year: Option<u32>,
    pub duration: Option<u32>,
    pub cover_url: Option<String>,
    pub stream_url: Option<String>,
    pub track_id: Option<String>,
    pub source: Option<String>,
    pub slskd_username: Option<String>,
    pub slskd_id: Option<String>,
    pub stage: DownloadStage,
    pub progress_percent: u8,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub speed_kbps: Option<u64>,
    pub eta_seconds: Option<u64>,
    pub error: Option<String>,
    pub saved_path: Option<String>,
    pub request_payload: Option<DownloadRequest>,
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadRequest {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub track_number: Option<u32>,
    pub year: Option<u32>,
    pub duration: Option<u32>,
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
    token: &tokio_util::sync::CancellationToken,
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

    loop {
        let chunk_opt = tokio::select! {
            _ = token.cancelled() => return Err("Download cancelled or paused".to_string()),
            next = stream.next() => next,
        };

        let chunk = match chunk_opt {
            Some(Ok(c)) => c,
            Some(Err(e)) => return Err(e.to_string()),
            None => break,
        };

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

async fn convert_audio_to_flac(input_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let temp_dir = std::env::temp_dir();
    let id = uuid::Uuid::new_v4();
    let in_file = temp_dir.join(format!("kv_dl_in_{}.tmp", id));
    let out_file = temp_dir.join(format!("kv_dl_out_{}.flac", id));

    tokio::fs::write(&in_file, input_bytes)
        .await
        .map_err(|e| format!("Failed to write temp audio file: {}", e))?;

    let res = tokio::process::Command::new("ffmpeg")
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            in_file.to_str().unwrap_or(""),
            "-c:a",
            "flac",
            out_file.to_str().unwrap_or(""),
        ])
        .output()
        .await;

    let _ = tokio::fs::remove_file(&in_file).await;

    match res {
        Ok(output) if output.status.success() => {
            let flac_bytes = tokio::fs::read(&out_file)
                .await
                .map_err(|e| format!("Failed to read transcoded flac file: {}", e))?;
            let _ = tokio::fs::remove_file(&out_file).await;
            if flac_bytes.len() >= 1024 {
                Ok(flac_bytes)
            } else {
                Err("Transcoded FLAC output too small".into())
            }
        }
        Ok(output) => {
            let _ = tokio::fs::remove_file(&out_file).await;
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("ffmpeg transcode failed: {}", stderr))
        }
        Err(e) => {
            let _ = tokio::fs::remove_file(&out_file).await;
            Err(format!("ffmpeg command execution failed: {}", e))
        }
    }
}

async fn run_download_pipeline(
    state: AppState,
    job_id: String,
    payload: DownloadRequest,
    token: tokio_util::sync::CancellationToken,
) {
    let _permit = match state.download_semaphore.acquire().await {
        Ok(p) => p,
        Err(_) => return,
    };

    if token.is_cancelled() {
        return;
    }

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

    // Priority 1: Pure Bit-Perfect Lossless Soulseek P2P Retrieval (Default)
    {
        let mut q = state.download_queue.write().await;
        if let Some(job) = q.jobs.iter_mut().find(|j| j.id == job_id) {
            job.source = Some("soulseek".to_string());
        }
    }

    let slsk_query = crate::engines::soulseek::SoulseekTrackQuery {
        artist: payload.artist.clone(),
        title: payload.title.clone(),
        album: if payload.album.trim().is_empty() { None } else { Some(payload.album.clone()) },
        track_number: payload.track_number,
        duration_secs: payload.duration,
    };

    info!(
        "Searching Soulseek network for authentic FLAC: {} - {} (album: {:?}, track: {:?}, dur: {:?}s)",
        slsk_query.artist, slsk_query.title, slsk_query.album, slsk_query.track_number, slsk_query.duration_secs
    );

    match state.soulseek.search_flac(&slsk_query).await {
        Ok(candidates) if !candidates.is_empty() => {
            info!("Found {} scored lossless FLAC candidates on Soulseek", candidates.len());
            let download_base_path = std::path::PathBuf::from(&download_dir);

            // Try candidates (up to 3 best candidates)
            for candidate in candidates.iter().take(3) {
                if token.is_cancelled() {
                    break;
                }

                info!(
                    "Attempting Soulseek download from user '{}': {} (score: {}, {} bytes, {} bit, {} Hz)",
                    candidate.username,
                    candidate.filename,
                    candidate.score,
                    candidate.size,
                    candidate.bit_depth.unwrap_or(16),
                    candidate.sample_rate.unwrap_or(44100)
                );

                {
                    let mut q = state.download_queue.write().await;
                    if let Some(job) = q.jobs.iter_mut().find(|j| j.id == job_id) {
                        job.slskd_username = Some(candidate.username.clone());
                    }
                }

                if let Err(e) = state.soulseek.queue_download(&candidate.username, &candidate.filename, candidate.size).await {
                    warn!("Failed to queue Soulseek download from user '{}': {}", candidate.username, e);
                    continue;
                }

                // Poll transfer status up to 300 seconds
                let poll_start = tokio::time::Instant::now();
                let mut completed_ok = false;

                while poll_start.elapsed() < Duration::from_secs(300) {
                    if token.is_cancelled() {
                        info!("Download job {} cancelled or paused during polling", job_id);
                        break;
                    }

                    tokio::select! {
                        _ = token.cancelled() => {
                            info!("Download job {} token cancelled during sleep", job_id);
                            break;
                        }
                        _ = tokio::time::sleep(Duration::from_millis(1000)) => {}
                    }

                    match state.soulseek.poll_download_status(&candidate.username, &candidate.filename).await {
                        Ok(status) => {
                            if let Some(ref tid) = status.id {
                                let mut q = state.download_queue.write().await;
                                if let Some(job) = q.jobs.iter_mut().find(|j| j.id == job_id) {
                                    job.slskd_id = Some(tid.clone());
                                    if job.slskd_username.is_none() {
                                        job.slskd_username = status.username.clone();
                                    }
                                }
                            }

                            if status.is_paused {
                                info!("Soulseek transfer is paused for '{}'", candidate.filename);
                                break;
                            }

                            let mapped_pct = (status.percent_complete.clamp(1.0, 100.0) as u8).min(95);
                            let eta = if status.speed_bytes > 0 && status.size > status.bytes_transferred {
                                Some((status.size - status.bytes_transferred) / status.speed_bytes)
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

    if token.is_cancelled() {
        let is_paused = {
            let q = state.download_queue.read().await;
            q.jobs.iter().find(|j| j.id == job_id).map(|j| j.stage == DownloadStage::Paused).unwrap_or(false)
        };
        if is_paused {
            info!("Pipeline for job {} terminated cleanly due to pause", job_id);
            return;
        }
    }

    // Priority 2: Direct Tidal HiFi Stream (if Soulseek yielded no FLAC)
    if audio_bytes_opt.is_none() && !token.is_cancelled() {
        if let Some(ref id) = payload.track_id {
            if let Ok(tidal_url) = state.tidal.resolve_stream_url(id, None).await {
                info!("Resolved direct Tidal HiFi stream URL for track download: {}", id);
                {
                    let mut q = state.download_queue.write().await;
                    if let Some(job) = q.jobs.iter_mut().find(|j| j.id == job_id) {
                        job.source = Some("tidal".to_string());
                    }
                }
                if let Ok(bytes) = fetch_audio_from_url_streaming(&tidal_url, &state, &job_id, &token).await {
                    audio_bytes_opt = Some(bytes);
                }
            }
        }
    }

    // Priority 3: Fallback to Web Stream Audio (Transcode to FLAC)
    if audio_bytes_opt.is_none() && !token.is_cancelled() {
        let stream_url = if let Some(ref u) = payload.stream_url {
            if !u.trim().is_empty() {
                Some(u.clone())
            } else {
                state.resolver.resolve_full_stream(&payload.artist, &payload.title).await
            }
        } else {
            state.resolver.resolve_full_stream(&payload.artist, &payload.title).await
        };

        if let Some(ref s_url) = stream_url {
            info!("Attempting Priority 3 Web Stream audio download for '{} - {}'", payload.artist, payload.title);
            {
                let mut q = state.download_queue.write().await;
                if let Some(job) = q.jobs.iter_mut().find(|j| j.id == job_id) {
                    job.source = Some("web-stream".to_string());
                }
            }
            if let Ok(raw_bytes) = fetch_audio_from_url_streaming(s_url, &state, &job_id, &token).await {
                if raw_bytes.starts_with(b"fLaC") {
                    audio_bytes_opt = Some(raw_bytes);
                } else {
                    match convert_audio_to_flac(&raw_bytes).await {
                        Ok(flac_bytes) => {
                            info!(
                                "Transcoded web stream ({} bytes) to lossless FLAC container ({} bytes)",
                                raw_bytes.len(),
                                flac_bytes.len()
                            );
                            audio_bytes_opt = Some(flac_bytes);
                        }
                        Err(e) => {
                            warn!("Failed transcoding web stream to FLAC: {}. Using raw audio bytes.", e);
                            audio_bytes_opt = Some(raw_bytes);
                        }
                    }
                }
            }
        }
    }

    if token.is_cancelled() {
        let is_paused = {
            let q = state.download_queue.read().await;
            q.jobs.iter().find(|j| j.id == job_id).map(|j| j.stage == DownloadStage::Paused).unwrap_or(false)
        };
        if is_paused {
            info!("Pipeline for job {} terminated cleanly due to pause", job_id);
            return;
        }
        info!("Pipeline for job {} terminated due to cancellation", job_id);
        return;
    }

    let audio_bytes = match audio_bytes_opt {
        Some(b) => b,
        None => {
            let err_msg = format!(
                "Download failed: No authentic audio found on Soulseek, Tidal, or Web Stream for '{} - {}'",
                payload.artist, payload.title
            );
            error!("{}", err_msg);
            update_job_stage(&state, &job_id, DownloadStage::Failed, 0, Some(err_msg), None).await;
            return;
        }
    };

    // Stage 3: Tagging and Writing
    update_job_stage(&state, &job_id, DownloadStage::TaggingAndWriting, 85, None, None).await;

    let mut cover_bytes = if let Some(ref curl) = payload.cover_url {
        if curl.starts_with("http://") || curl.starts_with("https://") {
            state.metadata.download_image_bytes(curl).await.ok()
        } else {
            None
        }
    } else {
        None
    };

    // Fallback: If no cover URL was provided or download failed, resolve 1000x1000 cover from Apple Music CDN
    if cover_bytes.is_none() {
        let query = format!("{} {}", payload.artist, payload.title);
        if let Some(meta) = state.metadata.resolve_apple_music(&query).await {
            if let Some(ref c_url) = meta.cover_url {
                cover_bytes = state.metadata.download_image_bytes(c_url).await.ok();
            }
        }
    }

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
    let token = tokio_util::sync::CancellationToken::new();

    {
        let mut tokens = state.download_tokens.write().await;
        tokens.insert(job_id.clone(), token.clone());
    }

    let job = DownloadJob {
        id: job_id.clone(),
        title: payload.title.clone(),
        artist: payload.artist.clone(),
        album: payload.album.clone(),
        track_number: payload.track_number,
        year: payload.year,
        duration: payload.duration,
        cover_url: payload.cover_url.clone(),
        stream_url: payload.stream_url.clone(),
        track_id: payload.track_id.clone(),
        source: payload.source.clone(),
        slskd_username: None,
        slskd_id: None,
        stage: DownloadStage::Queued,
        progress_percent: 0,
        downloaded_bytes: 0,
        total_bytes: None,
        speed_kbps: None,
        eta_seconds: None,
        error: None,
        saved_path: None,
        request_payload: Some(payload.clone()),
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
        run_download_pipeline(state_clone, job_id_clone, payload_clone, token).await;
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
    let mut jobs = {
        let q = state.download_queue.read().await;
        q.jobs.clone()
    };

    if let Ok(slsk_transfers) = state.soulseek.get_active_downloads().await {
        for transfer in slsk_transfers {
            let clean_name = transfer.filename.replace('\\', "/");
            let file_name = std::path::Path::new(&clean_name)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or(&transfer.filename);

            // Check if this transfer matches any existing job in queue
            let existing_idx = jobs.iter().position(|j| {
                (transfer.id.is_some() && j.slskd_id == transfer.id)
                    || clean_name.to_lowercase().contains(&j.title.to_lowercase())
                    || file_name.to_lowercase().contains(&j.title.to_lowercase())
                    || j.id.contains(&clean_name)
            });

            if let Some(idx) = existing_idx {
                if jobs[idx].slskd_id.is_none() && transfer.id.is_some() {
                    jobs[idx].slskd_id = transfer.id.clone();
                }
                if jobs[idx].slskd_username.is_none() && transfer.username.is_some() {
                    jobs[idx].slskd_username = transfer.username.clone();
                }
                // If the job is Paused, respect user's pause state
                if jobs[idx].stage == DownloadStage::Paused {
                    continue;
                }
            } else if !transfer.is_completed && !transfer.is_paused {
                let file_stem = std::path::Path::new(file_name)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or(file_name);

                let (artist, title) = if let Some((a, t)) = file_stem.split_once(" - ") {
                    (a.trim().to_string(), t.trim().to_string())
                } else {
                    ("Soulseek Peer".to_string(), file_stem.to_string())
                };

                let stage = if transfer.is_failed {
                    DownloadStage::Failed
                } else if transfer.bytes_transferred > 0 || transfer.state.to_lowercase().contains("downloading") {
                    DownloadStage::DownloadingAudio
                } else {
                    DownloadStage::Queued
                };

                let speed_kbps = if transfer.speed_bytes > 0 {
                    Some(transfer.speed_bytes / 1024)
                } else {
                    None
                };

                let eta = if transfer.speed_bytes > 0 && transfer.size > transfer.bytes_transferred {
                    Some((transfer.size - transfer.bytes_transferred) / transfer.speed_bytes)
                } else {
                    None
                };

                let slsk_job = DownloadJob {
                    id: format!("slsk-{:x}", md5::compute(clean_name.as_bytes())),
                    title,
                    artist,
                    album: "Soulseek P2P Lossless".to_string(),
                    track_number: None,
                    year: None,
                    duration: None,
                    cover_url: None,
                    stream_url: None,
                    track_id: None,
                    source: Some("soulseek".to_string()),
                    slskd_username: transfer.username.clone(),
                    slskd_id: transfer.id.clone(),
                    stage,
                    progress_percent: transfer.percent_complete as u8,
                    downloaded_bytes: transfer.bytes_transferred,
                    total_bytes: if transfer.size > 0 { Some(transfer.size) } else { None },
                    speed_kbps,
                    eta_seconds: eta,
                    error: transfer.error,
                    saved_path: None,
                    request_payload: None,
                    created_at: chrono::Utc::now().timestamp(),
                    updated_at: chrono::Utc::now().timestamp(),
                };
                jobs.push(slsk_job);
            }
        }
    }

    Json(serde_json::json!({
        "jobs": jobs,
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

// POST /api/download/:id/pause
async fn pause_download_job(
    State(state): State<AppState>,
    AxumPath(job_id): AxumPath<String>,
) -> Json<serde_json::Value> {
    // 1. Cancel token to halt Tokio loop
    {
        let tokens = state.download_tokens.read().await;
        if let Some(token) = tokens.get(&job_id) {
            token.cancel();
        }
    }

    // 2. Set job stage to Paused
    let slsk_info = {
        let mut q = state.download_queue.write().await;
        if let Some(job) = q.jobs.iter_mut().find(|j| j.id == job_id) {
            job.stage = DownloadStage::Paused;
            job.speed_kbps = Some(0);
            job.eta_seconds = None;
            job.updated_at = chrono::Utc::now().timestamp();
            job.slskd_username.clone().zip(job.slskd_id.clone())
        } else {
            None
        }
    };

    // 3. Signal slskd to cancel the transfer without deleting incomplete bytes (remove=false)
    if let Some((user, tid)) = slsk_info {
        let _ = state.soulseek.cancel_transfer(&user, &tid, false).await;
    }

    Json(serde_json::json!({
        "status": "ok",
        "job_id": job_id,
        "stage": "paused",
    }))
}

// POST /api/download/:id/resume
async fn resume_download_job(
    State(state): State<AppState>,
    AxumPath(job_id): AxumPath<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let job_opt = {
        let q = state.download_queue.read().await;
        q.jobs.iter().find(|j| j.id == job_id).cloned()
    };

    let job = match job_opt {
        Some(j) => j,
        None => return Err(StatusCode::NOT_FOUND),
    };

    let payload = match job.request_payload {
        Some(p) => p,
        None => DownloadRequest {
            title: job.title.clone(),
            artist: job.artist.clone(),
            album: job.album.clone(),
            track_number: job.track_number,
            year: job.year,
            duration: job.duration,
            cover_url: job.cover_url.clone(),
            stream_url: job.stream_url.clone(),
            track_id: job.track_id.clone(),
            source: job.source.clone(),
        },
    };

    // Instantiate a new cancellation token
    let new_token = tokio_util::sync::CancellationToken::new();
    {
        let mut tokens = state.download_tokens.write().await;
        tokens.insert(job_id.clone(), new_token.clone());
    }

    // Set stage back to Queued
    {
        let mut q = state.download_queue.write().await;
        if let Some(j) = q.jobs.iter_mut().find(|j| j.id == job_id) {
            j.stage = DownloadStage::Queued;
            j.error = None;
            j.updated_at = chrono::Utc::now().timestamp();
        }
    }

    let state_clone = state.clone();
    let job_id_clone = job_id.clone();
    tokio::spawn(async move {
        run_download_pipeline(state_clone, job_id_clone, payload, new_token).await;
    });

    Ok(Json(serde_json::json!({
        "status": "ok",
        "job_id": job_id,
        "stage": "queued",
    })))
}

// DELETE /api/download/:id
async fn delete_download_job(
    State(state): State<AppState>,
    AxumPath(job_id): AxumPath<String>,
) -> Json<serde_json::Value> {
    // 1. Cancel token
    {
        let mut tokens = state.download_tokens.write().await;
        if let Some(token) = tokens.remove(&job_id) {
            token.cancel();
        }
    }

    // 2. Remove job from in-memory queue & extract slskd transfer info
    let (removed, slsk_info) = {
        let mut q = state.download_queue.write().await;
        let job_info = q.jobs.iter().find(|j| j.id == job_id).and_then(|j| {
            j.slskd_username.clone().zip(j.slskd_id.clone())
        });
        let initial_len = q.jobs.len();
        q.jobs.retain(|j| j.id != job_id);
        (q.jobs.len() < initial_len, job_info)
    };

    // 3. Signal slskd to remove transfer completely (remove=true)
    if let Some((user, tid)) = slsk_info {
        let _ = state.soulseek.cancel_transfer(&user, &tid, true).await;
    } else {
        // Fallback for raw slsk-xxx items
        if let Ok(active) = state.soulseek.get_active_downloads().await {
            for t in active {
                if let (Some(u), Some(tid)) = (t.username, t.id) {
                    let clean = t.filename.replace('\\', "/");
                    let calc_id = format!("slsk-{:x}", md5::compute(clean.as_bytes()));
                    if calc_id == job_id {
                        let _ = state.soulseek.cancel_transfer(&u, &tid, true).await;
                    }
                }
            }
        }
    }

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

    // Clear completed/cancelled transfers in slskd
    let _ = state.soulseek.clear_completed_transfers().await;

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
        .route("/{id}/pause", post(pause_download_job))
        .route("/{id}/resume", post(resume_download_job))
}
