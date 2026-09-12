use crate::state::AppState;
use axum::extract::{Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::get;
use axum::Router;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use tower_service::Service;

#[derive(Debug, Deserialize)]
pub struct StreamRequest {
    pub artist: Option<String>,
    pub title: Option<String>,
    pub id: Option<String>,
    pub url: Option<String>,
    pub path: Option<String>,
}

fn find_ffmpeg() -> Option<PathBuf> {
    for candidate in &["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "ffmpeg"] {
        let p = PathBuf::from(candidate);
        if p.is_absolute() && p.exists() {
            return Some(p);
        }
        if std::process::Command::new(candidate).arg("-version").output().is_ok() {
            return Some(p);
        }
    }
    None
}

fn get_dsd_cache_dir() -> PathBuf {
    let base = if let Ok(d) = std::env::var("DATA_DIR") {
        PathBuf::from(d)
    } else if let Ok(cfg_path) = std::env::var("CONFIG_PATH") {
        PathBuf::from(cfg_path)
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("var"))
            .unwrap_or_else(|| PathBuf::from("./data"))
    } else {
        PathBuf::from("./data")
    };
    let dir = base.join("dsd_cache");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn get_audio_mime_type(path: &Path) -> &'static str {
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    match ext.as_str() {
        "flac" => "audio/flac",
        "wav" => "audio/wav",
        "mp3" => "audio/mpeg",
        "m4a" | "aac" => "audio/mp4",
        "ogg" => "audio/ogg",
        "opus" => "audio/opus",
        "aiff" | "aif" => "audio/aiff",
        "dsf" | "dff" => "audio/flac",
        _ => "audio/flac",
    }
}

