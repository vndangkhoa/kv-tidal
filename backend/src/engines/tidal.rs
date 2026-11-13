use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tracing::{info, warn};

// Well-known client tokens used by open-source clients (Fire TV / Desktop)
pub const DEFAULT_TIDAL_TOKEN: &str = "CzET4vdadNUFQ5JU";

// Verified Tidal OAuth2 Device Authorization client credentials (tidalapi)
pub const TIDAL_OAUTH_CLIENT_ID: &str = "fX2JxdmntZWK0ixT";
pub const TIDAL_OAUTH_CLIENT_SECRET: &str = "1Nn9AfDAjxrgJFJbKNWLeAyKGVGmINuXPPLHVXAvxAg=";
pub const TIDAL_OAUTH_SCOPE: &str = "r_usr w_usr w_sub";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TidalDeviceAuthResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone)]
pub enum TidalDevicePollResult {
    Pending,
    Authorized {
        access_token: String,
        refresh_token: Option<String>,
        country_code: String,
    },
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TidalResolvedStream {
    pub url: String,
    pub format_label: String,
    pub bit_depth: u8,
    pub sample_rate: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TidalTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: u32,
    pub track_number: u32,
    pub cover_uuid: Option<String>,
    pub audio_quality: String,
    pub isrc: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TidalArtist {
    pub id: String,
    pub name: String,
    pub picture_uuid: Option<String>,
    pub popularity: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlaybackManifest {
    #[serde(default)]
    pub urls: Vec<String>,
    #[serde(default)]
    pub mime_type: Option<String>,
    #[serde(default)]
    pub codecs: Option<String>,
}

pub struct TidalEngine {
    client: reqwest::Client,
    token: String,
    pub user_country_code: Arc<tokio::sync::RwLock<String>>,
    pub user_bearer_token: Arc<tokio::sync::RwLock<Option<String>>>,
    pub user_refresh_token: Arc<tokio::sync::RwLock<Option<String>>>,
    pub audio_quality: Arc<tokio::sync::RwLock<String>>,
    refresh_lock: tokio::sync::Mutex<()>,
    token_dirty: AtomicBool,
}

impl TidalEngine {
    pub fn new(
        token: Option<String>,
        country_code: Option<String>,
        user_bearer: Option<String>,
        user_refresh: Option<String>,
        quality: Option<String>,
    ) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent("TIDAL_ANDROID/1039 okhttp/4.9.3")
            .build()
            .unwrap_or_default();

        let clean_bearer = user_bearer
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let clean_refresh = user_refresh
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let clean_country = country_code
            .map(|s| s.trim().to_uppercase())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "US".to_string());

        Self {
            client,
            token: token.unwrap_or_else(|| DEFAULT_TIDAL_TOKEN.to_string()),
            user_country_code: Arc::new(tokio::sync::RwLock::new(clean_country)),
            user_bearer_token: Arc::new(tokio::sync::RwLock::new(clean_bearer)),
            user_refresh_token: Arc::new(tokio::sync::RwLock::new(clean_refresh)),
            audio_quality: Arc::new(tokio::sync::RwLock::new(
                quality.unwrap_or_else(|| "HI_RES_LOSSLESS".to_string()),
            )),
            refresh_lock: tokio::sync::Mutex::new(()),
            token_dirty: AtomicBool::new(false),
        }
    }

    pub async fn has_user_token(&self) -> bool {
        let has_access = self
            .user_bearer_token
            .read()
            .await
            .as_ref()
            .map(|t| !t.trim().is_empty())
            .unwrap_or(false);
        if has_access {
            return true;
        }
        self.user_refresh_token
            .read()
            .await
            .as_ref()
            .map(|t| !t.trim().is_empty())
            .unwrap_or(false)
    }

    async fn has_refresh_token(&self) -> bool {
        self.user_refresh_token
            .read()
            .await
            .as_ref()
            .map(|t| !t.trim().is_empty())
            .unwrap_or(false)
    }

    pub async fn set_credentials(&self, token: Option<String>, quality: Option<String>) {
        if let Some(t) = token {
            let trimmed = t.trim();
            if trimmed.is_empty() {
                *self.user_bearer_token.write().await = None;
                *self.user_refresh_token.write().await = None;
            } else {
                *self.user_bearer_token.write().await = Some(trimmed.to_string());
            }
        }
        if let Some(q) = quality {
            let mut w = self.audio_quality.write().await;
            *w = q;
        }
    }

    pub async fn set_oauth_session(
        &self,
        access_token: Option<String>,
        refresh_token: Option<String>,
        country_code: Option<String>,
    ) {
        if let Some(at) = access_token {
            let clean = at.trim();
            *self.user_bearer_token.write().await =
                if clean.is_empty() { None } else { Some(clean.to_string()) };
        }
        if let Some(rt) = refresh_token {
            let clean = rt.trim();
            *self.user_refresh_token.write().await =
                if clean.is_empty() { None } else { Some(clean.to_string()) };
        }
        if let Some(cc) = country_code {
            let clean = cc.trim().to_uppercase();
            if !clean.is_empty() {
                *self.user_country_code.write().await = clean;
            }
        }
    }

    /// Returns updated (access_token, refresh_token, country_code) if an auto-refresh occurred since last check.
    pub async fn take_dirty_tokens(&self) -> Option<(Option<String>, Option<String>, String)> {
        if !self.token_dirty.swap(false, Ordering::AcqRel) {
            return None;
        }
        let access = self.user_bearer_token.read().await.clone();
        let refresh = self.user_refresh_token.read().await.clone();
        let country = self.user_country_code.read().await.clone();
        Some((access, refresh, country))
    }

    /// Step 1 of Tidal OAuth2 Device Authorization Flow
    pub async fn start_device_auth(&self) -> Result<TidalDeviceAuthResponse, String> {
        let body = format!(
            "client_id={}&scope={}",
            urlencoding::encode(TIDAL_OAUTH_CLIENT_ID),
            urlencoding::encode(TIDAL_OAUTH_SCOPE),
        );

        let resp = self
            .client
            .post("https://auth.tidal.com/v1/oauth2/device_authorization")
            .header(
                reqwest::header::CONTENT_TYPE,
                "application/x-www-form-urlencoded",
            )
            .body(body)
            .send()
            .await
            .map_err(|e| format!("Network error contacting Tidal OAuth server: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!(
                "Tidal device authorization failed (HTTP {}): {}",
                status, text
            ));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Invalid JSON from Tidal device authorization: {}", e))?;

        let device_code = json
            .get("deviceCode")
            .or_else(|| json.get("device_code"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Missing deviceCode in Tidal response".to_string())?
            .to_string();

        let user_code = json
            .get("userCode")
            .or_else(|| json.get("user_code"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Missing userCode in Tidal response".to_string())?
            .to_string();

        let raw_uri = json
            .get("verificationUriComplete")
            .or_else(|| json.get("verification_uri_complete"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .or_else(|| {
                json.get("verificationUri")
                    .or_else(|| json.get("verification_uri"))
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.trim().is_empty())
            })
            .unwrap_or("https://link.tidal.com")
            .trim();

        let verification_uri = if raw_uri.starts_with("http://") || raw_uri.starts_with("https://") {
            raw_uri.to_string()
        } else {
            format!("https://{}", raw_uri.trim_start_matches('/'))
        };

        let expires_in = json
            .get("expiresIn")
            .or_else(|| json.get("expires_in"))
            .and_then(|v| v.as_u64())
            .unwrap_or(300);

        let interval = json
            .get("interval")
            .and_then(|v| v.as_u64())
            .unwrap_or(5)
            .max(2);

        Ok(TidalDeviceAuthResponse {
            device_code,
            user_code,
            verification_uri,
            expires_in,
            interval,
        })
    }

    /// Step 2 of Tidal OAuth2 Device Authorization Flow (poll until user authorizes)
    pub async fn poll_device_auth(&self, device_code: &str) -> TidalDevicePollResult {
        let clean_code = device_code.trim();
        if clean_code.is_empty() {
            return TidalDevicePollResult::Error("Missing device_code".to_string());
        }

        let body = format!(
            "client_id={}&client_secret={}&device_code={}&grant_type={}&scope={}",
            urlencoding::encode(TIDAL_OAUTH_CLIENT_ID),
            urlencoding::encode(TIDAL_OAUTH_CLIENT_SECRET),
            urlencoding::encode(clean_code),
            urlencoding::encode("urn:ietf:params:oauth:grant-type:device_code"),
            urlencoding::encode(TIDAL_OAUTH_SCOPE),
        );

        let resp = match self
            .client
            .post("https://auth.tidal.com/v1/oauth2/token")
            .header(
                reqwest::header::CONTENT_TYPE,
                "application/x-www-form-urlencoded",
            )
            .body(body)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                return TidalDevicePollResult::Error(format!(
                    "Network error polling Tidal OAuth: {}",
                    e
                ))
            }
        };

        let status = resp.status();
        let json: serde_json::Value = match resp.json().await {
            Ok(j) => j,
            Err(e) => {
                return TidalDevicePollResult::Error(format!(
                    "Invalid Tidal OAuth poll response (HTTP {}): {}",
                    status, e
                ))
            }
        };

        if status.is_success() {
            let access_token = match json.get("access_token").and_then(|v| v.as_str()) {
                Some(t) if !t.trim().is_empty() => t.trim().to_string(),
                _ => {
                    return TidalDevicePollResult::Error(
                        "Tidal OAuth response missing access_token".to_string(),
                    )
                }
            };
            let refresh_token = json
                .get("refresh_token")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());

            let country_code = json
                .get("user")
                .and_then(|u| u.get("countryCode").or_else(|| u.get("country_code")))
                .or_else(|| json.get("countryCode").or_else(|| json.get("country_code")))
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_uppercase())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "US".to_string());

            self.set_oauth_session(
                Some(access_token.clone()),
                refresh_token.clone(),
                Some(country_code.clone()),
            )
            .await;

            info!(
                "Tidal OAuth2 device login succeeded (country: {})",
                country_code
            );

            return TidalDevicePollResult::Authorized {
                access_token,
                refresh_token,
                country_code,
            };
        }

        let err_code = json
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let sub_status = json.get("sub_status").and_then(|v| v.as_u64());

        if err_code == "authorization_pending" || err_code == "slow_down" || sub_status == Some(1002)
        {
            return TidalDevicePollResult::Pending;
        }

        let err_desc = json
            .get("error_description")
            .and_then(|v| v.as_str())
            .or_else(|| (!err_code.is_empty()).then_some(err_code))
            .unwrap_or("Tidal device authorization failed or expired");

        TidalDevicePollResult::Error(err_desc.to_string())
    }

    /// Refresh OAuth2 access token using stored refresh_token
    pub async fn refresh_access_token(&self) -> Result<String, String> {
        let _guard = self.refresh_lock.lock().await;

        let refresh_token = self
            .user_refresh_token
            .read()
            .await
            .clone()
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| "No Tidal refresh token available".to_string())?;

        let body = format!(
            "client_id={}&client_secret={}&refresh_token={}&grant_type=refresh_token",
            urlencoding::encode(TIDAL_OAUTH_CLIENT_ID),
            urlencoding::encode(TIDAL_OAUTH_CLIENT_SECRET),
            urlencoding::encode(&refresh_token),
        );

        let resp = self
            .client
            .post("https://auth.tidal.com/v1/oauth2/token")
            .header(
                reqwest::header::CONTENT_TYPE,
                "application/x-www-form-urlencoded",
            )
            .body(body)
            .send()
            .await
            .map_err(|e| format!("Network error refreshing Tidal token: {}", e))?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            warn!("Tidal OAuth token refresh failed (HTTP {}): {}", status, text);
            return Err(format!("Tidal token refresh failed: HTTP {}", status));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Invalid JSON refreshing Tidal token: {}", e))?;

        let new_access = json
            .get("access_token")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "Tidal refresh response missing access_token".to_string())?;

