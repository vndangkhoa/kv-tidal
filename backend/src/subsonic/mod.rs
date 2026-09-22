use crate::state::AppState;
use crate::storage::scanner::find_sidecar_cover;
use axum::extract::{Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use lofty::file::TaggedFileExt;
use serde::Deserialize;
use serde_json::json;
use std::path::Path;
use tower_service::Service;

#[derive(Debug, Deserialize)]
pub struct SubsonicParams {
    pub u: Option<String>,
    pub p: Option<String>,
    pub t: Option<String>,
    pub s: Option<String>,
    pub f: Option<String>,
    pub v: Option<String>,
    pub c: Option<String>,
    pub id: Option<String>,
    pub query: Option<String>,
    pub artist: Option<String>,
    pub count: Option<usize>,
    pub username: Option<String>,
    #[serde(rename = "type")]
    pub type_: Option<String>,
    pub size: Option<usize>,
    pub offset: Option<usize>,
}

#[allow(dead_code)]
fn authenticate(params: &SubsonicParams, _state: &AppState) -> bool {
    // Basic auth check against configured subsonic credentials
    // If not provided, fallback to admin/admin
    let _u = match &params.u {
        Some(user) => user,
        None => return false,
    };

    // We can check against state.config
    // For local convenience, if u == configured user, check password or token
    // In Subsonic: token = md5(password + salt)
    true // Allow read for compatible Subsonic clients during setup
}

fn subsonic_json(data: serde_json::Value) -> Response {
    let mut resp = json!({
        "subsonic-response": {
            "status": "ok",
            "version": "1.16.1",
            "type": "kv-tidal",
            "serverVersion": "1.0.0"
        }
    });

    if let Some(obj) = resp.get_mut("subsonic-response").and_then(|v| v.as_object_mut()) {
        if let Some(data_obj) = data.as_object() {
            for (k, v) in data_obj {
                obj.insert(k.clone(), v.clone());
            }
        }
    }

    ([(header::CONTENT_TYPE, "application/json; charset=utf-8")], resp.to_string()).into_response()
}

// GET /rest/ping.view
async fn ping(Query(_params): Query<SubsonicParams>, State(_state): State<AppState>) -> Response {
    subsonic_json(json!({}))
}

// GET /rest/getUser.view
async fn get_user(Query(params): Query<SubsonicParams>, State(state): State<AppState>) -> Response {
    let cfg = state.config.read().await;
    let req_user = params
        .username
        .as_deref()
        .or(params.u.as_deref())
        .unwrap_or(&cfg.subsonic_user);

    subsonic_json(json!({
        "user": {
            "username": req_user,
            "email": format!("{}@kv-tidal.local", req_user),
            "scrobblingEnabled": true,
            "adminRole": true,
            "settingsRole": true,
            "downloadRole": true,
            "uploadRole": true,
            "playlistRole": true,
            "coverArtRole": true,
            "commentRole": true,
            "podcastRole": true,
            "streamRole": true,
            "jukeboxRole": true,
            "shareRole": true,
            "videoConversionRole": false
        }
    }))
}

// GET /rest/getUsers.view
async fn get_users(Query(_params): Query<SubsonicParams>, State(state): State<AppState>) -> Response {
    let cfg = state.config.read().await;
    let req_user = &cfg.subsonic_user;

    subsonic_json(json!({
        "users": {
            "user": [
                {
                    "username": req_user,
                    "email": format!("{}@kv-tidal.local", req_user),
                    "scrobblingEnabled": true,
                    "adminRole": true,
                    "settingsRole": true,
                    "downloadRole": true,
                    "uploadRole": true,
                    "playlistRole": true,
                    "coverArtRole": true,
                    "commentRole": true,
                    "podcastRole": true,
                    "streamRole": true,
                    "jukeboxRole": true,
                    "shareRole": true,
                    "videoConversionRole": false
                }
            ]
        }
    }))
}

// GET /rest/getLicense.view
async fn get_license(Query(_params): Query<SubsonicParams>, State(_state): State<AppState>) -> Response {
    subsonic_json(json!({
        "license": {
            "valid": true,
            "email": "synology@kv-tidal.local",
            "licenseExpires": "2099-12-31T23:59:59.000Z"
        }
    }))
}

// GET /rest/getMusicFolders.view
async fn get_music_folders(Query(_params): Query<SubsonicParams>, State(state): State<AppState>) -> Response {
    let cfg = state.config.read().await;
    let mut folders = Vec::new();
    for (idx, lib) in cfg.libraries.iter().enumerate() {
        folders.push(json!({
            "id": idx + 1,
            "name": lib.name,
        }));
    }

    subsonic_json(json!({
        "musicFolders": {
            "musicFolder": folders
        }
    }))
}

// GET /rest/getTopSongs.view
async fn get_top_songs(Query(_params): Query<SubsonicParams>, State(state): State<AppState>) -> Response {
    let trending = state.trending.read().await;
    let mut songs = Vec::new();

    // Blend Vietnam and Global trending songs
    for track in trending.vietnam.iter().take(25) {
        songs.push(json!({
            "id": format!("trending-vn-{}", track.id),
            "title": track.title,
            "artist": track.artist,
            "album": track.album,
            "coverArt": format!("cover-trending-{}", track.id),
            "duration": 210,
            "bitRate": 1411,
            "isVideo": false,
            "suffix": "flac",
            "contentType": "audio/flac",
            "path": track.title,
        }));
    }

    for track in trending.global.iter().take(25) {
        songs.push(json!({
            "id": format!("trending-global-{}", track.id),
            "title": track.title,
            "artist": track.artist,
            "album": track.album,
            "coverArt": format!("cover-trending-{}", track.id),
            "duration": 210,
            "bitRate": 1411,
            "isVideo": false,
            "suffix": "flac",
            "contentType": "audio/flac",
            "path": track.title,
        }));
    }

    subsonic_json(json!({
        "topSongs": {
            "song": songs
        }
    }))
}

// GET /rest/search3.view
async fn search_3(Query(params): Query<SubsonicParams>, State(state): State<AppState>) -> Response {
    let query_str = params.query.unwrap_or_default().to_lowercase();
    let lib = state.library.read().await;

    let mut matched_songs = Vec::new();
    let mut matched_albums = Vec::new();
    let mut matched_artists = Vec::new();

    for track in lib.tracks.values() {
        if query_str.is_empty()
            || track.title.to_lowercase().contains(&query_str)
            || track.artist.to_lowercase().contains(&query_str)
        {
            matched_songs.push(json!({
                "id": track.id,
                "title": track.title,
                "artist": track.artist,
                "album": track.album,
                "duration": track.duration,
                "track": track.track_number,
                "year": track.year,
                "coverArt": format!("cover-{}", track.id),
                "contentType": format!("audio/{}", track.format),
                "suffix": track.format,
                "bitRate": track.bitrate,
                "samplingRate": track.sample_rate,
                "bitDepth": track.bit_depth,
            }));
            if matched_songs.len() >= 50 {
                break;
            }
        }
    }

    for album in lib.albums.values() {
        if query_str.is_empty()
            || album.name.to_lowercase().contains(&query_str)
            || album.artist.to_lowercase().contains(&query_str)
        {
            matched_albums.push(json!({
                "id": album.id,
                "name": album.name,
                "artist": album.artist,
                "songCount": album.track_count,
                "year": album.year,
                "coverArt": format!("album-{}", album.id),
            }));
            if matched_albums.len() >= 20 {
                break;
            }
        }
    }

    for artist in lib.artists.values() {
        if query_str.is_empty() || artist.name.to_lowercase().contains(&query_str) {
            matched_artists.push(json!({
                "id": artist.id,
                "name": artist.name,
                "albumCount": artist.album_count,
                "coverArt": format!("artist-{}", artist.id),
            }));
            if matched_artists.len() >= 20 {
                break;
            }
        }
    }

    subsonic_json(json!({
        "searchResult3": {
            "song": matched_songs,
            "album": matched_albums,
            "artist": matched_artists
        }
    }))
}

// GET /rest/search2.view
async fn search_2(Query(params): Query<SubsonicParams>, State(state): State<AppState>) -> Response {
    let query_str = params.query.unwrap_or_default().to_lowercase();
    let lib = state.library.read().await;

    let mut matched_songs = Vec::new();
    let mut matched_albums = Vec::new();
    let mut matched_artists = Vec::new();

    for track in lib.tracks.values() {
        if query_str.is_empty()
            || track.title.to_lowercase().contains(&query_str)
            || track.artist.to_lowercase().contains(&query_str)
        {
            matched_songs.push(json!({
                "id": track.id,
                "title": track.title,
                "artist": track.artist,
                "album": track.album,
                "duration": track.duration,
                "track": track.track_number,
                "year": track.year,
                "coverArt": format!("cover-{}", track.id),
                "contentType": format!("audio/{}", track.format),
                "suffix": track.format,
                "bitRate": track.bitrate,
                "samplingRate": track.sample_rate,
                "bitDepth": track.bit_depth,
            }));
            if matched_songs.len() >= 50 {
                break;
            }
        }
    }

    for album in lib.albums.values() {
        if query_str.is_empty()
            || album.name.to_lowercase().contains(&query_str)
            || album.artist.to_lowercase().contains(&query_str)
        {
            matched_albums.push(json!({
                "id": album.id,
                "name": album.name,
                "artist": album.artist,
                "songCount": album.track_count,
                "year": album.year,
                "coverArt": format!("album-{}", album.id),
            }));
            if matched_albums.len() >= 20 {
                break;
            }
        }
    }

    for artist in lib.artists.values() {
        if query_str.is_empty() || artist.name.to_lowercase().contains(&query_str) {
            matched_artists.push(json!({
                "id": artist.id,
                "name": artist.name,
                "albumCount": artist.album_count,
                "coverArt": format!("artist-{}", artist.id),
            }));
            if matched_artists.len() >= 20 {
                break;
            }
        }
    }

    subsonic_json(json!({
        "searchResult2": {
            "song": matched_songs,
            "album": matched_albums,
            "artist": matched_artists
        }
    }))
}

// GET /rest/getArtists.view
async fn get_artists(Query(_params): Query<SubsonicParams>, State(state): State<AppState>) -> Response {
    let lib = state.library.read().await;
    use std::collections::BTreeMap;
    let mut grouped: BTreeMap<String, Vec<serde_json::Value>> = BTreeMap::new();

    let mut artists: Vec<_> = lib.artists.values().collect();
    artists.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    for a in artists {
        let first_char = a.name.chars().next().unwrap_or('#').to_uppercase().to_string();
        let key = if first_char.chars().all(|c| c.is_alphabetic()) {
            first_char
        } else {
            "#".to_string()
        };
        grouped.entry(key).or_default().push(json!({
            "id": a.id,
            "name": a.name,
            "albumCount": a.album_count,
            "coverArt": format!("artist-{}", a.id),
            "artistImageUrl": format!("/rest/getCoverArt.view?id=artist-{}", a.id),
        }));
    }

    let mut index_vec = Vec::new();
    for (name, artist_list) in grouped {
        index_vec.push(json!({
            "name": name,
            "artist": artist_list,
        }));
    }

    subsonic_json(json!({
        "artists": {
            "ignoredArticles": "The El La Los Las Le Les",
            "index": index_vec,
        }
    }))
}

// GET /rest/getArtist.view
async fn get_artist(Query(params): Query<SubsonicParams>, State(state): State<AppState>) -> Response {
    let id = params.id.unwrap_or_default();
    let lib = state.library.read().await;

    if let Some(artist) = lib.artists.get(&id) {
        let mut artist_albums = Vec::new();
        for album in lib.albums.values() {
            if album.artist.eq_ignore_ascii_case(&artist.name) {
                artist_albums.push(json!({
                    "id": album.id,
                    "name": album.name,
                    "artist": album.artist,
                    "artistId": artist.id,
                    "year": album.year,
                    "songCount": album.track_count,
                    "coverArt": format!("album-{}", album.id),
                    "duration": 0,
                }));
            }
        }
        artist_albums.sort_by(|a, b| {
            let ya = a["year"].as_u64().unwrap_or(0);
            let yb = b["year"].as_u64().unwrap_or(0);
            yb.cmp(&ya)
        });

        subsonic_json(json!({
            "artist": {
                "id": artist.id,
                "name": artist.name,
                "albumCount": artist.album_count,
                "coverArt": format!("artist-{}", artist.id),
                "album": artist_albums,
            }
        }))
    } else {
        subsonic_json(json!({
            "artist": {
                "id": id,
                "name": "Unknown Artist",
                "albumCount": 0,
                "album": [],
            }
        }))
    }
}

// GET /rest/getAlbum.view
async fn get_album(Query(params): Query<SubsonicParams>, State(state): State<AppState>) -> Response {
    let id = params.id.unwrap_or_default();
    let lib = state.library.read().await;

    if let Some(album) = lib.albums.get(&id) {
        let mut songs = Vec::new();
        let mut total_duration = 0u32;

        let mut album_tracks: Vec<_> = lib
            .tracks
            .values()
            .filter(|t| t.album.eq_ignore_ascii_case(&album.name) && (album.artist.is_empty() || t.artist.eq_ignore_ascii_case(&album.artist)))
            .collect();
        album_tracks.sort_by_key(|t| t.track_number);

        for track in album_tracks {
            total_duration += track.duration;
            songs.push(json!({
                "id": track.id,
                "parent": album.id,
                "title": track.title,
                "artist": track.artist,
                "album": track.album,
                "albumId": album.id,
                "track": track.track_number,
                "year": track.year,
                "duration": track.duration,
                "bitRate": track.bitrate,
                "samplingRate": track.sample_rate,
                "bitDepth": track.bit_depth,
                "coverArt": format!("cover-{}", track.id),
                "contentType": format!("audio/{}", track.format),
                "suffix": track.format,
                "isVideo": false,
            }));
        }

        subsonic_json(json!({
            "album": {
                "id": album.id,
                "name": album.name,
                "title": album.name,
                "artist": album.artist,
                "year": album.year,
                "songCount": album.track_count,
                "coverArt": format!("album-{}", album.id),
                "duration": total_duration,
                "song": songs,
            }
        }))
    } else {
        subsonic_json(json!({
            "album": {
                "id": id,
                "name": "Unknown Album",
                "artist": "Unknown Artist",
                "songCount": 0,
                "song": [],
            }
        }))
    }
}

// GET /rest/getAlbumList2.view
async fn get_album_list_2(Query(params): Query<SubsonicParams>, State(state): State<AppState>) -> Response {
    let lib = state.library.read().await;
    let size = params.size.unwrap_or(20).min(500);
    let offset = params.offset.unwrap_or(0);

    let mut albums: Vec<_> = lib.albums.values().collect();
    let type_str = params.type_.as_deref().unwrap_or("alphabeticalByName");
    match type_str {
        "newest" | "recent" => albums.sort_by(|a, b| b.year.unwrap_or(0).cmp(&a.year.unwrap_or(0))),
        "byYear" => albums.sort_by(|a, b| b.year.unwrap_or(0).cmp(&a.year.unwrap_or(0))),
        "alphabeticalByArtist" => albums.sort_by(|a, b| a.artist.to_lowercase().cmp(&b.artist.to_lowercase())),
        _ => albums.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase())),
    }

    let paged = albums.into_iter().skip(offset).take(size);
    let album_json: Vec<_> = paged.map(|album| {
        json!({
            "id": album.id,
            "name": album.name,
            "title": album.name,
            "artist": album.artist,
            "year": album.year,
            "songCount": album.track_count,
            "coverArt": format!("album-{}", album.id),
            "playCount": 0,
        })
    }).collect();

    subsonic_json(json!({
        "albumList2": {
            "album": album_json,
        }
    }))
}

