use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tracing::{info, warn};

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

        let query = format!("ytsearch1:{} {}", artist, title);
        let resolved_url = match tokio::process::Command::new("yt-dlp")
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
                    info!("Full-length audio stream resolved successfully: {}", key);
                    Some(full_url)
                } else {
                    None
                }
            }
            Ok(_) | Err(_) => {
                warn!("Stream extractor was unable to find audio for {}", key);
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
