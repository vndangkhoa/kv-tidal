use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex, RwLock};
use tracing::{info, warn};

static BOOTSTRAP_LOCK: Mutex<()> = Mutex::const_new(());
const STREAM_CACHE_TTL_SECS: u64 = 2700; // 45 minutes

#[derive(Clone, Debug)]
pub struct ResolvedStream {
    pub url: String,
    pub source: String,
    pub format_label: String,
    pub bit_depth: u8,
    pub sample_rate: u32,
    pub bitrate: u32,
}

pub(crate) fn get_base_data_dir() -> PathBuf {
    if let Ok(d) = std::env::var("DATA_DIR") {
        PathBuf::from(d)
    } else if let Ok(cfg_path) = std::env::var("CONFIG_PATH") {
        PathBuf::from(&cfg_path)
            .parent()
            .and_then(|p| {
                if p.file_name().and_then(|n| n.to_str()) == Some("etc") {
                    p.parent().map(|pp| pp.join("var"))
                } else {
                    Some(p.to_path_buf())
                }
            })
            .unwrap_or_else(|| PathBuf::from("./data"))
    } else {
        PathBuf::from("./data")
    }
}

/// Locate existing yt-dlp binary across standard Synology DSM, local, and system paths
pub fn find_yt_dlp() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("YT_DLP_PATH") {
        let pb = PathBuf::from(p);
        if pb.exists() {
            return Some(pb);
        }
    }

    let base_data_dir = get_base_data_dir();
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

fn parse_node_semver(dir_name: &str) -> (u32, u32, u32) {
    let trimmed = dir_name.trim_start_matches('v');
    let mut parts = trimmed.split('.').map(|s| s.parse::<u32>().unwrap_or(0));
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

fn newest_nvm_node_in(versions_dir: &Path) -> Option<(PathBuf, (u32, u32, u32))> {
    let entries = std::fs::read_dir(versions_dir).ok()?;
    let mut candidates: Vec<(PathBuf, (u32, u32, u32))> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let node_bin = path.join("bin").join("node");
        if node_bin.is_file() {
            let ver = path
                .file_name()
                .and_then(|n| n.to_str())
                .map(parse_node_semver)
                .unwrap_or((0, 0, 0));
            candidates.push((node_bin, ver));
        }
    }
    candidates.sort_by_key(|(_, ver)| *ver);
    candidates.pop()
}

