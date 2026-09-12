use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex, RwLock};
use tracing::{info, warn};

static BOOTSTRAP_LOCK: Mutex<()> = Mutex::const_new(());

/// Locate existing yt-dlp binary across standard Synology DSM, local, and system paths
pub fn find_yt_dlp() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("YT_DLP_PATH") {
        let pb = PathBuf::from(p);
        if pb.exists() {
            return Some(pb);
        }
    }

    // Check data dir bin
    let base_data_dir = if let Ok(d) = std::env::var("DATA_DIR") {
        PathBuf::from(d)
    } else if let Ok(cfg_path) = std::env::var("CONFIG_PATH") {
        PathBuf::from(cfg_path)
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("var"))
            .unwrap_or_else(|| PathBuf::from("./data"))
    } else {
        PathBuf::from("./data")
    };

    let data_bin = base_data_dir.join("bin").join("yt-dlp");
    if data_bin.exists() {
        return Some(data_bin);
    }

    for candidate in &[
        "/var/packages/kvtidal/target/bin/yt-dlp",
        "/usr/local/bin/yt-dlp",
        "/usr/bin/yt-dlp",
        "/bin/yt-dlp",
        "/opt/bin/yt-dlp",
        "/var/packages/python3/target/bin/yt-dlp",
        "/var/packages/python310/target/bin/yt-dlp",
        "/var/packages/python311/target/bin/yt-dlp",
    ] {
        let p = PathBuf::from(candidate);
        if p.exists() {
            return Some(p);
        }
    }

    // Check user home directory
    if let Ok(home) = std::env::var("HOME") {
        let home_bin = PathBuf::from(home).join(".local/bin/yt-dlp");
        if home_bin.exists() {
            return Some(home_bin);
        }
    }

    // Check PATH
    if std::process::Command::new("yt-dlp")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
    {
        return Some(PathBuf::from("yt-dlp"));
    }

    None
}

/// Automatically bootstrap standalone yt-dlp binary if missing on host
pub async fn bootstrap_yt_dlp() -> Option<PathBuf> {
    let _guard = BOOTSTRAP_LOCK.lock().await;
    if let Some(existing) = find_yt_dlp() {
        return Some(existing);
    }

    let base_data_dir = if let Ok(d) = std::env::var("DATA_DIR") {
        PathBuf::from(d)
    } else if let Ok(cfg_path) = std::env::var("CONFIG_PATH") {
        PathBuf::from(cfg_path)
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("var"))
            .unwrap_or_else(|| PathBuf::from("./data"))
    } else {
        PathBuf::from("./data")
    };

    let bin_dir = base_data_dir.join("bin");
    let _ = tokio::fs::create_dir_all(&bin_dir).await;
    let target = bin_dir.join("yt-dlp");
    let tmp = bin_dir.join(format!("yt-dlp.tmp.{}", uuid::Uuid::new_v4()));

    info!("Downloading standalone yt-dlp binary to {:?}...", target);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .unwrap_or_default();

    let download_url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
    match client.get(download_url).send().await {
        Ok(resp) if resp.status().is_success() => {
            if let Ok(bytes) = resp.bytes().await {
                if bytes.len() > 1_000_000 {
                    if tokio::fs::write(&tmp, &bytes).await.is_ok() {
                        #[cfg(unix)]
                        {
                            use std::os::unix::fs::PermissionsExt;
                            let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o755));
                        }
                        if tokio::fs::rename(&tmp, &target).await.is_ok() {
                            info!("Successfully bootstrapped yt-dlp to {:?}", target);
                            return Some(target);
                        }
                    }
                }
            }
            let _ = tokio::fs::remove_file(&tmp).await;
        }
        Ok(resp) => {
            warn!("Failed to download yt-dlp: HTTP {}", resp.status());
            let _ = tokio::fs::remove_file(&tmp).await;
        }
        Err(e) => {
            warn!("Failed to download yt-dlp: {}", e);
            let _ = tokio::fs::remove_file(&tmp).await;
        }
    }

    None
}

