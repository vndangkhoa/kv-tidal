use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryConfig {
    pub name: String,
    pub path: PathBuf,
    pub is_download_target: bool,
    pub watch_changes: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub host: String,
    pub port: u16,
    pub puid: u32,
    pub pgid: u32,
    pub data_dir: PathBuf,
    pub web_dir: PathBuf,
    pub subsonic_user: String,
    pub subsonic_password: String,
    pub download_dir: PathBuf,
    pub libraries: Vec<LibraryConfig>,
    #[serde(default)]
    pub tidal_access_token: Option<String>,
    #[serde(default)]
    pub tidal_refresh_token: Option<String>,
    #[serde(default = "default_tidal_quality")]
    pub tidal_quality: String,
    #[serde(default = "default_true")]
    pub soulseek_enabled: bool,
    #[serde(default = "default_soulseek_url")]
    pub soulseek_url: String,
    #[serde(default)]
    pub soulseek_api_key: Option<String>,
    #[serde(default)]
    pub soulseek_username: Option<String>,
    #[serde(default)]
    pub soulseek_password: Option<String>,
}

fn default_tidal_quality() -> String {
    "HI_RES_LOSSLESS".to_string()
}

fn default_true() -> bool {
    true
}

fn default_soulseek_url() -> String {
    "http://127.0.0.1:5030".to_string()
}

impl Default for AppConfig {
    fn default() -> Self {
        let puid = std::env::var("PUID")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(1000);
        let pgid = std::env::var("PGID")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(1000);
        let port = std::env::var("PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(8080);
        let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let data_dir = std::env::var("DATA_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("./data"));
        let web_dir = std::env::var("WEB_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("./web"));
        let download_dir = std::env::var("MUSIC_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("./music"));
        let subsonic_user = std::env::var("SUBSONIC_USER").unwrap_or_else(|_| "admin".to_string());
        let subsonic_password = std::env::var("SUBSONIC_PASSWORD").unwrap_or_else(|_| "admin".to_string());
        let tidal_access_token = std::env::var("TIDAL_ACCESS_TOKEN").ok();
        let tidal_refresh_token = std::env::var("TIDAL_REFRESH_TOKEN").ok();
        let tidal_quality = std::env::var("TIDAL_QUALITY").unwrap_or_else(|_| "HI_RES_LOSSLESS".to_string());
        let soulseek_enabled = std::env::var("SOULSEEK_ENABLED").map(|v| v == "true" || v == "1").unwrap_or(true);
        let soulseek_url = std::env::var("SOULSEEK_URL").unwrap_or_else(|_| "http://127.0.0.1:5030".to_string());
        let soulseek_api_key = std::env::var("SOULSEEK_API_KEY").ok();
        let soulseek_username = std::env::var("SOULSEEK_USERNAME").ok();
        let soulseek_password = std::env::var("SOULSEEK_PASSWORD").ok();

        let default_lib = LibraryConfig {
            name: "NAS Music Library".to_string(),
            path: download_dir.clone(),
            is_download_target: true,
            watch_changes: true,
        };

        Self {
            host,
            port,
            puid,
            pgid,
            data_dir,
            web_dir,
            subsonic_user,
            subsonic_password,
            download_dir,
            libraries: vec![default_lib],
            tidal_access_token,
            tidal_refresh_token,
            tidal_quality,
            soulseek_enabled,
            soulseek_url,
            soulseek_api_key,
            soulseek_username,
            soulseek_password,
        }
    }
}

impl AppConfig {
    pub fn load_or_create<P: AsRef<Path>>(path: P) -> Self {
        let p = path.as_ref();
        if p.exists() {
            if let Ok(content) = std::fs::read_to_string(p) {
                if let Ok(cfg) = serde_json::from_str::<AppConfig>(&content) {
                    return cfg;
                }
            }
        }

        let default_cfg = AppConfig::default();
        if let Some(parent) = p.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&default_cfg) {
            let _ = std::fs::write(p, json);
        }
        default_cfg
    }

    pub fn save<P: AsRef<Path>>(&self, path: P) -> Result<(), std::io::Error> {
        let json = serde_json::to_string_pretty(self)?;
        if let Some(parent) = path.as_ref().parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, json)?;
        Ok(())
    }
}

pub type SharedConfig = Arc<RwLock<AppConfig>>;
