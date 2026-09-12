use serde::{Deserialize, Serialize};
use std::time::Duration;

pub const DEFAULT_QOBUZ_APP_ID: &str = "712109809";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QobuzTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: u32,
    pub cover_url: Option<String>,
    pub hires: bool,
    pub maximum_bit_depth: Option<u32>,
    pub maximum_sampling_rate: Option<f32>,
}

pub struct QobuzEngine {
    client: reqwest::Client,
    app_id: String,
}

impl QobuzEngine {
    pub fn new(app_id: Option<String>) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .build()
            .unwrap_or_default();

        Self {
            client,
            app_id: app_id.unwrap_or_else(|| DEFAULT_QOBUZ_APP_ID.to_string()),
        }
    }

    /// Search Qobuz catalog for Hi-Res audio
    pub async fn search_tracks(&self, query: &str) -> Result<Vec<QobuzTrack>, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!(
            "https://www.qobuz.com/api.json/0.2/catalog/search?query={}&type=tracks&limit=25&app_id={}",
            urlencoding::encode(query),
            self.app_id
        );

        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(format!("Qobuz API error: HTTP {}", resp.status()).into());
        }

        let json: serde_json::Value = resp.json().await?;
        let items = json
            .get("tracks")
            .and_then(|t| t.get("items"))
            .and_then(|v| v.as_array())
            .ok_or("Invalid Qobuz search response")?;

        let mut tracks = Vec::new();
        for item in items {
            let id = item.get("id").and_then(|v| v.as_i64()).unwrap_or(0).to_string();
            let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let artist = item
                .get("performer")
                .and_then(|v| v.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let album = item
                .get("album")
                .and_then(|v| v.get("title"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let cover_url = item
                .get("album")
                .and_then(|v| v.get("image"))
                .and_then(|i| i.get("large"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let duration = item.get("duration").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let hires = item.get("hires").and_then(|v| v.as_bool()).unwrap_or(false);
            let maximum_bit_depth = item
                .get("maximum_bit_depth")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32);
            let maximum_sampling_rate = item
                .get("maximum_sampling_rate")
                .and_then(|v| v.as_f64())
                .map(|v| v as f32);

            tracks.push(QobuzTrack {
                id,
                title,
                artist,
                album,
                duration,
                cover_url,
                hires,
                maximum_bit_depth,
                maximum_sampling_rate,
            });
        }

        Ok(tracks)
    }
}