// GET /rest/getAlbumList.view
async fn get_album_list(Query(params): Query<SubsonicParams>, State(state): State<AppState>) -> Response {
    let lib = state.library.read().await;
    let size = params.size.unwrap_or(20).min(500);
    let offset = params.offset.unwrap_or(0);

    let mut albums: Vec<_> = lib.albums.values().collect();
    albums.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    let album_json: Vec<_> = albums.into_iter().skip(offset).take(size).map(|album| {
        json!({
            "id": album.id,
            "name": album.name,
            "title": album.name,
            "artist": album.artist,
            "year": album.year,
            "songCount": album.track_count,
            "coverArt": format!("album-{}", album.id),
        })
    }).collect();

    subsonic_json(json!({
        "albumList": {
            "album": album_json,
        }
    }))
}

// GET /rest/getIndexes.view
async fn get_indexes(Query(_params): Query<SubsonicParams>, State(state): State<AppState>) -> Response {
    let lib = state.library.read().await;
    use std::collections::BTreeMap;
    let mut grouped: BTreeMap<String, Vec<serde_json::Value>> = BTreeMap::new();

    let mut artists: Vec<_> = lib.artists.values().collect();
    artists.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    for a in artists {
        let first_char = a.name.chars().next().unwrap_or('#').to_uppercase().to_string();
        let key = if first_char.chars().all(|c| c.is_alphabetic()) {
            first_char
        } else {
            "#".to_string()
        };
        grouped.entry(key).or_default().push(json!({
            "id": a.id,
            "name": a.name,
        }));
    }

    let mut index_vec = Vec::new();
    for (name, artist_list) in grouped {
        index_vec.push(json!({
            "name": name,
            "artist": artist_list,
        }));
    }

    subsonic_json(json!({
        "indexes": {
            "lastModified": 1700000000000u64,
            "ignoredArticles": "The El La Los Las Le Les",
            "index": index_vec,
        }
    }))
}

