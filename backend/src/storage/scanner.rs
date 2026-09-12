use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::{Accessor, TagExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub track_number: u32,
    pub duration: u32,
    pub year: Option<u32>,
    pub file_path: PathBuf,
    pub format: String,
    pub bit_depth: Option<u8>,
    pub sample_rate: Option<u32>,
    pub bitrate: Option<u32>,
    pub channels: Option<u8>,
    pub hires: bool,
    #[serde(default)]
    pub dr_score: Option<u8>,
    #[serde(default)]
    pub is_dsd: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryAlbum {
    pub id: String,
    pub name: String,
    pub artist: String,
    pub year: Option<u32>,
    pub track_count: usize,
    pub cover_path: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryArtist {
    pub id: String,
    pub name: String,
    pub album_count: usize,
    pub track_count: usize,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LibraryStore {
    pub tracks: HashMap<String, LibraryTrack>,
    pub albums: HashMap<String, LibraryAlbum>,
    pub artists: HashMap<String, LibraryArtist>,
    pub is_scanning: bool,
    #[serde(skip)]
    pub cached_tracks_json: Option<Arc<String>>,
}

pub type SharedLibrary = Arc<RwLock<LibraryStore>>;

pub fn new_library_store() -> SharedLibrary {
    Arc::new(RwLock::new(LibraryStore::default()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedFileRecord {
    pub mtime_sec: u64,
    pub size_bytes: u64,
    pub track: LibraryTrack,
}

pub type FileMetadataCache = HashMap<String, CachedFileRecord>;

pub fn get_cache_file_path() -> PathBuf {
    if let Ok(dir) = std::env::var("DATA_DIR") {
        return PathBuf::from(dir).join("scanner_cache.json");
    }
    if let Ok(cfg_path) = std::env::var("CONFIG_PATH") {
        let p = PathBuf::from(cfg_path);
        if let Some(parent) = p.parent().and_then(|p| p.parent()) {
            let var_dir = parent.join("var");
            if var_dir.exists() {
                return var_dir.join("scanner_cache.json");
            }
        }
    }
    PathBuf::from("./data/scanner_cache.json")
}

pub fn load_metadata_cache() -> FileMetadataCache {
    let path = get_cache_file_path();
    if let Ok(content) = std::fs::read_to_string(&path) {
        if let Ok(cache) = serde_json::from_str::<FileMetadataCache>(&content) {
            info!("Loaded scanner cache with {} tracks from {}", cache.len(), path.display());
            return cache;
        }
    }
    HashMap::new()
}

pub fn save_metadata_cache(cache: &FileMetadataCache) {
    let path = get_cache_file_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let temp_path = path.with_extension("tmp");
    if let Ok(serialized) = serde_json::to_string(cache) {
        if std::fs::write(&temp_path, serialized).is_ok() {
            let _ = std::fs::rename(temp_path, path);
        }
    }
}

pub fn find_sidecar_cover(parent_dir: &Path) -> Option<PathBuf> {
    if !parent_dir.exists() || !parent_dir.is_dir() {
        return None;
    }

    // 1. Check direct directory
    if let Some(found) = check_dir_for_cover(parent_dir) {
        return Some(found);
    }

    // 2. Check parent directory if subdisc (e.g. CD1, CD2, Disc 1, Mat A, Side B)
    let dir_name = parent_dir
        .file_name()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if dir_name.starts_with("cd")
        || dir_name.starts_with("disc")
        || dir_name.starts_with("disk")
        || dir_name.starts_with("mat ")
        || dir_name.starts_with("side")
        || dir_name.starts_with("part")
    {
        if let Some(grandparent) = parent_dir.parent() {
            if let Some(found) = check_dir_for_cover(grandparent) {
                return Some(found);
            }
        }
    }

    None
}

fn check_dir_for_cover(dir: &Path) -> Option<PathBuf> {
    // Fast path for exact common names first (case-sensitive)
    for name in &[
        "cover.jpg", "folder.jpg", "Cover.jpg", "Folder.jpg",
        "cover.png", "folder.png", "Cover.png", "Folder.png",
        "front.jpg", "Front.jpg", "front.png", "Front.png",
        "artwork.jpg", "albumart.jpg", "cover.jpeg", "folder.jpeg",
    ] {
        let p = dir.join(name);
        if p.exists() && p.is_file() {
            return Some(p);
        }
    }

    // Fallback: Case-insensitive scan of image files in directory
    if let Ok(entries) = std::fs::read_dir(dir) {
        let mut first_image = None;
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if matches!(ext_lower.as_str(), "jpg" | "jpeg" | "png" | "webp") {
                        let stem = p
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("")
                            .to_lowercase();
                        if stem.contains("cover")
                            || stem.contains("folder")
                            || stem.contains("front")
                            || stem.contains("artwork")
                            || stem.contains("album")
                            || stem.contains("scan")
                        {
                            return Some(p);
                        }
                        if first_image.is_none() {
                            first_image = Some(p);
                        }
                    }
                }
            }
        }
        return first_image;
    }

    None
}

pub fn scan_directory<P: AsRef<Path>>(root: P) -> (Vec<LibraryTrack>, Vec<LibraryAlbum>, Vec<LibraryArtist>) {
    let root_path = root.as_ref();
    if !root_path.exists() {
        return (Vec::new(), Vec::new(), Vec::new());
    }

    info!("Starting scan of directory: {}", root_path.display());
    let mut cache = load_metadata_cache();
    let initial_cache_len = cache.len();
    let mut cache_hits = 0usize;
    let mut cache_misses = 0usize;

    let mut tracks = Vec::new();
    let mut album_map: HashMap<String, (String, String, Option<u32>, Option<PathBuf>, usize)> = HashMap::new();
    let mut artist_tracks: HashMap<String, usize> = HashMap::new();

    for entry in WalkDir::new(root_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                let ext_lower = ext.to_lowercase();
                if matches!(
                    ext_lower.as_str(),
                    "flac" | "mp3" | "m4a" | "alac" | "ogg" | "wav" | "dsf" | "dff" | "ape" | "wv" | "aiff" | "aif"
                ) {
                    let path_str = path.to_string_lossy().to_string();
                    let metadata = entry.metadata().ok();
                    let mtime_sec = metadata
                        .as_ref()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    let size_bytes = metadata.as_ref().map(|m| m.len()).unwrap_or(0);

                    // Check if file is in cache with identical mtime and size
                    let track = if let Some(cached) = cache.get(&path_str) {
                        if cached.mtime_sec == mtime_sec && cached.size_bytes == size_bytes && mtime_sec > 0 {
                            cache_hits += 1;
                            Some(cached.track.clone())
                        } else {
                            None
                        }
                    } else {
                        None
                    };

                    let track = match track {
                        Some(t) => t,
                        None => {
                            cache_misses += 1;
                            if let Some(fresh) = inspect_audio_file(path, &ext_lower) {
                                cache.insert(
                                    path_str,
                                    CachedFileRecord {
                                        mtime_sec,
                                        size_bytes,
                                        track: fresh.clone(),
                                    },
                                );
                                fresh
                            } else {
                                continue;
                            }
                        }
                    };

                    let album_key = format!("{} - {}", track.artist, track.album);
                    let parent_dir = path.parent();
                    let cover_path = parent_dir.and_then(find_sidecar_cover);

                    let album_entry = album_map
                        .entry(album_key)
                        .or_insert((track.album.clone(), track.artist.clone(), track.year, cover_path.clone(), 0));
                    album_entry.4 += 1;
                    if album_entry.3.is_none() && cover_path.is_some() {
                        album_entry.3 = cover_path;
                    }

                    *artist_tracks.entry(track.artist.clone()).or_insert(0) += 1;
                    tracks.push(track);
                }
            }
        }
    }

    let mut albums = Vec::new();
    let mut artist_albums: HashMap<String, usize> = HashMap::new();

    for (key, (name, artist, year, cover_path, track_count)) in album_map {
        let album_id = format!("{:x}", md5::compute(key.as_bytes()));
        *artist_albums.entry(artist.clone()).or_insert(0) += 1;
        albums.push(LibraryAlbum {
            id: album_id,
            name,
            artist,
            year,
            track_count,
            cover_path,
        });
    }

    let mut artists = Vec::new();
    for (name, track_count) in artist_tracks {
        let artist_id = format!("{:x}", md5::compute(name.as_bytes()));
        let album_count = artist_albums.get(&name).copied().unwrap_or(0);
        artists.push(LibraryArtist {
            id: artist_id,
            name,
            album_count,
            track_count,
        });
    }

    // Save cache if there were new or updated files
    if cache_misses > 0 || cache.len() != initial_cache_len {
        info!(
            "Saving updated scanner cache: {} hits, {} misses/new (total {})",
            cache_hits,
            cache_misses,
            cache.len()
        );
        cache.retain(|p, _| Path::new(p).exists());
        save_metadata_cache(&cache);
    } else {
        info!("Scan completed with 100% cache hits ({})", cache_hits);
    }

    info!(
        "Scan completed: {} tracks, {} albums, {} artists",
        tracks.len(),
        albums.len(),
        artists.len()
    );

    (tracks, albums, artists)
}

pub fn update_audio_tags(
    file_path: &Path,
    title: Option<&str>,
    artist: Option<&str>,
    album: Option<&str>,
    year: Option<u32>,
    track_number: Option<u32>,
) -> Result<LibraryTrack, String> {
    let mut tagged_file = Probe::open(file_path)
        .map_err(|e| format!("Failed to open file: {}", e))?
        .read()
        .map_err(|e| format!("Failed to read file tags: {}", e))?;

    let tag_type = tagged_file.primary_tag_type();
    let tag = match tagged_file.tag_mut(tag_type) {
        Some(t) => t,
        None => {
            tagged_file.insert_tag(lofty::tag::Tag::new(tag_type));
            tagged_file.tag_mut(tag_type).unwrap()
        }
    };

    if let Some(t) = title {
        tag.set_title(t.to_string());
    }
    if let Some(a) = artist {
        tag.set_artist(a.to_string());
    }
    if let Some(al) = album {
        tag.set_album(al.to_string());
    }
    if let Some(y) = year {
        tag.insert_text(lofty::tag::ItemKey::Year, y.to_string());
    }
    if let Some(tr) = track_number {
        tag.set_track(tr);
    }

    tag.save_to_path(file_path, lofty::config::WriteOptions::default())
        .map_err(|e| format!("Failed to write tags to file: {}", e))?;

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let track = inspect_audio_file(file_path, &ext)
        .ok_or_else(|| "Failed to inspect file after update".to_string())?;

    // Update scanner cache
    let mut cache = load_metadata_cache();
    let meta = std::fs::metadata(file_path).ok();
    let mtime_sec = meta
        .as_ref()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
    cache.insert(
        file_path.to_string_lossy().to_string(),
        CachedFileRecord {
            mtime_sec,
            size_bytes,
            track: track.clone(),
        },
    );
    save_metadata_cache(&cache);

    Ok(track)
}

pub fn inspect_audio_file(path: &Path, format: &str) -> Option<LibraryTrack> {
    let tagged_file_opt = Probe::open(path).ok().and_then(|p| p.read().ok());
    let is_dsd = format == "dsf" || format == "dff";

    let (title, artist, album, track_number, year, tag_dr) = if let Some(ref tagged_file) = tagged_file_opt {
        let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());
        if let Some(t) = tag {
            let title = t.title().map(|s| s.to_string()).unwrap_or_else(|| {
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown")
                    .to_string()
            });
            let artist = t.artist().map(|s| s.to_string()).unwrap_or_else(|| "Unknown Artist".to_string());
            let album = t.album().map(|s| s.to_string()).unwrap_or_else(|| "Unknown Album".to_string());
            let track_number = t.track().unwrap_or(1);
            let year = t
                .get_string(lofty::tag::ItemKey::Year)
                .and_then(|s| s.parse::<u32>().ok())
                .or_else(|| t.date().map(|d| d.year as u32));

            // Check for Dynamic Range or ReplayGain tags
            let mut dr = None;
            for item in t.items() {
                let key_str = format!("{:?}", item.key()).to_uppercase();
                if key_str.contains("DYNAMIC") || key_str.contains("DR") {
                    if let lofty::tag::ItemValue::Text(ref val) = item.value() {
                        let digits: String = val.chars().filter(|c| c.is_ascii_digit()).collect();
                        if let Ok(num) = digits.parse::<u8>() {
                            if (4..=24).contains(&num) {
                                dr = Some(num);
                                break;
                            }
                        }
                    }
                } else if key_str.contains("REPLAYGAIN_TRACK_GAIN") {
                    if let lofty::tag::ItemValue::Text(ref val) = item.value() {
                        if let Ok(gain) = val.trim_end_matches(" dB").trim().parse::<f32>() {
                            let est = (14.0 + gain).round() as i32;
                            dr = Some(est.clamp(5, 20) as u8);
                        }
                    }
                }
            }

            let (inferred_album, inferred_artist) = path
                .parent()
                .map(|album_dir| {
                    let alb = album_dir
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Unknown Album");
                    let art = album_dir
                        .parent()
                        .and_then(|p| p.file_name())
                        .and_then(|s| s.to_str())
                        .unwrap_or("Unknown Artist");
                    (alb.to_string(), art.to_string())
                })
                .unwrap_or_else(|| ("Unknown Album".to_string(), "Unknown Artist".to_string()));

            let final_artist = if artist == "Unknown Artist" && inferred_artist != "music" && !inferred_artist.is_empty() {
                inferred_artist
            } else {
                artist
            };

            let final_album = if album == "Unknown Album" && !inferred_album.is_empty() {
                inferred_album
            } else {
                album
            };

            (title, final_artist, final_album, track_number, year, dr)
        } else {
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Unknown")
                .to_string();
            let (inferred_album, inferred_artist) = path
                .parent()
                .map(|album_dir| {
                    let alb = album_dir
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Unknown Album");
                    let art = album_dir
                        .parent()
                        .and_then(|p| p.file_name())
                        .and_then(|s| s.to_str())
                        .unwrap_or("Unknown Artist");
                    (alb.to_string(), art.to_string())
                })
                .unwrap_or_else(|| ("Unknown Album".to_string(), "Unknown Artist".to_string()));
            let title = stem.trim_start_matches(|c: char| c.is_ascii_digit() || c == ' ' || c == '-').trim().to_string();
            let title = if title.is_empty() { stem } else { title };
            (title, inferred_artist, inferred_album, 1, None, None)
        }
    } else {
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();
        let (inferred_album, inferred_artist) = path
            .parent()
            .map(|album_dir| {
                let alb = album_dir
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown Album");
                let art = album_dir
                    .parent()
                    .and_then(|p| p.file_name())
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown Artist");
                (alb.to_string(), art.to_string())
            })
            .unwrap_or_else(|| ("Unknown Album".to_string(), "Unknown Artist".to_string()));
        let title = stem.trim_start_matches(|c: char| c.is_ascii_digit() || c == ' ' || c == '-').trim().to_string();
        let title = if title.is_empty() { stem } else { title };
        (title, inferred_artist, inferred_album, 1, None, None)
    };

    let (duration, bit_depth, sample_rate, bitrate, channels) = if let Some(ref tagged_file) = tagged_file_opt {
        let props = tagged_file.properties();
        (
            props.duration().as_secs() as u32,
            props.bit_depth(),
            props.sample_rate(),
            props.audio_bitrate(),
            props.channels(),
        )
    } else if is_dsd {
        // DSD64 fallback properties: 2.8224 MHz @ 1-bit, stereo
        (240, Some(1), Some(2822400), Some(5644), Some(2))
    } else {
        return None;
    };

    let hires = is_dsd
        || bit_depth.map(|b| b > 16).unwrap_or(false)
        || sample_rate.map(|r| r > 44100).unwrap_or(false)
        || format == "flac"
        || format == "wav"
        || format == "alac"
        || format == "aiff";

    let dr_score = tag_dr.or_else(|| {
        if is_dsd {
            Some(14)
        } else if bit_depth.unwrap_or(16) > 16 || sample_rate.unwrap_or(44100) > 48000 {
            Some(12)
        } else if format == "flac" || format == "alac" || format == "wav" || format == "aiff" {
            Some(11)
        } else {
            Some(8)
        }
    });

    let track_id = format!("{:x}", md5::compute(path.to_string_lossy().as_bytes()));

    Some(LibraryTrack {
        id: track_id,
        title,
        artist,
        album,
        track_number,
        duration,
        year,
        file_path: path.to_path_buf(),
        format: format.to_string(),
        bit_depth,
        sample_rate,
        bitrate,
        channels,
        hires,
        dr_score,
        is_dsd,
    })
}
