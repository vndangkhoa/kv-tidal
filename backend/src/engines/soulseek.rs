use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoulseekTrackCandidate {
    pub username: String,
    pub filename: String,
    pub size: u64,
    pub bit_rate: Option<u32>,
    pub bit_depth: Option<u8>,
    pub sample_rate: Option<u32>,
    pub free_upload_slots: bool,
    pub upload_speed: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoulseekStatus {
    pub connected: bool,
    pub server_version: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone)]
pub struct SoulseekEngine {
    client: reqwest::Client,
    config: Arc<RwLock<crate::config::AppConfig>>,
}

impl SoulseekEngine {
    pub fn new(config: Arc<RwLock<crate::config::AppConfig>>) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_default();
        Self { client, config }
    }

    fn build_headers(&self, api_key: Option<&str>) -> reqwest::header::HeaderMap {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(reqwest::header::ACCEPT, "application/json".parse().unwrap());
        if let Some(key) = api_key {
            if !key.trim().is_empty() {
                if let Ok(val) = key.trim().parse() {
                    headers.insert("X-API-Key", val);
                }
            }
        }
        headers
    }

    /// Check connection status to slskd instance
    pub async fn check_status(&self) -> SoulseekStatus {
        let (base_url, api_key, enabled) = {
            let cfg = self.config.read().await;
            (cfg.soulseek_url.clone(), cfg.soulseek_api_key.clone(), cfg.soulseek_enabled)
        };

        if !enabled {
            return SoulseekStatus {
                connected: false,
                server_version: None,
                error: Some("Soulseek engine is disabled in settings".to_string()),
            };
        }

        let endpoint = format!("{}/api/v0/application", base_url.trim_end_matches('/'));
        let headers = self.build_headers(api_key.as_deref());

        match self.client.get(&endpoint).headers(headers).send().await {
            Ok(resp) if resp.status().is_success() => {
                let json: serde_json::Value = resp.json().await.unwrap_or_default();
                let version = json.get("version").and_then(|v| v.as_str()).map(|s| s.to_string());
                SoulseekStatus {
                    connected: true,
                    server_version: version.or(Some("slskd active".to_string())),
                    error: None,
                }
            }
            Ok(resp) => SoulseekStatus {
                connected: false,
                server_version: None,
                error: Some(format!("slskd responded with HTTP {}", resp.status())),
            },
            Err(e) => SoulseekStatus {
                connected: false,
                server_version: None,
                error: Some(format!("Cannot connect to slskd at {}: {}", base_url, e)),
            },
        }
    }

    /// Search slskd for authentic FLAC files matching artist and title
    pub async fn search_flac(
        &self,
        artist: &str,
        title: &str,
    ) -> Result<Vec<SoulseekTrackCandidate>, String> {
        let (base_url, api_key, enabled) = {
            let cfg = self.config.read().await;
            (cfg.soulseek_url.clone(), cfg.soulseek_api_key.clone(), cfg.soulseek_enabled)
        };

        if !enabled {
            return Err("Soulseek engine is disabled in settings".to_string());
        }

        let clean_artist = artist.replace(|c: char| !c.is_alphanumeric() && c != ' ', "");
        let clean_title = title.replace(|c: char| !c.is_alphanumeric() && c != ' ', "");
        let search_text = format!("{} {} flac", clean_artist.trim(), clean_title.trim());

        let create_url = format!("{}/api/v0/searches", base_url.trim_end_matches('/'));
        let headers = self.build_headers(api_key.as_deref());

        let payload = serde_json::json!({
            "searchText": search_text,
            "minimumUploadSpeed": 50000,
        });

        let resp = self
            .client
            .post(&create_url)
            .headers(headers.clone())
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Failed to initiate Soulseek search: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("slskd search failed: HTTP {}", resp.status()));
        }

        let search_resp: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse slskd search creation response: {}", e))?;

        let search_id = search_resp
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "slskd search response missing id".to_string())?
            .to_string();

        info!("Initiated slskd search ID: {} for '{}'", search_id, search_text);

        // Poll search results for up to 6 seconds to gather high-quality responses
        let poll_url = format!("{}/api/v0/searches/{}/responses", base_url.trim_end_matches('/'), search_id);
        let mut candidates = Vec::new();

        for _ in 0..6 {
            tokio::time::sleep(Duration::from_millis(1000)).await;
            if let Ok(resp) = self.client.get(&poll_url).headers(headers.clone()).send().await {
                if let Ok(data) = resp.json::<serde_json::Value>().await {
                    let responses_opt = if let Some(arr) = data.as_array() {
                        Some(arr)
                    } else {
                        data.get("responses").and_then(|r| r.as_array())
                    };

                    if let Some(responses) = responses_opt {
                        for user_resp in responses {
                            let username = user_resp
                                .get("username")
                                .and_then(|u| u.as_str())
                                .unwrap_or("")
                                .to_string();
                            let free_slots = user_resp
                                .get("hasFreeUploadSlot")
                                .or_else(|| user_resp.get("freeUploadSlots"))
                                .and_then(|s| s.as_bool())
                                .unwrap_or(true);
                            let upload_speed = user_resp
                                .get("uploadSpeed")
                                .and_then(|s| s.as_u64())
                                .unwrap_or(0);

                            if let Some(files) = user_resp.get("files").and_then(|f| f.as_array()) {
                                for file in files {
                                    let filename = file
                                        .get("filename")
                                        .and_then(|f| f.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    let lower = filename.to_lowercase();
                                    if !lower.ends_with(".flac") {
                                        continue;
                                    }

                                    let is_locked = file
                                        .get("isLocked")
                                        .or_else(|| file.get("locked"))
                                        .and_then(|l| l.as_bool())
                                        .unwrap_or(false);
                                    if is_locked {
                                        continue;
                                    }

                                    let size = file.get("size").and_then(|s| s.as_u64()).unwrap_or(0);
                                    // True Hi-Res / Lossless FLAC is typically > 10MB
                                    if size < 10_000_000 {
                                        continue;
                                    }

                                    let bit_rate = file.get("bitRate").and_then(|b| b.as_u64()).map(|b| b as u32);
                                    let bit_depth = file.get("bitDepth").and_then(|b| b.as_u64()).map(|b| b as u8);
                                    let sample_rate = file.get("sampleRate").and_then(|s| s.as_u64()).map(|s| s as u32);

                                    candidates.push(SoulseekTrackCandidate {
                                        username: username.clone(),
                                        filename,
                                        size,
                                        bit_rate,
                                        bit_depth,
                                        sample_rate,
                                        free_upload_slots: free_slots,
                                        upload_speed,
                                    });
                                }
                            }
                        }
                    }
                }
            }

            if candidates.len() >= 3 {
                break;
            }
        }

        // Sort candidates: prefer free upload slots, then highest bit depth / sample rate / size
        candidates.sort_by(|a, b| {
            b.free_upload_slots
                .cmp(&a.free_upload_slots)
                .then_with(|| b.bit_depth.unwrap_or(16).cmp(&a.bit_depth.unwrap_or(16)))
                .then_with(|| b.size.cmp(&a.size))
        });

        // Deduplicate filenames
        candidates.dedup_by(|a, b| a.filename == b.filename);

        info!("Found {} FLAC candidates on Soulseek for '{} - {}'", candidates.len(), artist, title);
        Ok(candidates)
    }

    /// Request download of candidate file via slskd
    pub async fn queue_download(
        &self,
        username: &str,
        filename: &str,
        size: u64,
    ) -> Result<String, String> {
        let (base_url, api_key, enabled) = {
            let cfg = self.config.read().await;
            (cfg.soulseek_url.clone(), cfg.soulseek_api_key.clone(), cfg.soulseek_enabled)
        };

        if !enabled {
            return Err("Soulseek engine is disabled".to_string());
        }

        let download_url = format!(
            "{}/api/v0/transfers/downloads/{}",
            base_url.trim_end_matches('/'),
            urlencoding::encode(username)
        );
        let headers = self.build_headers(api_key.as_deref());

        let payload = serde_json::json!([
            {
                "filename": filename,
                "size": size,
            }
        ]);

        let resp = self
            .client
            .post(&download_url)
            .headers(headers)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Failed to submit download to slskd: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("slskd download queue failed: HTTP {}", resp.status()));
        }

        info!("Successfully queued Soulseek download for '{}' from user '{}'", filename, username);
        Ok(format!("Queued: {}", filename))
    }
}
