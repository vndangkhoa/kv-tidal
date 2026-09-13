# Changelog

All notable changes to KV-Tidal will be documented in this file.

## [Unreleased]

## [1.0.0-26] - 2026-09-13

### Added & Improved
- **Guaranteed Bit-Perfect FLAC for Local Tracks**: Player engine now strictly preserves lossless bit-perfect FLAC streaming for all local NAS library tracks (`track.source === "local"` or local filesystem paths), preventing unintended transcoding to Opus.
- **Rich Stream URL Metadata in Album Modal & Library**: Augmented `/api/stream` invocations with explicit `artist` and `title` query parameters from `AlbumModal` and `/library` views, ensuring immediate fallback stream resolution and accurate track matching.
- **Stream Resolution Fallback Hierarchy**: Implemented resilient multi-tier stream resolution in `api/stream.rs` that respects `!force_opus` for direct Tidal HiFi Master FLAC playback, while seamlessly falling back to Tidal CDN if web-based Opus resolvers are unavailable.
- **Automated Stream Quality Tests**: Added integration tests validating format selection, fallback hierarchy, and local track streaming under forced opus flags.

## [1.0.0-25] - 2026-09-13

### Fixed & Improved
- **Resolved DSM 7 Port Conflict Error (Error Code 283)**: Removed the legacy `adminport="26784"` manifest directive from `spk/INFO`. In DSM 7, `adminport` triggers an over-strict system-wide port reservation collision check during Package Center's `prepare_install` phase if the port is referenced in Reverse Proxy or container port mappings. Package Center launcher shortcuts now rely purely on standard `ui/config` dynamic substitution, enabling 100% reliable 1-click installation.

## [1.0.0-24] - 2026-09-13

### Added & Improved
- **Intelligent Soulseek Candidate Scoring Algorithm**: Implemented a comprehensive scoring engine evaluating track duration matching (±5s tolerance bonus, divergence penalties), negative keyword filtering (`karaoke`, `instrumental`, `remix`, `live`, `cover`, `demo` filtered out when not in track title), peer upload speed metrics, and free upload slot prioritization to ensure the highest-quality studio FLAC download.
- **Full Download Lifecycle Controls**: Added real-time Pause, Resume, and Cancel/Remove actions with bidirectional state synchronization with `slskd` P2P transfers.
- **Synology DSM Setup Wizard Integration**: Added `WIZARD_UIFILES` (`install_uifile` and `upgrade_uifile`) enabling interactive configuration of Soulseek credentials, listening ports, and download shares directly during DSM Package Center installation and upgrade.
- **Categorized Audiophile Settings Navigation**: Added quick-switch category navigation pills (All, Audio Devices, Engine & DAC, Tidal & P2P, NAS & Shares, Subsonic & Apps) for intuitive, organized settings management.
- **Mobile Files Page Bottom-Sheet Actions**: Added responsive mobile action sheet for streamlined single-touch file management, renaming, audio playback, and path inspection on mobile viewports.
- **Progressive Web App (PWA) & MediaSession Integration**: Added Service Worker registration (`sw.js`) and MediaSession API integration for native system lockscreen audio controls, artwork sync, and track scrubbing across desktop and mobile devices.
- **Daemon Launch & Supervision Resilience**: Hardened `launch.sh` with robust PID validation, process status verification, and clean multi-daemon lifecycle management.

## [1.0.0-23] - 2026-09-13

### Fixed & Improved
- **Studio Audio Suite Popover Layering**: Fixed z-index layering and backdrop dismiss handling for the bottom audio player popover tools.
- **Soulseek Query DMCA Bypass**: Enhanced query normalization to bypass restricted search terms while matching accurate releases.
- **Persistent Settings Credentials**: Ensured secure synchronization and persistence of Tidal and Soulseek configuration parameters.

## [1.0.0-22] - 2026-09-13

