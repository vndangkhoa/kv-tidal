use crate::state::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::Json;
use axum::routing::{get, post};
use axum::Router;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tracing::info;

#[derive(Debug, Serialize)]
pub struct SettingsResponse {
    pub tidal_has_token: bool,
    pub tidal_token_masked: Option<String>,
    pub tidal_quality: String,
    pub soulseek_enabled: bool,
    pub soulseek_url: String,
    pub soulseek_has_api_key: bool,
    pub soulseek_username: Option<String>,
    pub soulseek_has_password: bool,
    pub youtube_has_cookies: bool,
    pub ytdlp_available: bool,
    pub subsonic_user: String,
    pub port: u16,
    pub download_dir: String,
    pub nas_passcode_enabled: bool,
    pub nas_passcode_is_default: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    pub tidal_access_token: Option<String>,
    pub tidal_refresh_token: Option<String>,
    pub tidal_quality: Option<String>,
    pub soulseek_enabled: Option<bool>,
    pub soulseek_url: Option<String>,
    pub soulseek_api_key: Option<String>,
    pub soulseek_username: Option<String>,
    pub soulseek_password: Option<String>,
    pub youtube_cookies_content: Option<String>,
    pub download_dir: Option<String>,
    pub nas_passcode_enabled: Option<bool>,
    pub new_nas_passcode: Option<String>,
    pub current_nas_passcode: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TestTokenRequest {
    pub token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DevicePollRequest {
    pub device_code: String,
}

fn mask_token(token: &str) -> String {
    let t = token.trim();
    if t.len() <= 8 {
        "••••••••".to_string()
    } else {
        format!("{}••••{}", &t[..4], &t[t.len() - 4..])
    }
}

fn check_cookies_file(data_dir: &std::path::Path) -> Option<PathBuf> {
    for candidate in [data_dir.join("cookies.txt"), PathBuf::from("./data/cookies.txt")] {
        if candidate.is_file() {
            if let Ok(meta) = std::fs::metadata(&candidate) {
                if meta.len() > 0 {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

async fn get_settings(State(state): State<AppState>) -> Json<SettingsResponse> {
    let cfg = state.config.read().await;
    let tidal_has_token = cfg
        .tidal_access_token
        .as_ref()
        .map(|t| !t.trim().is_empty())
        .unwrap_or(false)
        || cfg
            .tidal_refresh_token
            .as_ref()
            .map(|t| !t.trim().is_empty())
            .unwrap_or(false);
    let tidal_token_masked = cfg
        .tidal_access_token
        .as_ref()
        .filter(|t| !t.trim().is_empty())
        .or(cfg.tidal_refresh_token.as_ref().filter(|t| !t.trim().is_empty()))
        .map(|t| mask_token(t));
    let soulseek_has_api_key = cfg.soulseek_api_key.as_ref().map(|k| !k.trim().is_empty()).unwrap_or(false);
    let soulseek_has_password = cfg.soulseek_password.as_ref().map(|p| !p.trim().is_empty()).unwrap_or(false);
    let youtube_has_cookies = check_cookies_file(&cfg.data_dir).is_some();
    let ytdlp_available = crate::engines::stream_resolver::find_yt_dlp().is_some();

    Json(SettingsResponse {
        tidal_has_token,
        tidal_token_masked,
        tidal_quality: cfg.tidal_quality.clone(),
        soulseek_enabled: cfg.soulseek_enabled,
        soulseek_url: cfg.soulseek_url.clone(),
        soulseek_has_api_key,
        soulseek_username: cfg.soulseek_username.clone(),
        soulseek_has_password,
        youtube_has_cookies,
        ytdlp_available,
        subsonic_user: cfg.subsonic_user.clone(),
        port: cfg.port,
        download_dir: cfg.download_dir.to_string_lossy().to_string(),
        nas_passcode_enabled: cfg.nas_passcode_enabled,
        nas_passcode_is_default: cfg.nas_passcode == "1234",
    })
}

async fn update_settings(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<UpdateSettingsRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut slsk_creds_changed = false;
    let mut cookies_updated = false;
    let config_path;

    let wants_passcode_change = payload.nas_passcode_enabled.is_some()
        || payload
            .new_nas_passcode
            .as_ref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
    let wants_download_dir_change = payload
        .download_dir
        .as_ref()
        .map(|d| !d.trim().is_empty())
        .unwrap_or(false);

    if wants_download_dir_change && !wants_passcode_change {
        let unlocked_cookie = crate::api::fs::is_request_nas_unlocked(&state, &headers, None).await;
        if !unlocked_cookie {
            let cfg = state.config.read().await;
            if cfg.nas_passcode_enabled {
                let supplied = payload.current_nas_passcode.as_deref().unwrap_or("").trim();
                if !crate::api::fs::constant_time_eq(
                    supplied.as_bytes(),
                    cfg.nas_passcode.as_bytes(),
                ) {
                    return Err((
                        StatusCode::FORBIDDEN,
                        "Current NAS passcode required to change download directory".to_string(),
                    ));
                }
            }
        }
    }

    {
        let mut cfg = state.config.write().await;

        if wants_passcode_change {
            if cfg.nas_passcode_enabled {
                let supplied = payload.current_nas_passcode.as_deref().unwrap_or("").trim();
                if !crate::api::fs::constant_time_eq(
                    supplied.as_bytes(),
                    cfg.nas_passcode.as_bytes(),
                ) {
                    return Err((
                        StatusCode::FORBIDDEN,
                        "Incorrect current NAS passcode".to_string(),
                    ));
                }
            }

            if let Some(ref new_pass) = payload.new_nas_passcode {
                let clean_new = new_pass.trim();
                if !clean_new.is_empty() {
                    if clean_new.len() < 4 || clean_new.len() > 32 {
                        return Err((
                            StatusCode::BAD_REQUEST,
                            "New NAS passcode must be between 4 and 32 characters".to_string(),
                        ));
                    }
                    cfg.nas_passcode = clean_new.to_string();
                    cfg.nas_auth_secret = uuid::Uuid::new_v4().to_string();
                }
            }

            if let Some(enabled) = payload.nas_passcode_enabled {
                cfg.nas_passcode_enabled = enabled;
                cfg.nas_auth_secret = uuid::Uuid::new_v4().to_string();
            }
        }

        if let Some(token) = payload.tidal_access_token {
            let clean = token.trim();
            if clean.is_empty() {
                cfg.tidal_access_token = None;
                cfg.tidal_refresh_token = None;
                state.tidal.set_credentials(Some(String::new()), None).await;
            } else {
                cfg.tidal_access_token = Some(clean.to_string());
                state.tidal.set_credentials(cfg.tidal_access_token.clone(), None).await;
            }
        }

        if let Some(rt) = payload.tidal_refresh_token {
            let clean = rt.trim();
            cfg.tidal_refresh_token = if clean.is_empty() { None } else { Some(clean.to_string()) };
            state.tidal.set_oauth_session(None, Some(clean.to_string()), None).await;
        }

        if let Some(quality) = payload.tidal_quality {
            cfg.tidal_quality = quality.clone();
            state.tidal.set_credentials(None, Some(quality)).await;
        }

        if let Some(enabled) = payload.soulseek_enabled {
            cfg.soulseek_enabled = enabled;
        }

        if let Some(url) = payload.soulseek_url {
            if !url.trim().is_empty() {
                cfg.soulseek_url = url.trim().to_string();
            }
        }

        if let Some(key) = payload.soulseek_api_key {
            let clean = key.trim();
            cfg.soulseek_api_key = if clean.is_empty() { None } else { Some(clean.to_string()) };
        }

        if let Some(user) = payload.soulseek_username {
            let clean = user.trim();
            let new_user = if clean.is_empty() { None } else { Some(clean.to_string()) };
            if new_user != cfg.soulseek_username {
                cfg.soulseek_username = new_user;
                slsk_creds_changed = true;
            }
        }

        if let Some(pass) = payload.soulseek_password {
            let clean = pass.trim();
            let new_pass = if clean.is_empty() { None } else { Some(clean.to_string()) };
            if new_pass != cfg.soulseek_password {
                cfg.soulseek_password = new_pass;
                slsk_creds_changed = true;
            }
        }

        if let Some(dir) = payload.download_dir {
            if !dir.trim().is_empty() {
                cfg.download_dir = PathBuf::from(dir.trim());
            }
        }

        if let Some(cookies_raw) = payload.youtube_cookies_content {
            let trimmed = cookies_raw.trim();
            if !trimmed.is_empty() {
                let _ = std::fs::create_dir_all(&cfg.data_dir);
                let formatted = if trimmed.starts_with("# Netscape HTTP Cookie File") || trimmed.starts_with("# HTTP Cookie File") {
                    format!("{}\n", trimmed)
                } else {
                    format!("# Netscape HTTP Cookie File\n{}\n", trimmed)
                };
                let primary_cookies = cfg.data_dir.join("cookies.txt");
                if let Err(e) = std::fs::write(&primary_cookies, &formatted) {
                    return Err((
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("Failed writing cookies.txt to {:?}: {}", primary_cookies, e),
                    ));
                }
                let fallback_dir = PathBuf::from("./data");
                if fallback_dir.exists() && fallback_dir != cfg.data_dir {
                    let _ = std::fs::write(fallback_dir.join("cookies.txt"), &formatted);
                }
                cookies_updated = true;
                info!("Saved YouTube cookies.txt ({} bytes) to {:?}", formatted.len(), primary_cookies);
            }
        }

        // Persist configuration to disk
        config_path = std::env::var("CONFIG_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| cfg.data_dir.join("config.json"));

        if let Err(e) = cfg.save(&config_path) {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed saving settings to {:?}: {}", config_path, e),
            ));
        }

        // Synchronize native slskd configuration (slskd.yml)
        let _ = crate::engines::soulseek::sync_slskd_config(
            &cfg.data_dir,
            &cfg.download_dir,
            cfg.soulseek_username.as_deref(),
            cfg.soulseek_password.as_deref(),
        );
    } // cfg write lock dropped here before calling async methods to prevent deadlock

    if cookies_updated {
        state.resolver.clear_cache().await;
    }

    // If Soulseek credentials changed, restart slskd so it boots with updated credentials;
    // otherwise just trigger connect.
    if slsk_creds_changed {
        info!("Soulseek credentials changed; restarting slskd daemon to reload configuration...");
        let _ = state.soulseek.restart().await;
    } else {
        let _ = state.soulseek.trigger_connect().await;
    }

    info!("Settings updated and saved to {:?}", config_path);
    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Settings saved successfully"
    })))
}

async fn test_tidal_token(
    State(state): State<AppState>,
    Json(payload): Json<TestTokenRequest>,
) -> Json<serde_json::Value> {
    let token_to_test = if let Some(ref t) = payload.token {
        if !t.trim().is_empty() {
            t.trim().to_string()
        } else {
            let cfg = state.config.read().await;
            cfg.tidal_access_token.clone().unwrap_or_default()
        }
    } else {
        let cfg = state.config.read().await;
        cfg.tidal_access_token.clone().unwrap_or_default()
    };

    if token_to_test.is_empty() {
        return Json(serde_json::json!({
            "success": false,
            "message": "No Tidal token provided to test."
        }));
    }

    let res = state.tidal.test_bearer_token(&token_to_test).await;

    if let Some((new_access, new_refresh, new_country)) = state.tidal.take_dirty_tokens().await {
        let mut cfg = state.config.write().await;
        cfg.tidal_access_token = new_access;
        if new_refresh.is_some() {
            cfg.tidal_refresh_token = new_refresh;
        }
        cfg.tidal_country_code = Some(new_country);
        let p = cfg.resolve_config_path();
        let _ = cfg.save(&p);
    }

    match res {
        Ok(msg) => Json(serde_json::json!({
            "success": true,
            "message": msg
        })),
        Err(e) => Json(serde_json::json!({
            "success": false,
            "message": e
        })),
    }
}

async fn start_tidal_device_auth(
    State(state): State<AppState>,
) -> Result<Json<crate::engines::tidal::TidalDeviceAuthResponse>, (StatusCode, Json<serde_json::Value>)> {
    match state.tidal.start_device_auth().await {
        Ok(resp) => Ok(Json(resp)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "status": "error",
                "message": e
            })),
        )),
    }
}

