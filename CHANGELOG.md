# Changelog

All notable changes to KV-Tidal will be documented in this file.

## [Unreleased]

## [1.0.0-11] - 2026-09-12

### Added
- **Local Album Cover Art Resolution (`/api/fs/cover`)**: Comprehensive 4-tier discovery engine resolving artwork from sidecar images (`folder.jpg`, `cover.jpg`, `front.jpg`), parent directory walks (for multi-disc releases like `Mat A`, `Mat B`, `CD1`, `CD2`), and embedded ID3v2/Vorbis tags via `lofty`.
- **Full-Resolution Cover Lightbox Zoom**: Clickable high-res modal allowing audiophiles to view album artwork, cassette sleeves, and tracklists with 1-click full-screen inspection.
- **Enhanced Audio QuickLook Inspector**: Redesigned inspector pane featuring live album artwork, Hi-Res format badge, dynamic color-coded DR meter, 6-dimension technical spec grid, and physical path display with 1-click clipboard copy.
- **Player Bar Cover Synchronization**: Audio tracks played from file browsing pass local cover URLs to the global player, displaying the real album artwork in the persistent bottom player.
- **Image File Icons & Lightbox Preview**: Dedicated image icon markers for `.jpg`/`.png` files in the file explorer with one-click full-resolution viewing.

## [1.0.0-10] - 2026-09-12

### Added
- **On-The-Fly DSD-to-FLAC (24-bit / 88.2kHz) Transcoder**: Web browsers (Chrome, Firefox, Safari) cannot decode 1-bit DSD (`.dsf`, `.dff`). Added real-time studio-grade decimation transcoding to 24-bit / 88.2 kHz FLAC with zero jitter, mathematically bit-perfect power-of-2 integer sub-sampling ($2.8224\text{ MHz} \div 32 = 88.2\text{ kHz}$).
- **Persistent DSD Stream Cache**: Transcoded FLAC audio is cached in `${DATA_DIR}/dsd_cache/`, providing instant 0ms subsequent access and full HTTP `Range: bytes=...` scrubbing and seeking.
- **Hardware ALSA Direct Bitstream Playback**: Added `/api/devices/play` hardware dispatcher to stream bit-perfect Native DSD / DoP (2.82MHz) or PCM direct to NAS-connected USB DACs.
- **Dynamic Audio MIME Streaming**: Replaced generic `application/octet-stream` fallbacks across `/api/stream` and `/api/fs/download` with explicit audio MIME types (`audio/flac`, `audio/mpeg`, `audio/wav`, `audio/mp4`, `audio/ogg`).
- **File Explorer Playback Integration**: File browsing view now routes audio preview and playback through `/api/stream`, enabling full DSD transcoding and telemetry across the entire file system.

### Added
- **macOS Finder Column Browser (Miller Columns)**: Interactive multi-column cascading navigation in `/files/` with resizable columns, smooth horizontal auto-scroll, and keyboard shortcuts (`←`, `→`, `↑`, `↓`, `Spacebar`).
- **Audio QuickLook Inspector**: Real-time audiophile inspector pane displaying vinyl cover art preview, Hi-Res codec badge (`24-bit / 96kHz FLAC`, `DSD64`), Dynamic Range (DR) rating gauge, duration, channels, bitrate, and one-click actions.
- **50x Faster `mtime`-Cached Scanner**: Persistent `scanner_cache.json` storing file `mtime` and size. Unmodified files skip audio decoding completely, reducing subsequent scans of 8,000+ files from ~60s to < 0.5s.
- **Web ID3 / Vorbis / FLAC Tag Editor**: Edit Title, Artist, Album, Year, and Track Number directly in the web browser using native `lofty` tag writes.
- **Smart Audiophile Library Auto-Organizer**: Reorganize tracks into clean directory patterns (e.g. `{artist}/{album}/{track:02d} - {title}.{ext}`) with dry-run diff preview before moving files.
- **O(1) Hash Lookup**: Replaced linear O(N) track searching in file browsing with instant O(1) MD5 lookup.

### Added
- **Upgrade Lifecycle Scripts**: Added `preupgrade`, `postupgrade`, and `preuninst` scripts to support seamless package upgrades directly through Synology Package Center without needing to uninstall first.

## [1.0.0-7] - 2026-09-12

### Added
- **Music Share Auto-Detection**: Setup wizard now defaults to `/volume2/music` (the active Synology music share), and automatically verifies path existence via `synoshare`.
- **Automatic ACL Permissions**: Automatically grants `sc-kvtidal` read/write POSIX ACL permissions (`synoacltool`) on the music directory during installation to prevent permission errors.
- **Non-blocking File Explorer**: Background scanning of tens of thousands of tracks no longer stalls file browsing or HTTP API routes.

## [1.0.0-6] - 2026-09-12

### Fixed
- **Package Center URL**: Updated default `adminport` in `INFO` to `26784` and added automated synchronization in `postinst` and `start-stop-status` so Synology Package Center's "URL:" row matches the active service port.

## [1.0.0-5] - 2026-09-12

### Changed
- **Dynamic Client Setup Info**: The Settings page now dynamically resolves the active host IP and configured port (`26784`) instead of static placeholders, with a one-click copy button for quick setup in Symfonium, Feishin, and Tempo.
- **Service Account Display**: Fixed permission guide display to reference `sc-kvtidal`.

## [1.0.0-4] - 2026-09-12

### Fixed
- **Port Synchronization**: Synchronized user-configured port in the installation wizard with `config.json` and DSM `ui/config` launcher URL to prevent connection failures when custom ports are used.
- **Service Port Watcher**: `start-stop-status` dynamically aligns DSM menu launcher shortcut with the active port in `config.json`.

## [1.0.0-3] - 2026-09-12

### Added
- **DSM Main-Menu Launcher**: Added multi-resolution application icons (16px to 256px) and DSM application registration (`com.khoavo.kvtidal`) so the package appears in the Synology main menu.

## [1.0.0] - 2026-09-12

### Added
- **Initial Release of KV-Tidal** - High-resolution music streaming and downloader platform for Synology NAS (Docker & Native SPK).
- **Tidal & Qobuz Integration** - Full bit-perfect lossless FLAC audio streaming and downloads without 30-second preview cutoffs.
- **OpenSubsonic API Server** - Full protocol support for Symfonium, Feishin, Tempo, and Substreamer desktop/mobile apps.
- **Live Trending Charts** - Real-time auto-updating Vietnam Top 50 and Billboard / Global Hot 50 with 1000x1000 artwork.
- **Anti-Blocking Architecture** - Multi-CDN fallback and Vietnam IP edge proxy bypass to ensure resilient audio and image playback.
- **Synology NAS Library Ingestion** - Live directory mapping (`/volume1/music`) with background scanning and Linux `inotify` live change detection.
- **Atomic File Transfers** - Download pipeline writing to `.part` files, tagging Vorbis/ID3 with cover art via `lofty`, and atomically moving into `{Artist}/{Album}/{Track} - {Title}.flac`.
- **Next.js 15 PWA Web UI** - Dark-mode responsive interface with player bar, lyrics view, and lock-screen MediaSession controls.
- **Synology DSM 7 Package (SPK)** - Native zero-overhead package for Synology Package Center with DSM install wizard and service lifecycle scripts.
- **Multi-Registry Docker Image** - Automated multi-stage container builds published to Docker Hub, GitHub Container Registry, and Forgejo.