        let rotated_refresh = json
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let updated_country = json
            .get("user")
            .and_then(|u| u.get("countryCode").or_else(|| u.get("country_code")))
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_uppercase())
            .filter(|s| !s.is_empty());

        *self.user_bearer_token.write().await = Some(new_access.clone());
        if let Some(rt) = rotated_refresh {
            *self.user_refresh_token.write().await = Some(rt);
        }
        if let Some(cc) = updated_country {
            *self.user_country_code.write().await = cc;
        }
        self.token_dirty.store(true, Ordering::Release);

        info!("Successfully refreshed Tidal OAuth2 access token");
        Ok(new_access)
    }

    pub async fn test_bearer_token(&self, token: &str) -> Result<String, String> {
        let clean = token.trim();
        if clean.is_empty() {
            return Err("Token is empty".to_string());
        }

        // 1. Try legacy streamurl endpoint first
        let test_url = "https://api.tidal.com/v1/tracks/77701758/streamurl?soundQuality=LOSSLESS";
        let resp = self
            .client
            .get(test_url)
            .header("Authorization", format!("Bearer {}", clean))
            .send()
            .await
            .map_err(|e| format!("Network error validating Tidal token: {}", e))?;

        if resp.status().is_success() {
            return Ok(
                "Tidal HiFi Token is active and valid! Direct Master/Lossless streaming enabled."
                    .to_string(),
            );
        }

        // 2. Fallback to playbackinfopostpaywall/v4 (used by OAuth2 Device tokens)
        let v4_url = "https://api.tidal.com/v1/tracks/77701758/playbackinfopostpaywall/v4?audioquality=LOSSLESS&playbackmode=STREAM&assetpresentation=FULL";
        let resp_v4 = self
            .client
            .get(v4_url)
            .header("Authorization", format!("Bearer {}", clean))
            .send()
            .await
            .map_err(|e| format!("Network error validating Tidal OAuth token: {}", e))?;

        if resp_v4.status().is_success() {
            return Ok(
                "Tidal HiFi Token is active and valid! Direct Lossless streaming enabled."
                    .to_string(),
            );
        }

        // 3. If testing the currently stored token and it returned 401 while a refresh token exists, auto-refresh!
        if resp_v4.status() == reqwest::StatusCode::UNAUTHORIZED {
            let matches_stored = self
                .user_bearer_token
                .read()
                .await
                .as_deref()
                .map(|s| s == clean)
                .unwrap_or(false);
            if matches_stored && self.has_refresh_token().await {
                if let Ok(refreshed) = self.refresh_access_token().await {
                    let retry_resp = self
                        .client
                        .get(v4_url)
                        .header("Authorization", format!("Bearer {}", refreshed))
                        .send()
                        .await
                        .map_err(|e| format!("Network error validating refreshed token: {}", e))?;
                    if retry_resp.status().is_success() {
                        return Ok(
                            "Tidal HiFi Token refreshed and verified! Direct Lossless streaming enabled."
                                .to_string(),
                        );
                    }
                }
            }
            return Err(
                "Tidal rejected token: HTTP 401 Unauthorized (Expired or invalid token)".to_string(),
            );
        }

        if resp_v4.status() == reqwest::StatusCode::FORBIDDEN {
            Err("Tidal rejected token: HTTP 403 Forbidden (Region restricted or subscription inactive)".to_string())
        } else {
            Err(format!("Tidal token check returned HTTP {}", resp_v4.status()))
        }
    }

    /// Search Tidal track catalog
    pub async fn search_tracks(&self, query: &str) -> Result<Vec<TidalTrack>, Box<dyn std::error::Error + Send + Sync>> {
        let country = self.user_country_code.read().await.clone();
        let url = format!(
            "https://api.tidal.com/v1/search/tracks?query={}&limit=25&countryCode={}",
            urlencoding::encode(query),
            country
        );

        let mut resp = self
            .client
            .get(&url)
            .header("x-tidal-token", &self.token)
            .send()
            .await?;

        if !resp.status().is_success() && country != "US" {
            let fallback_url = format!(
                "https://api.tidal.com/v1/search/tracks?query={}&limit=25&countryCode=US",
                urlencoding::encode(query)
            );
            resp = self
                .client
                .get(&fallback_url)
                .header("x-tidal-token", &self.token)
                .send()
                .await?;
        }

        if !resp.status().is_success() {
            return Err(format!("Tidal API search failed: HTTP {}", resp.status()).into());
        }

        let json: serde_json::Value = resp.json().await?;
        let items = json
            .get("items")
            .and_then(|v| v.as_array())
            .ok_or("Invalid search response")?;

        let mut tracks = Vec::new();
        for item in items {
            let id = item.get("id").and_then(|v| v.as_i64()).unwrap_or(0).to_string();
            let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let artist = item
                .get("artist")
                .and_then(|v| v.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let album = item
                .get("album")
                .and_then(|v| v.get("title"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let cover_uuid = item
                .get("album")
                .and_then(|v| v.get("cover"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let duration = item.get("duration").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let track_number = item.get("trackNumber").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
            let audio_quality = item
                .get("audioQuality")
                .and_then(|v| v.as_str())
                .unwrap_or("LOSSLESS")
                .to_string();
            let isrc = item.get("isrc").and_then(|v| v.as_str()).map(|s| s.to_string());

            tracks.push(TidalTrack {
                id,
                title,
                artist,
                album,
                duration,
                track_number,
                cover_uuid,
                audio_quality,
                isrc,
            });
        }

        Ok(tracks)
    }

    async fn fetch_playback_v4_json(
        &self,
        clean_id: &str,
        quality: &str,
        effective_bearer: &mut Option<String>,
        allow_refresh: bool,
        did_refresh: &mut bool,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!(
            "https://api.tidal.com/v1/tracks/{}/playbackinfopostpaywall/v4?audioquality={}&playbackmode=STREAM&assetpresentation=FULL",
            clean_id, quality
        );

        let send_once = |bearer_opt: &Option<String>| {
            let mut req = self.client.get(&url);
            if let Some(ref b) = bearer_opt {
                req = req.header("Authorization", format!("Bearer {}", b));
            } else {
                req = req.header("x-tidal-token", &self.token);
            }
            req.send()
        };

        let mut resp = send_once(effective_bearer).await?;
        if resp.status() == reqwest::StatusCode::UNAUTHORIZED
            && allow_refresh
            && !*did_refresh
            && self.has_refresh_token().await
        {
            *did_refresh = true;
            if let Ok(new_token) = self.refresh_access_token().await {
                *effective_bearer = Some(new_token);
                resp = send_once(effective_bearer).await?;
            }
        }

        if !resp.status().is_success() {
            return Err(format!("Playback info failed: HTTP {}", resp.status()).into());
        }

        let json: serde_json::Value = resp.json().await?;
        Ok(json)
    }

    /// Resolve postpaywall stream URL and audio metadata from Tidal manifest or direct streamurl
    pub async fn resolve_stream_with_meta(
        &self,
        track_id: &str,
        session_bearer: Option<&str>,
    ) -> Result<TidalResolvedStream, Box<dyn std::error::Error + Send + Sync>> {
        let clean_id = track_id.trim_start_matches("tidal-").trim();
        if clean_id.is_empty() {
            return Err("Empty Tidal track_id".into());
        }

        let quality = {
            let q = self.audio_quality.read().await;
            if q.trim().is_empty() {
                "LOSSLESS".to_string()
            } else {
                q.trim().to_string()
            }
        };

        let allow_refresh = session_bearer.is_none();
        let mut did_refresh = false;

        let mut effective_bearer: Option<String> = if let Some(sb) = session_bearer {
            let trimmed = sb.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        } else {
            self.user_bearer_token.read().await.clone()
        };

        // If access token is empty but refresh token is configured, mint a fresh access token upfront
        if effective_bearer.is_none() && allow_refresh && self.has_refresh_token().await {
            did_refresh = true;
            if let Ok(new_token) = self.refresh_access_token().await {
                effective_bearer = Some(new_token);
            }
        }

        // 1. If bearer token is present, try fast direct streamurl endpoint first
        if let Some(ref bearer) = effective_bearer.clone() {
            let direct_url = format!(
                "https://api.tidal.com/v1/tracks/{}/streamurl?soundQuality={}",
                clean_id, quality
            );
            if let Ok(mut resp) = self
                .client
                .get(&direct_url)
                .header("Authorization", format!("Bearer {}", bearer))
                .send()
                .await
            {
                if resp.status() == reqwest::StatusCode::UNAUTHORIZED
                    && allow_refresh
                    && !did_refresh
                    && self.has_refresh_token().await
                {
                    did_refresh = true;
                    if let Ok(new_token) = self.refresh_access_token().await {
                        effective_bearer = Some(new_token.clone());
                        if let Ok(retry_resp) = self
                            .client
                            .get(&direct_url)
                            .header("Authorization", format!("Bearer {}", new_token))
                            .send()
                            .await
                        {
                            resp = retry_resp;
                        }
                    }
                }

                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<serde_json::Value>().await {
                        if let Some(u) = json.get("url").and_then(|v| v.as_str()) {
                            let sq = json
                                .get("soundQuality")
                                .and_then(|v| v.as_str())
                                .unwrap_or(&quality)
                                .to_uppercase();
                            let codec = json
                                .get("codec")
                                .and_then(|v| v.as_str())
                                .unwrap_or("flac")
                                .to_lowercase();
                            let (format_label, bit_depth, sample_rate) =
                                if codec.contains("aac") || codec.contains("mp4a") || sq == "HIGH" || sq == "LOW" {
                                    ("AAC 320kbps (Tidal)".to_string(), 16, 44100)
                                } else if sq.contains("HI_RES") {
                                    ("FLAC 24-bit/96kHz (Tidal Max)".to_string(), 24, 96000)
                                } else {
                                    ("FLAC 16-bit/44.1kHz (Tidal HiFi)".to_string(), 16, 44100)
                                };
                            return Ok(TidalResolvedStream {
                                url: u.to_string(),
                                format_label,
                                bit_depth,
                                sample_rate,
                            });
                        }
                    }
                }
            }
        }

        // 2. Query playbackinfopostpaywall/v4
        let mut json = self
            .fetch_playback_v4_json(
                clean_id,
                &quality,
                &mut effective_bearer,
                allow_refresh,
                &mut did_refresh,
            )
            .await?;

        let manifest_mime = json
            .get("manifestMimeType")
            .and_then(|v| v.as_str())
            .unwrap_or("application/vnd.tidal.bts")
            .to_string();

        // HI_RES_LOSSLESS often returns segmented fMP4 DASH XML (application/dash+xml) which HTML5 <audio>
        // cannot play directly. Automatically retry with LOSSLESS to receive a byte-range-seekable FLAC BTS stream!
        if manifest_mime.eq_ignore_ascii_case("application/dash+xml")
            || manifest_mime.contains("dash+xml")
        {
            if !quality.eq_ignore_ascii_case("LOSSLESS") {
                info!(
                    "Tidal returned {} for track {} at quality {}; retrying with LOSSLESS for direct FLAC BTS stream",
                    manifest_mime, clean_id, quality
                );
                json = self
                    .fetch_playback_v4_json(
                        clean_id,
                        "LOSSLESS",
                        &mut effective_bearer,
                        allow_refresh,
                        &mut did_refresh,
                    )
                    .await?;
            }

            let retry_mime = json
                .get("manifestMimeType")
                .and_then(|v| v.as_str())
                .unwrap_or("application/vnd.tidal.bts");
            if retry_mime.eq_ignore_ascii_case("application/dash+xml")
                || retry_mime.contains("dash+xml")
            {
                json = self
                    .fetch_playback_v4_json(
                        clean_id,
                        "HIGH",
                        &mut effective_bearer,
                        allow_refresh,
                        &mut did_refresh,
                    )
                    .await?;
            }
        }

        let final_mime = json
            .get("manifestMimeType")
            .and_then(|v| v.as_str())
            .unwrap_or("application/vnd.tidal.bts");
        if final_mime.eq_ignore_ascii_case("application/dash+xml") || final_mime.contains("dash+xml")
        {
            return Err("Tidal returned segmented DASH MPD manifest without direct BTS stream URL".into());
        }

        let manifest_b64 = json
            .get("manifest")
            .and_then(|v| v.as_str())
            .ok_or("Manifest not found in response")?
            .trim();

        use base64::Engine;
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(manifest_b64)
            .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(manifest_b64))?;
        let manifest: PlaybackManifest = serde_json::from_slice(&decoded)?;

        let stream_url = manifest
            .urls
            .first()
            .ok_or("No audio stream URLs in manifest")?
            .clone();

        let bit_depth = json
            .get("bitDepth")
            .and_then(|v| v.as_u64())
            .map(|v| v as u8)
            .unwrap_or(16);
        let sample_rate = json
            .get("sampleRate")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32)
            .unwrap_or(44100);

        let codecs_lower = manifest.codecs.as_deref().unwrap_or("flac").to_lowercase();
        let mime_lower = manifest
            .mime_type
            .as_deref()
            .unwrap_or("audio/flac")
            .to_lowercase();
        let resp_quality = json
            .get("audioQuality")
            .and_then(|v| v.as_str())
            .unwrap_or("LOSSLESS")
            .to_uppercase();

        let format_label = if codecs_lower.contains("mp4a")
            || codecs_lower.contains("aac")
            || (mime_lower.contains("mp4") && !codecs_lower.contains("flac"))
            || resp_quality == "HIGH"
            || resp_quality == "LOW"
        {
            "AAC 320kbps (Tidal)".to_string()
        } else {
            let khz = if sample_rate % 1000 == 0 {
                format!("{}kHz", sample_rate / 1000)
            } else {
                format!("{:.1}kHz", sample_rate as f64 / 1000.0)
            };
            if bit_depth > 16 || sample_rate > 48000 {
                format!("FLAC {}-bit/{} (Tidal Max)", bit_depth, khz)
            } else {
                format!("FLAC {}-bit/{} (Tidal HiFi)", bit_depth, khz)
            }
        };

        Ok(TidalResolvedStream {
            url: stream_url,
            format_label,
            bit_depth,
            sample_rate,
        })
    }

    /// Resolve postpaywall FLAC stream URL from Tidal manifest or direct streamurl
    pub async fn resolve_stream_url(
        &self,
        track_id: &str,
        session_bearer: Option<&str>,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        self.resolve_stream_with_meta(track_id, session_bearer)
            .await
            .map(|r| r.url)
    }

    /// Search Tidal artists catalog
    pub async fn search_artists(&self, query: &str) -> Result<Vec<TidalArtist>, Box<dyn std::error::Error + Send + Sync>> {
        let country = self.user_country_code.read().await.clone();
        let url = format!(
            "https://api.tidal.com/v1/search/artists?query={}&limit=10&countryCode={}",
            urlencoding::encode(query),
            country
        );

        let resp = self
            .client
            .get(&url)
            .header("x-tidal-token", &self.token)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(format!("Tidal API artist search failed: HTTP {}", resp.status()).into());
        }

        let json: serde_json::Value = resp.json().await?;
        let items = json
            .get("items")
            .and_then(|v| v.as_array())
            .ok_or("Invalid artist search response")?;

        let mut artists = Vec::new();
        for item in items {
            let id = item.get("id").and_then(|v| v.as_i64()).unwrap_or(0).to_string();
            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let picture_uuid = item
                .get("picture")
                .and_then(|v| v.as_str())
                .or_else(|| item.get("selectedAlbumCoverFallback").and_then(|v| v.as_str()))
                .map(|s| s.to_string());
            let popularity = item.get("popularity").and_then(|v| v.as_u64()).map(|p| p as u32);

            artists.push(TidalArtist {
                id,
                name,
                picture_uuid,
                popularity,
            });
        }

        Ok(artists)
    }

    /// Fetch artist top tracks
    pub async fn get_artist_top_tracks(
        &self,
        artist_id: &str,
        limit: usize,
    ) -> Result<Vec<TidalTrack>, Box<dyn std::error::Error + Send + Sync>> {
        let country = self.user_country_code.read().await.clone();
        let url = format!(
            "https://api.tidal.com/v1/artists/{}/toptracks?limit={}&countryCode={}",
            artist_id,
            limit,
            country
        );

        let resp = self
            .client
            .get(&url)
            .header("x-tidal-token", &self.token)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(format!("Tidal API artist toptracks failed: HTTP {}", resp.status()).into());
        }

        let json: serde_json::Value = resp.json().await?;
        let items = json
            .get("items")
            .and_then(|v| v.as_array())
            .ok_or("Invalid toptracks response")?;

        let mut tracks = Vec::new();
        for item in items {
            let id = item.get("id").and_then(|v| v.as_i64()).unwrap_or(0).to_string();
            let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let artist = item
                .get("artist")
                .and_then(|v| v.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let album = item
                .get("album")
                .and_then(|v| v.get("title"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let cover_uuid = item
                .get("album")
                .and_then(|v| v.get("cover"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let duration = item.get("duration").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let track_number = item.get("trackNumber").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
            let audio_quality = item
                .get("audioQuality")
                .and_then(|v| v.as_str())
                .unwrap_or("LOSSLESS")
                .to_string();
            let isrc = item.get("isrc").and_then(|v| v.as_str()).map(|s| s.to_string());

            tracks.push(TidalTrack {
                id,
                title,
                artist,
                album,
                duration,
                track_number,
                cover_uuid,
                audio_quality,
                isrc,
            });
        }

        Ok(tracks)
    }

    /// Fetch artist editorial biography
    pub async fn get_artist_bio(
        &self,
        artist_id: &str,
    ) -> Result<Option<String>, Box<dyn std::error::Error + Send + Sync>> {
        let country = self.user_country_code.read().await.clone();
        let url = format!(
            "https://api.tidal.com/v1/artists/{}/bio?countryCode={}",
            artist_id,
            country
        );

        let resp = self
            .client
            .get(&url)
            .header("x-tidal-token", &self.token)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Ok(None);
        }

        let json: serde_json::Value = resp.json().await?;
        let bio_text = json.get("text").and_then(|v| v.as_str()).map(|s| s.to_string());
        Ok(bio_text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bts_manifest_decode() {
        let raw = r#"{"mimeType":"audio/flac","codecs":"flac","encryptionType":"NONE","urls":["https://sp-pr-cf.audio.tidal.com/mediatracks/test.flac"]}"#;
        let parsed: PlaybackManifest = serde_json::from_slice(raw.as_bytes()).unwrap();
        assert_eq!(parsed.urls.len(), 1);
        assert_eq!(parsed.mime_type.as_deref(), Some("audio/flac"));
        assert_eq!(parsed.codecs.as_deref(), Some("flac"));
    }

    #[tokio::test]
    async fn test_has_user_token_states() {
        let engine = TidalEngine::new(None, None, None, Some("rt_123".to_string()), None);
        assert!(engine.has_user_token().await);
        engine.set_credentials(Some(String::new()), None).await;
        assert!(!engine.has_user_token().await);
    }
}
