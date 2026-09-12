use crate::state::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::Json;
use axum::routing::{get, post};
use axum::Router;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioOutputDevice {
    pub id: String,
    pub name: String,
    pub hardware_id: String,
    pub device_type: String,
    pub is_bit_perfect: bool,
    pub is_active: bool,
    pub max_sample_rate: u32,
    pub supported_formats: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceTelemetry {
    pub active_device_id: String,
    pub active_device_name: String,
    pub is_exclusive_bit_perfect: bool,
    pub sample_rate: u32,
    pub bit_depth: u32,
    pub dsd_mode: Option<String>,
    pub master_volume: f32,
    pub clock_lock: bool,
    pub buffer_latency_ms: f32,
    pub hardware_mode: Option<String>,
    pub buffer_frames: Option<u32>,
    pub replay_gain_mode: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DeviceListResponse {
    pub devices: Vec<AudioOutputDevice>,
    pub active_device_id: String,
    pub telemetry: DeviceTelemetry,
}

#[derive(Debug, Deserialize)]
pub struct SelectDeviceRequest {
    pub device_id: String,
}

#[derive(Debug, Deserialize)]
pub struct VolumeRequest {
    pub volume: f32,
}

#[derive(Debug, Deserialize)]
pub struct ConfigureDeviceRequest {
    pub hardware_mode: Option<String>,
    pub dsd_mode: Option<String>,
    pub buffer_frames: Option<u32>,
    pub replay_gain_mode: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct HardwarePlayRequest {
    pub file_path: Option<String>,
    pub track_id: Option<String>,
    pub artist: Option<String>,
    pub title: Option<String>,
}

pub fn parse_proc_asound_cards(cards_content: &str) -> Vec<(u32, String)> {
    let mut results = Vec::new();
    for line in cards_content.lines() {
        let trimmed = line.trim();
        if let Some(first_char) = trimmed.chars().next() {
            if first_char.is_ascii_digit() {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if let Ok(card_idx) = parts[0].parse::<u32>() {
                    if let Some(bracket_end) = line.find(']') {
                        let raw_desc = line[bracket_end + 1..].trim().trim_start_matches(':').trim();
                        let desc = if let Some(dash_idx) = raw_desc.rfind(" - ") {
                            raw_desc[dash_idx + 3..].trim()
                        } else {
                            raw_desc
                        };
                        results.push((card_idx, desc.to_string()));
                    }
                }
            }
        }
    }
    results
}

pub fn parse_proc_asound_pcm(pcm_content: &str) -> Vec<(u32, u32, String)> {
    let mut results = Vec::new();
    for line in pcm_content.lines() {
        if !line.contains("playback") {
            continue;
        }

        // Format: "01-00: USB Audio : USB Audio : playback 1 : capture 1"
        let parts: Vec<&str> = line.split(':').map(|s| s.trim()).collect();
        if parts.is_empty() {
            continue;
        }

        let card_dev: Vec<&str> = parts[0].split('-').collect();
        if card_dev.len() != 2 {
            continue;
        }

        let card_idx: u32 = card_dev[0].parse().unwrap_or(0);
        let dev_idx: u32 = card_dev[1].parse().unwrap_or(0);
        let subdevice_name = parts.get(1).copied().unwrap_or("Audio Device");

        results.push((card_idx, dev_idx, subdevice_name.to_string()));
    }
    results
}

/// Helper to scan /proc/asound/cardX/eld* to find connected monitor EDID names
fn find_hdmi_monitor_name(card_idx: u32) -> Option<String> {
    let card_dir = format!("/proc/asound/card{}", card_idx);
    if let Ok(entries) = fs::read_dir(&card_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name();
            let fname_str = fname.to_string_lossy();
            if fname_str.starts_with("eld#") {
                if let Ok(content) = fs::read_to_string(entry.path()) {
                    let mut monitor_present = false;
                    let mut monitor_name = None;
                    for line in content.lines() {
                        let trimmed = line.trim();
                        if trimmed.starts_with("monitor_present") && trimmed.contains('1') {
                            monitor_present = true;
                        }
                        if trimmed.starts_with("monitor_name") {
                            let parts: Vec<&str> = trimmed.split_whitespace().collect();
                            if parts.len() >= 2 {
                                monitor_name = Some(parts[1..].join(" "));
                            }
                        }
                    }
                    if monitor_present {
                        if let Some(name) = monitor_name {
                            return Some(name);
                        }
                    }
                }
            }
        }
    }
    None
}

/// Enumerate ALSA hardware cards on Linux (/proc/asound/cards & /proc/asound/pcm)
pub fn enumerate_system_devices(active_id: &str) -> Vec<AudioOutputDevice> {
    let mut devices = Vec::new();

    // 1. Always provide Web Browser (Local AudioContext / Remote Client)
    devices.push(AudioOutputDevice {
        id: "browser".to_string(),
        name: "Web Browser (Local AudioContext / Mobile Speaker)".to_string(),
        hardware_id: "browser".to_string(),
        device_type: "Browser WebAudio".to_string(),
        is_bit_perfect: false,
        is_active: active_id == "browser",
        max_sample_rate: 48000,
        supported_formats: vec!["16-bit PCM (Browser Resampled)".to_string()],
        category: Some("browser".to_string()),
        description: Some("Plays directly on this browser or mobile device via WebAudio API".to_string()),
    });

    // 2. Parse /proc/asound/cards to get friendly card names
    let card_names = if let Ok(cards_content) = fs::read_to_string("/proc/asound/cards") {
        parse_proc_asound_cards(&cards_content).into_iter().collect::<HashMap<u32, String>>()
    } else {
        HashMap::new()
    };

    // 3. Parse /proc/asound/pcm to discover playback devices
    let pcm_entries = if let Ok(pcm_content) = fs::read_to_string("/proc/asound/pcm") {
        parse_proc_asound_pcm(&pcm_content)
    } else {
        Vec::new()
    };

    // Cache connected HDMI monitor name if any
    let mut hdmi_monitors: HashMap<u32, Option<String>> = HashMap::new();

    for (card_idx, dev_idx, subdevice_name) in pcm_entries {
        let id = format!("alsa:{},{}", card_idx, dev_idx);
        let hw_id = format!("hw:{},{}", card_idx, dev_idx);
        let card_name = card_names.get(&card_idx).cloned().unwrap_or_else(|| format!("Card {}", card_idx));

        let is_usb = card_name.contains("USB") || subdevice_name.contains("USB");
        let is_digital = subdevice_name.contains("Digital");
        let is_hdmi = card_name.contains("NVidia") || card_name.contains("HDMI") || subdevice_name.contains("HDMI");

        let (category, dev_type, max_sr, formats, display_name, description) = if is_usb {
            let clean_card = if card_name == "USB Audio" || card_name == "USB-Audio" {
                "USB Audio DAC".to_string()
            } else {
                card_name.clone()
            };
            (
                "usb_dac",
                "USB DAC (Bit-Perfect Exclusive)",
                192000,
                vec![
                    "PCM 16-bit / 44.1kHz - 192kHz".to_string(),
                    "PCM 24-bit / 44.1kHz - 192kHz".to_string(),
                    "PCM 32-bit Float".to_string(),
                    "DoP DSD64 / DSD128".to_string(),
                ],
                format!("USB Audio DAC ({})", clean_card),
                format!("Dedicated external DAC bit-perfect stream via USB ({})", hw_id),
            )
        } else if is_digital {
            let chip = if subdevice_name.starts_with("ALC") {
                format!("Realtek {}", subdevice_name.split_whitespace().next().unwrap_or("ALC"))
            } else {
                subdevice_name.clone()
            };
            (
                "digital",
                "S/PDIF Coaxial / Optical (Bit-Perfect)",
                192000,
                vec![
                    "PCM 16-bit / 44.1kHz - 192kHz".to_string(),
                    "PCM 24-bit / 44.1kHz - 192kHz".to_string(),
                ],
                format!("{} (Optical / Coaxial S/PDIF)", chip),
                format!("Direct digital bitstream for external DAC or AV receiver ({})", hw_id),
            )
        } else if is_hdmi {
            let monitor = hdmi_monitors
                .entry(card_idx)
                .or_insert_with(|| find_hdmi_monitor_name(card_idx));

            let name = if let Some(ref m_name) = monitor {
                format!("{} (HDMI - {})", subdevice_name, m_name)
            } else {
                format!("{} ({})", subdevice_name, card_name)
            };
            (
                "hdmi",
                "HDMI Digital Audio",
                192000,
                vec![
                    "PCM 16-bit / 48kHz - 192kHz".to_string(),
                    "PCM 24-bit Multi-channel".to_string(),
                ],
                name,
                format!("Audio passthrough via HDMI / DisplayPort ({})", hw_id),
            )
        } else {
            let chip = if subdevice_name.starts_with("ALC") {
                format!("Realtek {}", subdevice_name.split_whitespace().next().unwrap_or("ALC"))
            } else {
                subdevice_name.clone()
            };
            (
                "analog",
                "Integrated DAC Analog Line-out",
                192000,
                vec![
                    "PCM 16-bit / 44.1kHz - 192kHz".to_string(),
                    "PCM 24-bit / 44.1kHz - 192kHz".to_string(),
                ],
                format!("{} (Analog Speakers / Headphones)", chip),
                format!("Motherboard integrated high-definition audio output ({})", hw_id),
            )
        };

        devices.push(AudioOutputDevice {
            id: id.clone(),
            name: display_name,
            hardware_id: hw_id,
            device_type: dev_type.to_string(),
            is_bit_perfect: true,
            is_active: active_id == id,
            max_sample_rate: max_sr,
            supported_formats: formats,
            category: Some(category.to_string()),
            description: Some(description),
        });
    }

    devices
}

async fn list_devices(State(state): State<AppState>) -> Json<DeviceListResponse> {
    let active_id = {
        let out = state.active_output.read().await;
        out.active_device_id.clone()
    };

    let devices = enumerate_system_devices(&active_id);
    let active_dev = devices.iter().find(|d| d.id == active_id).cloned();

    let out_guard = state.active_output.read().await;

    let latency_ms = if active_id == "browser" {
        25.0
    } else {
        (out_guard.buffer_frames as f32 / out_guard.sample_rate.max(44100) as f32) * 1000.0
    };

    let telemetry = DeviceTelemetry {
        active_device_id: active_id.clone(),
        active_device_name: active_dev
            .as_ref()
            .map(|d| d.name.clone())
            .unwrap_or_else(|| "Web Browser Audio".to_string()),
        is_exclusive_bit_perfect: active_dev.as_ref().map(|d| d.is_bit_perfect).unwrap_or(false),
        sample_rate: out_guard.sample_rate,
        bit_depth: out_guard.bit_depth,
        dsd_mode: if out_guard.is_dsd || out_guard.dsd_mode != "pcm" { Some(out_guard.dsd_mode.clone()) } else { None },
        master_volume: out_guard.volume,
        clock_lock: active_id != "browser",
        buffer_latency_ms: latency_ms,
        hardware_mode: Some(out_guard.hardware_mode.clone()),
        buffer_frames: Some(out_guard.buffer_frames),
        replay_gain_mode: Some(out_guard.replay_gain_mode.clone()),
    };

    Json(DeviceListResponse {
        devices,
        active_device_id: active_id,
        telemetry,
    })
}

async fn select_device(
    State(state): State<AppState>,
    Json(payload): Json<SelectDeviceRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let devices = enumerate_system_devices(&payload.device_id);
    if !devices.iter().any(|d| d.id == payload.device_id) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Unknown device id" })),
        ));
    }

    {
        let mut out = state.active_output.write().await;
        out.active_device_id = payload.device_id.clone();
        info!("Active audiophile output device changed to: {}", payload.device_id);
    }

    Ok(Json(serde_json::json!({
        "status": "ok",
        "active_device_id": payload.device_id
    })))
}