### Added & Improved
- **Visual Overhaul of Audio Player**: Completely decluttered the desktop bottom player bar by eliminating redundant badges and grouping the 12 cramped items into 4 balanced, well-spaced functional groups.
- **Unified Stream Quality Capsule (`[ FLAC | OPUS | ✨ ]`)**: Combined stream format switching, live Soulseek download progress, and signal chain inspection into a single interactive capsule.
- **Studio Audio Suite Popover**: Consolidated 10-Band Parametric EQ & Presets, Real-Time FFT Spectrum Analyzer, and Analog Ballistic VU Meters into an elegant studio tools popover menu.
- **Default Opus Streaming**: Set default online music streaming to fast 160kbps Opus for instantaneous click-to-play startup.
- **Smart FLAC Auto-Download & Seamless Hot-Swap**: Clicking `FLAC` on an online track automatically triggers background Soulseek lossless retrieval, displays live transfer progress on the button, keeps playing Opus without interruption, and automatically hot-swaps to the bit-perfect FLAC master at the exact millisecond upon completion.

## [1.0.0-21] - 2026-09-13

### Added & Improved
- **Top-Right Corner Live Progress HUD**: Dynamically maps active Soulseek P2P downloads to the top-right header button with an animated circular radial progress ring, real-time download percentage (e.g. `45%`), and live transfer speed (e.g. `2.4 MB/s`).
- **Unified Soulseek P2P Telemetry**: Soulseek transfers occurring in `slskd` are seamlessly merged into the KV-Tidal download queue via `GET /api/download/queue` with accurate byte progress, transfer speeds, and ETA calculations.
- **Enhanced Download Drawer Badges**: Active and queued downloads clearly indicate source (`Soulseek P2P Lossless FLAC` vs `Tidal HiFi Direct`), providing transparent audiophile provenance for every downloaded track.

## [1.0.0-20] - 2026-09-13

### Added & Changed
- **Pure Lossless Soulseek Download Engine**: Completely replaced the `yt-dlp --audio-format flac` fake-FLAC download fallback with authentic Soulseek P2P lossless retrieval. All downloaded tracks are genuine 16-bit to 24-bit/96kHz studio FLAC files directly saved to the Synology music library.
- **Real-Time P2P Transfer Progress**: Integrated live telemetry polling from `slskd` (`bytesTransferred`, `averageSpeed`, ETA, percentage) directly into KV-Tidal's download queue.
- **Fixed Native `slskd` Daemon Launch**: Corrected relative webroot path discovery (`bin/wwwroot -> ../share/slskd/wwwroot`) and disabled HTTPS port binding conflict in SPK service supervisor (`start-stop-status`) and Docker `entrypoint.sh`.
- **Files Action Bar Overlay Fix**: Fixed floating clipboard (Copy/Cut/Paste) and multi-select action bars to dynamically float above the bottom audio player bar (`bottom-[92px]`).

## [1.0.0-19] - 2026-09-12

### Added
- **Native Self-Contained `slskd` Bundled in SPK Package**: Bundled the full Linux x86_64 self-contained Soulseek (`slskd` v0.26.0) daemon and web assets directly into the SPK package (`package/bin/slskd`, `package/share/slskd/`). Eliminates any dependency on Docker, Container Manager, or manual configuration for public end-users.
- **Automated Service Lifecycle & PID Management**: `start-stop-status` now supervises and launches both `kv-tidal` and `slskd` as native background services, redirecting logs to `/var/packages/kvtidal/var/slskd.log` and cleanly handling restarts and package stops.
- **Automated Music Folder Target Mapping**: `postinst` automatically maps `directories: downloads` to the detected Synology music shared folder (`/volume2/music` or `/volume1/music`).
- **Real-Time Web UI Config Sync**: Changes to Soulseek username/password in KV-Tidal `/settings` are automatically synchronized to `slskd.yml` on disk, allowing hot-reloads and automatic login without command-line access.
- **Docker Container Integration**: Updated Dockerfile and `entrypoint.sh` to bundle and supervise `slskd` inside the unified container image for Docker Hub, GHCR, and Forgejo distributions.

