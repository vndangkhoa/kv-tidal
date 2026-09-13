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
    pub subsonic_user: String,
    pub port: u16,
    pub download_dir: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    pub tidal_access_token: Option<String>,
    pub tidal_quality: Option<String>,
    pub soulseek_enabled: Option<bool>,
    pub soulseek_url: Option<String>,
    pub soulseek_api_key: Option<String>,
    pub soulseek_username: Option<String>,
    pub soulseek_password: Option<String>,
    pub download_dir: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TestTokenRequest {
    pub token: Option<String>,
}

fn mask_token(token: &str) -> String {
    let t = token.trim();
    if t.len() <= 8 {
        "••••••••".to_string()
    } else {
        format!("{}••••{}", &t[..4], &t[t.len() - 4..])
    }
}

async fn get_settings(State(state): State<AppState>) -> Json<SettingsResponse> {
    let cfg = state.config.read().await;
    let tidal_has_token = cfg.tidal_access_token.as_ref().map(|t| !t.trim().is_empty()).unwrap_or(false);
    let tidal_token_masked = cfg.tidal_access_token.as_ref().filter(|t| !t.trim().is_empty()).map(|t| mask_token(t));
    let soulseek_has_api_key = cfg.soulseek_api_key.as_ref().map(|k| !k.trim().is_empty()).unwrap_or(false);
    let soulseek_has_password = cfg.soulseek_password.as_ref().map(|p| !p.trim().is_empty()).unwrap_or(false);

    Json(SettingsResponse {
        tidal_has_token,
        tidal_token_masked,
        tidal_quality: cfg.tidal_quality.clone(),
        soulseek_enabled: cfg.soulseek_enabled,
        soulseek_url: cfg.soulseek_url.clone(),
        soulseek_has_api_key,
        soulseek_username: cfg.soulseek_username.clone(),
        soulseek_has_password,
        subsonic_user: cfg.subsonic_user.clone(),
        port: cfg.port,
        download_dir: cfg.download_dir.to_string_lossy().to_string(),
    })
}

async fn update_settings(
    State(state): State<AppState>,
    Json(payload): Json<UpdateSettingsRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut slsk_creds_changed = false;
    let config_path;

    {
        let mut cfg = state.config.write().await;

        if let Some(token) = payload.tidal_access_token {
            let clean = token.trim();
            cfg.tidal_access_token = if clean.is_empty() { None } else { Some(clean.to_string()) };
            state.tidal.set_credentials(cfg.tidal_access_token.clone(), None).await;
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

    match state.tidal.test_bearer_token(&token_to_test).await {
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

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_settings).post(update_settings))
        .route("/test-tidal", post(test_tidal_token))
        .route("/test-soulseek", post(test_soulseek_connection))
}
