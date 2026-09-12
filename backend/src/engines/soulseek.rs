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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoulseekDownloadStatus {
    pub filename: String,
    pub size: u64,
    pub bytes_transferred: u64,
    pub speed_bytes: u64,
    pub percent_complete: f32,
    pub state: String,
    pub is_completed: bool,
    pub is_failed: bool,
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
                let is_completed = lower.contains("completed") || lower.contains("succeeded") || lower.contains("finished");
                let is_failed = lower.contains("error")
                    || lower.contains("fail")
                    || lower.contains("cancel")
                    || lower.contains("abort")
                    || lower.contains("timedout")
                    || lower.contains("rejected");

                out.push(SoulseekDownloadStatus {
                    filename: fname_val.to_string(),
                    size,
                    bytes_transferred,
                    speed_bytes: speed,
                    percent_complete: percent,
                    state: state.clone(),
                    is_completed,
                    is_failed,
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
                    let is_completed = lower.contains("completed") || lower.contains("succeeded") || lower.contains("finished");
                    let is_failed = lower.contains("error")
                        || lower.contains("fail")
                        || lower.contains("cancel")
                        || lower.contains("abort")
                        || lower.contains("timedout")
                        || lower.contains("rejected");

                    return Some(SoulseekDownloadStatus {
                        filename: fname_val.to_string(),
                        size,
                        bytes_transferred,
                        speed_bytes: speed,
                        percent_complete: percent,
                        state: state.clone(),
                        is_completed,
                        is_failed,
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