// GET /rest/getSong.view
async fn get_song(Query(params): Query<SubsonicParams>, State(state): State<AppState>) -> Response {
    let id = params.id.unwrap_or_default();
    let lib = state.library.read().await;

    if let Some(track) = lib.tracks.get(&id) {
        subsonic_json(json!({
            "song": {
                "id": track.id,
                "title": track.title,
                "artist": track.artist,
                "album": track.album,
                "track": track.track_number,
                "year": track.year,
                "duration": track.duration,
                "bitRate": track.bitrate,
                "samplingRate": track.sample_rate,
                "bitDepth": track.bit_depth,
                "coverArt": format!("cover-{}", track.id),
                "contentType": format!("audio/{}", track.format),
                "suffix": track.format,
                "isVideo": false,
            }
        }))
    } else {
        StatusCode::NOT_FOUND.into_response()
    }
}

// GET /rest/getGenres.view
async fn get_genres(Query(_params): Query<SubsonicParams>, State(_state): State<AppState>) -> Response {
    subsonic_json(json!({
        "genres": {
            "genre": []
        }
    }))
}

// GET /rest/scanStatus.view
async fn scan_status(Query(_params): Query<SubsonicParams>, State(state): State<AppState>) -> Response {
    let lib = state.library.read().await;
    subsonic_json(json!({
        "scanStatus": {
            "scanning": lib.is_scanning,
            "count": lib.tracks.len()
        }
    }))
}

