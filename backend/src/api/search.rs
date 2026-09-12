use crate::api::search_tracker::normalize_diacritics;
use crate::state::AppState;
use axum::extract::{Query, State};
use axum::response::Json;
use axum::routing::get;
use axum::Router;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    pub source: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SuggestionQuery {
    pub q: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct SearchResultItem {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub cover_url: Option<String>,
    pub preview_url: Option<String>,
    pub duration: u32,
    pub source: String,
    pub hires: bool,
    pub stream_id: Option<String>,
    pub bit_depth: Option<u32>,
    pub sample_rate: Option<f32>,
    pub bitrate: Option<u32>,
    pub format: Option<String>,
    pub dr_score: Option<u8>,
}

#[derive(Debug, Serialize)]
pub struct SearchSuggestionItem {
    pub r#type: String, // "artist", "track", "query"
    pub text: String,
    pub subtext: Option<String>,
    pub cover_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TrendingArtistItem {
    pub name: String,
    pub track_count: usize,
    pub cover_url: String,
}

#[derive(Debug, Serialize)]
pub struct PreSearchTrendingResponse {
    pub trending_keywords: Vec<String>,
    pub top_artists: Vec<TrendingArtistItem>,
    pub quick_picks: Vec<SearchResultItem>,
    pub genres: Vec<String>,
}

/// Zero-state discovery endpoint: returns hot search keywords, top trending artists,
/// quick-play picks, and curated categories.
async fn handle_search_trending(
    State(state): State<AppState>,
) -> Json<PreSearchTrendingResponse> {
    let trending_lock = state.trending.read().await;

    // 1. Get real-time surging queries from the in-memory velocity tracker
    let live_trending_queries = state.search_tracker.get_trending_queries(10).await;

    // 2. Extract top artists and track count from VN and Global charts
    let mut artist_counts: HashMap<String, (usize, String)> = HashMap::new();
    let mut all_trending_tracks = Vec::new();
    all_trending_tracks.extend(trending_lock.vietnam.clone());
    all_trending_tracks.extend(trending_lock.global.clone());

    for track in &all_trending_tracks {
        let entry = artist_counts
            .entry(track.artist.clone())
            .or_insert((0, track.cover_url.clone()));
        entry.0 += 1;
        if entry.1.is_empty() && !track.cover_url.is_empty() {
            entry.1 = track.cover_url.clone();
        }
    }

    let mut top_artists: Vec<TrendingArtistItem> = artist_counts
        .into_iter()
        .map(|(name, (track_count, cover_url))| TrendingArtistItem {
            name,
            track_count,
            cover_url,
        })
        .collect();
    top_artists.sort_by(|a, b| b.track_count.cmp(&a.track_count));
    top_artists.truncate(8);

    // 3. Quick picks: Top 6 tracks from Vietnam trending for instant playback
    let quick_picks: Vec<SearchResultItem> = trending_lock
        .vietnam
        .iter()
        .take(6)
        .map(|t| SearchResultItem {
            id: format!("trending-vn-{}", t.id),
            title: t.title.clone(),
            artist: t.artist.clone(),
            album: t.album.clone(),
            cover_url: Some(t.cover_url.clone()),
            preview_url: t.preview_url.clone(),
            duration: 210,
            source: "tidal".to_string(),
            hires: true,
            stream_id: None,
            bit_depth: Some(24),
            sample_rate: Some(96000.0),
            bitrate: Some(2500),
            format: Some("FLAC".to_string()),
            dr_score: Some(12),
        })
        .collect();

    // 4. Build rich trending keywords: merge real-time search velocity with chart top items
    let mut keywords: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for q in live_trending_queries {
        let norm = normalize_diacritics(&q);
        if seen.insert(norm) {
            keywords.push(q);
        }
    }

    // Augment with top artists and songs from charts
    for artist in &top_artists {
        let norm = normalize_diacritics(&artist.name);
        if seen.insert(norm) {
            keywords.push(artist.name.clone());
        }
    }

    for track in trending_lock.vietnam.iter().take(6) {
        let norm = normalize_diacritics(&track.title);
        if seen.insert(norm) {
            keywords.push(track.title.clone());
        }
    }

    // Default fallbacks if charts haven't loaded yet
    let defaults = [
        "Sơn Tùng M-TP",
        "Đen",
        "Taylor Swift",
        "Billie Eilish",
        "HIEUTHUHAI",
        "V-Pop Top 50",
        "Hi-Res 24-bit FLAC",
    ];
    for d in defaults {
        let norm = normalize_diacritics(d);
        if seen.insert(norm) {
            keywords.push(d.to_string());
        }
    }
    keywords.truncate(10);

    let genres = vec![
        "Hi-Res FLAC (24-bit)".to_string(),
        "V-Pop Top Hits".to_string(),
        "Billboard Global".to_string(),
        "Hip-Hop / Rap".to_string(),
        "Pop & Ballad".to_string(),
        "Indie & Acoustic".to_string(),
        "Lossless Master".to_string(),
    ];

    Json(PreSearchTrendingResponse {
        trending_keywords: keywords,
        top_artists,
        quick_picks,
        genres,
    })
}

/// Instant Typeahead / Autocomplete endpoint (<15ms)
async fn handle_search_suggestions(
    Query(query): Query<SuggestionQuery>,
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let q_raw = query.q.trim();
    if q_raw.is_empty() {
        return Json(serde_json::json!({ "suggestions": [] }));
    }

    let q_norm = normalize_diacritics(q_raw);
    let mut suggestions: Vec<(SearchSuggestionItem, i32)> = Vec::new();
    let mut seen_keys: HashSet<String> = HashSet::new();

    // 1. Search Local Library (Artists, Tracks, Albums)
    {
        let lib = state.library.read().await;

        for artist in lib.artists.values() {
            let a_norm = normalize_diacritics(&artist.name);
            if a_norm == q_norm {
                let key = format!("artist:{}", a_norm);
                if seen_keys.insert(key) {
                    suggestions.push((
                        SearchSuggestionItem {
                            r#type: "artist".to_string(),
                            text: artist.name.clone(),
                            subtext: Some(format!("Artist • {} tracks in NAS", artist.track_count)),
                            cover_url: None,
                        },
                        100,
                    ));
                }
            } else if a_norm.starts_with(&q_norm) {
                let key = format!("artist:{}", a_norm);
                if seen_keys.insert(key) {
                    suggestions.push((
                        SearchSuggestionItem {
                            r#type: "artist".to_string(),
                            text: artist.name.clone(),
                            subtext: Some(format!("Artist • {} tracks in NAS", artist.track_count)),
                            cover_url: None,
                        },
                        80,
                    ));
                }
            } else if a_norm.contains(&q_norm) {
                let key = format!("artist:{}", a_norm);
                if seen_keys.insert(key) {
                    suggestions.push((
                        SearchSuggestionItem {
                            r#type: "artist".to_string(),
                            text: artist.name.clone(),
                            subtext: Some("Artist in Library".to_string()),
                            cover_url: None,
                        },
                        50,
                    ));
                }
            }
        }

        for track in lib.tracks.values().take(2000) {
            let t_norm = normalize_diacritics(&track.title);
            let a_norm = normalize_diacritics(&track.artist);

            if t_norm.starts_with(&q_norm) {
                let key = format!("track:{}", t_norm);
                if seen_keys.insert(key) {
                    suggestions.push((
                        SearchSuggestionItem {
                            r#type: "track".to_string(),
                            text: track.title.clone(),
                            subtext: Some(format!("Track by {}", track.artist)),
                            cover_url: Some(format!("/rest/getCoverArt.view?id=cover-{}", track.id)),
                        },
                        75,
                    ));
                }
            } else if t_norm.contains(&q_norm) || a_norm.contains(&q_norm) {
                let key = format!("track:{}", t_norm);
                if seen_keys.insert(key) {
                    suggestions.push((
                        SearchSuggestionItem {
                            r#type: "track".to_string(),
                            text: track.title.clone(),
                            subtext: Some(format!("Track by {}", track.artist)),
                            cover_url: Some(format!("/rest/getCoverArt.view?id=cover-{}", track.id)),
                        },
                        45,
                    ));
                }
            }
        }
    }

    // 2. Search Trending Charts (Artists & Songs)
    {
        let trending = state.trending.read().await;
        let mut chart_tracks = Vec::new();
        chart_tracks.extend(&trending.vietnam);
        chart_tracks.extend(&trending.global);

        for track in chart_tracks {
            let a_norm = normalize_diacritics(&track.artist);
            let t_norm = normalize_diacritics(&track.title);

            if a_norm.starts_with(&q_norm) {
                let key = format!("artist:{}", a_norm);
                if seen_keys.insert(key) {
                    suggestions.push((
                        SearchSuggestionItem {
                            r#type: "artist".to_string(),
                            text: track.artist.clone(),
                            subtext: Some("Artist • Trending".to_string()),
                            cover_url: Some(track.cover_url.clone()),
                        },
                        85,
                    ));
                }
            }

            if t_norm.starts_with(&q_norm) {
                let key = format!("track:{}", t_norm);
                if seen_keys.insert(key) {
                    suggestions.push((
                        SearchSuggestionItem {
                            r#type: "track".to_string(),
                            text: track.title.clone(),
                            subtext: Some(format!("Trending Track by {}", track.artist)),
                            cover_url: Some(track.cover_url.clone()),
                        },
                        70,
                    ));
                }
            }
        }
    }

    // 3. Fallback generic query completion
    let q_key = format!("query:{}", q_norm);
    if seen_keys.insert(q_key) {
        suggestions.push((
            SearchSuggestionItem {
                r#type: "query".to_string(),
                text: q_raw.to_string(),
                subtext: Some("Search all sources".to_string()),
                cover_url: None,
            },
            10,
        ));
    }

    // Sort by relevance score descending
    suggestions.sort_by(|a, b| b.1.cmp(&a.1));
    let top_suggestions: Vec<SearchSuggestionItem> =
        suggestions.into_iter().take(8).map(|(s, _)| s).collect();

    Json(serde_json::json!({ "suggestions": top_suggestions }))
}

/// Full search endpoint with multi-source retrieval, diacritic tolerance, and query logging
async fn handle_search(
    Query(query): Query<SearchQuery>,
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let q = query.q.trim();
    if q.is_empty() {
        return Json(serde_json::json!({ "results": [] }));
    }

    // Record query for real-time trending analytics
    state.search_tracker.record_query(q).await;

    let q_norm = normalize_diacritics(q);
    let q_tokens: Vec<&str> = q_norm.split_whitespace().collect();

    let mut local_results: Vec<(SearchResultItem, i32)> = Vec::new();
    let mut seen_canonical: HashSet<String> = HashSet::new();

    // 1. Search local NAS library with diacritic-tolerant scoring
    {
        let lib = state.library.read().await;
        for track in lib.tracks.values() {
            let title_norm = normalize_diacritics(&track.title);
            let artist_norm = normalize_diacritics(&track.artist);
            let album_norm = normalize_diacritics(&track.album);

            let mut score = 0;

            if title_norm == q_norm {
                score += 100;
            } else if title_norm.starts_with(&q_norm) {
                score += 80;
            } else if artist_norm == q_norm {
                score += 70;
            } else if artist_norm.starts_with(&q_norm) {
                score += 60;
            } else if !q_tokens.is_empty()
                && q_tokens
                    .iter()
                    .all(|&tok| title_norm.contains(tok) || artist_norm.contains(tok) || album_norm.contains(tok))
            {
                score += 50;
            } else if title_norm.contains(&q_norm) || artist_norm.contains(&q_norm) {
                score += 30;
            }

            if score > 0 {
                // Priority boost for local NAS bit-perfect FLAC
                score += 20;

                let canonical_key = format!("{}-{}", artist_norm, title_norm);
                seen_canonical.insert(canonical_key);

                local_results.push((
                    SearchResultItem {
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
                    },
                    score,
                ));
            }
        }
    }

    local_results.sort_by(|a, b| b.1.cmp(&a.1));
    let mut final_results: Vec<SearchResultItem> =
        local_results.into_iter().map(|(item, _)| item).collect();

    let source_filter = query.source.as_deref().unwrap_or("all");

    // 2. Parallel Search for Tidal and Qobuz (if requested)
    let should_search_tidal = source_filter == "all" || source_filter == "tidal";
    let should_search_qobuz = source_filter == "all" || source_filter == "qobuz";

    let (tidal_res, qobuz_res) = tokio::join!(
        async {
            if should_search_tidal {
                state.tidal.search_tracks(q).await.ok()
            } else {
                None
            }
        },
        async {
            if should_search_qobuz {
                state.qobuz.search_tracks(q).await.ok()
            } else {
                None
            }
        }
    );

    // Merge Tidal results
    if let Some(tidal_tracks) = tidal_res {
        for track in tidal_tracks {
            let canonical_key = format!(
                "{}-{}",
                normalize_diacritics(&track.artist),
                normalize_diacritics(&track.title)
            );
            // If already present in local NAS, avoid cluttering unless user specifically asked for tidal
            if source_filter == "all" && seen_canonical.contains(&canonical_key) {
                continue;
            }
            seen_canonical.insert(canonical_key);

            let cover = track.cover_uuid.as_deref().map(|uuid| {
                crate::engines::MetadataResolver::format_tidal_cover(uuid, 1280)
            });
            let is_master = track.audio_quality == "HI_RES_LOSSLESS";
            final_results.push(SearchResultItem {
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
        }
    }

    // Merge Qobuz results
    if let Some(qobuz_tracks) = qobuz_res {
        for track in qobuz_tracks {
            let canonical_key = format!(
                "{}-{}",
                normalize_diacritics(&track.artist),
                normalize_diacritics(&track.title)
            );
            if source_filter == "all" && seen_canonical.contains(&canonical_key) {
                continue;
            }
            seen_canonical.insert(canonical_key);

            let bit_depth = track.maximum_bit_depth;
            let sample_rate = track.maximum_sampling_rate;
            let is_hires = track.hires || bit_depth.unwrap_or(0) > 16;
            let bitrate = bit_depth.and_then(|bd| {
                sample_rate.map(|sr| (bd as f32 * sr * 2.0 / 1000.0) as u32)
            });

            final_results.push(SearchResultItem {
                id: format!("qobuz-{}", track.id),
                title: track.title,
                artist: track.artist,
                album: track.album,
                cover_url: track.cover_url,
                preview_url: None,
                duration: track.duration,
                source: "qobuz".to_string(),
                hires: is_hires,
                stream_id: Some(track.id),
                bit_depth,
                sample_rate,
                bitrate,
                format: Some("FLAC".to_string()),
                dr_score: Some(if is_hires { 13 } else { 11 }),
            });
        }
    }

    // 3. Apple Music / iTunes fallback search (if still empty)
    if final_results.is_empty() {
        if let Some(meta) = state.metadata.resolve_apple_music(q).await {
            final_results.push(SearchResultItem {
                id: format!("apple-{}", uuid::Uuid::new_v4()),
                title: meta.title,
                artist: meta.artist,
                album: meta.album,
                cover_url: meta.cover_url,
                preview_url: meta.preview_url,
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
        }
    }

    Json(serde_json::json!({ "results": final_results }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(handle_search))
        .route("/trending", get(handle_search_trending))
        .route("/suggestions", get(handle_search_suggestions))
}
