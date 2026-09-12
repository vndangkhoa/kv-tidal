pub mod api;
pub mod config;
pub mod engines;
pub mod state;
pub mod storage;
pub mod subsonic;
pub mod trending;

use axum::http::{header, Method};
use axum::Router;
use config::AppConfig;
use state::AppState;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Initialize logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,kv_tidal=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting KV-Tidal Server for Synology NAS (Docker / Native SPK)...");

    // 2. Load Configuration
    let config_path = std::env::var("CONFIG_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./data/config.json"));

    let config = Arc::new(RwLock::new(AppConfig::load_or_create(&config_path)));
    let (host, port, web_dir) = {
        let cfg = config.read().await;
        (cfg.host.clone(), cfg.port, cfg.web_dir.clone())
    };

    // 3. Initialize In-Memory Stores
    let trending = trending::new_trending_store();
    let library = storage::scanner::new_library_store();

    // 4. Start Background Tasks
    trending::start_trending_updater(trending.clone()).await;
    storage::watcher::start_library_watcher(config.clone(), library.clone()).await;

    // Initial background scan of mapped libraries
    {
        let lib_store = library.clone();
        let cfg_store = config.clone();
        tokio::spawn(async move {
            let cfg = cfg_store.read().await;
            for lib in &cfg.libraries {
                if lib.path.exists() {
                    let (tracks, albums, artists) = storage::scanner::scan_directory(&lib.path);
                    let mut store = lib_store.write().await;
                    for t in tracks {
                        store.tracks.insert(t.id.clone(), t);
                    }
                    for a in albums {
                        store.albums.insert(a.id.clone(), a);
                    }
                    for ar in artists {
                        store.artists.insert(ar.id.clone(), ar);
                    }
                }
            }
        });
    }

    // 5. Build Shared Application State
    let app_state = AppState::new(config, trending, library);

    // 6. CORS Configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);

    // 7. Assemble Axum Router
    let app = Router::new()
        .nest("/api", api::router())
        .nest("/rest", subsonic::router())
        .fallback_service(ServeDir::new(&web_dir).append_index_html_on_directories(true))
        .layer(cors)
        .with_state(app_state);

    // 8. Bind & Listen
    let addr: SocketAddr = format!("{}:{}", host, port).parse()?;
    info!("KV-Tidal listening on http://{}", addr);
    info!("OpenSubsonic server active on http://{}/rest", addr);
    info!("Serving web assets from: {}", web_dir.display());

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
