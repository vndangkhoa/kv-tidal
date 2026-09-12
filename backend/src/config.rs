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
