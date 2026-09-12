use crate::state::AppState;
use axum::extract::{Query, State};
use axum::response::Json;
use axum::routing::get;
use axum::Router;
use lofty::file::TaggedFileExt;
use serde::{Deserialize, Serialize};

use std::time::Duration;
use tracing::{info, warn};

#[derive(Debug, Deserialize)]
pub struct LyricsQuery {
    pub artist: String,
    pub title: String,
    pub album: Option<String>,
    pub duration: Option<u32>,
}

#[derive(Debug, Serialize, Clone)]
pub struct LyricLine {
    pub time: f64, // time in seconds (e.g. 20.49)
    pub text: String,
}

#[derive(Debug, Serialize)]
pub struct LyricsResponse {
    pub synced: bool,
    pub lines: Vec<LyricLine>,
    pub plain: Option<String>,
    pub instrumental: bool,
    pub source: String, // "local-lrc", "local-tag", "lrclib", "none"
}

#[derive(Debug, Deserialize)]
struct LrclibItem {
    #[serde(rename = "syncedLyrics")]
    pub synced_lyrics: Option<String>,
    #[serde(rename = "plainLyrics")]
    pub plain_lyrics: Option<String>,
    #[serde(default)]
    pub instrumental: bool,
}

/// Parse LRC timestamp format: [mm:ss.xx] or [mm:ss.xxx]
pub fn parse_lrc(lrc_text: &str) -> Vec<LyricLine> {
    let mut lines = Vec::new();

    for line in lrc_text.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with('[') {
            continue;
        }

        // Find all timestamp tags in line, e.g. [01:23.45]
        let mut rest = trimmed;
        let mut timestamps = Vec::new();

        while let Some(open_idx) = rest.find('[') {
            if let Some(close_idx) = rest[open_idx..].find(']') {
                let tag = &rest[open_idx + 1..open_idx + close_idx];
                if let Some(sec) = parse_timestamp(tag) {
                    timestamps.push(sec);
                    rest = &rest[open_idx + close_idx + 1..];
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        let lyric_text = rest.trim().to_string();
        for t in timestamps {
            lines.push(LyricLine {
                time: t,
                text: lyric_text.clone(),
            });
        }
    }

    lines.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap_or(std::cmp::Ordering::Equal));
    lines
}

fn parse_timestamp(tag: &str) -> Option<f64> {
    let parts: Vec<&str> = tag.split(':').collect();
    if parts.len() != 2 {
        return None;
    }

    let minutes: f64 = parts[0].trim().parse().ok()?;
    let seconds: f64 = parts[1].trim().parse().ok()?;

    Some(minutes * 60.0 + seconds)
}

async fn handle_lyrics(
    Query(query): Query<LyricsQuery>,
    State(state): State<AppState>,
) -> Json<LyricsResponse> {
    let artist = query.artist.trim();
    let title = query.title.trim();

    if artist.is_empty() && title.is_empty() {
        return Json(LyricsResponse {
            synced: false,
            lines: Vec::new(),
            plain: None,
            instrumental: false,
            source: "none".to_string(),
        });
    }

    // 1. Check local NAS library for .lrc file or embedded metadata tags
    {
        let lib = state.library.read().await;
        for track in lib.tracks.values() {
            if track.title.eq_ignore_ascii_case(title) && track.artist.eq_ignore_ascii_case(artist) {
                // Check if .lrc file exists alongside music file
                let lrc_candidate1 = track.file_path.with_extension("lrc");
                let lrc_candidate2 = std::path::PathBuf::from(format!("{}.lrc", track.file_path.display()));

                let lrc_path = if lrc_candidate1.exists() {
                    Some(lrc_candidate1)
                } else if lrc_candidate2.exists() {
                    Some(lrc_candidate2)
                } else {
                    None
                };

                if let Some(path) = lrc_path {
                    if let Ok(content) = tokio::fs::read_to_string(&path).await {
                        let lines = parse_lrc(&content);
                        if !lines.is_empty() {
                            info!("Found local .lrc file for {} - {}", artist, title);
                            return Json(LyricsResponse {
                                synced: true,
                                lines,
                                plain: Some(content),
                                instrumental: false,
                                source: "local-lrc".to_string(),
                            });
                        }
                    }
                }

                // Check embedded metadata tags using lofty
                if let Ok(tagged_file) = lofty::probe::Probe::open(&track.file_path)
                    .and_then(|p| p.read())
                {
                    if let Some(tag) = tagged_file.primary_tag().or_else(|| tagged_file.first_tag()) {
                        if let Some(lyrics) = tag.get_string(lofty::tag::ItemKey::Lyrics) {
                            let lines = parse_lrc(lyrics);
                            let has_sync = !lines.is_empty();
                            info!("Found embedded lyrics for {} - {}", artist, title);
                            return Json(LyricsResponse {
                                synced: has_sync,
                                lines,
                                plain: Some(lyrics.to_string()),
                                instrumental: false,
                                source: "local-tag".to_string(),
                            });
                        }
                    }
                }
                break;
            }
        }
    }

    // 2. Query LRCLIB API
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(6))
        .user_agent("KV-TIDAL/1.0 (https://github.com/khoavo)")
        .build()
        .unwrap_or_default();

    // Try direct get endpoint: /api/get
    let mut get_url = format!(
        "https://lrclib.net/api/get?artist_name={}&track_name={}",
        urlencoding::encode(artist),
        urlencoding::encode(title)
    );
    if let Some(album) = &query.album {
        if !album.is_empty() {
            get_url.push_str(&format!("&album_name={}", urlencoding::encode(album)));
        }
    }
    if let Some(dur) = query.duration {
        if dur > 0 {
            get_url.push_str(&format!("&duration={}", dur));
        }
    }

    if let Ok(resp) = client.get(&get_url).send().await {
        if resp.status().is_success() {
            if let Ok(item) = resp.json::<LrclibItem>().await {
                if item.instrumental {
                    return Json(LyricsResponse {
                        synced: false,
                        lines: Vec::new(),
                        plain: Some("[Instrumental]".to_string()),
                        instrumental: true,
                        source: "lrclib".to_string(),
                    });
                }

                if let Some(synced) = item.synced_lyrics {
                    let lines = parse_lrc(&synced);
                    if !lines.is_empty() {
                        return Json(LyricsResponse {
                            synced: true,
                            lines,
                            plain: item.plain_lyrics.or(Some(synced)),
                            instrumental: false,
                            source: "lrclib".to_string(),
                        });
                    }
                }

                if let Some(plain) = item.plain_lyrics {
                    return Json(LyricsResponse {
                        synced: false,
                        lines: Vec::new(),
                        plain: Some(plain),
                        instrumental: false,
                        source: "lrclib".to_string(),
                    });
                }
            }
        }
    }

    // 3. Fallback search query on LRCLIB: /api/search?q=artist title
    let search_url = format!(
        "https://lrclib.net/api/search?q={}",
        urlencoding::encode(&format!("{} {}", artist, title))
    );

    if let Ok(resp) = client.get(&search_url).send().await {
        if resp.status().is_success() {
            if let Ok(items) = resp.json::<Vec<LrclibItem>>().await {
                for item in items {
                    if let Some(synced) = item.synced_lyrics {
                        let lines = parse_lrc(&synced);
                        if !lines.is_empty() {
                            return Json(LyricsResponse {
                                synced: true,
                                lines,
                                plain: item.plain_lyrics.or(Some(synced)),
                                instrumental: item.instrumental,
                                source: "lrclib".to_string(),
                            });
                        }
                    } else if let Some(plain) = item.plain_lyrics {
                        return Json(LyricsResponse {
                            synced: false,
                            lines: Vec::new(),
                            plain: Some(plain),
                            instrumental: item.instrumental,
                            source: "lrclib".to_string(),
                        });
                    }
                }
            }
        }
    }

    warn!("No lyrics found for {} - {}", artist, title);
    Json(LyricsResponse {
        synced: false,
        lines: Vec::new(),
        plain: None,
        instrumental: false,
        source: "none".to_string(),
    })
}

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(handle_lyrics))
}
