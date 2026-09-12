use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{error, info};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrendingTrack {
    pub id: String,
    pub rank: usize,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub cover_url: String,
    pub preview_url: Option<String>,
    pub region: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrendingAlbum {
    pub id: String,
    pub rank: usize,
    pub title: String,
    pub artist: String,
    pub cover_url: String,
    pub release_date: Option<String>,
    pub track_count: Option<usize>,
    pub region: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TrendingStore {
    pub vietnam: Vec<TrendingTrack>,
    pub global: Vec<TrendingTrack>,
    pub vietnam_albums: Vec<TrendingAlbum>,
    pub global_albums: Vec<TrendingAlbum>,
    pub last_updated: Option<DateTime<Utc>>,
}

pub type SharedTrending = Arc<RwLock<TrendingStore>>;

pub fn new_trending_store() -> SharedTrending {
    Arc::new(RwLock::new(TrendingStore::default()))
}

pub async fn start_trending_updater(store: SharedTrending) {
    // Initial fetch
    if let Err(e) = refresh_all_trending(&store).await {
        error!("Initial trending fetch failed: {}", e);
    }

    // Background loop every 2 hours
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(7200));
        loop {
            interval.tick().await;
            info!("Refreshing trending charts...");
            if let Err(e) = refresh_all_trending(&store).await {
                error!("Failed to refresh trending charts: {}", e);
            }
        }
    });
}

pub async fn refresh_all_trending(store: &SharedTrending) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()?;

    let (vn_res, global_res, vn_alb_res, global_alb_res) = tokio::join!(
        fetch_trending(&client, "vn", "https://itunes.apple.com/vn/rss/topsongs/limit=50/json"),
        fetch_trending(&client, "global", "https://itunes.apple.com/us/rss/topsongs/limit=50/json"),
        fetch_trending_albums(&client, "vn", "https://itunes.apple.com/vn/rss/topalbums/limit=25/json"),
        fetch_trending_albums(&client, "global", "https://itunes.apple.com/us/rss/topalbums/limit=25/json")
    );

    let mut w = store.write().await;
    match vn_res {
        Ok(tracks) => {
            info!("Updated Vietnam Trending ({} tracks)", tracks.len());
            w.vietnam = tracks;
        }
        Err(e) => error!("Failed to fetch Vietnam trending: {}", e),
    }

    match global_res {
        Ok(tracks) => {
            info!("Updated Global Trending ({} tracks)", tracks.len());
            w.global = tracks;
        }
        Err(e) => error!("Failed to fetch Global trending: {}", e),
    }

    match vn_alb_res {
        Ok(albums) => {
            info!("Updated Vietnam Top Albums ({} albums)", albums.len());
            w.vietnam_albums = albums;
        }
        Err(e) => error!("Failed to fetch Vietnam top albums: {}", e),
    }

    match global_alb_res {
        Ok(albums) => {
            info!("Updated Global Top Albums ({} albums)", albums.len());
            w.global_albums = albums;
        }
        Err(e) => error!("Failed to fetch Global top albums: {}", e),
    }

    w.last_updated = Some(Utc::now());
    Ok(())
}

async fn fetch_trending(
    client: &reqwest::Client,
    region: &str,
    url: &str,
) -> Result<Vec<TrendingTrack>, Box<dyn std::error::Error + Send + Sync>> {
    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(format!("HTTP error {}: {}", resp.status(), url).into());
    }

    let json: serde_json::Value = resp.json().await?;
    let entries = json
        .get("feed")
        .and_then(|f| f.get("entry"))
        .and_then(|e| e.as_array())
        .ok_or("Invalid iTunes RSS feed format")?;

    let mut tracks = Vec::new();

    for (idx, entry) in entries.iter().enumerate() {
        let title = entry
            .get("im:name")
            .and_then(|v| v.get("label"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Title")
            .to_string();

        let artist = entry
            .get("im:artist")
            .and_then(|v| v.get("label"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Artist")
            .to_string();

        let album = entry
            .get("im:collection")
            .and_then(|v| v.get("im:name"))
            .and_then(|v| v.get("label"))
            .and_then(|v| v.as_str())
            .unwrap_or(&title)
            .to_string();

        let id = entry
            .get("id")
            .and_then(|v| v.get("attributes"))
            .and_then(|v| v.get("im:id"))
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| &title)
            .to_string();

        let raw_cover = entry
            .get("im:image")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.last())
            .and_then(|v| v.get("label"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        // Upgrade cover to crystal-clear 1000x1000
        let cover_url = if !raw_cover.is_empty() {
            raw_cover
                .replace("170x170bb.png", "1000x1000bb.jpg")
                .replace("170x170bb.jpg", "1000x1000bb.jpg")
        } else {
            "".to_string()
        };

        let preview_url = entry
            .get("link")
            .and_then(|v| v.as_array())
            .and_then(|arr| {
                arr.iter().find(|link| {
                    link.get("attributes")
                        .and_then(|a| a.get("title"))
                        .and_then(|t| t.as_str())
                        == Some("Preview")
                })
            })
            .and_then(|link| link.get("attributes"))
            .and_then(|a| a.get("href"))
            .and_then(|h| h.as_str())
            .map(|s| s.to_string());

        tracks.push(TrendingTrack {
            id,
            rank: idx + 1,
            title,
            artist,
            album,
            cover_url,
            preview_url,
            region: region.to_string(),
        });
    }

    Ok(tracks)
}

async fn fetch_trending_albums(
    client: &reqwest::Client,
    region: &str,
    url: &str,
) -> Result<Vec<TrendingAlbum>, Box<dyn std::error::Error + Send + Sync>> {
    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(format!("HTTP error {}: {}", resp.status(), url).into());
    }

    let json: serde_json::Value = resp.json().await?;
    let entries = json
        .get("feed")
        .and_then(|f| f.get("entry"))
        .and_then(|e| e.as_array())
        .ok_or("Invalid iTunes RSS feed format")?;

    let mut albums = Vec::new();

    for (idx, entry) in entries.iter().enumerate() {
        let title = entry
            .get("im:name")
            .and_then(|v| v.get("label"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Album")
            .to_string();

        let artist = entry
            .get("im:artist")
            .and_then(|v| v.get("label"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Artist")
            .to_string();

        let id = entry
            .get("id")
            .and_then(|v| v.get("attributes"))
            .and_then(|v| v.get("im:id"))
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| &title)
            .to_string();

        let raw_cover = entry
            .get("im:image")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.last())
            .and_then(|v| v.get("label"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let cover_url = if !raw_cover.is_empty() {
            raw_cover
                .replace("170x170bb.png", "1000x1000bb.jpg")
                .replace("170x170bb.jpg", "1000x1000bb.jpg")
        } else {
            "".to_string()
        };

        let release_date = entry
            .get("im:releaseDate")
            .and_then(|v| v.get("attributes"))
            .and_then(|v| v.get("label"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let track_count = entry
            .get("im:itemCount")
            .and_then(|v| v.get("label"))
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<usize>().ok());

        albums.push(TrendingAlbum {
            id,
            rank: idx + 1,
            title,
            artist,
            cover_url,
            release_date,
            track_count,
            region: region.to_string(),
        });
    }

    Ok(albums)
}

