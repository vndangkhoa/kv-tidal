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
        "./spk/bin/yt-dlp_linux",
        "./spk/bin/yt-dlp",
        "/var/packages/kvtidal/target/bin/yt-dlp",
        "/var/packages/kvtidal/target/bin/yt-dlp_linux",
        "/var/packages/kv-tidal/target/bin/yt-dlp",
        "/var/packages/kv-tidal/target/bin/yt-dlp_linux",
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
        for sub in &[".local/bin/yt-dlp", ".local/bin/yt-dlp_linux", "bin/yt-dlp"] {
            let home_bin = PathBuf::from(&home).join(sub);
            if home_bin.exists() {
                return Some(home_bin);
            }
        }
    }

    // Check PATH
    for bin_name in &["yt-dlp", "yt-dlp_linux"] {
        if std::process::Command::new(bin_name)
            .arg("--version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
        {
            return Some(PathBuf::from(bin_name));
        }
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

    let download_url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";
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

async fn resolve_via_invidious(client: &reqwest::Client, base_url: &str, artist: &str, title: &str) -> Option<String> {
    let query = format!("{} {}", artist, title);
    let search_url = format!("{}/api/v1/search?q={}&type=video", base_url.trim_end_matches('/'), urlencoding::encode(&query));
    let resp = client.get(&search_url).timeout(std::time::Duration::from_secs(4)).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let items: serde_json::Value = resp.json().await.ok()?;
    let video_id = items.as_array()?.first()?.get("videoId")?.as_str()?;

    let video_url = format!("{}/api/v1/videos/{}", base_url.trim_end_matches('/'), video_id);
    let v_resp = client.get(&video_url).timeout(std::time::Duration::from_secs(4)).send().await.ok()?;
    if !v_resp.status().is_success() {
        return None;
    }
    let v_json: serde_json::Value = v_resp.json().await.ok()?;
    let formats = v_json.get("adaptiveFormats")?.as_array()?;

    // Pick highest audio bitrate
    let mut audio_formats: Vec<_> = formats.iter().filter(|f| {
        f.get("type").and_then(|t| t.as_str()).map(|t| t.starts_with("audio")).unwrap_or(false)
    }).collect();

    audio_formats.sort_by_key(|f| {
        f.get("bitrate").and_then(|b| b.as_u64()).or_else(|| {
            f.get("bitrate").and_then(|b| b.as_str()).and_then(|s| s.parse().ok())
        }).unwrap_or(0)
    });

    if let Some(best) = audio_formats.last() {
        if let Some(url) = best.get("url").and_then(|u| u.as_str()) {
            return Some(url.to_string());
        }
    }
    None
}

#[derive(Clone)]
pub struct StreamResolver {
    cache: Arc<RwLock<HashMap<String, (String, std::time::Instant)>>>,
    in_flight: Arc<RwLock<HashMap<String, broadcast::Sender<Option<String>>>>>,
    http_client: reqwest::Client,
}

impl Default for StreamResolver {
    fn default() -> Self {
        Self::new()
    }
}

fn find_writable_tmp() -> PathBuf {
    let test_write = |dir: &std::path::Path| -> bool {
        let _ = std::fs::create_dir_all(dir);
        let test_file = dir.join(format!(".write_test_{}", uuid::Uuid::new_v4()));
        if std::fs::write(&test_file, b"ok").is_ok() {
            let _ = std::fs::remove_file(test_file);
            true
        } else {
            false
        }
    };

    if let Ok(t) = std::env::var("TMPDIR") {
        let pb = PathBuf::from(&t);
        if test_write(&pb) {
            return pb;
        }
    }

    if let Ok(d) = std::env::var("DATA_DIR") {
        let pb = PathBuf::from(d).join("tmp");
        if test_write(&pb) {
            return pb;
        }
    }

    if let Ok(cfg) = std::env::var("CONFIG_PATH") {
        if let Some(parent) = PathBuf::from(cfg).parent().and_then(|p| p.parent()) {
            let pb = parent.join("var").join("tmp");
            if test_write(&pb) {
                return pb;
            }
        }
    }

    let local_data = PathBuf::from("./data/tmp");
    if test_write(&local_data) {
        return local_data;
    }

    let sys_temp = std::env::temp_dir();
    if test_write(&sys_temp) {
        return sys_temp;
    }

    PathBuf::from("/tmp")
}

impl StreamResolver {
    pub fn new() -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .unwrap_or_default();
        Self {
            cache: Arc::new(RwLock::new(HashMap::new())),
            in_flight: Arc::new(RwLock::new(HashMap::new())),
            http_client,
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

        // Tier 1: Check local NAS Invidious instance (port 7601) for instant ~10ms HTTP resolution
        for base in &["http://127.0.0.1:7601", "http://localhost:7601"] {
            if let Some(url) = resolve_via_invidious(&self.http_client, base, artist, title).await {
                let mut c = self.cache.write().await;
                c.insert(key.clone(), (url.clone(), std::time::Instant::now()));
                info!("Full-length audio stream resolved via local Invidious ({}) for {}", base, key);
                let mut in_flight = self.in_flight.write().await;
                if let Some(tx) = in_flight.remove(&key) {
                    let _ = tx.send(Some(url.clone()));
                }
                return Some(url);
            }
        }

        // Tier 2: Standalone yt-dlp binary (with robust writable TMPDIR)
        let yt_binary = match find_yt_dlp() {
            Some(p) => Some(p),
            None => bootstrap_yt_dlp().await,
        };

        if let Some(yt_binary) = yt_binary {
            let clean_title = crate::engines::soulseek::clean_query_title(title);
            let primary_artist = artist
                .split(&[',', '&', ';', '/'][..])
                .next()
                .unwrap_or(artist)
                .trim();
            let query = format!("ytsearch1:{} {}", primary_artist, clean_title);

            let mut cmd = tokio::process::Command::new(&yt_binary);
            cmd.args([
                &query,
                "--get-url",
                "-f",
                "ba/b",
                "--no-warnings",
                "--no-playlist",
                "--no-check-certificates",
                "--extractor-args",
                "youtube:player_client=android,mweb,web",
                "--socket-timeout",
                "10",
            ]);

            let base_tmp = find_writable_tmp();
            cmd.env("TMPDIR", &base_tmp);

            match cmd.output().await {
                Ok(output) if output.status.success() => {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    if let Some(url) = stdout.lines().find(|l| l.starts_with("http")) {
                        let full_url = url.trim().to_string();
                        let mut c = self.cache.write().await;
                        c.insert(key.clone(), (full_url.clone(), std::time::Instant::now()));
                        info!("Full-length audio stream resolved successfully with {:?}: {}", yt_binary, key);
                        let mut in_flight = self.in_flight.write().await;
                        if let Some(tx) = in_flight.remove(&key) {
                            let _ = tx.send(Some(full_url.clone()));
                        }
                        return Some(full_url);
                    }
                }
                Ok(output) => {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    warn!("yt-dlp ({:?}) failed for {}: {}", yt_binary, key, stderr);
                }
                Err(e) => {
                    warn!("Stream extractor ({:?}) execution error for {}: {}", yt_binary, key, e);
                }
            }
        }

        // Tier 3: Public Invidious instances as high-reliability fallback
        for base in &[
            "https://invidious.f5.si",
            "https://inv.nadeko.net",
            "https://invidious.privacydev.net",
        ] {
            if let Some(url) = resolve_via_invidious(&self.http_client, base, artist, title).await {
                let mut c = self.cache.write().await;
                c.insert(key.clone(), (url.clone(), std::time::Instant::now()));
                info!("Full-length audio stream resolved via fallback Invidious ({}) for {}", base, key);
                let mut in_flight = self.in_flight.write().await;
                if let Some(tx) = in_flight.remove(&key) {
                    let _ = tx.send(Some(url.clone()));
                }
                return Some(url);
            }
        }

        warn!("All full-length stream resolvers failed for {}", key);
        let mut in_flight = self.in_flight.write().await;
        if let Some(tx) = in_flight.remove(&key) {
            let _ = tx.send(None);
        }
        None
    }
}
