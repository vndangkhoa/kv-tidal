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

#[test]
fn test_config_tidal_and_soulseek_serialization() {
    let dir = tempdir().unwrap();
    let cfg_path = dir.path().join("config.json");

    let mut cfg = kv_tidal::config::AppConfig::default();
    cfg.tidal_access_token = Some("test-bearer-token-123".to_string());
    cfg.tidal_quality = "HI_RES_LOSSLESS".to_string();
    cfg.soulseek_enabled = true;
    cfg.soulseek_url = "http://192.168.1.10:5030".to_string();

    cfg.save(&cfg_path).unwrap();

    let loaded = kv_tidal::config::AppConfig::load_or_create(&cfg_path);
    assert_eq!(loaded.tidal_access_token, Some("test-bearer-token-123".to_string()));
    assert_eq!(loaded.tidal_quality, "HI_RES_LOSSLESS");
    assert_eq!(loaded.soulseek_url, "http://192.168.1.10:5030");
    assert!(loaded.soulseek_enabled);
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
            duration: Some(186),
            slskd_username: None,
            slskd_id: None,
            speed_kbps: None,
            eta_seconds: None,
            error: None,
            saved_path: None,
            request_payload: None,
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

#[test]
fn test_stream_request_format_deserialization() {
    let json_opus = serde_json::json!({
        "artist": "Billie Eilish",
        "title": "bad guy",
        "format": "opus"
    });
    let req_opus: kv_tidal::api::stream::StreamRequest = serde_json::from_value(json_opus).unwrap();
    assert_eq!(req_opus.format.as_deref(), Some("opus"));

    let json_flac = serde_json::json!({
        "artist": "Billie Eilish",
        "title": "bad guy",
        "format": "flac"
    });
    let req_flac: kv_tidal::api::stream::StreamRequest = serde_json::from_value(json_flac).unwrap();
    assert_eq!(req_flac.format.as_deref(), Some("flac"));
}

#[test]
fn test_sync_slskd_config_creates_valid_yaml() {
    let temp = tempfile::tempdir().unwrap();
    let data_dir = temp.path().join("var");
    let download_dir = temp.path().join("music");

    let res = kv_tidal::engines::soulseek::sync_slskd_config(
        &data_dir,
        &download_dir,
        Some("test_user"),
        Some("test_pass123"),
    );
    assert!(res.is_ok());

    let yaml_file = data_dir.join("slskd").join("slskd.yml");
    assert!(yaml_file.exists());

    let content = std::fs::read_to_string(&yaml_file).unwrap();
    assert!(content.contains("port: 5030"));
    assert!(content.contains("username: \"test_user\""));
    assert!(content.contains("password: \"test_pass123\""));
    assert!(content.contains(&download_dir.to_string_lossy().to_string()));
}

#[tokio::test]
async fn test_find_downloaded_file_on_disk() {
    let temp = tempfile::tempdir().unwrap();
    let music_dir = temp.path().join("music");
    let user_dir = music_dir.join("beastlyhobos").join("subfolder");
    std::fs::create_dir_all(&user_dir).unwrap();

    let target_file = user_dir.join("01 - CHIHIRO.flac");
    std::fs::write(&target_file, b"fake flac content for disk lookup test").unwrap();

    let found = kv_tidal::engines::soulseek::find_downloaded_file_on_disk(
        &music_dir,
        "beastlyhobos",
        "music\\subfolder\\01 - CHIHIRO.flac",
    ).await;

    assert!(found.is_some());
    assert_eq!(found.unwrap(), target_file);
}

#[tokio::test]
async fn test_stream_local_track_with_force_opus() {
    let temp = tempfile::tempdir().unwrap();
    let audio_file = temp.path().join("01 - Toughest.flac");
    let fake_flac = vec![0u8; 2048];
    std::fs::write(&audio_file, &fake_flac).unwrap();

    let track_id = format!("{:x}", md5::compute(audio_file.to_string_lossy().as_bytes()));
    let library = kv_tidal::storage::scanner::new_library_store();
    {
        let mut lib = library.write().await;
        lib.tracks.insert(track_id.clone(), kv_tidal::storage::scanner::LibraryTrack {
            id: track_id.clone(),
            title: "Toughest".to_string(),
            artist: "Ed Sheeran".to_string(),
            album: "-".to_string(),
            track_number: 1,
            duration: 180,
            year: Some(2023),
            file_path: audio_file.clone(),
            format: "flac".to_string(),
            bit_depth: Some(24),
            sample_rate: Some(48000),
            bitrate: Some(1500),
            channels: Some(2),
            hires: true,
            dr_score: Some(12),
            is_dsd: false,
        });
    }

    let config = std::sync::Arc::new(tokio::sync::RwLock::new(kv_tidal::config::AppConfig::default()));
    let trending = kv_tidal::trending::new_trending_store();
    let state = kv_tidal::state::AppState::new(config, trending, library);

    let router = kv_tidal::api::stream::router().with_state(state);
    use tower_service::Service;
    let uri = format!("/?id={}&format=opus", track_id);
    let req = axum::http::Request::builder()
        .uri(&uri)
        .method("GET")
        .body(axum::body::Body::empty())
        .unwrap();

    let mut router = router;
    let res = router.call(req).await.unwrap();
    assert_eq!(res.status(), axum::http::StatusCode::OK);
}

#[test]
fn test_clean_query_title() {
    use kv_tidal::engines::soulseek::clean_query_title;

    assert_eq!(clean_query_title("17 - Toughest (Bonus Track)"), "Toughest");
    assert_eq!(clean_query_title("01. Shape of You"), "Shape of You");
    assert_eq!(clean_query_title("Bad Habits [Explicit]"), "Bad Habits");
    assert_eq!(clean_query_title("Something (Remastered 2009)"), "Something");
    assert_eq!(clean_query_title("Normal Title"), "Normal Title");
    assert_eq!(clean_query_title("1999"), "1999");
}

#[tokio::test]
async fn test_stream_vietnamese_track() {
    let config = std::sync::Arc::new(tokio::sync::RwLock::new(kv_tidal::config::AppConfig::default()));
    let trending = kv_tidal::trending::new_trending_store();
    let library = kv_tidal::storage::scanner::new_library_store();
    let state = kv_tidal::state::AppState::new(config, trending, library);

    let router = kv_tidal::api::stream::router().with_state(state);
    use tower_service::Service;
    let uri = "/?artist=Anh%20Trai%20V%C6%B0%E1%BB%A3t%20Ng%C3%A0n%20Ch%C3%B4ng%20Gai&title=T%C3%8DCH%20T%E1%BB%8ACH%20T%C3%8CNH%20TANG&format=opus";
    let req = axum::http::Request::builder()
        .uri(uri)
        .method("GET")
        .body(axum::body::Body::empty())
        .unwrap();

    let mut router = router;
    let res = router.call(req).await.unwrap();
    println!("VN Track Status: {:?}", res.status());
    for (name, val) in res.headers() {
        println!("{}: {:?}", name, val);
    }
}

#[tokio::test]
async fn test_subsonic_endpoints() {
    use tower_service::Service;

    let config = std::sync::Arc::new(tokio::sync::RwLock::new(kv_tidal::config::AppConfig::default()));
    let trending = kv_tidal::trending::new_trending_store();
    let library = kv_tidal::storage::scanner::new_library_store();
    let state = kv_tidal::state::AppState::new(config, trending, library);

    let router = kv_tidal::subsonic::router().with_state(state);

    // 1. Test getUser.view
    let req = axum::http::Request::builder()
        .uri("/getUser.view?u=admin&f=json&username=admin")
        .method("GET")
        .body(axum::body::Body::empty())
        .unwrap();

    let mut router_clone = router.clone();
    let res = router_clone.call(req).await.unwrap();
    assert_eq!(res.status(), axum::http::StatusCode::OK);
    let bytes = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(json["subsonic-response"]["status"], "ok");
    assert_eq!(json["subsonic-response"]["user"]["username"], "admin");
    assert_eq!(json["subsonic-response"]["user"]["adminRole"], true);

    // 2. Test getUsers.view
    let req = axum::http::Request::builder()
        .uri("/getUsers.view?u=admin&f=json")
        .method("GET")
        .body(axum::body::Body::empty())
        .unwrap();
    let mut router_clone = router.clone();
    let res = router_clone.call(req).await.unwrap();
    assert_eq!(res.status(), axum::http::StatusCode::OK);

    // 3. Test getArtists.view
    let req = axum::http::Request::builder()
        .uri("/getArtists.view?u=admin&f=json")
        .method("GET")
        .body(axum::body::Body::empty())
        .unwrap();
    let mut router_clone = router.clone();
    let res = router_clone.call(req).await.unwrap();
    assert_eq!(res.status(), axum::http::StatusCode::OK);

    // 4. Test getAlbumList2.view
    let req = axum::http::Request::builder()
        .uri("/getAlbumList2.view?u=admin&f=json&type=newest")
        .method("GET")
        .body(axum::body::Body::empty())
        .unwrap();
    let mut router_clone = router.clone();
    let res = router_clone.call(req).await.unwrap();
    assert_eq!(res.status(), axum::http::StatusCode::OK);
}