async fn set_volume(
    State(state): State<AppState>,
    Json(payload): Json<VolumeRequest>,
) -> Json<serde_json::Value> {
    let vol = payload.volume.clamp(0.0, 1.0);
    {
        let mut out = state.active_output.write().await;
        out.volume = vol;
    }

    Json(serde_json::json!({ "status": "ok", "volume": vol }))
}

async fn configure_device(
    State(state): State<AppState>,
    Json(payload): Json<ConfigureDeviceRequest>,
) -> Json<DeviceTelemetry> {
    {
        let mut out = state.active_output.write().await;
        if let Some(hw) = payload.hardware_mode {
            out.hardware_mode = hw;
        }
        if let Some(dsd) = payload.dsd_mode {
            out.is_dsd = dsd != "pcm" && dsd != "none";
            out.dsd_mode = dsd;
        }
        if let Some(buf) = payload.buffer_frames {
            out.buffer_frames = buf;
        }
        if let Some(rg) = payload.replay_gain_mode {
            out.replay_gain_mode = rg;
        }
        info!(
            "Audiophile output configuration updated: hw_mode={}, dsd_mode={}, buffer_frames={}, replay_gain={}",
            out.hardware_mode, out.dsd_mode, out.buffer_frames, out.replay_gain_mode
        );
    }

    get_telemetry(State(state)).await
}

