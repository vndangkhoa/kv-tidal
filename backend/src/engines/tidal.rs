use serde::{Deserialize, Serialize};
use std::time::Duration;

// Well-known client tokens used by open-source clients (Fire TV / Desktop)
pub const DEFAULT_TIDAL_TOKEN: &str = "CzET4vdadNUFQ5JU";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TidalTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: u32,
    pub track_number: u32,
    pub cover_uuid: Option<String>,
    pub audio_quality: String,
    pub isrc: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TidalArtist {
    pub id: String,
    pub name: String,
    pub picture_uuid: Option<String>,
    pub popularity: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct PlaybackManifest {
    #[serde(default)]
    pub urls: Vec<String>,
}

pub struct TidalEngine {
    client: reqwest::Client,
    token: String,
    country_code: String,
}

impl TidalEngine {
    pub fn new(token: Option<String>, country_code: Option<String>) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent("TIDAL_ANDROID/1039 okhttp/4.9.3")
            .build()
            .unwrap_or_default();

        Self {
            client,
            token: token.unwrap_or_else(|| DEFAULT_TIDAL_TOKEN.to_string()),
            country_code: country_code.unwrap_or_else(|| "US".to_string()),
        }
    }

    /// Search Tidal track catalog
    pub async fn search_tracks(&self, query: &str) -> Result<Vec<TidalTrack>, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!(
            "https://api.tidal.com/v1/search/tracks?query={}&limit=25&countryCode={}",
            urlencoding::encode(query),
            self.country_code
        );

        let resp = self
            .client
            .get(&url)
            .header("x-tidal-token", &self.token)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(format!("Tidal API search failed: HTTP {}", resp.status()).into());
        }

        let json: serde_json::Value = resp.json().await?;
        let items = json
            .get("items")
            .and_then(|v| v.as_array())
            .ok_or("Invalid search response")?;

        let mut tracks = Vec::new();
        for item in items {
            let id = item.get("id").and_then(|v| v.as_i64()).unwrap_or(0).to_string();
            let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let artist = item
                .get("artist")
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
            let cover_uuid = item
                .get("album")
                .and_then(|v| v.get("cover"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let duration = item.get("duration").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let track_number = item.get("trackNumber").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
            let audio_quality = item
                .get("audioQuality")
                .and_then(|v| v.as_str())
                .unwrap_or("LOSSLESS")
                .to_string();
            let isrc = item.get("isrc").and_then(|v| v.as_str()).map(|s| s.to_string());

            tracks.push(TidalTrack {
                id,
                title,
                artist,
                album,
                duration,
                track_number,
                cover_uuid,
                audio_quality,
                isrc,
            });
        }

        Ok(tracks)
    }

    /// Resolve postpaywall FLAC stream URL from Tidal manifest
    pub async fn resolve_stream_url(
        &self,
        track_id: &str,
        session_bearer: Option<&str>,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!(
            "https://api.tidal.com/v1/tracks/{}/playbackinfopostpaywall/v4?audioquality=LOSSLESS&playbackmode=STREAM&assetpresentation=FULL",
            track_id
        );

        let mut req = self.client.get(&url);
        if let Some(bearer) = session_bearer {
            req = req.header("Authorization", format!("Bearer {}", bearer));
        } else {
            req = req.header("x-tidal-token", &self.token);
        }

        let resp = req.send().await?;
        if !resp.status().is_success() {
            return Err(format!("Playback info failed: HTTP {}", resp.status()).into());
        }

        let json: serde_json::Value = resp.json().await?;
        let manifest_b64 = json
            .get("manifest")
            .and_then(|v| v.as_str())
            .ok_or("Manifest not found in response")?;

        use base64::Engine;
        let decoded = base64::engine::general_purpose::STANDARD.decode(manifest_b64)?;
        let manifest: PlaybackManifest = serde_json::from_slice(&decoded)?;

        let stream_url = manifest
            .urls
            .first()
            .ok_or("No audio stream URLs in manifest")?
            .clone();

        Ok(stream_url)
    }

    /// Search Tidal artists catalog
    pub async fn search_artists(&self, query: &str) -> Result<Vec<TidalArtist>, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!(
            "https://api.tidal.com/v1/search/artists?query={}&limit=10&countryCode={}",
            urlencoding::encode(query),
            self.country_code
        );

        let resp = self
            .client
            .get(&url)
            .header("x-tidal-token", &self.token)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(format!("Tidal API artist search failed: HTTP {}", resp.status()).into());
        }

        let json: serde_json::Value = resp.json().await?;
        let items = json
            .get("items")
            .and_then(|v| v.as_array())
            .ok_or("Invalid artist search response")?;

        let mut artists = Vec::new();
        for item in items {
            let id = item.get("id").and_then(|v| v.as_i64()).unwrap_or(0).to_string();
            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let picture_uuid = item
                .get("picture")
                .and_then(|v| v.as_str())
                .or_else(|| item.get("selectedAlbumCoverFallback").and_then(|v| v.as_str()))
                .map(|s| s.to_string());
            let popularity = item.get("popularity").and_then(|v| v.as_u64()).map(|p| p as u32);

            artists.push(TidalArtist {
                id,
                name,
                picture_uuid,
                popularity,
            });
        }

        Ok(artists)
    }

    /// Fetch artist top tracks
    pub async fn get_artist_top_tracks(
        &self,
        artist_id: &str,
        limit: usize,
    ) -> Result<Vec<TidalTrack>, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!(
            "https://api.tidal.com/v1/artists/{}/toptracks?limit={}&countryCode={}",
            artist_id,
            limit,
            self.country_code
        );

        let resp = self
            .client
            .get(&url)
            .header("x-tidal-token", &self.token)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(format!("Tidal API artist toptracks failed: HTTP {}", resp.status()).into());
        }

        let json: serde_json::Value = resp.json().await?;
        let items = json
            .get("items")
            .and_then(|v| v.as_array())
            .ok_or("Invalid toptracks response")?;

        let mut tracks = Vec::new();
        for item in items {
            let id = item.get("id").and_then(|v| v.as_i64()).unwrap_or(0).to_string();
            let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let artist = item
                .get("artist")
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
            let cover_uuid = item
                .get("album")
                .and_then(|v| v.get("cover"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let duration = item.get("duration").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let track_number = item.get("trackNumber").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
            let audio_quality = item
                .get("audioQuality")
                .and_then(|v| v.as_str())
                .unwrap_or("LOSSLESS")
                .to_string();
            let isrc = item.get("isrc").and_then(|v| v.as_str()).map(|s| s.to_string());

            tracks.push(TidalTrack {
                id,
                title,
                artist,
                album,
                duration,
                track_number,
                cover_uuid,
                audio_quality,
                isrc,
            });
        }

        Ok(tracks)
    }

    /// Fetch artist editorial biography
    pub async fn get_artist_bio(
        &self,
        artist_id: &str,
    ) -> Result<Option<String>, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!(
            "https://api.tidal.com/v1/artists/{}/bio?countryCode={}",
            artist_id,
            self.country_code
        );

        let resp = self
            .client
            .get(&url)
            .header("x-tidal-token", &self.token)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Ok(None);
        }

        let json: serde_json::Value = resp.json().await?;
        let bio_text = json.get("text").and_then(|v| v.as_str()).map(|s| s.to_string());
        Ok(bio_text)
    }
}