async fn handle_stream(
    Query(query): Query<StreamRequest>,
    State(state): State<AppState>,
    req: axum::extract::Request,
) -> Response {
    let artist = query.artist.as_deref().unwrap_or("").trim();
    let title = query.title.as_deref().unwrap_or("").trim();

    // 1. Check if track already exists in local NAS library (by path, ID, or artist & title)
    let local_track = {
        let lib = state.library.read().await;
        if let Some(path_str) = &query.path {
            let p = PathBuf::from(path_str);
            lib.tracks.values().find(|t| t.file_path == p).cloned().or_else(|| {
                if p.exists() && p.is_file() {
                    let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                    let is_dsd = ext == "dsf" || ext == "dff";
                    let id = format!("{:x}", md5::compute(p.to_string_lossy().as_bytes()));
                    Some(crate::storage::scanner::LibraryTrack {
                        id,
                        title: query.title.clone().unwrap_or_else(|| p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()),
                        artist: query.artist.clone().unwrap_or_else(|| "Synology NAS Vault".to_string()),
                        album: "Lossless Storage".to_string(),
                        duration: 0,
                        track_number: 1,
                        file_path: p,
                        format: ext,
                        bit_depth: if is_dsd { Some(1) } else { Some(24) },
                        sample_rate: if is_dsd { Some(2822400) } else { Some(96000) },
                        bitrate: if is_dsd { Some(5644) } else { Some(2400) },
                        channels: Some(2),
                        year: None,
                        dr_score: Some(13),
                        hires: true,
                        is_dsd,
                    })
                } else {
                    None
                }
            })
        } else if let Some(id) = &query.id {
            if id.starts_with('/') {
                let p = PathBuf::from(id);
                lib.tracks.values().find(|t| t.file_path == p).cloned()
            } else if let Some(t) = lib.tracks.get(id) {
                Some(t.clone())
            } else if !artist.is_empty() && !title.is_empty() {
                lib.tracks.values().find(|t| {
                    t.artist.eq_ignore_ascii_case(artist) && t.title.eq_ignore_ascii_case(title)
                }).cloned()
            } else {
                None
            }
        } else if !artist.is_empty() && !title.is_empty() {
            lib.tracks.values().find(|t| {
                t.artist.eq_ignore_ascii_case(artist) && t.title.eq_ignore_ascii_case(title)
            }).cloned()
        } else {
            None
        }
    };

    if let Some(track) = local_track {
        // Ensure file exists and is not 0 bytes (corrupted download)
        if track.file_path.exists() {
            if let Ok(meta) = std::fs::metadata(&track.file_path) {
                if meta.len() > 1024 {
                    let is_dsd = track.is_dsd
                        || track.format.eq_ignore_ascii_case("dsf")
                        || track.format.eq_ignore_ascii_case("dff")
                        || track.file_path.extension().and_then(|e| e.to_str()).map(|e| {
                            let el = e.to_lowercase();
                            el == "dsf" || el == "dff"
                        }).unwrap_or(false);

                    let (file_to_serve, is_transcoded) = if is_dsd {
                        let cache_dir = get_dsd_cache_dir();
                        let flac_name = format!("{}.flac", track.id);
                        let cached_flac = cache_dir.join(&flac_name);

                        let mut ready = false;
                        if cached_flac.exists() {
                            if let Ok(m) = std::fs::metadata(&cached_flac) {
                                if m.len() > 1024 {
                                    ready = true;
                                }
                            }
                        }

                        if !ready {
                            if let Some(ffmpeg) = find_ffmpeg() {
                                tracing::info!("Transcoding DSD to 24-bit/88.2kHz FLAC for track '{}': {:?}", track.title, track.file_path);
                                let tmp_name = format!("{}.{}.tmp.flac", track.id, uuid::Uuid::new_v4());
                                let tmp_file = cache_dir.join(&tmp_name);

                                let status = tokio::process::Command::new(ffmpeg)
                                    .arg("-ss").arg("0")
                                    .arg("-i").arg(&track.file_path)
                                    .arg("-vn")
                                    .arg("-c:a").arg("flac")
                                    .arg("-sample_fmt").arg("s32")
                                    .arg("-ar").arg("88200")
                                    .arg("-compression_level").arg("5")
                                    .arg("-f").arg("flac")
                                    .arg("-y")
                                    .arg(&tmp_file)
                                    .status()
                                    .await;

                                if let Ok(st) = status {
                                    if st.success() {
                                        if tokio::fs::rename(&tmp_file, &cached_flac).await.is_ok() {
                                            ready = true;
                                        }
                                    } else {
                                        let _ = tokio::fs::remove_file(&tmp_file).await;
                                        tracing::warn!("FFmpeg DSD transcode failed: {:?}", st);
                                    }
                                } else {
                                    let _ = tokio::fs::remove_file(&tmp_file).await;
                                    tracing::warn!("Failed to invoke FFmpeg for DSD transcode");
                                }
                            }
                        }

                        if ready {
                            (cached_flac, true)
                        } else {
                            (track.file_path.clone(), false)
                        }
                    } else {
                        (track.file_path.clone(), false)
                    };

                    let mut service = tower_http::services::fs::ServeFile::new(&file_to_serve);
                    let mut res = service.call(req).await.unwrap().into_response();
                    let headers = res.headers_mut();
                    headers.insert("access-control-allow-origin", "*".parse().unwrap());
                    headers.insert("access-control-expose-headers", "*".parse().unwrap());

                    let mime = get_audio_mime_type(&file_to_serve);
                    headers.insert(header::CONTENT_TYPE, mime.parse().unwrap());

                    if is_transcoded {
                        headers.insert("x-audio-format", "FLAC (DSD64 Transcoded)".parse().unwrap());
                        headers.insert("x-audio-source", "nas-local-dsd-transcoded".parse().unwrap());
                        headers.insert("x-audio-bit-depth", "24".parse().unwrap());
                        headers.insert("x-audio-sample-rate", "88200".parse().unwrap());
                    } else {
                        headers.insert("x-audio-format", track.format.to_uppercase().parse().unwrap());
                        headers.insert("x-audio-source", "nas-local-bitperfect".parse().unwrap());
                        if let Some(bd) = track.bit_depth {
                            headers.insert("x-audio-bit-depth", bd.to_string().parse().unwrap());
                        }
                        if let Some(sr) = track.sample_rate {
                            headers.insert("x-audio-sample-rate", sr.to_string().parse().unwrap());
                        }
                    }

                    if let Some(dr) = track.dr_score {
                        headers.insert("x-audio-dr-score", dr.to_string().parse().unwrap());
                    }
                    headers.insert("x-audio-is-dsd", (if is_dsd { "true" } else { "false" }).parse().unwrap());
                    return res;
                }
            }
        }
    }

    // Direct Tidal Stream Resolution if track_id is provided
    if let Some(id) = &query.id {
        if id.starts_with("tidal-") {
            let real_id = id.trim_start_matches("tidal-");
            if let Ok(tidal_stream) = state.tidal.resolve_stream_url(real_id, None).await {
                return proxy_stream(&tidal_stream, req).await;
            }
        }
    }

    // 2. Resolve 100% full-length song stream
    if !title.is_empty() {
        if let Some(full_stream_url) = state.resolver.resolve_full_stream(artist, title).await {
            return proxy_stream(&full_stream_url, req).await;
        }
    }

    // 3. Fallback to direct URL if provided
    if let Some(direct_url) = &query.url {
        if !direct_url.is_empty() {
            return proxy_stream(direct_url, req).await;
        }
    }

    StatusCode::NOT_FOUND.into_response()
}

