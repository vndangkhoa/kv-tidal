use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedMetadata {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub year: Option<u32>,
    pub track_number: Option<u32>,
    pub cover_url: Option<String>,
    pub preview_url: Option<String>,
}

pub struct MetadataResolver {
    client: reqwest::Client,
}

impl MetadataResolver {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(8))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .build()
            .unwrap_or_default();
        Self { client }
    }

    /// Resolve 1000x1000 artwork and song info from Apple Music CDN (unblocked in Vietnam)
    pub async fn resolve_apple_music(&self, query: &str) -> Option<ResolvedMetadata> {
        let url = format!(
            "https://itunes.apple.com/search?term={}&entity=song&limit=1",
            urlencoding::encode(query)
        );

        let resp = self.client.get(&url).send().await.ok()?;
        if !resp.status().is_success() {
            return None;
        }

        let json: serde_json::Value = resp.json().await.ok()?;
        let results = json.get("results")?.as_array()?;
        let item = results.first()?;

        let title = item.get("trackName")?.as_str()?.to_string();
        let artist = item.get("artistName")?.as_str()?.to_string();
        let album = item
            .get("collectionName")
            .and_then(|v| v.as_str())
            .unwrap_or(&title)
            .to_string();

        let raw_cover = item.get("artworkUrl100").and_then(|v| v.as_str());
        let cover_url = raw_cover.map(|c| c.replace("100x100bb.jpg", "1000x1000bb.jpg"));

        let preview_url = item
            .get("previewUrl")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let track_number = item
            .get("trackNumber")
            .and_then(|v| v.as_u64())
            .map(|n| n as u32);

        let year = item
            .get("releaseDate")
            .and_then(|v| v.as_str())
            .and_then(|d| d.get(0..4))
            .and_then(|y| y.parse::<u32>().ok());

        Some(ResolvedMetadata {
            title,
            artist,
            album,
            year,
            track_number,
            cover_url,
            preview_url,
        })
    }

    /// Format Tidal cover UUID into CDN URL
    pub fn format_tidal_cover(uuid: &str, size: u32) -> String {
        let formatted = uuid.replace('-', "/");
        format!("https://resources.tidal.com/images/{}/{}x{}.jpg", formatted, size, size)
    }

    /// Download image bytes for embedding into FLAC Vorbis comments
    pub async fn download_image_bytes(&self, url: &str) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
        let resp = self.client.get(url).send().await?;
        if !resp.status().is_success() {
            return Err(format!("Failed to download image: HTTP {}", resp.status()).into());
        }
        let bytes = resp.bytes().await?;
        Ok(bytes.to_vec())
    }
}
