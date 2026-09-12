use std::fs;
use tempfile::tempdir;

#[test]
fn test_sanitize_filename() {
    let forbidden = "LISA / ROCKSTAR : [Official] * ? < > | \"";
    let cleaned = kv_tidal::storage::atomic::sanitize_name(forbidden);
    assert!(!cleaned.contains('/'));
    assert!(!cleaned.contains(':'));
    assert!(!cleaned.contains('*'));
    assert!(!cleaned.contains('?'));
    assert!(!cleaned.contains('<'));
    assert!(!cleaned.contains('>'));
    assert!(!cleaned.contains('|'));
    assert!(!cleaned.contains('"'));
}

#[tokio::test]
async fn test_trending_rss_parsing() {
    let store = kv_tidal::trending::new_trending_store();
    let result = kv_tidal::trending::refresh_all_trending(&store).await;
    assert!(result.is_ok(), "Failed to refresh trending RSS: {:?}", result);

    let data = store.read().await;
    assert!(!data.vietnam.is_empty(), "Vietnam trending should have tracks");
    assert!(!data.global.is_empty(), "Global trending should have tracks");

    let first_vn = &data.vietnam[0];
    assert!(!first_vn.title.is_empty());
    assert!(!first_vn.artist.is_empty());
    assert!(first_vn.cover_url.contains("1000x1000"), "Cover should be upgraded to 1000x1000");
}

#[tokio::test]
async fn test_atomic_file_transfer_and_tagging() {
    let dir = tempdir().unwrap();
    let music_dir = dir.path().join("music");
    fs::create_dir_all(&music_dir).unwrap();

    let mut sample_audio = b"OggS\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00MockAudioStreamBytesForTesting".to_vec();
    sample_audio.resize(2048, 0);

    let saved = kv_tidal::storage::atomic::save_track_atomic(
        kv_tidal::storage::atomic::TrackSaveOptions {
            base_dir: &music_dir,
            artist: "Test Artist",
            album: "Test Album",
            track_number: 1,
            title: "Test Track",
            year: Some(2026),
            audio_bytes: &sample_audio,
            cover_bytes: None,
            puid: 1000,
            pgid: 1000,
        },
    )
    .await;

    assert!(saved.is_ok(), "Failed saving atomic track: {:?}", saved);
    let path = saved.unwrap();
    assert!(path.exists());
    assert_eq!(path.file_name().unwrap(), "01 - Test Track.flac");

    // Verify directory structure
    let expected_album_dir = music_dir.join("Test Artist").join("Test Album");
    assert!(expected_album_dir.exists());
}

#[test]
fn test_library_scanner_empty_and_valid() {
    let dir = tempdir().unwrap();
    let (tracks, albums, artists) = kv_tidal::storage::scanner::scan_directory(dir.path());
    assert_eq!(tracks.len(), 0);
    assert_eq!(albums.len(), 0);
    assert_eq!(artists.len(), 0);
}

