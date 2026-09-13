use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoulseekTrackCandidate {
    pub username: String,
    pub filename: String,
    pub size: u64,
    pub bit_rate: Option<u32>,
    pub bit_depth: Option<u8>,
    pub sample_rate: Option<u32>,
    pub duration_secs: Option<u32>,
    pub free_upload_slots: bool,
    pub upload_speed: u64,
    pub score: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoulseekTrackQuery {
    pub artist: String,
    pub title: String,
    pub album: Option<String>,
    pub track_number: Option<u32>,
    pub duration_secs: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoulseekStatus {
    pub connected: bool,
    pub is_logged_in: bool,
    pub server_version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoulseekDownloadStatus {
    pub id: Option<String>,
    pub username: Option<String>,
    pub filename: String,
    pub size: u64,
    pub bytes_transferred: u64,
    pub speed_bytes: u64,
    pub percent_complete: f32,
    pub state: String,
    pub is_completed: bool,
    pub is_failed: bool,
    pub is_paused: bool,
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
                is_logged_in: false,
                server_version: None,
                error: Some("Soulseek engine is disabled in settings".to_string()),
            };
        }

        let endpoint = format!("{}/api/v0/application", base_url.trim_end_matches('/'));
        let headers = self.build_headers(api_key.as_deref());

        match self.client.get(&endpoint).headers(headers).send().await {
            Ok(resp) if resp.status().is_success() => {
                let json: serde_json::Value = resp.json().await.unwrap_or_default();
                let version_str = json
                    .get("version")
                    .and_then(|v| {
                        if let Some(cur) = v.get("current").and_then(|c| c.as_str()) {
                            Some(cur)
                        } else if let Some(f) = v.get("full").and_then(|f| f.as_str()) {
                            Some(f)
                        } else {
                            v.as_str()
                        }
                    })
                    .unwrap_or("0.26.0");

                let server_obj = json.get("server");
                let is_logged_in = server_obj
                    .and_then(|s| s.get("isLoggedIn"))
                    .and_then(|b| b.as_bool())
                    .unwrap_or(false);
                let is_connected = server_obj
                    .and_then(|s| s.get("isConnected"))
                    .and_then(|b| b.as_bool())
                    .unwrap_or(false);
                let server_state = server_obj
                    .and_then(|s| s.get("state"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("Unknown");

                let username = json
                    .get("user")
                    .and_then(|u| u.get("username"))
                    .and_then(|u| u.as_str())
                    .unwrap_or("");

                if is_logged_in {
                    SoulseekStatus {
                        connected: true,
                        is_logged_in: true,
                        server_version: Some(format!("slskd v{} (Logged In as {})", version_str, username)),
                        error: None,
                    }
                } else if is_connected {
                    SoulseekStatus {
                        connected: true,
                        is_logged_in: false,
                        server_version: Some(format!("slskd v{} (Logging In...)", version_str)),
                        error: Some("Connected to Soulseek server, awaiting authentication".to_string()),
                    }
                } else {
                    SoulseekStatus {
                        connected: false,
                        is_logged_in: false,
                        server_version: Some(format!("slskd v{}", version_str)),
                        error: Some(format!(
                            "slskd running, but Disconnected from Soulseek network ({}) — please verify username/password in Settings",
                            server_state
                        )),
                    }
                }
            }
            Ok(resp) => SoulseekStatus {
                connected: false,
                is_logged_in: false,
                server_version: None,
                error: Some(format!("slskd responded with HTTP {}", resp.status())),
            },
            Err(e) => SoulseekStatus {
                connected: false,
                is_logged_in: false,
                server_version: None,
                error: Some(format!("Cannot connect to slskd at {}: {}", base_url, e)),
            },
        }
    }

    /// Trigger immediate connection to Soulseek central server via slskd
    pub async fn trigger_connect(&self) -> Result<(), String> {
        let (base_url, api_key, enabled) = {
            let cfg = self.config.read().await;
            (cfg.soulseek_url.clone(), cfg.soulseek_api_key.clone(), cfg.soulseek_enabled)
        };
        if !enabled {
            return Err("Soulseek engine is disabled".to_string());
        }
        let endpoint = format!("{}/api/v0/server", base_url.trim_end_matches('/'));
        let headers = self.build_headers(api_key.as_deref());
        let _ = self.client
            .put(&endpoint)
            .headers(headers)
            .json(&serde_json::json!({ "state": "Connected" }))
            .send()
            .await;
        Ok(())
    }

    /// Restart slskd application to reload configuration from slskd.yml
    pub async fn restart(&self) -> Result<(), String> {
        let (base_url, api_key, enabled) = {
            let cfg = self.config.read().await;
            (cfg.soulseek_url.clone(), cfg.soulseek_api_key.clone(), cfg.soulseek_enabled)
        };
        if !enabled {
            return Ok(());
        }
        let endpoint = format!("{}/api/v0/application", base_url.trim_end_matches('/'));
        let headers = self.build_headers(api_key.as_deref());
        let _ = self.client
            .put(&endpoint)
            .headers(headers)
            .send()
            .await;
        // Wait briefly for slskd to restart and re-authenticate
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        Ok(())
    }

    /// Calculate match score (0-100+) between candidate and target track metadata
    pub fn calculate_candidate_score(
        candidate_filename: &str,
        candidate_size: u64,
        candidate_duration: Option<u32>,
        free_upload_slots: bool,
        upload_speed: u64,
        query: &SoulseekTrackQuery,
    ) -> i32 {
        let mut score = 0i32;

        let norm_path = candidate_filename.replace('\\', "/").to_lowercase();
        let norm_filename = std::path::Path::new(&norm_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&norm_path)
            .to_string();

        let cleaned_t = clean_query_title(&query.title);
        let clean_title = cleaned_t.to_lowercase()
            .replace(|c: char| !c.is_alphanumeric() && c != ' ', " ");
        let title_tokens: Vec<&str> = clean_title.split_whitespace().filter(|t| !t.is_empty()).collect();

        let clean_artist = query.artist.to_lowercase()
            .replace(|c: char| !c.is_alphanumeric() && c != ' ', " ");
        let artist_tokens: Vec<&str> = clean_artist.split_whitespace().filter(|t| !t.is_empty()).collect();

        // 1. Title Matching (up to 45 pts)
        if !title_tokens.is_empty() {
            let matched_tokens = title_tokens.iter().filter(|t| norm_filename.contains(**t)).count();
            let token_ratio = matched_tokens as f32 / title_tokens.len() as f32;
            score += (token_ratio * 35.0) as i32;

            if norm_filename.contains(clean_title.trim()) {
                score += 10;
            }
        }

        // 2. Artist Matching (up to 30 pts)
        if !artist_tokens.is_empty() {
            let matched_in_file = artist_tokens.iter().filter(|t| norm_filename.contains(**t)).count();
            let matched_in_path = artist_tokens.iter().filter(|t| norm_path.contains(**t)).count();
            let max_matched = matched_in_file.max(matched_in_path);
            let artist_ratio = max_matched as f32 / artist_tokens.len() as f32;
            score += (artist_ratio * 25.0) as i32;

            if norm_path.contains(clean_artist.trim()) || norm_filename.contains(clean_artist.trim()) {
                score += 5;
            }
        }

        // 3. Album Matching (up to 15 pts)
        if let Some(ref album) = query.album {
            let clean_album = album.to_lowercase().replace(|c: char| !c.is_alphanumeric() && c != ' ', " ");
            let album_tokens: Vec<&str> = clean_album.split_whitespace().filter(|t| t.len() > 2).collect();
            if !album_tokens.is_empty() {
                let matched_album = album_tokens.iter().filter(|t| norm_path.contains(**t)).count();
                if matched_album == album_tokens.len() {
                    score += 15;
                } else if matched_album > 0 {
                    score += 8;
                }
            }
        }

        // 4. Track Number Matching (up to 10 pts)
        if let Some(track_num) = query.track_number {
            let patterns = [
                format!("{:02} ", track_num),
                format!("{:02} -", track_num),
                format!("{:02}.", track_num),
                format!("{:02}_", track_num),
                format!("{} -", track_num),
                format!("{}. ", track_num),
            ];
            if patterns.iter().any(|p| norm_filename.starts_with(p)) {
                score += 10;
            }
        }

        // 5. Duration Matching (up to +20 pts or heavy penalty)
        if let (Some(target_dur), Some(cand_dur)) = (query.duration_secs, candidate_duration) {
            if target_dur > 0 && cand_dur > 0 {
                let diff = (cand_dur as i64 - target_dur as i64).abs();
                if diff <= 3 {
                    score += 20;
                } else if diff <= 8 {
                    score += 10;
                } else if diff > 30 {
                    score -= 40; // Discrepancy: likely wrong version or full album rip
                }
            }
        }

        // 6. Negative Keywords Penalty (-50 pts)
        let negative_keywords = ["karaoke", "instrumental", "cover", "tribute", "live", "remix", "acoustic", "snippet", "demo", "ringtone"];
        for kw in negative_keywords {
            if norm_path.contains(kw) && !clean_title.contains(kw) {
                score -= 50;
                break;
            }
        }

        // 7. Size Sanity Window
        if candidate_size < 8_000_000 {
            score -= 30; // Corrupt or suspiciously small
        } else if candidate_size > 115_000_000 {
            score -= 25; // Likely full album disc image or oversized vinyl rip
        } else if candidate_size >= 15_000_000 && candidate_size <= 70_000_000 {
            score += 10; // Ideal single track size
        }

        // 8. Peer Availability and Bandwidth
        if free_upload_slots {
            score += 15;
        }
        if upload_speed >= 1_000_000 {
            score += 15;
        } else if upload_speed >= 300_000 {
            score += 8;
        } else if upload_speed < 80_000 && upload_speed > 0 {
            score -= 10;
        }

        score
    }

    /// Helper to execute a single search query against slskd and collect scored FLAC candidates
    async fn execute_slskd_query(
        &self,
        base_url: &str,
        headers: &reqwest::header::HeaderMap,
        query: &str,
        artist_filter: Option<&str>,
        track_query: &SoulseekTrackQuery,
    ) -> Result<Vec<SoulseekTrackCandidate>, String> {
        let create_url = format!("{}/api/v0/searches", base_url.trim_end_matches('/'));
        let payload = serde_json::json!({
            "searchText": query,
            "minimumUploadSpeed": 0,
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

        info!("Initiated slskd search ID: {} for '{}'", search_id, query);

        let poll_url = format!("{}/api/v0/searches/{}/responses", base_url.trim_end_matches('/'), search_id);
        let mut candidates = Vec::new();
        let filter_lower = artist_filter.map(|a| a.to_lowercase());

        for _ in 0..5 {
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

                                    // If artist filter is active, ensure path matches artist
                                    if let Some(ref artist_req) = filter_lower {
                                        if !lower.contains(artist_req) {
                                            continue;
                                        }
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
                                    if size < 5_000_000 {
                                        continue;
                                    }

                                    let bit_rate = file.get("bitRate").and_then(|b| b.as_u64()).map(|b| b as u32);
                                    let bit_depth = file.get("bitDepth").and_then(|b| b.as_u64()).map(|b| b as u8);
                                    let sample_rate = file.get("sampleRate").and_then(|s| s.as_u64()).map(|s| s as u32);
                                    let duration_secs = file.get("length")
                                        .or_else(|| file.get("duration"))
                                        .and_then(|d| d.as_u64())
                                        .map(|d| d as u32);

                                    let score = Self::calculate_candidate_score(
                                        &filename,
                                        size,
                                        duration_secs,
                                        free_slots,
                                        upload_speed,
                                        track_query,
                                    );

                                    candidates.push(SoulseekTrackCandidate {
                                        username: username.clone(),
                                        filename,
                                        size,
                                        bit_rate,
                                        bit_depth,
                                        sample_rate,
                                        duration_secs,
                                        free_upload_slots: free_slots,
                                        upload_speed,
                                        score,
                                    });
                                }
                            }
                        }
                    }
                }
            }

            if candidates.len() >= 30 {
                break;
            }
        }

        Ok(candidates)
    }

    /// Search slskd for authentic FLAC files matching track query with multi-factor scoring
    pub async fn search_flac(
        &self,
        query: &SoulseekTrackQuery,
    ) -> Result<Vec<SoulseekTrackCandidate>, String> {
        let (base_url, api_key, enabled) = {
            let cfg = self.config.read().await;
            (cfg.soulseek_url.clone(), cfg.soulseek_api_key.clone(), cfg.soulseek_enabled)
        };

        if !enabled {
            return Err("Soulseek engine is disabled in settings".to_string());
        }

        let headers = self.build_headers(api_key.as_deref());

        let cleaned_t = clean_query_title(&query.title);
        let clean_artist = query.artist.replace(|c: char| !c.is_alphanumeric() && c != ' ', "");
        let clean_title = cleaned_t.replace(|c: char| !c.is_alphanumeric() && c != ' ', "");

        // Primary Tier 1: Search "{Artist} {Title} flac"
        let q1 = format!("{} {} flac", clean_artist.trim(), clean_title.trim());
        let mut candidates = match self.execute_slskd_query(&base_url, &headers, &q1, None, query).await {
            Ok(c) => c,
            Err(e) => {
                warn!("Soulseek primary search query '{}' failed: {}", q1, e);
                Vec::new()
            }
        };

        // Fallback Tier 2: If no candidates found, search "{Title} flac" with artist filter
        if candidates.is_empty() && !clean_title.trim().is_empty() {
            let q2 = format!("{} flac", clean_title.trim());
            info!(
                "Primary Soulseek query yielded 0 results; executing server-filter bypass query: '{}' with artist filter '{}'",
                q2,
                clean_artist.trim()
            );
            if let Ok(c) = self.execute_slskd_query(&base_url, &headers, &q2, Some(clean_artist.trim()), query).await {
                candidates = c;
            }
        }

        // Fallback Tier 3: Search "{Artist} {Title}" without "flac" keyword
        if candidates.is_empty() && !clean_artist.trim().is_empty() && !clean_title.trim().is_empty() {
            let q3 = format!("{} {}", clean_artist.trim(), clean_title.trim());
            info!("Attempting Soulseek fallback query: '{}'", q3);
            if let Ok(c) = self.execute_slskd_query(&base_url, &headers, &q3, None, query).await {
                candidates = c;
            }
        }

        // Sort candidates: prefer highest score, then free upload slots, then upload speed
        candidates.sort_by(|a, b| {
            b.score.cmp(&a.score)
                .then_with(|| b.free_upload_slots.cmp(&a.free_upload_slots))
                .then_with(|| b.upload_speed.cmp(&a.upload_speed))
                .then_with(|| b.bit_depth.unwrap_or(16).cmp(&a.bit_depth.unwrap_or(16)))
        });

        // Deduplicate filenames
        candidates.dedup_by(|a, b| a.filename == b.filename);

        // Filter out low-confidence matches (score < 40)
        candidates.retain(|c| c.score >= 40);

        info!(
            "Found {} scored FLAC candidates on Soulseek for '{} - {}' (top score: {})",
            candidates.len(),
            query.artist,
            query.title,
            candidates.first().map(|c| c.score).unwrap_or(0)
        );
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

    /// Poll slskd for the transfer status of a queued download file
    pub async fn poll_download_status(
        &self,
        username: &str,
        filename: &str,
    ) -> Result<SoulseekDownloadStatus, String> {
        let (base_url, api_key, enabled) = {
            let cfg = self.config.read().await;
            (cfg.soulseek_url.clone(), cfg.soulseek_api_key.clone(), cfg.soulseek_enabled)
        };

        if !enabled {
            return Err("Soulseek engine is disabled".to_string());
        }

        let endpoint = format!("{}/api/v0/transfers/downloads", base_url.trim_end_matches('/'));
        let headers = self.build_headers(api_key.as_deref());

        let resp = self
            .client
            .get(&endpoint)
            .headers(headers.clone())
            .send()
            .await
            .map_err(|e| format!("Failed to poll slskd downloads: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("slskd downloads poll returned HTTP {}", resp.status()));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse slskd downloads response: {}", e))?;

        if let Some(status) = find_transfer_in_json(&json, filename) {
            return Ok(status);
        }

        // Check user-specific download endpoint if not found in global list
        let user_endpoint = format!(
            "{}/api/v0/transfers/downloads/{}",
            base_url.trim_end_matches('/'),
            urlencoding::encode(username)
        );
        if let Ok(user_resp) = self.client.get(&user_endpoint).headers(headers).send().await {
            if let Ok(user_json) = user_resp.json::<serde_json::Value>().await {
                if let Some(status) = find_transfer_in_json(&user_json, filename) {
                    return Ok(status);
                }
            }
        }

        Err(format!("Transfer for '{}' not found in slskd queue", filename))
    }

    /// Retrieve all active downloads from slskd
    pub async fn get_active_downloads(&self) -> Result<Vec<SoulseekDownloadStatus>, String> {
        let (base_url, api_key, enabled) = {
            let cfg = self.config.read().await;
            (cfg.soulseek_url.clone(), cfg.soulseek_api_key.clone(), cfg.soulseek_enabled)
        };

        if !enabled {
            return Ok(Vec::new());
        }

        let endpoint = format!("{}/api/v0/transfers/downloads", base_url.trim_end_matches('/'));
        let headers = self.build_headers(api_key.as_deref());

        let resp = self
            .client
            .get(&endpoint)
            .headers(headers)
            .send()
            .await
            .map_err(|e| format!("Failed to poll slskd downloads: {}", e))?;

        if !resp.status().is_success() {
            return Ok(Vec::new());
        }

        let json: serde_json::Value = resp.json().await.unwrap_or_default();
        let mut list = Vec::new();
        collect_transfers_from_json(&json, &mut list);
        Ok(list)
    }

    /// Cancel or remove a transfer in slskd
    pub async fn cancel_transfer(&self, username: &str, transfer_id: &str, remove: bool) -> Result<(), String> {
        let (base_url, api_key, enabled) = {
            let cfg = self.config.read().await;
            (cfg.soulseek_url.clone(), cfg.soulseek_api_key.clone(), cfg.soulseek_enabled)
        };
        if !enabled {
            return Err("Soulseek engine is disabled".to_string());
        }
        let endpoint = format!(
            "{}/api/v0/transfers/downloads/{}/{}?remove={}",
            base_url.trim_end_matches('/'),
            urlencoding::encode(username),
            urlencoding::encode(transfer_id),
            remove
        );
        let headers = self.build_headers(api_key.as_deref());
        let resp = self.client.delete(&endpoint).headers(headers).send().await
            .map_err(|e| format!("Failed to delete transfer in slskd: {}", e))?;
        if !resp.status().is_success() && resp.status() != reqwest::StatusCode::NOT_FOUND {
            return Err(format!("slskd delete transfer returned HTTP {}", resp.status()));
        }
        Ok(())
    }

    /// Clear all completed and cancelled transfers in slskd
    pub async fn clear_completed_transfers(&self) -> Result<(), String> {
        let (base_url, api_key, enabled) = {
            let cfg = self.config.read().await;
            (cfg.soulseek_url.clone(), cfg.soulseek_api_key.clone(), cfg.soulseek_enabled)
        };
        if !enabled {
            return Err("Soulseek engine is disabled".to_string());
        }
        let endpoint = format!("{}/api/v0/transfers/downloads/all/completed", base_url.trim_end_matches('/'));
        let headers = self.build_headers(api_key.as_deref());
        let _ = self.client.delete(&endpoint).headers(headers).send().await;
        Ok(())
    }
}