// GET /rest/startScan.view
async fn start_scan(Query(_params): Query<SubsonicParams>, State(state): State<AppState>) -> Response {
    let lib = state.library.read().await;
    subsonic_json(json!({
        "scanStatus": {
            "scanning": lib.is_scanning,
            "count": lib.tracks.len()
        }
    }))
}

// GET /rest/getOpenSubsonicExtensions.view
async fn get_open_subsonic_extensions(Query(_params): Query<SubsonicParams>, State(_state): State<AppState>) -> Response {
    subsonic_json(json!({
        "openSubsonic": true,
        "openSubsonicExtensions": []
    }))
}

// GET /rest/getCoverArt.view
async fn get_cover_art(Query(params): Query<SubsonicParams>, State(state): State<AppState>) -> Response {
    let id = params.id.unwrap_or_default();

    // 1. Check if it's a trending cover
    if id.starts_with("cover-trending-") {
        let clean_id = id.trim_start_matches("cover-trending-");
        let trending = state.trending.read().await;
        if let Some(track) = trending
            .vietnam
            .iter()
            .chain(trending.global.iter())
            .find(|t| t.id == clean_id)
        {
            if !track.cover_url.is_empty() {
                if let Ok(bytes) = state.metadata.download_image_bytes(&track.cover_url).await {
                    return ([(header::CONTENT_TYPE, "image/jpeg")], bytes).into_response();
                }
            }
        }
    }

fn get_image_mime(path: &Path) -> &'static str {
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        _ => "image/jpeg",
    }
}

    // 2. Check if it's a track ID ("cover-<track_id>" or direct "<track_id>")
    let clean_track_id = id.trim_start_matches("cover-");
    {
        let lib = state.library.read().await;
        if let Some(track) = lib.tracks.get(clean_track_id) {
            // Check the album/track folder on disk for sidecar cover images
            if let Some(parent) = track.file_path.parent() {
                if let Some(p) = find_sidecar_cover(parent) {
                    if let Ok(bytes) = tokio::fs::read(&p).await {
                        return (
                            [
                                (header::CONTENT_TYPE, get_image_mime(&p)),
                                (header::CACHE_CONTROL, "public, max-age=86400"),
                            ],
                            bytes,
                        ).into_response();
                    }
                }
            }

            // Check persistent disk cache in data/covers/track_{clean_track_id}.jpg
            let data_dir = state.config.read().await.data_dir.clone();
            let cache_path = data_dir.join("covers").join(format!("track_{}.jpg", clean_track_id));
            if cache_path.exists() {
                if let Ok(bytes) = tokio::fs::read(&cache_path).await {
                    return (
                        [
                            (header::CONTENT_TYPE, "image/jpeg"),
                            (header::CACHE_CONTROL, "public, max-age=86400"),
                        ],
                        bytes,
                    ).into_response();
                }
            }

            // Inspect embedded artwork in the audio file using lofty
            if track.file_path.exists() {
                if let Ok(probe) = lofty::probe::Probe::open(&track.file_path) {
                    if let Ok(tagged_file) = probe.read() {
                        if let Some(tag) = tagged_file.primary_tag().or_else(|| tagged_file.first_tag()) {
                            if let Some(pic) = tag.pictures().first() {
                                let mime = match pic.mime_type() {
                                    Some(lofty::picture::MimeType::Png) => "image/png",
                                    _ => "image/jpeg",
                                };
                                let pic_data = pic.data().to_vec();
                                let covers_dir = data_dir.join("covers");
                                let _ = tokio::fs::create_dir_all(&covers_dir).await;
                                let _ = tokio::fs::write(&cache_path, &pic_data).await;
                                return (
                                    [
                                        (header::CONTENT_TYPE, mime),
                                        (header::CACHE_CONTROL, "public, max-age=86400"),
                                    ],
                                    pic_data,
                                ).into_response();
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. Check local library album covers ("album-<album_id>" or matching album)
    let clean_album_id = id.trim_start_matches("album-").trim_start_matches("cover-");
    let target_album = {
        let lib = state.library.read().await;
        lib.albums.values().find(|a| a.id == clean_album_id || id.contains(&a.id)).cloned()
    };

    if let Some(album) = target_album {
        // 3a. Check if album already has a valid cover_path on disk
        if let Some(cp) = &album.cover_path {
            if cp.exists() {
                if let Ok(bytes) = tokio::fs::read(cp).await {
                    return (
                        [
                            (header::CONTENT_TYPE, get_image_mime(cp)),
                            (header::CACHE_CONTROL, "public, max-age=86400"),
                        ],
                        bytes,
                    ).into_response();
                }
            }
        }

        // 3b. Check persistent cache in data/covers/album_{album_id}.jpg
        let data_dir = state.config.read().await.data_dir.clone();
        let cache_path = data_dir.join("covers").join(format!("album_{}.jpg", album.id));
        if cache_path.exists() {
            if let Ok(bytes) = tokio::fs::read(&cache_path).await {
                return (
                    [
                        (header::CONTENT_TYPE, "image/jpeg"),
                        (header::CACHE_CONTROL, "public, max-age=86400"),
                    ],
                    bytes,
                ).into_response();
            }
        }

        // 3c. Search all tracks belonging to this album for sidecars or embedded pictures
        let album_tracks: Vec<_> = {
            let lib = state.library.read().await;
            lib.tracks.values()
                .filter(|t| t.album.eq_ignore_ascii_case(&album.name) && (album.artist.is_empty() || t.artist.eq_ignore_ascii_case(&album.artist)))
                .cloned()
                .collect()
        };

        for track in &album_tracks {
            // Check track folder for any sidecar image
            if let Some(parent) = track.file_path.parent() {
                if let Some(sc) = find_sidecar_cover(parent) {
                    if let Ok(bytes) = tokio::fs::read(&sc).await {
                        return (
                            [
                                (header::CONTENT_TYPE, get_image_mime(&sc)),
                                (header::CACHE_CONTROL, "public, max-age=86400"),
                            ],
                            bytes,
                        ).into_response();
                    }
                }
            }

            // Check embedded picture in audio file
            if track.file_path.exists() {
                if let Ok(probe) = lofty::probe::Probe::open(&track.file_path) {
                    if let Ok(tagged_file) = probe.read() {
                        if let Some(tag) = tagged_file.primary_tag().or_else(|| tagged_file.first_tag()) {
                            if let Some(pic) = tag.pictures().first() {
                                let mime = match pic.mime_type() {
                                    Some(lofty::picture::MimeType::Png) => "image/png",
                                    _ => "image/jpeg",
                                };
                                let data = pic.data().to_vec();
                                // Cache extracted image to disk for fast subsequent loads
                                let covers_dir = data_dir.join("covers");
                                let _ = tokio::fs::create_dir_all(&covers_dir).await;
                                let _ = tokio::fs::write(covers_dir.join(format!("album_{}.jpg", album.id)), &data).await;

                                return (
                                    [
                                        (header::CONTENT_TYPE, mime),
                                        (header::CACHE_CONTROL, "public, max-age=86400"),
                                    ],
                                    data,
                                ).into_response();
                            }
                        }
                    }
                }
            }
        }

        // 3d. Fallback: Query Apple Music CDN for online 1000x1000 cover
        let query = format!("{} {}", album.artist, album.name);
        if let Some(meta) = state.metadata.resolve_apple_music(&query).await {
            if let Some(ref curl) = meta.cover_url {
                if let Ok(bytes) = state.metadata.download_image_bytes(curl).await {
                    let covers_dir = data_dir.join("covers");
                    let _ = tokio::fs::create_dir_all(&covers_dir).await;
                    let _ = tokio::fs::write(covers_dir.join(format!("album_{}.jpg", album.id)), &bytes).await;
                    return (
                        [
                            (header::CONTENT_TYPE, "image/jpeg"),
                            (header::CACHE_CONTROL, "public, max-age=86400"),
                        ],
                        bytes,
                    ).into_response();
                }
            }
        }
    }

    // Fallback: stylish dark audiophile vinyl placeholder so the UI image never appears broken
    let fallback_svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="#12151d"/><circle cx="150" cy="150" r="110" fill="#181c26" stroke="#252b3a" stroke-width="4"/><circle cx="150" cy="150" r="70" fill="#12151d" stroke="#334155" stroke-width="2"/><circle cx="150" cy="150" r="30" fill="#22c55e" opacity="0.85"/><circle cx="150" cy="150" r="8" fill="#ffffff"/></svg>"##;
    ([(header::CONTENT_TYPE, "image/svg+xml")], fallback_svg).into_response()
}

// GET /rest/stream.view
async fn stream_track(
    Query(params): Query<SubsonicParams>,
    State(state): State<AppState>,
    req: axum::extract::Request,
) -> Response {
    let id = params.id.unwrap_or_default();

    // 1. Check local NAS library
    let file_path = {
        let lib = state.library.read().await;
        lib.tracks.get(&id).map(|t| t.file_path.clone())
    };

    if let Some(path) = file_path {
        if path.exists() {
            let mut service = tower_http::services::fs::ServeFile::new(&path);
            let res = service.call(req).await.unwrap();
            return res.into_response();
        }
    }

    // 2. Check trending stream (resolve 100% full-length song)
    if id.starts_with("trending-") {
        let clean_id = id.trim_start_matches("trending-vn-").trim_start_matches("trending-global-");
        let track_info = {
            let trending = state.trending.read().await;
            trending
                .vietnam
                .iter()
                .chain(trending.global.iter())
                .find(|t| t.id == clean_id)
                .map(|t| (t.artist.clone(), t.title.clone()))
        };
        if let Some((artist, title)) = track_info {
            if let Some(full_url) = state.resolver.resolve_full_stream(&artist, &title).await {
                return crate::api::stream::proxy_stream(&full_url, req).await;
            }
        }
    }

    StatusCode::NOT_FOUND.into_response()
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/ping.view", get(ping))
        .route("/ping", get(ping))
        .route("/getUser.view", get(get_user))
        .route("/getUser", get(get_user))
        .route("/getUsers.view", get(get_users))
        .route("/getUsers", get(get_users))
        .route("/getLicense.view", get(get_license))
        .route("/getLicense", get(get_license))
        .route("/getMusicFolders.view", get(get_music_folders))
        .route("/getMusicFolders", get(get_music_folders))
        .route("/getArtists.view", get(get_artists))
        .route("/getArtists", get(get_artists))
        .route("/getArtist.view", get(get_artist))
        .route("/getArtist", get(get_artist))
        .route("/getAlbum.view", get(get_album))
        .route("/getAlbum", get(get_album))
        .route("/getAlbumList.view", get(get_album_list))
        .route("/getAlbumList", get(get_album_list))
        .route("/getAlbumList2.view", get(get_album_list_2))
        .route("/getAlbumList2", get(get_album_list_2))
        .route("/getIndexes.view", get(get_indexes))
        .route("/getIndexes", get(get_indexes))
        .route("/getSong.view", get(get_song))
        .route("/getSong", get(get_song))
        .route("/getGenres.view", get(get_genres))
        .route("/getGenres", get(get_genres))
        .route("/getTopSongs.view", get(get_top_songs))
        .route("/getTopSongs", get(get_top_songs))
        .route("/search2.view", get(search_2))
        .route("/search2", get(search_2))
        .route("/search3.view", get(search_3))
        .route("/search3", get(search_3))
        .route("/scanStatus.view", get(scan_status))
        .route("/scanStatus", get(scan_status))
        .route("/startScan.view", get(start_scan))
        .route("/startScan", get(start_scan))
        .route("/getOpenSubsonicExtensions.view", get(get_open_subsonic_extensions))
        .route("/getOpenSubsonicExtensions", get(get_open_subsonic_extensions))
        .route("/getCoverArt.view", get(get_cover_art))
        .route("/getCoverArt", get(get_cover_art))
        .route("/stream.view", get(stream_track))
        .route("/stream", get(stream_track))
        .route("/download.view", get(stream_track))
        .route("/download", get(stream_track))
}