/// Locate a Node.js binary for yt-dlp's `--js-runtimes` signature solver
pub fn find_node_binary() -> Option<PathBuf> {
    for env_key in &["NODE_BIN", "NODE_PATH"] {
        if let Ok(val) = std::env::var(env_key) {
            for part in val.split(':') {
                let pb = PathBuf::from(part.trim());
                if pb.is_file() {
                    return Some(pb);
                }
            }
        }
    }

    for candidate in &[
        "/usr/local/bin/node",
        "/usr/bin/node",
        "/bin/node",
        "/opt/bin/node",
        "/var/packages/Node.js_v22/target/usr/local/bin/node",
        "/var/packages/Node.js_v20/target/usr/local/bin/node",
        "/var/packages/Node.js_v18/target/usr/local/bin/node",
    ] {
        let pb = PathBuf::from(candidate);
        if pb.is_file() {
            return Some(pb);
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        let home_nvm = PathBuf::from(home).join(".nvm/versions/node");
        if let Some((node_bin, _)) = newest_nvm_node_in(&home_nvm) {
            return Some(node_bin);
        }
    }

    if let Ok(home_entries) = std::fs::read_dir("/home") {
        let mut best: Option<(PathBuf, (u32, u32, u32))> = None;
        for entry in home_entries.flatten() {
            let nvm_dir = entry.path().join(".nvm/versions/node");
            if let Some((bin, ver)) = newest_nvm_node_in(&nvm_dir) {
                if best.as_ref().map(|(_, b_ver)| ver > *b_ver).unwrap_or(true) {
                    best = Some((bin, ver));
                }
            }
        }
        if let Some((bin, _)) = best {
            return Some(bin);
        }
    }

    None
}

fn find_cookies_file() -> Option<PathBuf> {
    let base = get_base_data_dir();
    let primary = base.join("cookies.txt");
    if primary.is_file() {
        return Some(primary);
    }
    let fallback = PathBuf::from("./data/cookies.txt");
    if fallback.is_file() {
        return Some(fallback);
    }
    None
}

/// Automatically bootstrap standalone yt-dlp binary if missing on host
pub async fn bootstrap_yt_dlp() -> Option<PathBuf> {
    let _guard = BOOTSTRAP_LOCK.lock().await;
    if let Some(existing) = find_yt_dlp() {
        return Some(existing);
    }

    let base_data_dir = get_base_data_dir();
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

pub(crate) fn normalize_match_text(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub(crate) fn strip_feat_clauses(s: &str) -> String {
    let mut out = String::new();
    let mut depth = 0usize;
    let mut group = String::new();

    for c in s.chars() {
        if c == '(' || c == '[' {
            if depth == 0 {
                group.clear();
            } else {
                group.push(c);
            }
            depth += 1;
        } else if c == ')' || c == ']' {
            if depth > 0 {
                depth -= 1;
                if depth == 0 {
                    let g_low = group.trim().to_lowercase();
                    let is_feat_or_edition = g_low.starts_with("feat.")
                        || g_low.starts_with("feat ")
                        || g_low.starts_with("ft.")
                        || g_low.starts_with("ft ")
                        || g_low.starts_with("with ")
                        || g_low.starts_with("prod.")
                        || g_low.starts_with("prod ")
                        || g_low.contains("remaster")
                        || g_low.contains("bonus track")
                        || g_low.contains("album version")
                        || g_low.contains("single version")
                        || g_low == "explicit"
                        || g_low == "clean";
                    if !is_feat_or_edition {
                        out.push(' ');
                        out.push_str(&group);
                    }
                    group.clear();
                } else {
                    group.push(c);
                }
            }
        } else if depth > 0 {
            group.push(c);
        } else {
            out.push(c);
        }
    }

    // Also strip trailing unparenthesized " feat. ..." / " ft. ..."
    let lower = out.to_lowercase();
    for marker in &[" feat. ", " feat ", " ft. ", " ft "] {
        if let Some(idx) = lower.find(marker) {
            out.truncate(idx);
            break;
        }
    }
    out.trim().to_string()
}

pub(crate) fn extract_primary_artist(artist: &str) -> String {
    let base = artist
        .split(&[',', '&', ';', '/'][..])
        .next()
        .unwrap_or(artist)
        .trim();
    let lower = base.to_lowercase();
    for marker in &[" feat. ", " feat ", " ft. ", " ft "] {
        if let Some(idx) = lower.find(marker) {
            return base[..idx].trim().to_string();
        }
    }
    base.to_string()
}

fn contains_word_phrase(norm_haystack: &str, phrase: &str) -> bool {
    let padded_hay = format!(" {} ", norm_haystack);
    let padded_needle = format!(" {} ", phrase);
    padded_hay.contains(&padded_needle)
}

pub(crate) fn artist_matches_primary(norm_primary_artist: &str, candidate_artist: &str) -> bool {
    if norm_primary_artist.is_empty() {
        return true;
    }
    let norm_cand = normalize_match_text(candidate_artist);
    if norm_cand.is_empty() {
        return false;
    }
    if norm_cand == norm_primary_artist
        || norm_cand.replace(' ', "") == norm_primary_artist.replace(' ', "")
    {
        return true;
    }
    let (shorter, longer) = if norm_primary_artist.len() <= norm_cand.len() {
        (norm_primary_artist, norm_cand.as_str())
    } else {
        (norm_cand.as_str(), norm_primary_artist)
    };
    if shorter.len() >= 3 && contains_word_phrase(longer, shorter) {
        return true;
    }
    false
}

pub(crate) fn score_track_title_match(
    raw_req_title: &str,
    clean_req_title: &str,
    raw_cand_title: &str,
) -> Option<i32> {
    let norm_req_full = normalize_match_text(raw_req_title);
    let norm_cand_full = normalize_match_text(raw_cand_title);

    // Reject variant mismatches (covers/remixes/live/instrumental/karaoke) so they fall through cleanly
    for kw in &[
        "remix",
        "cover",
        "karaoke",
        "instrumental",
        "tribute",
        "sped up",
        "slowed",
        "nightcore",
        "live",
    ] {
        let req_has = contains_word_phrase(&norm_req_full, kw);
        let cand_has = contains_word_phrase(&norm_cand_full, kw);
        if req_has != cand_has {
            return None;
        }
    }

    let core_req = {
        let stripped = normalize_match_text(&strip_feat_clauses(clean_req_title));
        if stripped.is_empty() {
            normalize_match_text(clean_req_title)
        } else {
            stripped
        }
    };
    let clean_cand = crate::engines::soulseek::clean_query_title(raw_cand_title);
    let core_cand = {
        let stripped = normalize_match_text(&strip_feat_clauses(&clean_cand));
        if stripped.is_empty() {
            normalize_match_text(&clean_cand)
        } else {
            stripped
        }
    };

    if core_req.is_empty() || core_cand.is_empty() {
        return None;
    }

    let mut score = if core_cand == core_req {
        100
    } else if contains_word_phrase(&core_cand, &core_req)
        && core_cand.len() <= core_req.len() + 24
    {
        80
    } else if core_req.len() >= 4 && contains_word_phrase(&core_req, &core_cand) {
        75
    } else {
        return None;
    };

    if !contains_word_phrase(&norm_req_full, "radio edit")
        && !contains_word_phrase(&norm_cand_full, "radio edit")
    {
        score += 10;
    }

    Some(score)
}

pub(crate) fn select_invidious_video_id(
    items: &[serde_json::Value],
    artist: &str,
    title: &str,
) -> Option<String> {
    let clean_title = crate::engines::soulseek::clean_query_title(title);
    let primary_artist = extract_primary_artist(artist);
    let norm_primary = normalize_match_text(&primary_artist);

    let mut fallback_id: Option<String> = None;
    let mut best_candidate: Option<(i32, String)> = None;

    for item in items {
        if item.get("liveNow").and_then(|v| v.as_bool()) == Some(true) {
            continue;
        }
        let len_secs = item
            .get("lengthSeconds")
            .and_then(|v| v.as_u64().or_else(|| v.as_i64().map(|n| n.max(0) as u64)))
            .unwrap_or(0);
        if len_secs > 0 && (len_secs < 45 || len_secs > 900) {
            continue;
        }

        let Some(vid) = item
            .get("videoId")
            .and_then(|v| v.as_str())
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        else {
            continue;
        };

        if fallback_id.is_none() {
            fallback_id = Some(vid.to_string());
        }

        let cand_title = item.get("title").and_then(|v| v.as_str()).unwrap_or("");
        let author = item.get("author").and_then(|v| v.as_str()).unwrap_or("");

        if let Some(mut score) = score_track_title_match(title, &clean_title, cand_title) {
            if !norm_primary.is_empty() {
                let norm_cand_title = normalize_match_text(cand_title);
                if artist_matches_primary(&norm_primary, author)
                    || contains_word_phrase(&norm_cand_title, &norm_primary)
                {
                    score += 20;
                }
            }
            let lower_title = cand_title.to_lowercase();
            let lower_author = author.to_lowercase();
            if lower_title.contains("official audio") || lower_author.ends_with(" - topic") {
                score += 15;
            }
            if best_candidate
                .as_ref()
                .map(|(best_score, _)| score > *best_score)
                .unwrap_or(true)
            {
                best_candidate = Some((score, vid.to_string()));
            }
        }
    }

    best_candidate.map(|(_, id)| id).or(fallback_id)
}

pub(crate) fn extract_innertube_video_ids(text: &str) -> Vec<String> {
    let mut ids = Vec::new();
    let needle = "\"videoId\":\"";
    let mut search_from = 0;

    while let Some(pos) = text[search_from..].find(needle) {
        let start = search_from + pos + needle.len();
        if start + 11 <= text.len() {
            let candidate = &text[start..start + 11];
            let after = text.as_bytes().get(start + 11).copied();
            if after == Some(b'"')
                && candidate
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
            {
                if !ids.iter().any(|existing| existing == candidate) {
                    ids.push(candidate.to_string());
                    if ids.len() >= 5 {
                        break;
                    }
                }
            }
        }
        search_from = start;
    }

    ids
}

fn parse_query_param_f64(url: &str, key: &str) -> Option<f64> {
    let query = url.split_once('?')?.1;
    let prefix = format!("{}=", key);
    for pair in query.split('&') {
        if let Some(val) = pair.strip_prefix(&prefix) {
            if let Ok(parsed) = val.parse::<f64>() {
                return Some(parsed);
            }
        }
    }
    None
}

async fn probe_companion_stream_url(
    client: &reqwest::Client,
    proxy_url: &str,
    timeout_secs: u64,
    source: &str,
    default_label: &str,
    default_sr: u32,
    default_br: u32,
) -> Option<ResolvedStream> {
    let probe_resp = client
        .get(proxy_url)
        .header(reqwest::header::RANGE, "bytes=0-0")
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .send()
        .await
        .ok()?;

    let st = probe_resp.status();
    if st != reqwest::StatusCode::OK && st != reqwest::StatusCode::PARTIAL_CONTENT {
        return None;
    }

    let resolved_url = probe_resp.url().to_string();
    // Never accept an unproxied googlevideo.com redirect from a remote instance (IP-bound -> 403)
    if resolved_url.contains(".googlevideo.com/") {
        return None;
    }

    // Reject short preview clips (< 45 seconds) if duration is encoded in the resolved URL
    if let Some(dur) = parse_query_param_f64(&resolved_url, "dur") {
        if dur > 0.0 && dur < 45.0 {
            return None;
        }
    }

    let is_m4a = resolved_url.contains("mime=audio%2Fmp4")
        || resolved_url.contains("mime=audio/mp4")
        || default_label.contains("AAC");

    let (format_label, sample_rate, bitrate) = if is_m4a {
        ("AAC 128kbps".to_string(), 44100, 128)
    } else {
        (default_label.to_string(), default_sr, default_br)
    };

    Some(ResolvedStream {
        url: resolved_url,
        source: source.to_string(),
        format_label,
        bit_depth: 16,
        sample_rate,
        bitrate,
    })
}

async fn resolve_via_invidious(
    client: &reqwest::Client,
    base_url: &str,
    artist: &str,
    title: &str,
) -> Option<ResolvedStream> {
    let base = base_url.trim_end_matches('/');
    let is_local_base = base.contains("127.0.0.1")
        || base.contains("localhost")
        || base.contains("host.docker.internal");

    let clean_title = crate::engines::soulseek::clean_query_title(title);
    let primary_artist = extract_primary_artist(artist);
    let query = if !primary_artist.is_empty() {
        format!("{} {}", primary_artist, clean_title)
    } else {
        clean_title
    };

    let search_url = format!(
        "{}/api/v1/search?q={}&type=video",
        base,
        urlencoding::encode(query.trim())
    );
    let search_timeout = if is_local_base {
        std::time::Duration::from_millis(1500)
    } else {
        std::time::Duration::from_secs(4)
    };
    let resp = client
        .get(&search_url)
        .timeout(search_timeout)
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let items: serde_json::Value = resp.json().await.ok()?;
    let arr = items.as_array()?;
    let video_id = select_invidious_video_id(arr, artist, title)?;

    let source_name = if is_local_base {
        "invidious-local"
    } else {
        "invidious-companion"
    };
    let probe_timeout_secs = if is_local_base { 3 } else { 6 };

    // Fast-path: directly probe companion/local proxy for Opus 160kbps (itag 251) and AAC 128kbps (itag 140)
    // without waiting on a separate /api/v1/videos/{video_id} round-trip.
    for (itag_val, label, sr, br) in [
        ("251", "WebM Opus 160kbps", 48000u32, 160u32),
        ("140", "AAC 128kbps", 44100u32, 128u32),
    ] {
        let local_proxy_url = format!(
            "{}/latest_version?id={}&itag={}&local=true",
            base,
            urlencoding::encode(&video_id),
            itag_val
        );
        if let Some(resolved) = probe_companion_stream_url(
            client,
            &local_proxy_url,
            probe_timeout_secs,
            source_name,
            label,
            sr,
            br,
        )
        .await
        {
            return Some(resolved);
        }
    }

    if !is_local_base {
        return None;
    }

    // Fallback for local Invidious instances that may expose non-standard adaptiveFormat itags
    let video_url = format!("{}/api/v1/videos/{}", base, video_id);
    let v_resp = client
        .get(&video_url)
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
        .ok()?;
    if !v_resp.status().is_success() {
        return None;
    }
    let v_json: serde_json::Value = v_resp.json().await.ok()?;
    let formats = v_json.get("adaptiveFormats")?.as_array()?;

    let mut audio_formats: Vec<_> = formats
        .iter()
        .filter(|f| {
            f.get("type")
                .and_then(|t| t.as_str())
                .map(|t| t.starts_with("audio"))
                .unwrap_or(false)
        })
        .collect();

    audio_formats.sort_by_key(|f| {
        f.get("bitrate")
            .and_then(|b| b.as_u64())
            .or_else(|| f.get("bitrate").and_then(|b| b.as_str()).and_then(|s| s.parse().ok()))
            .unwrap_or(0)
    });

    let best = audio_formats.last()?;
    let itag = best.get("itag").and_then(|v| {
        v.as_str()
            .map(|s| s.to_string())
            .or_else(|| v.as_u64().map(|n| n.to_string()))
            .or_else(|| v.as_i64().map(|n| n.to_string()))
    })?;

    let bitrate_bps = best
        .get("bitrate")
        .and_then(|b| b.as_u64().or_else(|| b.as_str().and_then(|s| s.parse().ok())))
        .unwrap_or(160_000);
    let bitrate_kbps = ((bitrate_bps / 1000) as u32).max(128);
    let mime_type = best
        .get("type")
        .and_then(|t| t.as_str())
        .unwrap_or("audio/webm");
    let is_opus = mime_type.contains("webm") || mime_type.contains("opus");
    let format_label = if is_opus {
        format!("WebM Opus {}kbps", bitrate_kbps)
    } else {
        format!("AAC {}kbps", bitrate_kbps)
    };
    let sample_rate = best
        .get("audioSampleRate")
        .and_then(|sr| sr.as_u64().or_else(|| sr.as_str().and_then(|s| s.parse().ok())))
        .map(|sr| sr as u32)
        .unwrap_or(if is_opus { 48000 } else { 44100 });

    let local_proxy_url = format!(
        "{}/latest_version?id={}&itag={}&local=true",
        base,
        urlencoding::encode(&video_id),
        urlencoding::encode(&itag)
    );
    probe_companion_stream_url(
        client,
        &local_proxy_url,
        3,
        source_name,
        &format_label,
        sample_rate,
        bitrate_kbps,
    )
    .await
}

async fn resolve_via_youtube_innertube_and_companion(
    client: &reqwest::Client,
    artist: &str,
    title: &str,
) -> Option<ResolvedStream> {
    let clean_title = crate::engines::soulseek::clean_query_title(title);
    let primary_artist = extract_primary_artist(artist);
    let query = if !primary_artist.is_empty() {
        format!("{} {} Official Audio", primary_artist, clean_title)
    } else {
        format!("{} Official Audio", clean_title)
    };

    let body = serde_json::json!({
        "context": {
            "client": {
                "clientName": "WEB",
                "clientVersion": "2.20260101.00.00"
            }
        },
        "query": query.trim()
    });

    let resp = client
        .post("https://www.youtube.com/youtubei/v1/search?prettyPrint=false")
        .timeout(std::time::Duration::from_millis(3500))
        .json(&body)
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let text = resp.text().await.ok()?;
    let video_ids = extract_innertube_video_ids(&text);

    for vid in video_ids.into_iter().take(2) {
        let companion_urls = [
            format!(
                "https://yt.chocolatemoo53.com/latest_version?id={}&itag=251&local=true",
                urlencoding::encode(&vid)
            ),
            format!(
                "https://eu.yt.chocolatemoo53.com/latest_version?id={}&itag=251&local=true",
                urlencoding::encode(&vid)
            ),
            format!(
                "https://yt-comp1.chocolatemoo53.com/companion/latest_version?id={}&itag=251&local=true",
                urlencoding::encode(&vid)
            ),
            format!(
                "https://eu.yt-comp5.chocolatemoo53.com/companion/latest_version?id={}&itag=251&local=true",
                urlencoding::encode(&vid)
            ),
        ];

        for proxy_url in &companion_urls {
            if let Some(resolved) = probe_companion_stream_url(
                client,
                proxy_url,
                6,
                "invidious-companion",
                "WebM Opus 160kbps",
                48000,
                160,
            )
            .await
            {
                return Some(resolved);
            }
        }
    }

    None
}

async fn resolve_via_monochrome_tracks(
    client: &reqwest::Client,
    artist: &str,
    title: &str,
) -> Option<ResolvedStream> {
    let clean_title = crate::engines::soulseek::clean_query_title(title);
    let primary_artist = extract_primary_artist(artist);
    let norm_primary = normalize_match_text(&primary_artist);

    let search_q = if !primary_artist.is_empty() {
        format!("{} {}", primary_artist, clean_title)
    } else {
        clean_title.clone()
    };

    let search_url = format!(
        "https://tracks.monochrome.st/search?q={}",
        urlencoding::encode(search_q.trim())
    );

    let resp = client
        .get(&search_url)
        .timeout(std::time::Duration::from_millis(2500))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }

    let json: serde_json::Value = resp.json().await.ok()?;
    let tracks = json.get("tracks")?.as_array()?;

    let mut best_candidate: Option<(i32, String)> = None;

    for item in tracks {
        if item.get("playable").and_then(|v| v.as_bool()) == Some(false) {
            continue;
        }

        let track_id = item
            .get("trackId")
            .or_else(|| item.get("id"))
            .and_then(|v| {
                v.as_str()
                    .map(|s| s.trim().to_string())
                    .or_else(|| v.as_u64().map(|n| n.to_string()))
                    .or_else(|| v.as_i64().map(|n| n.to_string()))
            })
            .filter(|s| !s.is_empty());
        let Some(track_id) = track_id else {
            continue;
        };

        let cand_title = item.get("title").and_then(|v| v.as_str()).unwrap_or("");
        let Some(mut score) = score_track_title_match(title, &clean_title, cand_title) else {
            continue;
        };

        let artist_names: Vec<&str> = item
            .get("artistNames")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|a| a.as_str()).collect())
            .unwrap_or_default();

        if !norm_primary.is_empty() {
            let any_match = artist_names
                .iter()
                .any(|ca| artist_matches_primary(&norm_primary, ca));
            if !any_match {
                continue;
            }
            if let Some(first_artist) = artist_names.first() {
                if normalize_match_text(first_artist) == norm_primary {
                    score += 20;
                }
            }
        }

        if best_candidate
            .as_ref()
            .map(|(best_score, _)| score > *best_score)
            .unwrap_or(true)
        {
            best_candidate = Some((score, track_id));
        }
    }

    let (_, best_id) = best_candidate?;
    let track_url = format!("https://tracks.monochrome.st/track/{}", best_id);

    // Quick 42-byte magic-header probe to distinguish genuine FLAC (and read STREAMINFO) vs AAC/MP4
    if let Ok(probe_resp) = client
        .get(&track_url)
        .header(reqwest::header::RANGE, "bytes=0-41")
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
    {
        if !probe_resp.status().is_success()
            && probe_resp.status() != reqwest::StatusCode::PARTIAL_CONTENT
        {
            return None;
        }
        if let Ok(head_bytes) = probe_resp.bytes().await {
            if head_bytes.len() >= 4 && &head_bytes[0..4] == b"fLaC" {
                let mut sample_rate = 44100u32;
                let mut bit_depth = 16u8;
                // FLAC block 0 (STREAMINFO): 4-byte 'fLaC' + 4-byte block header + 34-byte STREAMINFO
                // Bytes 18..22 contain: 20-bit sample_rate, 3-bit (channels-1), 5-bit (bits_per_sample-1)
                if head_bytes.len() >= 22 && (head_bytes[4] & 0x7F) == 0 {
                    let sr = ((head_bytes[18] as u32) << 12)
                        | ((head_bytes[19] as u32) << 4)
                        | ((head_bytes[20] as u32) >> 4);
                    let bps = (((head_bytes[20] & 0x01) << 4) | (head_bytes[21] >> 4)) + 1;
                    if (8000..=384000).contains(&sr) {
                        sample_rate = sr;
                    }
                    if matches!(bps, 16 | 24 | 32) {
                        bit_depth = bps;
                    }
                }
                let bitrate = if bit_depth > 16 || sample_rate > 48000 {
                    2400
                } else {
                    1411
                };
                return Some(ResolvedStream {
                    url: track_url,
                    source: "monochrome-lossless-flac".to_string(),
                    format_label: format!(
                        "FLAC ({}-bit/{:.1}kHz)",
                        bit_depth,
                        sample_rate as f32 / 1000.0
                    ),
                    bit_depth,
                    sample_rate,
                    bitrate,
                });
            }
        }
    }

    Some(ResolvedStream {
        url: track_url,
        source: "monochrome-aac-320".to_string(),
        format_label: "AAC 320kbps".to_string(),
        bit_depth: 16,
        sample_rate: 44100,
        bitrate: 320,
    })
}

