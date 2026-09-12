# Changelog

All notable changes to KV-Tidal will be documented in this file.

## [Unreleased]

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
