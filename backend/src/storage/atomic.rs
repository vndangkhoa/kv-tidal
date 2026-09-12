use crate::storage::permissions::{ensure_dir_permissions, ensure_file_permissions};
use lofty::file::TaggedFileExt;
use lofty::picture::Picture;
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey, Tag, TagExt, TagType};
use std::path::{Path, PathBuf};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tracing::{info, warn};

pub fn sanitize_name(input: &str) -> String {
    let forbidden = ['/', '\\', '<', '>', ':', '"', '|', '?', '*'];
    let cleaned: String = input
        .chars()
        .map(|c| if forbidden.contains(&c) { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() {
        "Unknown".to_string()
    } else {
        trimmed.to_string()
    }
}

pub struct TrackSaveOptions<'a> {
    pub base_dir: &'a Path,
    pub artist: &'a str,
    pub album: &'a str,
    pub track_number: u32,
    pub title: &'a str,
    pub year: Option<u32>,
    pub audio_bytes: &'a [u8],
    pub cover_bytes: Option<&'a [u8]>,
    pub puid: u32,
    pub pgid: u32,
}

pub async fn save_track_atomic(
    opts: TrackSaveOptions<'_>,
) -> Result<PathBuf, Box<dyn std::error::Error + Send + Sync>> {
    if opts.audio_bytes.len() < 1024 {
        return Err("Audio payload is empty or corrupted (< 1KB)".into());
    }

    let clean_artist = sanitize_name(opts.artist);
    let clean_album = sanitize_name(opts.album);
    let clean_title = sanitize_name(opts.title);

    let album_dir = opts.base_dir.join(&clean_artist).join(&clean_album);
    ensure_dir_permissions(&album_dir, opts.puid, opts.pgid);

    let incoming_dir = opts.base_dir.join(".incoming");
    ensure_dir_permissions(&incoming_dir, opts.puid, opts.pgid);

    let filename = format!("{:02} - {}.flac", opts.track_number, clean_title);
    let final_path = album_dir.join(&filename);
    let temp_filename = format!("{}.{}", uuid::Uuid::new_v4(), filename);
    let temp_path = incoming_dir.join(&temp_filename);

    // Write audio bytes to temporary file
    {
        let mut file = fs::File::create(&temp_path).await?;
        file.write_all(opts.audio_bytes).await?;
        file.flush().await?;
    }

    // Embed metadata and cover art via Lofty
    if let Err(e) = tag_audio_file(&temp_path, &opts) {
        warn!("Tagging warning for {}: {}", temp_path.display(), e);
    }

    // Save cover.jpg in album directory if present
    if let Some(cover) = opts.cover_bytes {
        let cover_path = album_dir.join("cover.jpg");
        if !cover_path.exists() {
            if let Ok(mut cf) = fs::File::create(&cover_path).await {
                let _ = cf.write_all(cover).await;
                let _ = cf.flush().await;
                ensure_file_permissions(&cover_path, opts.puid, opts.pgid);
            }
        }
    }

    // Atomic rename into destination
    fs::rename(&temp_path, &final_path).await?;
    ensure_file_permissions(&final_path, opts.puid, opts.pgid);

    info!("Successfully saved atomic track: {}", final_path.display());
    Ok(final_path)
}

fn tag_audio_file(
    file_path: &Path,
    opts: &TrackSaveOptions<'_>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut tagged_file = match Probe::open(file_path)?.read() {
        Ok(f) => f,
        Err(e) => return Err(format!("Lofty probe failed: {}", e).into()),
    };

    let mut tag = match tagged_file.primary_tag_mut() {
        Some(t) => t.clone(),
        None => Tag::new(TagType::VorbisComments),
    };

    tag.set_title(opts.title.to_string());
    tag.set_artist(opts.artist.to_string());
    tag.set_album(opts.album.to_string());
    tag.set_track(opts.track_number);
    if let Some(y) = opts.year {
        tag.insert_text(ItemKey::Year, y.to_string());
    }

    if let Some(cover) = opts.cover_bytes {
        if let Ok(pic) = Picture::from_reader(&mut std::io::Cursor::new(cover)) {
            tag.push_picture(pic);
        }
    }

    tag.save_to_path(file_path, lofty::config::WriteOptions::default())?;
    Ok(())
}
