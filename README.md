# KV-TIDAL 🎵

> High-Resolution Music Streaming & Downloader Platform for Synology NAS (Docker & Native SPK)

**KV-Tidal** is an open-source, self-hosted music platform built with **Rust** (high-performance async engine) and **Next.js 15 / React 19** (modern dark-theme PWA interface). It provides full-track streaming, bit-perfect FLAC downloads from Tidal and Qobuz, live Global & Vietnamese trending charts, existing NAS music library mapping with `inotify` live detection, and an **OpenSubsonic** server compatible with all major mobile and desktop music players.

---

## ✨ Features

- **🇻🇳 Live Vietnamese Trending Top 50**: Automatically updated chart featuring top trending hits in Vietnam with high-resolution 1000x1000 artwork.
- **🌍 Billboard & Global Hot 50**: Worldwide top chart updated in real-time.
- **🎧 Full Lossless Audio**: Resolves full post-paywall FLAC streams and uncompressed downloads (no 30-second preview cutoffs).
- **🛡️ Anti-Blocking Architecture**: Handles geo-blocking (Vietnam IP edge blocks) and features multi-CDN fallbacks so artwork and tracks never fail to load.
- **📁 Existing NAS Library Ingestion**: Map existing Synology shares (e.g. `/volume1/music`) with instant background scanning and real-time Linux `inotify` file watchers.
- **⚡ Atomic File Transfers**: Stream downloads to `.part` files, embed Vorbis/ID3 tags and artwork via `lofty`, and atomically rename into `{Artist}/{Album}/{Track} - {Title}.flac` without corrupting media indexers.
- **📱 Universal Client Support**:
  - **Web / PWA**: Installable on iPhone (Safari) and Android (Chrome) with background audio and lock-screen controls via `MediaSession` API.
  - **Subsonic Ecosystem**: Connect **Symfonium** (Android), **Feishin** (Desktop), **Ample / Tempo** (iOS), or **Substreamer** directly to `http://<nas-ip>:8080/rest`.
- **🚀 Dual-Mode Deployment**:
  - **Native Synology SPK**: Pure native binary package for Synology Package Center with near-zero RAM usage (~15MB). No Docker required!
  - **Docker Container**: Ready-to-run container image with optional `gluetun` VPN integration for Synology Container Manager.

---

## 🛠️ Deployment Options

### Option 1: Native Synology SPK Package (Recommended)

1. **Build the `.spk` package**:
   ```bash
   ./spk/build-spk.sh
   ```
   This compiles the Next.js frontend into static assets, builds the optimized release binary in Rust, and packages everything into `kv-tidal.spk`.

2. **Install on Synology DSM**:
   - Open **Synology DSM** → **Package Center**.
   - Click **Manual Install** in the top right.
   - Select the generated `kv-tidal.spk` file.
   - Follow the installation wizard:
     - Select your existing Music share folder (default `/volume1/music`).
     - Choose your port (default `8080`).
     - Set your Subsonic username and password.
   - Click **Done**. KV-Tidal is now running as a native DSM service!

---

### Option 2: Docker / Synology Container Manager

1. **Create directories on your Synology NAS**:
   ```bash
   mkdir -p /volume1/docker/kv-tidal/data
   ```

2. **Deploy via Docker Compose**:
   ```bash
   docker compose up -d
   ```

3. **Access the Web Dashboard**:
   - Open `http://<synology-ip>:8080` in your web browser or phone.

---

## 📱 Connecting Subsonic Mobile & Desktop Apps

KV-Tidal provides a fully compliant **OpenSubsonic API** at `/rest`. To connect mobile apps (such as **Symfonium** on Android or **Tempo** on iOS):

| Parameter | Value |
| :--- | :--- |
| **Server Type** | Subsonic / OpenSubsonic |
| **Server Address** | `http://<synology-ip>:8080` |
| **Username** | `admin` (or your configured user) |
| **Password** | `admin` (or your configured password) |

Once connected, your mobile app will stream directly from your NAS library and display the live trending charts in the "Top Songs" feed.

---

## 🔧 Project Architecture

```
kv-tidal/
├── backend/                  # Rust Axum/Tokio Engine
│   ├── src/
│   │   ├── main.rs           # Web server, router, static file server
│   │   ├── config.rs         # Configuration & Synology permissions (PUID/PGID)
│   │   ├── api/              # REST Endpoints (trending, search, download, fs, library)
│   │   ├── subsonic/         # OpenSubsonic API protocol engine
│   │   ├── engines/          # Tidal & Qobuz resolvers + metadata fallbacks
│   │   ├── trending/         # Auto-refreshing Vietnam & Global Top 50
│   │   └── storage/          # inotify watcher, scanner & atomic FLAC tagger
├── frontend/                 # Next.js 15+ React 19 Frontend (PWA)
│   ├── src/
│   │   ├── app/              # App Router (Trending, Search, Library, Files, Settings)
│   │   ├── components/       # Player, TrackRow, Navigation
│   │   └── context/          # Web Audio & MediaSession state
├── spk/                      # Synology SPK Packaging Definitions
│   ├── INFO                  # DSM 7 Package Manifest
│   ├── conf/privilege        # DSM 7 Security & Share Permissions
│   ├── scripts/              # Daemon start-stop-status & lifecycle scripts
│   ├── WIZARD_UIFILES/       # DSM Manual Install Wizard
│   └── build-spk.sh          # Automated 1-click SPK compilation script
├── Dockerfile                # Multi-stage production container build
└── docker-compose.yml        # Synology Container Manager setup
```

---

## 📄 License

MIT License. Designed for personal homelab audio streaming and self-hosting on Synology NAS.
