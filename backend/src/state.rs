use crate::api::search_tracker::SearchVelocityTracker;
use crate::config::SharedConfig;
use crate::engines::{MetadataResolver, QobuzEngine, SoulseekEngine, StreamResolver, TidalEngine};
use crate::storage::scanner::SharedLibrary;
use crate::trending::SharedTrending;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct ActiveOutputConfig {
    pub active_device_id: String,
    pub volume: f32,
    pub sample_rate: u32,
    pub bit_depth: u32,
    pub is_dsd: bool,
    pub hardware_mode: String,
    pub dsd_mode: String,
    pub buffer_frames: u32,
    pub replay_gain_mode: String,
}

impl Default for ActiveOutputConfig {
    fn default() -> Self {
        Self {
            active_device_id: "browser".to_string(),
            volume: 0.85,
            sample_rate: 44100,
            bit_depth: 16,
            is_dsd: false,
            hardware_mode: "hw".to_string(),
            dsd_mode: "dop".to_string(),
            buffer_frames: 512,
            replay_gain_mode: "off".to_string(),
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub config: SharedConfig,
    pub trending: SharedTrending,
    pub library: SharedLibrary,
    pub metadata: Arc<MetadataResolver>,
    pub tidal: Arc<TidalEngine>,
    pub qobuz: Arc<QobuzEngine>,
    pub soulseek: Arc<SoulseekEngine>,
    pub resolver: Arc<StreamResolver>,
    pub search_tracker: Arc<SearchVelocityTracker>,
    pub active_output: Arc<RwLock<ActiveOutputConfig>>,
    pub download_queue: crate::api::download::SharedDownloadQueue,
    pub download_semaphore: Arc<tokio::sync::Semaphore>,
}

impl AppState {
    pub fn new(
        config: SharedConfig,
        trending: SharedTrending,
        library: SharedLibrary,
    ) -> Self {
        let (tidal_token, tidal_quality) = {
            if let Ok(c) = config.try_read() {
                (c.tidal_access_token.clone(), Some(c.tidal_quality.clone()))
            } else {
                (None, None)
            }
        };

        Self {
            config: config.clone(),
            trending,
            library,
            metadata: Arc::new(MetadataResolver::new()),
            tidal: Arc::new(TidalEngine::new(None, None, tidal_token, tidal_quality)),
            qobuz: Arc::new(QobuzEngine::new(None)),
            soulseek: Arc::new(SoulseekEngine::new(config)),
            resolver: Arc::new(StreamResolver::new()),
            search_tracker: Arc::new(SearchVelocityTracker::new()),
            active_output: Arc::new(RwLock::new(ActiveOutputConfig::default())),
            download_queue: crate::api::download::new_download_queue(),
            download_semaphore: Arc::new(tokio::sync::Semaphore::new(2)),
        }
    }
}