/// Recursively collect all file transfers from slskd JSON structure
fn collect_transfers_from_json(v: &serde_json::Value, out: &mut Vec<SoulseekDownloadStatus>) {
    match v {
        serde_json::Value::Array(arr) => {
            for item in arr {
                collect_transfers_from_json(item, out);
            }
        }
        serde_json::Value::Object(map) => {
            if let Some(fname_val) = map.get("filename").and_then(|f| f.as_str()) {
                let id = map.get("id").and_then(|i| i.as_str()).map(|s| s.to_string());
                let username = map.get("username").and_then(|u| u.as_str()).map(|s| s.to_string());
                let size = map.get("size").and_then(|s| s.as_u64()).unwrap_or(0);
                let bytes_transferred = map
                    .get("bytesTransferred")
                    .or_else(|| map.get("bytes_transferred"))
                    .and_then(|b| b.as_u64())
                    .unwrap_or(0);
                let speed = map
                    .get("averageSpeed")
                    .or_else(|| map.get("speed"))
                    .and_then(|s| s.as_u64().or_else(|| s.as_f64().map(|f| f as u64)))
                    .unwrap_or(0);
                let percent = if size > 0 && bytes_transferred > 0 {
                    ((bytes_transferred as f32 / size as f32) * 100.0).min(100.0)
                } else {
                    map.get("percentComplete")
                        .or_else(|| map.get("percent"))
                        .and_then(|p| p.as_f64().map(|f| {
                            let f32_val = f as f32;
                            if f32_val <= 1.0 && f32_val > 0.0 { f32_val * 100.0 } else { f32_val }
                        }))
                        .unwrap_or(0.0)
                };
                let state = map
                    .get("state")
                    .and_then(|s| s.as_str())
                    .unwrap_or("Queued")
                    .to_string();

                let lower = state.to_lowercase();
                let is_completed = lower.contains("completed") && !lower.contains("cancelled") && !lower.contains("timedout") && !lower.contains("rejected");
                let is_paused = lower.contains("cancel");
                let is_failed = (lower.contains("error")
                    || lower.contains("fail")
                    || lower.contains("abort")
                    || lower.contains("timedout")
                    || lower.contains("rejected"))
                    && !is_paused;

                out.push(SoulseekDownloadStatus {
                    id,
                    username,
                    filename: fname_val.to_string(),
                    size,
                    bytes_transferred,
                    speed_bytes: speed,
                    percent_complete: percent,
                    state: state.clone(),
                    is_completed,
                    is_failed,
                    is_paused,
                    error: if is_failed {
                        Some(format!("Soulseek transfer failed with state: {}", state))
                    } else {
                        None
                    },
                });
            } else {
                for (_, val) in map {
                    collect_transfers_from_json(val, out);
                }
            }
        }
        _ => {}
    }
}