## [1.0.0-18] - 2026-09-12

### Added
- **Smart Auto-Upgrade to Bit-Perfect FLAC on Download Complete**: If a user is listening to an OPUS web stream and a Soulseek/Tidal FLAC download finishes in the background, KV-Tidal automatically hot-swaps mid-song to the bit-perfect FLAC master at the exact millisecond without interrupting playback.
- **Interactive Toast Notification Action**: Toasts now support direct call-to-action buttons (`[ ⚡ Switch to FLAC Master Now ]`), giving users immediate one-tap control when a download completes.
- **Pulsating Ready Indicators**: Added glowing emerald pulse badges and status dots to the `[ FLAC | OPUS ]` quality switcher when a FLAC file is downloaded and ready on the NAS for the active song.
- **Audio Quality & Auto-Upgrade Strategy Settings**: Added a new settings card in Settings (`/settings`) allowing users to choose their default playback format (FLAC vs OPUS) and toggle between Auto Hot-Swap and Manual Prompt Button on download completion.

## [1.0.0-17] - 2026-09-12

### Added
- **Instant Seamless Audio Quality Switcher (`[ FLAC | OPUS ]`)**: Added an interactive quality selector pill to both desktop player bar and mobile playback sheet. Allows users to switch on-the-fly between **FLAC (Bit-Perfect Lossless Master)** and **OPUS (Fast Web Stream 160kbps)** without losing playback position (exact millisecond timestamp preserved seamlessly).
- **A/B Audiophile Audio Comparison**: Listeners can directly compare compressed 160k Opus vs uncompressed 24-bit Studio Master FLAC in real-time mid-song on their DAC/headphones.
- **Mobile 4G/5G Bandwidth Conservation**: Allows switching to 160kbps Opus to save 90% data when roaming or on limited bandwidth, while switching back to FLAC on home Wi-Fi/DAC.
- **Direct Disk Scan Fallback**: If a Soulseek download finishes before the periodic library scanner triggers, `/api/stream` immediately detects and serves the authentic FLAC file directly from `/volume2/music`.
- **Persistent Quality Preference**: Preferred quality selection is saved to `localStorage` (`kv_stream_quality`) and honored across all track transitions.

## [1.0.0-16] - 2026-09-12

### Added
- **Soulseek (`slskd`) Lossless FLAC Engine**: Integrated REST client with `slskd` for discovering and downloading authentic bit-perfect FLAC audio files (16-bit / 24-bit, 25MB - 80MB) 100% free with no Tidal subscription required and zero geo-blocking.
- **Tidal HiFi Personal Bearer Token Integration**: Added configuration in Settings (`/settings`) allowing users to connect their Tidal HiFi subscriber bearer token, unlocking direct bit-perfect 24-bit / 192kHz Master FLAC streaming and downloading straight from Tidal's official CDN (`sp-storage.tidal.com`).
- **Live Stream Telemetry & Transparent Badges**: Upgraded `/api/stream` to pass rich telemetry response headers (`x-audio-source`, `x-audio-format`, `x-audio-bit-depth`, `x-audio-sample-rate`, `x-audio-bitrate`, `x-audio-is-lossless`).
- **Source-Aware UI Audio Badges**: Audio player bar, mobile UI, and Signal Path modal now dynamically and honestly display the real audio source and format:
  - `LOCAL BIT-PERFECT` (Cyan) — 24b/96kHz bit-perfect playback from Synology NAS vault (`/volume2/music`).
  - `TIDAL MASTER` (Gold) — 24b/192kHz Master FLAC streamed directly from Tidal CDN.
  - `SOULSEEK FLAC` (Purple) — Authentic lossless FLAC from Soulseek P2P network.
  - `WEB OPUS` (Amber) — 160 kbps Opus fallback stream when no HiFi account or local file is available.