async fn poll_tidal_device_auth(
    State(state): State<AppState>,
    Json(payload): Json<DevicePollRequest>,
) -> Json<serde_json::Value> {
    match state.tidal.poll_device_auth(&payload.device_code).await {
        crate::engines::tidal::TidalDevicePollResult::Pending => Json(serde_json::json!({
            "status": "pending"
        })),
        crate::engines::tidal::TidalDevicePollResult::Authorized {
            access_token,
            refresh_token,
            country_code,
        } => {
            state
                .tidal
                .set_oauth_session(
                    Some(access_token.clone()),
                    refresh_token.clone(),
                    Some(country_code.clone()),
                )
                .await;

            let masked = mask_token(&access_token);
            {
                let mut cfg = state.config.write().await;
                cfg.tidal_access_token = Some(access_token);
                if let Some(rt) = refresh_token {
                    cfg.tidal_refresh_token = Some(rt);
                }
                cfg.tidal_country_code = Some(country_code);
                let config_path = cfg.resolve_config_path();
                if let Err(e) = cfg.save(&config_path) {
                    tracing::warn!("Failed persisting Tidal OAuth tokens to {:?}: {}", config_path, e);
                } else {
                    info!("Persisted Tidal OAuth2 tokens to {:?}", config_path);
                }
            }

            Json(serde_json::json!({
                "status": "authorized",
                "tidal_token_masked": masked,
                "message": "Connected to Tidal HiFi!"
            }))
        }
        crate::engines::tidal::TidalDevicePollResult::Error(msg) => Json(serde_json::json!({
            "status": "error",
            "message": msg
        })),
    }
}

