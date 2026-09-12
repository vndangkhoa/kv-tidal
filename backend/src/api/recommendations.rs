use crate::api::search::SearchResultItem;
use crate::api::search_tracker::normalize_diacritics;
use crate::state::AppState;
use axum::extract::{Query, State};
use axum::response::Json;
use axum::routing::get;
use axum::Router;
use serde::Deserialize;
use std::collections::HashSet;

#[derive(Debug, Deserialize)]
pub struct RecommendationQuery {
    pub artist: String,
    pub title: Option<String>,
    pub limit: Option<usize>,
}

async fn handle_recommendations(
    Query(query): Query<RecommendationQuery>,
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let artist = query.artist.trim();
    let current_title = query.title.as_deref().unwrap_or("").trim();
    let limit = query.limit.unwrap_or(10);

    let norm_artist = normalize_diacritics(artist);
    let norm_title = normalize_diacritics(current_title);
    let current_canonical = format!("{}-{}", norm_artist, norm_title);

    let mut results: Vec<SearchResultItem> = Vec::new();
    let mut seen_canonical: HashSet<String> = HashSet::new();
    if !current_canonical.is_empty() {
        seen_canonical.insert(current_canonical);
    }

    // 1. Search local NAS library for tracks by same artist
    {
        let lib = state.library.read().await;
        for track in lib.tracks.values() {
            let t_artist = normalize_diacritics(&track.artist);
            let t_title = normalize_diacritics(&track.title);
            let canonical = format!("{}-{}", t_artist, t_title);

            if seen_canonical.contains(&canonical) {
                continue;
            }

            if t_artist == norm_artist || t_artist.contains(&norm_artist) || norm_artist.contains(&t_artist) {
                seen_canonical.insert(canonical);
                results.push(SearchResultItem {
                    id: format!("local-{}", track.id),
                    title: track.title.clone(),
                    artist: track.artist.clone(),
                    album: track.album.clone(),
                    cover_url: Some(format!("/rest/getCoverArt.view?id=cover-{}", track.id)),
                    preview_url: Some(format!("/rest/stream.view?id={}", track.id)),
                    duration: track.duration,
                    source: "local".to_string(),
                    hires: track.hires,
                    stream_id: Some(track.id.clone()),
                    bit_depth: track.bit_depth.map(|b| b as u32),
                    sample_rate: track.sample_rate.map(|r| r as f32),
                    bitrate: track.bitrate,
                    format: Some(track.format.to_uppercase()),
                    dr_score: track.dr_score,
                });

                if results.len() >= limit {
                    break;
                }
            }
        }
    }

    // 2. Query Tidal catalog for top tracks by this artist
    if results.len() < limit && !artist.is_empty() {
        if let Ok(tidal_tracks) = state.tidal.search_tracks(artist).await {
            for track in tidal_tracks {
                let t_artist = normalize_diacritics(&track.artist);
                let t_title = normalize_diacritics(&track.title);
                let canonical = format!("{}-{}", t_artist, t_title);

                if seen_canonical.contains(&canonical) {
                    continue;
                }
                seen_canonical.insert(canonical);

                let cover = track.cover_uuid.as_deref().map(|uuid| {
                    crate::engines::MetadataResolver::format_tidal_cover(uuid, 1280)
                });
                let is_master = track.audio_quality == "HI_RES_LOSSLESS";

                results.push(SearchResultItem {
                    id: format!("tidal-{}", track.id),
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    cover_url: cover,
                    preview_url: None,
                    duration: track.duration,
                    source: "tidal".to_string(),
                    hires: is_master || track.audio_quality == "LOSSLESS",
                    stream_id: Some(track.id),
                    bit_depth: if is_master { Some(24) } else { Some(16) },
                    sample_rate: if is_master { Some(96000.0) } else { Some(44100.0) },
                    bitrate: if is_master { Some(3200) } else { Some(1411) },
                    format: Some("FLAC".to_string()),
                    dr_score: Some(if is_master { 12 } else { 10 }),
                });

                if results.len() >= limit {
                    break;
                }
            }
        }
    }

    // 3. Fallback to Trending chart tracks if list is still small
    if results.len() < limit {
        let trending_lock = state.trending.read().await;
        // Prioritize Vietnam trending if query artist looks Vietnamese or global otherwise
        let pool = if !trending_lock.vietnam.is_empty() {
            &trending_lock.vietnam
        } else {
            &trending_lock.global
        };

        for t in pool {
            let t_artist = normalize_diacritics(&t.artist);
            let t_title = normalize_diacritics(&t.title);
            let canonical = format!("{}-{}", t_artist, t_title);

            if seen_canonical.contains(&canonical) {
                continue;
            }
            seen_canonical.insert(canonical);

            results.push(SearchResultItem {
                id: format!("trending-rec-{}", t.id),
                title: t.title.clone(),
                artist: t.artist.clone(),
                album: t.album.clone(),
                cover_url: Some(t.cover_url.clone()),
                preview_url: t.preview_url.clone(),
                duration: 210,
                source: "itunes".to_string(),
                hires: false,
                stream_id: None,
                bit_depth: Some(16),
                sample_rate: Some(44100.0),
                bitrate: Some(256),
                format: Some("AAC".to_string()),
                dr_score: Some(8),
            });

            if results.len() >= limit {
                break;
            }
        }
    }

    results.truncate(limit);
    Json(serde_json::json!({ "recommendations": results }))
}

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(handle_recommendations))
}