/// Recursively search slskd transfer JSON hierarchy for matching file
fn find_transfer_in_json(v: &serde_json::Value, target_filename: &str) -> Option<SoulseekDownloadStatus> {
    let normalized_target = target_filename.replace('\\', "/");
    let target_base = std::path::Path::new(&normalized_target)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(target_filename);

    match v {
        serde_json::Value::Array(arr) => {
            for item in arr {
                if let Some(res) = find_transfer_in_json(item, target_filename) {
                    return Some(res);
                }
            }
        }
        serde_json::Value::Object(map) => {
            if let Some(fname_val) = map.get("filename").and_then(|f| f.as_str()) {
                let normalized_fname = fname_val.replace('\\', "/");
                let fname_base = std::path::Path::new(&normalized_fname)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(fname_val);

                if fname_val == target_filename || fname_base == target_base || fname_val.ends_with(target_base) || normalized_fname.ends_with(target_base) {
                    let id = map.get("id").and_then(|i| i.as_str()).map(|s| s.to_string());
                    let username = map.get("username").and_then(|u| u.as_str()).map(|s| s.to_string());
                    let size = map.get("size").and_then(|s| s.as_u64()).unwrap_or(0);
                    let bytes_transferred = map
                        .get("bytesTransferred")
                        .or_else(|| map.get("bytes_transferred"))
                        .and_then(|b| b.as_u64())
                        .unwrap_or(0);
                    let speed = map
                        .get("averageSpeed")
                        .or_else(|| map.get("speed"))
                        .and_then(|s| s.as_u64().or_else(|| s.as_f64().map(|f| f as u64)))
                        .unwrap_or(0);
                    let percent = if size > 0 && bytes_transferred > 0 {
                        ((bytes_transferred as f32 / size as f32) * 100.0).min(100.0)
                    } else {
                        map.get("percentComplete")
                            .or_else(|| map.get("percent"))
                            .and_then(|p| p.as_f64().map(|f| {
                                let f32_val = f as f32;
                                if f32_val <= 1.0 && f32_val > 0.0 { f32_val * 100.0 } else { f32_val }
                            }))
                            .unwrap_or(0.0)
                    };
                    let state = map
                        .get("state")
                        .and_then(|s| s.as_str())
                        .unwrap_or("Queued")
                        .to_string();

                    let lower = state.to_lowercase();
                    let is_completed = lower.contains("completed") && !lower.contains("cancelled") && !lower.contains("timedout") && !lower.contains("rejected");
                    let is_paused = lower.contains("cancel");
                    let is_failed = (lower.contains("error")
                        || lower.contains("fail")
                        || lower.contains("abort")
                        || lower.contains("timedout")
                        || lower.contains("rejected"))
                        && !is_paused;

                    return Some(SoulseekDownloadStatus {
                        id,
                        username,
                        filename: fname_val.to_string(),
                        size,
                        bytes_transferred,
                        speed_bytes: speed,
                        percent_complete: percent,
                        state: state.clone(),
                        is_completed,
                        is_failed,
                        is_paused,
                        error: if is_failed {
                            Some(format!("Soulseek transfer failed with state: {}", state))
                        } else {
                            None
                        },
                    });
                }
            }

            for (_, val) in map {
                if let Some(res) = find_transfer_in_json(val, target_filename) {
                    return Some(res);
                }
            }
        }
        _ => {}
    }
    None
}