async fn test_soulseek_connection(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let mut status = state.soulseek.check_status().await;

    // If slskd is running but disconnected/connecting, trigger server connect and wait briefly
    if !status.is_logged_in {
        let _ = state.soulseek.trigger_connect().await;
        for _ in 0..5 {
            tokio::time::sleep(std::time::Duration::from_millis(600)).await;
            status = state.soulseek.check_status().await;
            if status.is_logged_in {
                break;
            }
        }
    }

    if status.connected && status.is_logged_in {
        Json(serde_json::json!({
            "success": true,
            "message": "Connected and Logged In to Soulseek P2P successfully!",
            "version": status.server_version
        }))
    } else if status.connected {
        Json(serde_json::json!({
            "success": false,
            "message": status.error.unwrap_or_else(|| "Connected to slskd, but not logged in to Soulseek network".to_string()),
            "version": status.server_version
        }))
    } else {
        Json(serde_json::json!({
            "success": false,
            "message": status.error.unwrap_or_else(|| "Failed to connect to slskd".to_string())
        }))
    }
}

async fn clear_youtube_cookies(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let data_dir = {
        let cfg = state.config.read().await;
        cfg.data_dir.clone()
    };
    let _ = std::fs::remove_file(data_dir.join("cookies.txt"));
    let _ = std::fs::remove_file(PathBuf::from("./data/cookies.txt"));
    state.resolver.clear_cache().await;
    info!("Cleared YouTube cookies.txt from {:?}", data_dir);

    Json(serde_json::json!({
        "success": true,
        "has_cookies": false,
        "message": "YouTube cookies.txt removed."
    }))
}

