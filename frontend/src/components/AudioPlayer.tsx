"use client";

import React, { useState, useRef, useEffect } from "react";
import { usePlayer } from "@/context/PlayerContext";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Music,
  Download,
  Sliders,
  Activity,
  Mic2,
  ListMusic,
  Heart,
  Shuffle,
  Repeat,
  ChevronDown,
  MoreHorizontal,
  Sparkles,
  Gauge,
  Speaker,
  Lock,
  Unlock,
  Maximize2,
  Check,
  Loader2,
} from "lucide-react";
import { useDownloads } from "@/context/DownloadContext";
import { SignalPathModal } from "./SignalPathModal";
import { EqualizerModal } from "./EqualizerModal";
import { AudioVisualizer } from "./AudioVisualizer";
import { LyricsModal } from "./LyricsModal";
import { QueueDrawer } from "./QueueDrawer";
import { VuMeterModal } from "./VuMeterModal";
import { ArtworkModal } from "./ArtworkModal";
import { DevicePickerPopover } from "./DevicePickerPopover";

export function AudioPlayer() {
  const {
    currentTrack,
    isPlaying,
    progress,
    duration,
    volume,
    bitPerfectMode,
    isVolumeLocked,
    toggleVolumeLock,
    togglePlay,
    seek,
    setVolume,
    playNext,
    playPrevious,
    setIsSignalPathOpen,
    setIsEqOpen,
    setIsVisualizerOpen,
    isLyricsOpen,
    setIsLyricsOpen,
    isQueueOpen,
    setIsQueueOpen,
    setIsVuMeterOpen,
    autoplay,
    suggestedTracks,
    queue,
    currentIndex,
    streamQuality,
    switchStreamQuality,
  } = usePlayer();

  const [isLiked, setIsLiked] = useState(false);
  const [isFullscreenPlayerOpen, setIsFullscreenPlayerOpen] = useState(false);
  const [isArtworkModalOpen, setIsArtworkModalOpen] = useState(false);
  const [isStudioToolsOpen, setIsStudioToolsOpen] = useState(false);
  const [timeMode, setTimeMode] = useState<"elapsed" | "remaining" | "frames">("elapsed");
  const [coverError, setCoverError] = useState(false);
  const studioToolsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCoverError(false);
  }, [currentTrack?.id]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        studioToolsRef.current &&
        !studioToolsRef.current.contains(event.target as Node)
      ) {
        setIsStudioToolsOpen(false);
      }
    }
    if (isStudioToolsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isStudioToolsOpen]);

  const { downloadTrack, getTrackDownloadStatus, setIsManagerOpen } = useDownloads();

  if (!currentTrack) return null;

  const downloadStatus = getTrackDownloadStatus(currentTrack.title, currentTrack.artist);

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const renderTimeDisplay = () => {
    if (timeMode === "remaining") {
      const remainingSecs = Math.max(0, duration - progress);
      return `-${formatTime(remainingSecs)}`;
    }
    if (timeMode === "frames") {
      const sampleRate = currentTrack.sampleRate || (currentTrack.hires ? 96000 : 44100);
      const frames = Math.floor(progress * sampleRate);
      return `F# ${(frames / 1000000).toFixed(2)}M`;
    }
    return formatTime(progress);
  };

  const cycleTimeMode = () => {
    if (timeMode === "elapsed") setTimeMode("remaining");
    else if (timeMode === "remaining") setTimeMode("frames");
    else setTimeMode("elapsed");
  };

  const handleDownloadCurrent = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentTrack) return;
    if (downloadStatus.isDownloading) {
      setIsManagerOpen(true);
      return;
    }
    await downloadTrack({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      duration: currentTrack.duration,
      stream_url: currentTrack.streamUrl,
      cover_url: currentTrack.coverUrl,
      track_id: currentTrack.id,
      source: currentTrack.source || "tidal",
    });
  };

  // Audiophile badge format & Real Source Distinction
  const isLocal = currentTrack.source?.includes("local") || currentTrack.id.startsWith("/");
  const isTidalMaster = currentTrack.source === "tidal-direct-hifi";
  const isSoulseek = currentTrack.source === "soulseek-lossless";
  const isWebOpus = currentTrack.source === "web-stream-opus" || (!isLocal && !isTidalMaster && !isSoulseek && !currentTrack.isDsd);
  const isPlayingFlac = !isWebOpus && (isLocal || isTidalMaster || isSoulseek || !!currentTrack.format?.toUpperCase().includes("FLAC") || !!currentTrack.isDsd);
  const isPlayingOpus = isWebOpus;
  const playingFileName = currentTrack.fileName || (currentTrack.filePath ? currentTrack.filePath.split("/").pop() : null);

  // Switch quality with automatic Soulseek FLAC download trigger & smooth playback
  const handleQualitySwitch = async (targetQuality: "flac" | "opus") => {
    if (targetQuality === "opus") {
      switchStreamQuality("opus");
      return;
    }

    const hasFlac = isLocal || downloadStatus.isDone || isTidalMaster;
    if (hasFlac) {
      switchStreamQuality("flac");
    } else {
      if (downloadStatus.isDownloading) {
        setIsManagerOpen(true);
        return;
      }
      if (currentTrack) {
        await downloadTrack({
          title: currentTrack.title,
          artist: currentTrack.artist,
          album: currentTrack.album,
          duration: currentTrack.duration,
          stream_url: currentTrack.streamUrl,
          cover_url: currentTrack.coverUrl,
          track_id: currentTrack.id,
          source: currentTrack.source || "tidal",
        });
      }
    }
  };

  const bitDepth = currentTrack.bitDepth || (isWebOpus ? 16 : currentTrack.hires ? 24 : 16);
  const sampleRateKhz = currentTrack.sampleRate
    ? (currentTrack.sampleRate / 1000).toFixed(1)
    : isWebOpus
    ? "48.0"
    : currentTrack.hires
    ? "96.0"
    : "44.1";

  const formatName = currentTrack.format || (isWebOpus ? "WebM Opus" : currentTrack.isDsd ? "DSD64" : "FLAC");
  const isHiRes = (bitDepth > 16 || parseFloat(sampleRateKhz) > 44.1) && !isWebOpus;
  const bitrateDisplay = isWebOpus
    ? "160 kbps"
    : `${currentTrack.bitrate || (isHiRes ? 2800 : 960)} kbps`;

  const sourceLabel = isLocal
    ? "NAS Vault (Bit-Perfect)"
    : isTidalMaster
    ? "Tidal HiFi Master CDN"
    : isSoulseek
    ? "Soulseek Lossless P2P"
    : "Online Web Stream (Opus 160k)";

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. DESKTOP BOTTOM PLAYER BAR (76px fixed, TIDAL 3-zone layout)             */}
      {/* ========================================================================= */}
      <div className="hidden md:flex fixed bottom-0 left-0 right-0 h-[76px] bg-surface/98 backdrop-blur-md border-t border-border px-4 md:px-6 items-center justify-between z-40 select-none shadow-2xl">
        {/* Left Zone: Track Metadata, Art & Codec Telemetry */}
        <div className="flex items-center space-x-3.5 w-1/4 min-w-[220px] max-w-sm">
          <div
            onClick={() => setIsArtworkModalOpen(true)}
            title="Click to inspect ultra-HD artwork & album details"
            className="w-14 h-14 rounded-tidal bg-card flex-shrink-0 overflow-hidden border border-border/80 flex items-center justify-center shadow-md cursor-pointer group relative hover:border-primary/60 transition-all hover:shadow-[0_0_15px_rgba(0,255,255,0.25)]"
          >
            {currentTrack.coverUrl && !coverError ? (
              <img
                src={currentTrack.coverUrl}
                alt={currentTrack.title}
                onError={() => setCoverError(true)}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <Music className="w-6 h-6 text-textSecondary" />
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Maximize2 className="w-4 h-4 text-primary drop-shadow" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div
              onClick={() => setIsArtworkModalOpen(true)}
              title="Click to inspect album artwork & specs"
              className="text-sm font-semibold text-white truncate hover:underline hover:text-primary transition-colors cursor-pointer"
            >
              {currentTrack.title}
            </div>
            <div className="text-xs text-textSecondary truncate hover:underline cursor-pointer mt-0.5">
              {currentTrack.artist}
            </div>
            {/* Live Codec Stream Sub-label */}
            <div
              className="text-[10px] font-mono text-textSecondary/80 truncate mt-0.5"
              title={playingFileName ? `${playingFileName} (${sourceLabel})` : sourceLabel}
            >
              {formatName} • {bitDepth}b/{sampleRateKhz}kHz • {bitrateDisplay}
              {playingFileName ? ` • ${playingFileName}` : ""}
            </div>
          </div>

          {/* Favorite Heart & Download Button */}
          <div className="flex items-center space-x-1 flex-shrink-0">
            <button
              onClick={() => setIsLiked(!isLiked)}
              title={isLiked ? "Remove from Favorites" : "Add to Favorites"}
              className={`p-1.5 rounded-full hover:bg-card transition-colors cursor-pointer ${
                isLiked ? "text-primary" : "text-textSecondary hover:text-white"
              }`}
            >
              <Heart className={`w-4 h-4 ${isLiked ? "fill-primary" : ""}`} />
            </button>
            <button
              onClick={handleDownloadCurrent}
              title={
                downloadStatus.isDownloading
                  ? `Downloading to NAS: ${downloadStatus.progress}% (Click to inspect)`
                  : downloadStatus.isDone
                  ? "Bit-perfect FLAC saved on Synology NAS! (Click to view)"
                  : "Download Bit-Perfect FLAC to Synology NAS"
              }
              className={`relative p-1.5 rounded-full hover:bg-card transition-colors cursor-pointer ${
                downloadStatus.isDone
                  ? "text-emerald-400"
                  : downloadStatus.isDownloading
                  ? "text-primary"
                  : "text-textSecondary hover:text-white"
              }`}
            >
              {downloadStatus.isDownloading ? (
                <div className="relative w-4 h-4 flex items-center justify-center">
                  <svg className="w-4 h-4 -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-white/20"
                      strokeWidth="4"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-primary transition-all duration-300"
                      strokeDasharray={`${downloadStatus.progress}, 100`}
                      strokeWidth="4"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <span className="absolute text-[7px] font-mono font-bold text-primary">
                    {downloadStatus.progress > 0 ? downloadStatus.progress : ""}
                  </span>
                </div>
              ) : downloadStatus.isDone ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Center Zone: Controls & Scrubber Timeline */}
        <div className="flex flex-col items-center w-2/5 max-w-xl px-2">
          {/* Controls row */}
          <div className="flex items-center space-x-5 mb-1.5">
            <button
              title="Shuffle"
              className="text-textSecondary hover:text-white transition-colors cursor-pointer"
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              onClick={playPrevious}
              disabled={currentIndex <= 0}
              title="Previous Track (Gapless)"
              className="text-textSecondary hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>

            {/* TIDAL Round Play/Pause Button */}
            <button
              onClick={togglePlay}
              className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-md cursor-pointer"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              onClick={playNext}
              disabled={
                currentIndex >= queue.length - 1 && (!autoplay || suggestedTracks.length === 0)
              }
              title="Next Track (Pre-buffered 0ms Gapless)"
              className="text-textSecondary hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>

            <button
              title="Repeat"
              className="text-textSecondary hover:text-white transition-colors cursor-pointer"
            >
              <Repeat className="w-4 h-4" />
            </button>
          </div>

          {/* Scrubber Bar with Time Display Mode Toggle */}
          <div className="w-full flex items-center space-x-3 text-[11px] font-mono text-textSecondary select-none">
            <button
              onClick={cycleTimeMode}
              title="Click to toggle: Elapsed / Remaining / Sample Frames"
              className="w-14 text-right hover:text-white transition-colors cursor-pointer"
            >
              {renderTimeDisplay()}
            </button>
            <div className="relative flex-1 group py-2 cursor-pointer">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={progress}
                onChange={(e) => seek(parseFloat(e.target.value))}
                className="w-full h-1 group-hover:h-1.5 bg-border rounded-full appearance-none cursor-pointer accent-primary transition-all"
              />
            </div>
            <span className="w-10">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right Zone: Stream Quality Capsule, Studio Suite & Volume */}
        <div className="flex items-center justify-end space-x-2.5 w-1/4 min-w-[280px]">
          {/* Unified Stream Quality Capsule (FLAC / OPUS + Signal Chain) */}
          <div className="flex items-center bg-card/90 border border-border/80 rounded-full p-0.5 text-[10px] font-mono select-none shadow-sm">
            {/* FLAC Option */}
            <button
              onClick={() => handleQualitySwitch("flac")}
              title={
                isPlayingFlac
                  ? "Currently streaming Bit-Perfect Lossless FLAC Master"
                  : downloadStatus.isDownloading
                  ? `Soulseek P2P Download in progress (${downloadStatus.progress}%). Playing Opus smoothly until FLAC is ready.`
                  : downloadStatus.isDone || isLocal
                  ? "Bit-Perfect Lossless FLAC Master available. Click to play."
                  : "Switch to FLAC — will automatically download lossless studio FLAC via Soulseek & play seamlessly"
              }
              className={`px-2.5 py-0.5 rounded-full transition-all cursor-pointer flex items-center space-x-1 font-bold ${
                isPlayingFlac
                  ? "bg-cyan-500/25 text-cyan-300 border border-cyan-500/50 shadow-[0_0_8px_rgba(0,255,255,0.3)]"
                  : downloadStatus.isDownloading
                  ? "bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 animate-pulse"
                  : downloadStatus.isDone
                  ? "text-emerald-400 hover:text-white"
                  : "text-textSecondary hover:text-white"
              }`}
            >
              {downloadStatus.isDownloading ? (
                <>
                  <Loader2 className="w-2.5 h-2.5 animate-spin text-cyan-400" />
                  <span>{downloadStatus.progress > 0 ? `${downloadStatus.progress}%` : "FLAC"}</span>
                </>
              ) : (
                <>
                  {isPlayingFlac && (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#00ffff]" />
                  )}
                  {downloadStatus.isDone && !isPlayingFlac && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  )}
                  <span>FLAC</span>
                </>
              )}
            </button>

            {/* OPUS Option */}
            <button
              onClick={() => handleQualitySwitch("opus")}
              title={
                isPlayingOpus
                  ? "Currently streaming Fast 160kbps Web Stream (Opus)"
                  : "Switch to OPUS (Fast 160kbps Web Stream for instant playback)"
              }
              className={`px-2.5 py-0.5 rounded-full transition-all cursor-pointer font-bold flex items-center space-x-1 ${
                isPlayingOpus
                  ? "bg-amber-500/25 text-amber-300 border border-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.25)]"
                  : "text-textSecondary hover:text-white"
              }`}
            >
              {isPlayingOpus && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
              )}
              <span>OPUS</span>
            </button>

            {/* Hardware Signal Path Inspector Trigger */}
            <button
              onClick={() => setIsSignalPathOpen(true)}
              title={`Inspect Bit-Perfect Hardware Signal Chain (${sourceLabel})`}
              className="px-1.5 py-0.5 text-textSecondary hover:text-primary transition-colors cursor-pointer"
            >
              <Sparkles className="w-3 h-3" />
            </button>
          </div>

          {/* Studio Audio Suite (EQ, Spectrum Visualizer, VU Meters) */}
          <div className="relative" ref={studioToolsRef}>
            <button
              onClick={() => setIsStudioToolsOpen(!isStudioToolsOpen)}
              title="Studio Audio Suite (Parametric EQ, Spectrum Visualizer, Analog VU Meters)"
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                isStudioToolsOpen
                  ? "bg-primary/20 text-primary border border-primary/40 shadow-sm"
                  : "hover:bg-card text-textSecondary hover:text-white"
              }`}
            >
              <Sliders className="w-4 h-4" />
            </button>

            {isStudioToolsOpen && (
              <div className="absolute bottom-full mb-3 right-0 w-64 bg-[#141414] border border-white/15 rounded-2xl p-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.95)] z-50 space-y-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150 select-none">
                <div className="px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-textSecondary border-b border-white/10 flex items-center justify-between">
                  <span>Studio Audio Suite</span>
                  <span className="text-primary text-[9px] font-mono">DSP & METERS</span>
                </div>

                {/* 1. Equalizer */}
                <button
                  onClick={() => {
                    setIsEqOpen(true);
                    setIsStudioToolsOpen(false);
                  }}
                  className="w-full flex items-center space-x-3 px-2.5 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-left transition-all cursor-pointer group border border-transparent hover:border-purple-500/30"
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center border border-purple-500/30 flex-shrink-0 group-hover:scale-105 transition-transform">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-white group-hover:text-purple-300 transition-colors">
                      Parametric Equalizer
                    </div>
                    <div className="text-[10px] text-textSecondary truncate">
                      10-band studio EQ & AutoEQ
                    </div>
                  </div>
                </button>

                {/* 2. Spectrum Analyzer */}
                <button
                  onClick={() => {
                    setIsVisualizerOpen(true);
                    setIsStudioToolsOpen(false);
                  }}
                  className="w-full flex items-center space-x-3 px-2.5 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-left transition-all cursor-pointer group border border-transparent hover:border-cyan-500/30"
                >
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center border border-cyan-500/30 flex-shrink-0 group-hover:scale-105 transition-transform">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors">
                      Spectrum Analyzer
                    </div>
                    <div className="text-[10px] text-textSecondary truncate">
                      Real-time FFT audio visualizer
                    </div>
                  </div>
                </button>

                {/* 3. Ballistic VU Meters */}
                <button
                  onClick={() => {
                    setIsVuMeterOpen(true);
                    setIsStudioToolsOpen(false);
                  }}
                  className="w-full flex items-center space-x-3 px-2.5 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-left transition-all cursor-pointer group border border-transparent hover:border-amber-500/30"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center border border-amber-500/30 flex-shrink-0 group-hover:scale-105 transition-transform">
                    <Gauge className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-white group-hover:text-amber-300 transition-colors">
                      Ballistic VU Meters
                    </div>
                    <div className="text-[10px] text-textSecondary truncate">
                      Accuphase / McIntosh needles
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Karaoke Lyrics Toggle */}
          <button
            onClick={() => setIsLyricsOpen(!isLyricsOpen)}
            title="Karaoke Synced Lyrics"
            className={`p-1.5 rounded-lg hover:bg-card transition-colors cursor-pointer ${
              isLyricsOpen ? "text-primary bg-primary/15" : "text-textSecondary hover:text-white"
            }`}
          >
            <Mic2 className="w-4 h-4" />
          </button>

          {/* Play Queue Toggle */}
          <button
            onClick={() => setIsQueueOpen(!isQueueOpen)}
            title="Queue & Up Next"
            className={`p-1.5 rounded-lg hover:bg-card transition-colors relative cursor-pointer ${
              isQueueOpen ? "text-primary bg-primary/15" : "text-textSecondary hover:text-white"
            }`}
          >
            <ListMusic className="w-4 h-4" />
            {queue.length > 1 && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </button>

          {/* Audiophile Output Device Selector Popover */}
          <DevicePickerPopover />

          {/* Padlocked Bit-Perfect Volume Control */}
          <div className="flex items-center space-x-1.5 pl-2 border-l border-border/80">
            {bitPerfectMode ? (
              <button
                onClick={toggleVolumeLock}
                title={
                  isVolumeLocked
                    ? "Bit-Perfect Direct: Digital volume locked at 100% (0.0 dB) for bit-perfection. Click to unlock 64-bit dithered attenuation."
                    : "Digital volume unlocked. Click to re-lock at 100% bit-perfect direct level."
                }
                className={`p-1 rounded transition-colors cursor-pointer ${
                  isVolumeLocked
                    ? "text-emerald-400 bg-emerald-500/15"
                    : "text-amber-400 bg-amber-500/15"
                }`}
              >
                {isVolumeLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <button
                onClick={() => setVolume(volume === 0 ? 0.85 : 0)}
                className="text-textSecondary hover:text-white transition-colors cursor-pointer"
              >
                {volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4 text-textSecondary" />
                )}
              </button>
            )}

            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={bitPerfectMode && isVolumeLocked ? 1.0 : volume}
              disabled={bitPerfectMode && isVolumeLocked}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              title={
                bitPerfectMode && isVolumeLocked
                  ? "Bit-Perfect Direct: 100% fixed output. Use analog DAC/Amp knob."
                  : `Volume: ${Math.round(volume * 100)}%`
              }
              className={`w-16 h-1 rounded-full appearance-none cursor-pointer ${
                bitPerfectMode && isVolumeLocked
                  ? "bg-emerald-500/40 accent-emerald-400 opacity-60 cursor-not-allowed"
                  : "bg-border accent-primary"
              }`}
            />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MOBILE FLOATING MINI-PLAYER (Docked 8px above bottom tab bar)           */}
      {/* ========================================================================= */}
      <div
        onClick={() => setIsFullscreenPlayerOpen(true)}
        className="md:hidden fixed bottom-[60px] left-2.5 right-2.5 h-14 bg-[#181818]/95 backdrop-blur-lg rounded-lg border border-border shadow-2xl flex items-center justify-between px-3 z-40 cursor-pointer overflow-hidden select-none animate-in fade-in slide-in-from-bottom-2 duration-200"
      >
        {/* Artwork & Info */}
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-tidal bg-card flex-shrink-0 overflow-hidden border border-border/60 flex items-center justify-center">
            {currentTrack.coverUrl && !coverError ? (
              <img
                src={currentTrack.coverUrl}
                alt={currentTrack.title}
                onError={() => setCoverError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <Music className="w-5 h-5 text-textSecondary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white truncate">{currentTrack.title}</div>
            <div className="text-[10px] text-textSecondary truncate">
              {currentTrack.artist} • {formatName} {bitDepth}b/{sampleRateKhz}k
            </div>
          </div>
        </div>

        {/* Right Quick Controls */}
        <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
          {/* Audio Quality Tag */}
          <span
            className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${
              isLocal
                ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300"
                : isTidalMaster
                ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                : isSoulseek
                ? "border-purple-500/40 bg-purple-500/15 text-purple-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-400"
            }`}
          >
            {isLocal
              ? "LOCAL"
              : isTidalMaster
              ? "MASTER"
              : isSoulseek
              ? "SOULSEEK"
              : "OPUS"}
          </span>

          {currentTrack.drScore && (
            <span className="px-1 py-0.5 rounded text-[8px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              DR{currentTrack.drScore}
            </span>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className="p-2 text-white hover:text-primary transition-colors cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>
        </div>

        {/* Progress Bar glued to the bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/10">
          <div
            className="h-full bg-primary transition-all duration-150"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. MOBILE FULL-SCREEN "NOW PLAYING" SHEET (Slide-Up Modal)                */}
      {/* ========================================================================= */}
      <div
        className={`md:hidden fixed inset-0 z-50 bg-black flex flex-col justify-between p-6 pb-safe transition-transform duration-300 ease-out select-none ${
          isFullscreenPlayerOpen ? "translate-y-0" : "translate-y-full pointer-events-none"
        }`}
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setIsFullscreenPlayerOpen(false)}
            className="p-2 rounded-full hover:bg-card text-white cursor-pointer"
          >
            <ChevronDown className="w-6 h-6" />
          </button>
          <div className="text-center px-2 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary block truncate">
              {sourceLabel}
            </span>
            <p
              className="text-xs font-semibold text-white truncate max-w-[260px]"
              title={playingFileName ? `${playingFileName} (${currentTrack.album || formatName})` : currentTrack.album || formatName}
            >
              {playingFileName || currentTrack.album || formatName}
            </p>
          </div>
          <button
            onClick={handleDownloadCurrent}
            className={`p-2 rounded-full hover:bg-card transition-colors cursor-pointer ${
              downloadStatus.isDone
                ? "text-emerald-400"
                : downloadStatus.isDownloading
                ? "text-primary"
                : "text-textSecondary hover:text-white"
            }`}
            title={
              downloadStatus.isDownloading
                ? `Downloading to NAS: ${downloadStatus.progress}%`
                : downloadStatus.isDone
                ? "Saved to NAS"
                : "Download FLAC to NAS"
            }
          >
            {downloadStatus.isDownloading ? (
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            ) : downloadStatus.isDone ? (
              <Check className="w-5 h-5 text-emerald-400" />
            ) : (
              <Download className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Center: Large Square Artwork */}
        <div className="my-auto flex justify-center py-4">
          <div
            onClick={() => setIsArtworkModalOpen(true)}
            title="Tap to zoom / inspect ultra-HD artwork"
            className="w-[76vw] h-[76vw] max-w-[340px] max-h-[340px] rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.9)] border border-border flex items-center justify-center bg-card cursor-pointer group relative"
          >
            {currentTrack.coverUrl && !coverError ? (
              <img
                src={currentTrack.coverUrl}
                alt={currentTrack.title}
                onError={() => setCoverError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <Music className="w-20 h-20 text-textSecondary opacity-40" />
            )}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Maximize2 className="w-6 h-6 text-white drop-shadow" />
            </div>
          </div>
        </div>

        {/* Bottom Control Sheet */}
        <div className="space-y-5 pb-6">
          {/* Title, Artist and Heart */}
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-4">
              <h2 className="text-xl font-bold text-white truncate">{currentTrack.title}</h2>
              <p className="text-sm text-textSecondary truncate mt-0.5">{currentTrack.artist}</p>
              <div className="flex items-center space-x-2.5 mt-1.5">
                <span className="text-[11px] font-mono text-textSecondary/70 truncate max-w-[190px]" title={playingFileName || formatName}>
                  {formatName} • {bitDepth}-bit / {sampleRateKhz} kHz • DR{currentTrack.drScore || 12}
                </span>
                <div className="flex items-center bg-card border border-border rounded-lg p-0.5 text-[9px] font-mono font-bold flex-shrink-0">
                  <button
                    onClick={() => handleQualitySwitch("flac")}
                    className={`px-1.5 py-0.5 rounded transition-all cursor-pointer flex items-center space-x-1 ${
                      isPlayingFlac
                        ? "bg-cyan-500/25 text-cyan-300 border border-cyan-500/40"
                        : downloadStatus.isDownloading
                        ? "bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 animate-pulse"
                        : downloadStatus.isDone
                        ? "text-emerald-400 border border-emerald-500/50 bg-emerald-500/10"
                        : "text-textSecondary hover:text-white"
                    }`}
                  >
                    {downloadStatus.isDownloading ? (
                      <>
                        <Loader2 className="w-2.5 h-2.5 animate-spin text-cyan-400" />
                        <span>{downloadStatus.progress > 0 ? `${downloadStatus.progress}%` : "FLAC"}</span>
                      </>
                    ) : (
                      <>
                        {isPlayingFlac && (
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#00ffff]" />
                        )}
                        {downloadStatus.isDone && isPlayingOpus && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-0.5" />
                        )}
                        <span>FLAC</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleQualitySwitch("opus")}
                    className={`px-1.5 py-0.5 rounded transition-all cursor-pointer flex items-center space-x-1 ${
                      isPlayingOpus
                        ? "bg-amber-500/25 text-amber-300 border border-amber-500/40 font-bold"
                        : "text-textSecondary hover:text-white"
                    }`}
                  >
                    {isPlayingOpus && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
                    )}
                    <span>OPUS</span>
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsLiked(!isLiked)}
              className={`p-2 transition-colors cursor-pointer ${
                isLiked ? "text-primary" : "text-textSecondary hover:text-white"
              }`}
            >
              <Heart className={`w-6 h-6 ${isLiked ? "fill-primary" : ""}`} />
            </button>
          </div>

          {/* Scrubber Timeline */}
          <div className="space-y-1.5">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={progress}
              onChange={(e) => seek(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-card rounded-full appearance-none accent-primary cursor-pointer"
            />
            <div className="flex justify-between text-xs font-mono text-textSecondary">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Primary Controls */}
          <div className="flex items-center justify-between px-2">
            <button className="text-textSecondary hover:text-white cursor-pointer">
              <Shuffle className="w-5 h-5" />
            </button>
            <button
              onClick={playPrevious}
              disabled={currentIndex <= 0}
              className="text-white disabled:opacity-30 cursor-pointer"
            >
              <SkipBack className="w-7 h-7 fill-current" />
            </button>
            <button
              onClick={togglePlay}
              className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-2xl active:scale-95 transition-transform cursor-pointer"
            >
              {isPlaying ? (
                <Pause className="w-7 h-7 fill-current" />
              ) : (
                <Play className="w-7 h-7 fill-current ml-1" />
              )}
            </button>
            <button
              onClick={playNext}
              disabled={
                currentIndex >= queue.length - 1 && (!autoplay || suggestedTracks.length === 0)
              }
              className="text-white disabled:opacity-30 cursor-pointer"
            >
              <SkipForward className="w-7 h-7 fill-current" />
            </button>
            <button className="text-textSecondary hover:text-white cursor-pointer">
              <Repeat className="w-5 h-5" />
            </button>
          </div>

          {/* Audio Quality & Tool Sheet Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <button
              onClick={() => {
                setIsFullscreenPlayerOpen(false);
                setIsSignalPathOpen(true);
              }}
              className="px-2.5 py-1 rounded text-[11px] font-mono font-bold border border-badgeMax/40 bg-badgeMaxBg text-badgeMax flex items-center space-x-1.5 cursor-pointer min-w-0 max-w-[190px] sm:max-w-none"
            >
              <Sparkles className="w-3 h-3 text-badgeMax shrink-0" />
              <span className="truncate">
                {isHiRes ? "MAX" : "HIGH"} • {bitDepth}B/{sampleRateKhz}k {formatName}
              </span>
            </button>

            <div className="flex items-center space-x-3 text-textSecondary">
              <DevicePickerPopover />
              <button
                onClick={() => {
                  setIsFullscreenPlayerOpen(false);
                  setIsLyricsOpen(true);
                }}
                className="p-1.5 hover:text-primary cursor-pointer"
                title="Lyrics"
              >
                <Mic2 className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  setIsFullscreenPlayerOpen(false);
                  setIsQueueOpen(true);
                }}
                className="p-1.5 hover:text-primary cursor-pointer"
                title="Queue"
              >
                <ListMusic className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  setIsFullscreenPlayerOpen(false);
                  setIsEqOpen(true);
                }}
                className="p-1.5 hover:text-primary cursor-pointer"
                title="Equalizer"
              >
                <Sliders className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Audiophile & Discovery Modals */}
      <ArtworkModal
        isOpen={isArtworkModalOpen}
        onClose={() => setIsArtworkModalOpen(false)}
        track={currentTrack}
      />
      <SignalPathModal />
      <EqualizerModal />
      <VuMeterModal />
      <AudioVisualizer />
      <LyricsModal />
      <QueueDrawer />
    </>
  );
}