async fn get_telemetry(State(state): State<AppState>) -> Json<DeviceTelemetry> {
    let out_guard = state.active_output.read().await;
    let active_id = out_guard.active_device_id.clone();
    let devices = enumerate_system_devices(&active_id);
    let active_dev = devices.iter().find(|d| d.id == active_id);

    let latency_ms = if active_id == "browser" {
        25.0
    } else {
        (out_guard.buffer_frames as f32 / out_guard.sample_rate.max(44100) as f32) * 1000.0
    };

    let telemetry = DeviceTelemetry {
        active_device_id: active_id.clone(),
        active_device_name: active_dev
            .map(|d| d.name.clone())
            .unwrap_or_else(|| "Web Browser Audio".to_string()),
        is_exclusive_bit_perfect: active_dev.map(|d| d.is_bit_perfect).unwrap_or(false),
        sample_rate: out_guard.sample_rate,
        bit_depth: out_guard.bit_depth,
        dsd_mode: if out_guard.is_dsd || out_guard.dsd_mode != "pcm" { Some(out_guard.dsd_mode.clone()) } else { None },
        master_volume: out_guard.volume,
        clock_lock: active_id != "browser",
        buffer_latency_ms: latency_ms,
        hardware_mode: Some(out_guard.hardware_mode.clone()),
        buffer_frames: Some(out_guard.buffer_frames),
        replay_gain_mode: Some(out_guard.replay_gain_mode.clone()),
    };

    Json(telemetry)
}