#[derive(Clone)]
pub struct StreamResolver {
    cache: Arc<RwLock<HashMap<String, (ResolvedStream, std::time::Instant)>>>,
    in_flight: Arc<RwLock<HashMap<String, broadcast::Sender<Option<ResolvedStream>>>>>,
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
            .user_agent("Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0")
            .build()
            .unwrap_or_default();
        Self {
            cache: Arc::new(RwLock::new(HashMap::new())),
            in_flight: Arc::new(RwLock::new(HashMap::new())),
            http_client,
        }
    }

    fn make_key(artist: &str, title: &str) -> String {
        format!(
            "{} - {}",
            artist.to_lowercase().trim(),
            title.to_lowercase().trim()
        )
    }

    /// Evict a stale cached stream URL (e.g., when upstream returns 403/404)
    pub async fn invalidate(&self, artist: &str, title: &str) {
        let key = Self::make_key(artist, title);
        let mut c = self.cache.write().await;
        if c.remove(&key).is_some() {
            info!("Invalidated stale stream cache entry for '{}'", key);
        }
    }

    /// Clear all cached stream entries (e.g., when cookies.txt is updated or removed)
    pub async fn clear_cache(&self) {
        let mut c = self.cache.write().await;
        let count = c.len();
        c.clear();
        if count > 0 {
            info!("Cleared {} cached stream entries", count);
        }
    }

    /// Convenience wrapper returning only the resolved stream URL string
    pub async fn resolve_full_stream(&self, artist: &str, title: &str) -> Option<String> {
        self.resolve_full_stream_meta(artist, title)
            .await
            .map(|r| r.url)
    }

    /// Resolve 100% full-length audio stream + format metadata (with singleflight deduplication)
    pub async fn resolve_full_stream_meta(
        &self,
        artist: &str,
        title: &str,
    ) -> Option<ResolvedStream> {
        let key = Self::make_key(artist, title);

        // 1. Check in-memory cache (valid for 45 minutes)
        {
            let c = self.cache.read().await;
            if let Some((resolved, timestamp)) = c.get(&key) {
                if timestamp.elapsed().as_secs() < STREAM_CACHE_TTL_SECS {
                    return Some(resolved.clone());
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
                drop(in_flight);

                return self.resolve_as_leader(key, artist, title).await;
            }
        };

        match rx.recv().await {
            Ok(result) => result,
            Err(_) => {
                let c = self.cache.read().await;
                c.get(&key).map(|(r, _)| r.clone())
            }
        }
    }

    async fn finish_leader(&self, key: &str, result: Option<ResolvedStream>) -> Option<ResolvedStream> {
        if let Some(ref resolved) = result {
            let mut c = self.cache.write().await;
            c.insert(key.to_string(), (resolved.clone(), std::time::Instant::now()));
        }
        let mut in_flight = self.in_flight.write().await;
        if let Some(tx) = in_flight.remove(key) {
            let _ = tx.send(result.clone());
        }
        result
    }

    async fn resolve_as_leader(
        &self,
        key: String,
        artist: &str,
        title: &str,
    ) -> Option<ResolvedStream> {
        info!("Resolving full-length audio stream (singleflight leader): {}", key);

        // Tier 1: Local, configured, or verified companion-backed Invidious instances
        let mut invidious_bases: Vec<String> = Vec::new();
        if let Ok(env_url) = std::env::var("INVIDIOUS_URL") {
            let trimmed = env_url.trim().trim_end_matches('/').to_string();
            if !trimmed.is_empty() {
                invidious_bases.push(trimmed);
            }
        }
        for default_base in &[
            "http://127.0.0.1:7601",
            "http://localhost:7601",
            "http://host.docker.internal:7601",
            "https://yt.chocolatemoo53.com",
            "https://eu.yt.chocolatemoo53.com",
        ] {
            if !invidious_bases.iter().any(|b| b == default_base) {
                invidious_bases.push((*default_base).to_string());
            }
        }

        for base in &invidious_bases {
            if let Some(resolved) = resolve_via_invidious(&self.http_client, base, artist, title).await {
                info!(
                    "Full-length audio stream resolved via Invidious ({}) for {}",
                    base, key
                );
                return self.finish_leader(&key, Some(resolved)).await;
            }
        }

        // Tier 1b: Direct YouTube Innertube search + Invidious Companion stream pool
        if let Some(resolved) =
            resolve_via_youtube_innertube_and_companion(&self.http_client, artist, title).await
        {
            info!(
                "Full-length audio stream resolved via YouTube Innertube + Companion pool for {}",
                key
            );
            return self.finish_leader(&key, Some(resolved)).await;
        }

        // Tier 2: Zero-Auth 320kbps AAC Faststart via tracks.monochrome.st
        if let Some(resolved) = resolve_via_monochrome_tracks(&self.http_client, artist, title).await {
            info!(
                "Full-length 320kbps AAC stream resolved via tracks.monochrome.st for {}",
                key
            );
            return self.finish_leader(&key, Some(resolved)).await;
        }

        // Tier 3: Standalone yt-dlp binary (with Node.js runtime & optional cookies.txt)
        let yt_binary = match find_yt_dlp() {
            Some(p) => Some(p),
            None => bootstrap_yt_dlp().await,
        };

        if let Some(yt_binary) = yt_binary {
            let clean_title = crate::engines::soulseek::clean_query_title(title);
            let primary_artist = extract_primary_artist(artist);
            let query = format!("ytsearch1:{} {}", primary_artist, clean_title);

            let mut cmd = tokio::process::Command::new(&yt_binary);
            cmd.args([
                &query,
                "--get-url",
                "-f",
                "ba[acodec=opus]/ba[ext=m4a]/ba/b",
                "--no-warnings",
                "--no-playlist",
                "--no-check-certificates",
                "--socket-timeout",
                "10",
            ]);

            if let Some(node_path) = find_node_binary() {
                cmd.args(["--js-runtimes", &format!("node:{}", node_path.display())]);
            }

            if let Some(cookies_path) = find_cookies_file() {
                cmd.arg("--cookies").arg(&cookies_path);
            }

            let base_tmp = find_writable_tmp();
            cmd.env("TMPDIR", &base_tmp);

            match cmd.output().await {
                Ok(output) if output.status.success() => {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    if let Some(url) = stdout.lines().find(|l| l.starts_with("http")) {
                        let full_url = url.trim().to_string();
                        let is_m4a = full_url.contains("mime=audio%2Fmp4")
                            || full_url.contains("mime=audio/mp4")
                            || full_url.ends_with(".m4a");
                        let resolved = if is_m4a {
                            ResolvedStream {
                                url: full_url,
                                source: "web-stream-aac".to_string(),
                                format_label: "AAC 128kbps".to_string(),
                                bit_depth: 16,
                                sample_rate: 44100,
                                bitrate: 128,
                            }
                        } else {
                            ResolvedStream {
                                url: full_url,
                                source: "web-stream-opus".to_string(),
                                format_label: "WebM Opus 160kbps".to_string(),
                                bit_depth: 16,
                                sample_rate: 48000,
                                bitrate: 160,
                            }
                        };
                        info!(
                            "Full-length audio stream resolved successfully with {:?}: {}",
                            yt_binary, key
                        );
                        return self.finish_leader(&key, Some(resolved)).await;
                    }
                }
                Ok(output) => {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    warn!("yt-dlp ({:?}) failed for {}: {}", yt_binary, key, stderr);
                }
                Err(e) => {
                    warn!(
                        "Stream extractor ({:?}) execution error for {}: {}",
                        yt_binary, key, e
                    );
                }
            }
        }

        warn!("All full-length stream resolvers failed for {}", key);
        self.finish_leader(&key, None).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_monochrome_title_and_artist_scoring() {
        let clean = crate::engines::soulseek::clean_query_title("Get Lucky");
        // Original matches album track with feat clause
        let s1 = score_track_title_match(
            "Get Lucky",
            &clean,
            "Get Lucky (feat. Pharrell Williams and Nile Rodgers)",
        );
        assert!(s1.is_some());

        // Original rejects remix
        let s_remix = score_track_title_match("Get Lucky", &clean, "Get Lucky - Daft Punk Remix");
        assert!(s_remix.is_none());

        // Remix request matches remix candidate and rejects plain original
        let clean_rmx = crate::engines::soulseek::clean_query_title("Get Lucky (Daft Punk Remix)");
        assert!(score_track_title_match(
            "Get Lucky (Daft Punk Remix)",
            &clean_rmx,
            "Get Lucky - Daft Punk Remix"
        )
        .is_some());
        assert!(score_track_title_match(
            "Get Lucky (Daft Punk Remix)",
            &clean_rmx,
            "Get Lucky"
        )
        .is_none());

        // Words like "Alive" or "Undercover" must not falsely trigger "live" / "cover" rejection
        assert!(score_track_title_match("Alive", "Alive", "Alive").is_some());
        assert!(score_track_title_match("Undercover", "Undercover", "Undercover").is_some());

        // Artist matching
        let norm_daft = normalize_match_text(&extract_primary_artist("Daft Punk, Pharrell Williams"));
        assert_eq!(norm_daft, "daft punk");
        assert!(artist_matches_primary(&norm_daft, "Daft Punk"));
        assert!(!artist_matches_primary(&norm_daft, "Random Tribute Band"));
    }

    #[test]
    fn test_select_invidious_video_id_filters_previews_and_scores_matches() {
        let items: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
                {
                    "type": "video",
                    "videoId": "short_preview",
                    "title": "Daft Punk - Get Lucky (30s Preview)",
                    "author": "Daft Punk",
                    "lengthSeconds": 30,
                    "liveNow": false
                },
                {
                    "type": "video",
                    "videoId": "live_stream",
                    "title": "Daft Punk - Get Lucky (Official Audio)",
                    "author": "Daft Punk",
                    "lengthSeconds": 248,
                    "liveNow": true
                },
                {
                    "type": "video",
                    "videoId": "unrelated_vid",
                    "title": "Top 10 Pop Songs 2024",
                    "author": "Music Channel",
                    "lengthSeconds": 600,
                    "liveNow": false
                },
                {
                    "type": "video",
                    "videoId": "5NV6Rdv1a3I",
                    "title": "Daft Punk - Get Lucky (Official Audio) ft. Pharrell Williams, Nile Rodgers",
                    "author": "Daft Punk",
                    "lengthSeconds": 248,
                    "liveNow": false
                }
            ]"#,
        )
        .unwrap();

        let selected = select_invidious_video_id(&items, "Daft Punk", "Get Lucky");
        assert_eq!(selected.as_deref(), Some("5NV6Rdv1a3I"));
    }

    #[test]
    fn test_extract_innertube_video_ids() {
        let raw_json = r#"{"contents":{"videoRenderer":{"videoId":"4NRXx6U8ABQ","title":"Blinding Lights"},"dup":{"videoId":"4NRXx6U8ABQ"},"second":{"videoId":"5NV6Rdv1a3I"},"shortInvalid":{"videoId":"too_short"}}}"#;
        let ids = extract_innertube_video_ids(raw_json);
        assert_eq!(
            ids,
            vec!["4NRXx6U8ABQ".to_string(), "5NV6Rdv1a3I".to_string()]
        );
    }
}