/// Recursively find a completed download file on disk in the downloads folder
pub async fn find_downloaded_file_on_disk(
    download_dir: &std::path::Path,
    username: &str,
    filename: &str,
) -> Option<std::path::PathBuf> {
    let normalized = filename.replace('\\', "/");
    let base_name = std::path::Path::new(&normalized)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(filename);

    let candidate1 = download_dir.join(&normalized);
    if candidate1.is_file() {
        return Some(candidate1);
    }
    let candidate2 = download_dir.join(username).join(&normalized);
    if candidate2.is_file() {
        return Some(candidate2);
    }
    let candidate3 = download_dir.join(base_name);
    if candidate3.is_file() {
        return Some(candidate3);
    }
    let candidate4 = download_dir.join(username).join(base_name);
    if candidate4.is_file() {
        return Some(candidate4);
    }

    // Walk subdirectories in download_dir
    let mut stack = vec![download_dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if let Ok(mut entries) = tokio::fs::read_dir(&dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let path = entry.path();
                if let Ok(ft) = entry.file_type().await {
                    if ft.is_dir() {
                        stack.push(path);
                    } else if ft.is_file() {
                        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                            if name == base_name || name.ends_with(base_name) {
                                return Some(path);
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

/// Write or update the native slskd configuration file (slskd.yml)
pub fn sync_slskd_config(
    data_dir: &std::path::Path,
    download_dir: &std::path::Path,
    username: Option<&str>,
    password: Option<&str>,
) -> std::io::Result<()> {
    let slskd_dir = data_dir.join("slskd");
    std::fs::create_dir_all(&slskd_dir)?;
    let incomplete_dir = slskd_dir.join("incomplete");
    std::fs::create_dir_all(&incomplete_dir)?;

    let config_path = slskd_dir.join("slskd.yml");
    let u = username.unwrap_or("").trim();
    let p = password.unwrap_or("").trim();
    let d = download_dir.to_string_lossy();
    let inc = incomplete_dir.to_string_lossy();

    let yaml_content = format!(
r#"web:
  port: 5030
  authentication:
    disabled: true

directories:
  downloads: "{d}"
  incomplete: "{inc}"

shares:
  directories:
    - "{d}"

soulseek:
  username: "{u}"
  password: "{p}"
  listen_port: 50300
  diagnostic_level: Info
"#
    );

    std::fs::write(&config_path, yaml_content)?;
    info!("Synchronized slskd native configuration at {:?}", config_path);
    Ok(())
}

/// Cleans track titles by stripping leading track indices (e.g. "17 - ", "01. ")
/// and parenthetical metadata tags (e.g. "(Bonus Track)", "[Remastered]").
pub fn clean_query_title(title: &str) -> String {
    let mut t = title.trim();
    // Strip leading track numbers like "17 - ", "01. ", "12 "
    if let Some(pos) = t.find(|c: char| c == '-' || c == '.' || c == ' ') {
        let prefix = &t[..pos];
        if !prefix.is_empty() && prefix.chars().all(|c| c.is_ascii_digit()) && pos <= 4 {
            t = t[pos + 1..].trim_start_matches(|c: char| c == '-' || c == '.' || c == ' ');
        }
    }
    // Remove bracketed or parenthesized tags like "(Bonus Track)", "[Deluxe]", "(Remastered 2021)"
    let mut cleaned = String::new();
    let mut depth = 0;
    let mut in_tag = String::new();
    for c in t.chars() {
        if c == '(' || c == '[' {
            depth += 1;
            in_tag.clear();
        } else if c == ')' || c == ']' {
            if depth > 0 {
                depth -= 1;
                let lower_tag = in_tag.to_lowercase();
                if !(lower_tag.contains("bonus")
                    || lower_tag.contains("deluxe")
                    || lower_tag.contains("remaster")
                    || lower_tag.contains("explicit")
                    || lower_tag.contains("version")
                    || lower_tag.contains("edit")
                    || lower_tag.contains("audio")
                    || lower_tag.contains("official")
                    || lower_tag.contains("video"))
                {
                    cleaned.push(' ');
                    cleaned.push_str(&in_tag);
                }
                in_tag.clear();
            }
        } else if depth > 0 {
            in_tag.push(c);
        } else {
            cleaned.push(c);
        }
    }
    let res = cleaned.trim();
    if res.is_empty() {
        t.to_string()
    } else {
        res.to_string()
    }
}