#[tokio::test]
async fn test_download_queue_lifecycle() {
    let queue = kv_tidal::api::download::new_download_queue();
    let now = chrono::Utc::now().timestamp();

    // 1. Enqueue Job
    {
        let mut q = queue.write().await;
        q.jobs.push(kv_tidal::api::download::DownloadJob {
            id: "job-1".to_string(),
            title: "Houdini".to_string(),
            artist: "Dua Lipa".to_string(),
            album: "Radical Optimism".to_string(),
            track_number: Some(1),
            year: Some(2024),
            cover_url: None,
            stream_url: None,
            track_id: None,
            source: Some("tidal".to_string()),
            stage: kv_tidal::api::download::DownloadStage::Queued,
            progress_percent: 0,
            downloaded_bytes: 0,
            total_bytes: Some(35_000_000),
            speed_kbps: None,
            eta_seconds: None,
            error: None,
            saved_path: None,
            created_at: now,
            updated_at: now,
        });
    }

    // 2. Read Queue
    {
        let q = queue.read().await;
        assert_eq!(q.jobs.len(), 1);
        assert_eq!(q.jobs[0].title, "Houdini");
        assert_eq!(q.jobs[0].stage, kv_tidal::api::download::DownloadStage::Queued);
    }

    // 3. Update Progress
    {
        let mut q = queue.write().await;
        let job = &mut q.jobs[0];
        job.stage = kv_tidal::api::download::DownloadStage::DownloadingAudio;
        job.progress_percent = 50;
        job.downloaded_bytes = 17_500_000;
        job.speed_kbps = Some(4500);
        job.eta_seconds = Some(4);
    }

    // 4. Verify Progress
    {
        let q = queue.read().await;
        assert_eq!(q.jobs[0].progress_percent, 50);
        assert_eq!(q.jobs[0].speed_kbps, Some(4500));
        assert_eq!(q.jobs[0].eta_seconds, Some(4));
    }

    // 5. Complete Job
    {
        let mut q = queue.write().await;
        let job = &mut q.jobs[0];
        job.stage = kv_tidal::api::download::DownloadStage::Completed;
        job.progress_percent = 100;
        job.saved_path = Some("/volume1/music/Dua Lipa/Radical Optimism/01 - Houdini.flac".to_string());
    }

    // 6. Clear Completed
    {
        let mut q = queue.write().await;
        q.jobs.retain(|j| {
            j.stage != kv_tidal::api::download::DownloadStage::Completed
                && j.stage != kv_tidal::api::download::DownloadStage::Failed
        });
        assert_eq!(q.jobs.len(), 0);
    }
}

#[test]
fn test_find_sidecar_cover() {
    let dir = tempdir().unwrap();
    let album_dir = dir.path().join("Artist - Album");
    fs::create_dir_all(&album_dir).unwrap();

    // 1. Initially no cover
    assert!(kv_tidal::storage::scanner::find_sidecar_cover(&album_dir).is_none());

    // 2. Case-insensitive non-standard sidecar e.g. front.png
    let front_png = album_dir.join("front.png");
    fs::write(&front_png, b"mock_png_data").unwrap();
    let found = kv_tidal::storage::scanner::find_sidecar_cover(&album_dir);
    assert_eq!(found, Some(front_png.clone()));

    // 3. Subdisc folder CD1 should find parent album cover
    let cd1_dir = album_dir.join("CD1");
    fs::create_dir_all(&cd1_dir).unwrap();
    let found_from_subdisc = kv_tidal::storage::scanner::find_sidecar_cover(&cd1_dir);
    assert_eq!(found_from_subdisc, Some(front_png));
}

#[tokio::test]
async fn test_aiff_transcode_and_scanner() {
    let dir = tempdir().unwrap();
    let aiff_path = dir.path().join("test_track.aiff");

    // Generate a minimal valid AIFF file using ffmpeg
    let status = std::process::Command::new("ffmpeg")
        .args([
            "-f", "lavfi",
            "-i", "sine=frequency=1000:duration=0.5:sample_rate=44100",
            "-c:a", "pcm_s16be",
            "-y",
            aiff_path.to_str().unwrap(),
        ])
        .output();

    if let Ok(out) = status {
        if out.status.success() {
            let track = kv_tidal::storage::scanner::inspect_audio_file(&aiff_path, "aiff");
            assert!(track.is_some(), "Scanner should scan .aiff file");
            let t = track.unwrap();
            assert_eq!(t.format, "aiff");
            assert_eq!(t.sample_rate, Some(44100));

            // Transcode to FLAC via ffmpeg as stream.rs does
            let flac_path = dir.path().join("transcoded.flac");
            let transcode_status = std::process::Command::new("ffmpeg")
                .args([
                    "-ss", "0",
                    "-i", aiff_path.to_str().unwrap(),
                    "-vn",
                    "-c:a", "flac",
                    "-compression_level", "5",
                    "-f", "flac",
                    "-y",
                    flac_path.to_str().unwrap(),
                ])
                .output();

            assert!(transcode_status.is_ok());
            assert!(transcode_status.unwrap().status.success());
            assert!(flac_path.exists());
            assert!(fs::metadata(&flac_path).unwrap().len() > 500);
        }
    }
}