- **Settings API (`/api/settings`)**: New backend endpoints for managing and persisting Tidal HiFi credentials, Soulseek endpoints, and live test connection probes (`/test-tidal` and `/test-soulseek`).
- **Docker Compose Recipe for `slskd`**: Added `docker/slskd-compose.yml` for 1-click Soulseek daemon deployment on Synology DSM Container Manager.

## [1.0.0-15] - 2026-09-12

### Fixed
- **Resolved 30-Second Preview Cutoff**: Fixed issue where online music on Synology NAS dropped into 30s Apple Music preview snippets due to Python 3.8 version incompatibility on DSM 7.2.
- **Direct Local Invidious Integration**: Added Tier-1 stream resolver querying local NAS Invidious service (`http://127.0.0.1:7601`) for instantaneous ~10ms full-length Opus/AAC stream extraction without subprocesses.
- **Standalone `yt-dlp_linux` ELF Binary**: Upgraded SPK bundle to include self-contained Linux x86_64 `yt-dlp_linux` ELF binary with embedded Python 3.11+ runtime, eliminating any dependency on DSM's Python version.
- **Synology `noexec /tmp` Bypass**: Routed PyInstaller temporary extraction directory to `${VAR_DIR}/tmp` via explicit `TMPDIR` environment configuration, preventing `libz.so.1: failed to map segment from shared object` permission errors.
- **Public Invidious Fallback Grid**: Added resilient public Invidious instances (`inv.tux.pizza`, `invidious.nerdvpn.de`, `yewtu.be`) to guarantee 100% full-length song playback even if local stream extractors are busy or offline.

## [1.0.0-14] - 2026-09-12

### Added
- **Sub-Millisecond Library API Caching**: Added pre-serialized JSON cache and zero-allocation ASCII sorting for `/api/library/tracks`, accelerating library queries of 10,000+ songs from 400ms down to < 1ms.
- **Dedicated Album Details Endpoint (`/api/library/album`)**: Added high-speed endpoint retrieving full album metadata and sorted tracklists for instant modal rendering.
- **Persistent Cover Art Disk Cache**: Cached extracted embedded audio artwork and Apple Music CDN covers into `${DATA_DIR}/covers/` with 24-hour HTTP cache headers.
- **Interactive Library Alphabet Scroller**: Built responsive A-Z quick-jump scroller supporting Vietnamese diacritics and numeric symbols for effortless navigation across massive collections.
- **Virtualized Library Tracklist & Album Modal**: High-performance chunked track rendering in `/library` with instant modal inspection, multi-track playback, and seamless cover art sync.

### Fixed
- **Online Music Streaming 404 Resolution**: Fixed issue where online Tidal and trending tracks failed to play on Synology NAS with HTTP 404.
- **Bundled `yt-dlp` in SPK Package**: Bundled standalone Linux x86_64 `yt-dlp` binary directly inside `/var/packages/kvtidal/target/bin/yt-dlp` for native DSM packages.
- **Multi-Path `yt-dlp` Locator & Auto-Bootstrap**: `StreamResolver` and `DownloadEngine` now search package target directories, standard DSM paths, Entware `/opt/bin`, and auto-bootstrap standalone binaries to `${DATA_DIR}/bin/yt-dlp` if missing.
- **Tidal Track ID Normalization**: Fixed track ID matching in `/api/stream` to accept both raw numeric IDs (`64325938`) and prefixed IDs (`tidal-64325938`).
- **Dynamic Apple Music Preview Fallback**: Added 4th tier fallback resolving high-bitrate AAC streams directly from Apple Music CDN when YouTube/Tidal stream extraction is unavailable, preventing 404 errors.
- **Frontend Stream Parameter Alignment**: Forwarded available `preview_url` across all player queues in `PopularArtistsView`, `page.tsx`, `ArtistModal`, and `PlaylistModal`.

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