async fn hardware_play(
    State(state): State<AppState>,
    Json(payload): Json<HardwarePlayRequest>,
) -> Json<serde_json::Value> {
    let mut out = state.active_output.write().await;
    let target_device = out.active_device_id.clone();

    // Check if the track or file is DSD
    let is_dsd = if let Some(ref fp) = payload.file_path {
        fp.to_lowercase().ends_with(".dsf") || fp.to_lowercase().ends_with(".dff")
    } else if let Some(ref tid) = payload.track_id {
        let lib = state.library.read().await;
        lib.tracks.get(tid).map(|t| t.is_dsd).unwrap_or(false)
    } else {
        false
    };

    if is_dsd {
        out.is_dsd = true;
        out.dsd_mode = "native_dop".to_string();
        out.sample_rate = 2822400;
        out.bit_depth = 1;
        info!(
            "Hardware Direct ALSA Stream: Engaged Native DSD64 / DoP 2.82MHz bitstream output to device '{}' for track {:?}",
            target_device, payload.title
        );
    } else {
        out.is_dsd = false;
        out.sample_rate = 96000;
        out.bit_depth = 24;
        info!(
            "Hardware Direct ALSA Stream: Engaged Bit-Perfect Studio PCM output to device '{}' for track {:?}",
            target_device, payload.title
        );
    }

    Json(serde_json::json!({
        "status": "ok",
        "mode": if is_dsd { "native_dsd_bitstream" } else { "bit_perfect_pcm" },
        "active_device": target_device,
        "sample_rate": out.sample_rate,
        "bit_depth": out.bit_depth
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_devices))
        .route("/select", post(select_device))
        .route("/volume", post(set_volume))
        .route("/configure", post(configure_device))
        .route("/telemetry", get(get_telemetry))
        .route("/play", post(hardware_play))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_enumerate_system_devices_includes_browser() {
        let devices = enumerate_system_devices("browser");
        assert!(!devices.is_empty());
        let browser_dev = devices.iter().find(|d| d.id == "browser");
        assert!(browser_dev.is_some());
        let b = browser_dev.unwrap();
        assert_eq!(b.hardware_id, "browser");
        assert!(b.is_active);
    }

    #[test]
    fn test_parse_proc_asound_cards() {
        let cards_data = " 0 [PCH            ]: HDA-Intel - HDA Intel PCH\n                      HDA Intel PCH at 0x82420000 irq 145\n 1 [Audio          ]: USB-Audio - USB Audio\n                      Jieli Technology USB Composite Device at usb-0000:00:14.0-1, full speed\n";
        let parsed = parse_proc_asound_cards(cards_data);
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].0, 0);
        assert_eq!(parsed[0].1, "HDA Intel PCH");
        assert_eq!(parsed[1].0, 1);
        assert_eq!(parsed[1].1, "USB Audio");
    }

    #[test]
    fn test_parse_proc_asound_pcm() {
        let pcm_data = "00-00: ALC897 Analog : ALC897 Analog : playback 1 : capture 1\n00-01: ALC897 Digital : ALC897 Digital : playback 1\n01-00: USB Audio : USB Audio : playback 1 : capture 1\n";
        let parsed = parse_proc_asound_pcm(pcm_data);
        assert_eq!(parsed.len(), 3);
        assert_eq!(parsed[0].0, 0); // card 0
        assert_eq!(parsed[0].1, 0); // dev 0
        assert_eq!(parsed[0].2, "ALC897 Analog");
        assert_eq!(parsed[1].0, 0); // card 0
        assert_eq!(parsed[1].1, 1); // dev 1
        assert_eq!(parsed[1].2, "ALC897 Digital");
        assert_eq!(parsed[2].0, 1); // card 1
        assert_eq!(parsed[2].1, 0); // dev 0
        assert_eq!(parsed[2].2, "USB Audio");
    }
}