#[derive(Clone)]
pub struct StreamResolver {
    cache: Arc<RwLock<HashMap<String, (String, std::time::Instant)>>>,
    in_flight: Arc<RwLock<HashMap<String, broadcast::Sender<Option<String>>>>>,
}

impl Default for StreamResolver {
    fn default() -> Self {
        Self::new()
    }
}

impl StreamResolver {
    pub fn new() -> Self {
        Self {
            cache: Arc::new(RwLock::new(HashMap::new())),
            in_flight: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Resolve 100% full-length audio stream for any track (with deduplication)
    pub async fn resolve_full_stream(&self, artist: &str, title: &str) -> Option<String> {
        let key = format!("{} - {}", artist.to_lowercase().trim(), title.to_lowercase().trim());

        // 1. Check in-memory cache (valid for 3 hours)
        {
            let c = self.cache.read().await;
            if let Some((url, timestamp)) = c.get(&key) {
                if timestamp.elapsed().as_secs() < 10800 {
                    return Some(url.clone());
                }
            }
        }

        // 2. Check if this stream is already being resolved in-flight
        let mut rx = {
            let mut in_flight = self.in_flight.write().await;
            if let Some(tx) = in_flight.get(&key) {
                tx.subscribe()
            } else {
                let (tx, _) = broadcast::channel(4);
                in_flight.insert(key.clone(), tx);
                // We are the leader for this key
                drop(in_flight);

                // Run resolution as leader
                return self.resolve_as_leader(key, artist, title).await;
            }
        };

        // If we are a follower, wait for leader's broadcast
        match rx.recv().await {
            Ok(result) => result,
            Err(_) => {
                // In case leader dropped without broadcasting, check cache fallback
                let c = self.cache.read().await;
                c.get(&key).map(|(u, _)| u.clone())
            }
        }
    }

    async fn resolve_as_leader(&self, key: String, artist: &str, title: &str) -> Option<String> {
        info!("Resolving full-length audio stream (singleflight leader): {}", key);

        let yt_binary = match find_yt_dlp() {
            Some(p) => p,
            None => {
                info!("yt-dlp not found on system, attempting auto-bootstrap...");
                match bootstrap_yt_dlp().await {
                    Some(p) => p,
                    None => {
                        warn!("yt-dlp is unavailable on this host and auto-bootstrap failed");
                        let mut in_flight = self.in_flight.write().await;
                        if let Some(tx) = in_flight.remove(&key) {
                            let _ = tx.send(None);
                        }
                        return None;
                    }
                }
            }
        };

        let query = format!("ytsearch1:{} {}", artist, title);
        let resolved_url = match tokio::process::Command::new(&yt_binary)
            .args([&query, "--get-url", "-f", "ba/b", "--no-warnings"])
            .output()
            .await
        {
            Ok(output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Some(url) = stdout.lines().find(|l| l.starts_with("http")) {
                    let full_url = url.trim().to_string();
                    let mut c = self.cache.write().await;
                    c.insert(key.clone(), (full_url.clone(), std::time::Instant::now()));
                    info!("Full-length audio stream resolved successfully with {:?}: {}", yt_binary, key);
                    Some(full_url)
                } else {
                    warn!("yt-dlp succeeded but returned no stream URL for {}", key);
                    None
                }
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                warn!("yt-dlp ({:?}) failed for {}: {}", yt_binary, key, stderr);
                None
            }
            Err(e) => {
                warn!("Stream extractor ({:?}) execution error for {}: {}", yt_binary, key, e);
                None
            }
        };

        // Broadcast to all waiting followers and remove from in_flight
        {
            let mut in_flight = self.in_flight.write().await;
            if let Some(tx) = in_flight.remove(&key) {
                let _ = tx.send(resolved_url.clone());
            }
        }

        resolved_url
    }
}
