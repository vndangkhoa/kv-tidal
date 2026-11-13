use crate::config::SharedConfig;
use crate::storage::scanner::{scan_directory, SharedLibrary};
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{info, warn};

async fn run_refresh(cfg_store: SharedConfig, lib_store: SharedLibrary) {
    tokio::time::sleep(Duration::from_secs(4)).await;
    info!("NAS filesystem change detected; updating music library...");

    let libraries = {
        let cfg = cfg_store.read().await;
        cfg.libraries.clone()
    };

    if let Ok((all_tracks, all_albums, all_artists)) = tokio::task::spawn_blocking(move || {
        let mut all_tracks = Vec::new();
        let mut all_albums = Vec::new();
        let mut all_artists = Vec::new();
        for lib in libraries {
            if lib.path.exists() {
                let (tracks, albums, artists) = scan_directory(&lib.path);
                all_tracks.extend(tracks);
                all_albums.extend(albums);
                all_artists.extend(artists);
            }
        }
        (all_tracks, all_albums, all_artists)
    })
    .await
    {
        let mut store = lib_store.write().await;
        for t in all_tracks {
            store.tracks.insert(t.id.clone(), t);
        }
        for a in all_albums {
            store.albums.insert(a.id.clone(), a);
        }
        for ar in all_artists {
            store.artists.insert(ar.id.clone(), ar);
        }
        store.cached_tracks_json = None;
    }
    info!("Library refresh completed.");
}

pub async fn start_library_watcher(config: SharedConfig, library: SharedLibrary) {
    let (tx, mut rx) = mpsc::channel(100);

    let mut watcher = match RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                match event.kind {
                    notify::EventKind::Create(_)
                    | notify::EventKind::Modify(_)
                    | notify::EventKind::Remove(_) => {
                        let _ = tx.blocking_send(event);
                    }
                    _ => {}
                }
            }
        },
        notify::Config::default(),
    ) {
        Ok(w) => w,
        Err(e) => {
            warn!("Failed to initialize inotify filesystem watcher: {}", e);
            return;
        }
    };

    // Watch all library folders
    {
        let cfg = config.read().await;
        for lib in &cfg.libraries {
            if lib.watch_changes && lib.path.exists() {
                if let Err(e) = watcher.watch(&lib.path, RecursiveMode::Recursive) {
                    warn!("Failed to watch path {}: {}", lib.path.display(), e);
                } else {
                    info!("Watching library folder for real-time changes: {}", lib.path.display());
                }
            }
        }
    }

    // Event debounce loop
    tokio::spawn(async move {
        // Keep watcher in scope so it doesn't get dropped
        let _watcher = watcher;
        let mut debounce_timer: Option<tokio::task::JoinHandle<()>> = None;

        while let Some(_event) = rx.recv().await {
            if let Some(timer) = debounce_timer.take() {
                timer.abort();
            }
            // Debounce by 4 seconds so multi-file copies don't trigger 100 rescans
            debounce_timer = Some(tokio::spawn(run_refresh(config.clone(), library.clone())));
        }
    });
}
