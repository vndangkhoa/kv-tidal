use crate::state::AppState;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::get;
use axum::Router;
use serde::Deserialize;
use tower_service::Service;

#[derive(Debug, Deserialize)]
pub struct StreamRequest {
    pub artist: Option<String>,
    pub title: Option<String>,
    pub id: Option<String>,
    pub url: Option<String>,
}

async fn handle_stream(
    Query(query): Query<StreamRequest>,
    State(state): State<AppState>,
    req: axum::extract::Request,
) -> Response {
    let artist = query.artist.as_deref().unwrap_or("").trim();
    let title = query.title.as_deref().unwrap_or("").trim();

    // 1. Check if track already exists in local NAS library (by ID or artist & title)
    let local_track = {
        let lib = state.library.read().await;
        if let Some(id) = &query.id {
            if let Some(t) = lib.tracks.get(id) {
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
                    let mut service = tower_http::services::fs::ServeFile::new(&track.file_path);
                    let mut res = service.call(req).await.unwrap().into_response();
                    let headers = res.headers_mut();
                    headers.insert("access-control-allow-origin", "*".parse().unwrap());
                    headers.insert("access-control-expose-headers", "*".parse().unwrap());
                    headers.insert("x-audio-format", track.format.to_uppercase().parse().unwrap());
                    headers.insert("x-audio-source", "nas-local-bitperfect".parse().unwrap());
                    if let Some(bd) = track.bit_depth {
                        headers.insert("x-audio-bit-depth", bd.to_string().parse().unwrap());
                    }
                    if let Some(sr) = track.sample_rate {
                        headers.insert("x-audio-sample-rate", sr.to_string().parse().unwrap());
                    }
                    if let Some(dr) = track.dr_score {
                        headers.insert("x-audio-dr-score", dr.to_string().parse().unwrap());
                    }
                    headers.insert("x-audio-is-dsd", (if track.is_dsd { "true" } else { "false" }).parse().unwrap());
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