pub async fn proxy_stream(target_url: &str, req: axum::extract::Request) -> Response {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0")
        .build()
        .unwrap_or_default();
    let mut req_builder = client.get(target_url);

    // Forward client Range header for byte-seeking
    if let Some(range) = req.headers().get(axum::http::header::RANGE) {
        if let Ok(range_str) = range.to_str() {
            req_builder = req_builder.header(reqwest::header::RANGE, range_str);
        }
    }

    match req_builder.send().await {
        Ok(upstream_res) => {
            let upstream_status = upstream_res.status();
            if !upstream_status.is_success() && upstream_status != reqwest::StatusCode::PARTIAL_CONTENT {
                tracing::warn!("Stream proxy upstream error {}: {}", upstream_status, target_url);
                return (upstream_status, "Upstream stream unavailable").into_response();
            }

            let status = if upstream_status == reqwest::StatusCode::PARTIAL_CONTENT {
                StatusCode::PARTIAL_CONTENT
            } else {
                StatusCode::OK
            };

            let mut builder = Response::builder()
                .status(status)
                .header(axum::http::header::ACCEPT_RANGES, "bytes")
                .header(axum::http::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .header(axum::http::header::ACCESS_CONTROL_ALLOW_METHODS, "GET, HEAD, OPTIONS")
                .header(axum::http::header::ACCESS_CONTROL_ALLOW_HEADERS, "*")
                .header(axum::http::header::ACCESS_CONTROL_EXPOSE_HEADERS, "*");

            if let Some(content_type) = upstream_res.headers().get(reqwest::header::CONTENT_TYPE) {
                if let Ok(ct) = content_type.to_str() {
                    if ct.starts_with("text/") || ct.contains("html") {
                        builder = builder.header(axum::http::header::CONTENT_TYPE, "audio/webm");
                    } else {
                        builder = builder.header(axum::http::header::CONTENT_TYPE, ct);
                    }
                }
            } else {
                builder = builder.header(axum::http::header::CONTENT_TYPE, "audio/mpeg");
            }

            if let Some(content_length) = upstream_res.headers().get(reqwest::header::CONTENT_LENGTH) {
                if let Ok(cl) = content_length.to_str() {
                    builder = builder.header(axum::http::header::CONTENT_LENGTH, cl);
                }
            }

            if let Some(content_range) = upstream_res.headers().get(reqwest::header::CONTENT_RANGE) {
                if let Ok(cr) = content_range.to_str() {
                    builder = builder.header(axum::http::header::CONTENT_RANGE, cr);
                }
            }

            let stream = upstream_res.bytes_stream();
            let body = axum::body::Body::from_stream(stream);
            builder.body(body).unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        Err(e) => {
            tracing::warn!("Stream proxy failed for {}: {}, falling back to 307 redirect", target_url, e);
            Redirect::temporary(target_url).into_response()
        }
    }
}

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(handle_stream))
}
