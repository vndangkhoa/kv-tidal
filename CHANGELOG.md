# Changelog

All notable changes to KV-Tidal will be documented in this file.

## [Unreleased]

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