async fn test_ytdlp_status(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let data_dir = {
        let cfg = state.config.read().await;
        cfg.data_dir.clone()
    };
    let cookies_path = check_cookies_file(&data_dir);
    let has_cookies = cookies_path.is_some();
    let cookie_entries = cookies_path
        .as_ref()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .map(|txt| {
            txt.lines()
                .filter(|l| {
                    let t = l.trim();
                    !t.is_empty() && (!t.starts_with('#') || t.starts_with("#HttpOnly_"))
                })
                .count()
        })
        .unwrap_or(0);

    let ytdlp_path = match crate::engines::stream_resolver::find_yt_dlp() {
        Some(p) => Some(p),
        None => crate::engines::stream_resolver::bootstrap_yt_dlp().await,
    };
    let node_path = crate::engines::stream_resolver::find_node_binary();

    if let Some(yt_bin) = ytdlp_path {
        let node_status = if let Some(ref nb) = node_path {
            format!("Node.js runtime ({})", nb.display())
        } else {
            "no Node.js runtime".to_string()
        };
        let msg = if has_cookies {
            format!(
                "yt-dlp ready ({}, {}) with cookies.txt active ({} cookie entries).",
                yt_bin.display(),
                node_status,
                cookie_entries
            )
        } else {
            format!(
                "yt-dlp ready ({}, {}) — no cookies.txt configured (optional for age/bot-gated tracks).",
                yt_bin.display(),
                node_status
            )
        };
        Json(serde_json::json!({
            "success": true,
            "has_cookies": has_cookies,
            "ytdlp_available": true,
            "message": msg
        }))
    } else {
        Json(serde_json::json!({
            "success": false,
            "has_cookies": has_cookies,
            "ytdlp_available": false,
            "message": "yt-dlp binary not found and automatic bootstrap failed."
        }))
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_settings).post(update_settings))
        .route("/test-tidal", post(test_tidal_token))
        .route("/test-soulseek", post(test_soulseek_connection))
        .route("/test-ytdlp", post(test_ytdlp_status))
        .route("/cookies", axum::routing::delete(clear_youtube_cookies))
        .route("/clear-cookies", post(clear_youtube_cookies))
        .route("/tidal/device-auth", post(start_tidal_device_auth))
        .route("/tidal/device-poll", post(poll_tidal_device_auth))
}
