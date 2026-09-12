"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  ZoomIn,
  ZoomOut,
  Download,
  ExternalLink,
  Copy,
  Check,
  Music,
  Mic2,
  Activity,
  Disc,
  Sparkles,
} from "lucide-react";
import { PlayableTrack } from "@/types";
import { usePlayer } from "@/context/PlayerContext";

interface ArtworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: PlayableTrack | null;
}

/**
 * Ensures highest possible resolution from CDN endpoints (e.g. 1200x1200bb for Apple, 1280x1280 for Tidal)
 */
export function getUltraHdCoverUrl(url?: string): string {
  if (!url) return "";
  if (url.includes("apple.com") || url.includes("mzstatic.com")) {
    return url
      .replace(/\/\d+x\d+bb\./, "/1200x1200bb.")
      .replace(/\/\d+x\d+\./, "/1200x1200.");
  }
  if (url.includes("resources.tidal.com")) {
    return url.replace(/\/\d+x\d+\.jpg$/, "/1280x1280.jpg");
  }
  return url;
}

export function ArtworkModal({ isOpen, onClose, track }: ArtworkModalProps) {
  const { setIsLyricsOpen, setIsSignalPathOpen } = usePlayer();
  const [isZoomed, setIsZoomed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Keyboard shortcut: close on Escape
  useEffect(() => {
    if (!isOpen) {
      setIsZoomed(false);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isZoomed) {
          setIsZoomed(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isZoomed, onClose]);

  if (!isOpen || !track) return null;

  const hdCoverUrl = getUltraHdCoverUrl(track.coverUrl);
  const bitDepth = track.bitDepth || (track.hires ? 24 : 16);
  const sampleRateKhz = track.sampleRate
    ? (track.sampleRate / 1000).toFixed(1)
    : track.hires
    ? "96.0"
    : "44.1";
  const formatName = track.format || (track.isDsd ? "DSD64" : "FLAC");

  const handleCopyLink = async () => {
    if (!hdCoverUrl) return;
    try {
      await navigator.clipboard.writeText(hdCoverUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleDownloadArtwork = async () => {
    if (!hdCoverUrl) return;
    try {
      const resp = await fetch(hdCoverUrl);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      const cleanTitle = (track.title || "Artwork").replace(/[^a-zA-Z0-9_-]/g, "_");
      const cleanArtist = (track.artist || "Artist").replace(/[^a-zA-Z0-9_-]/g, "_");
      link.download = `${cleanArtist}_-_${cleanTitle}_HD_Cover.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(hdCoverUrl, "_blank");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-3 sm:p-6 select-none animate-in fade-in duration-200"
      onClick={() => {
        if (isZoomed) setIsZoomed(false);
        else onClose();
      }}
    >
      <div
        className={`relative bg-surface/95 border border-border rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.95)] overflow-hidden flex flex-col transition-all duration-300 ${
          isZoomed
            ? "w-[94vw] h-[92vh] max-w-5xl"
            : "w-full max-w-xl md:max-w-2xl max-h-[92vh]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card/60 flex-shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
              <Disc className="w-4 h-4 animate-spin-slow" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Album Artwork Inspector
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-primary/10 text-primary border border-primary/30">
                  Ultra HD
                </span>
              </div>
              <p className="text-[11px] text-textSecondary truncate">
                {track.album || track.title}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsZoomed(!isZoomed)}
              title={isZoomed ? "Standard View (Z)" : "Zoom In to 100% (Z)"}
              className="p-2 rounded-lg hover:bg-card text-textSecondary hover:text-white transition-colors cursor-pointer"
            >
              {isZoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              title="Close (Esc)"
              className="p-2 rounded-lg hover:bg-card text-textSecondary hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Center Artwork Canvas */}
        <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6 flex flex-col items-center justify-center bg-gradient-to-b from-black/40 via-surface to-black/60 relative">
          {/* Ambient Colored Backlight Glow */}
          {hdCoverUrl && (
            <div
              className="absolute inset-0 bg-cover bg-center blur-3xl opacity-20 pointer-events-none scale-125"
              style={{ backgroundImage: `url(${hdCoverUrl})` }}
            />
          )}

          {/* Main Image Container */}
          <div
            onClick={() => setIsZoomed(!isZoomed)}
            title={isZoomed ? "Click to fit view" : "Click to zoom / inspect high-res detail"}
            className={`relative group cursor-pointer transition-all duration-300 rounded-xl overflow-hidden border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex items-center justify-center bg-card/80 ${
              isZoomed
                ? "w-full h-full max-w-4xl max-h-[72vh]"
                : "w-[72vw] h-[72vw] max-w-[380px] max-h-[380px]"
            }`}
          >
            {hdCoverUrl ? (
              <>
                {!imageLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-card animate-pulse">
                    <Music className="w-12 h-12 text-textSecondary/40 animate-bounce" />
                  </div>
                )}
                <img
                  src={hdCoverUrl}
                  alt={track.title}
                  onLoad={() => setImageLoaded(true)}
                  className={`w-full h-full ${
                    isZoomed ? "object-contain" : "object-cover"
                  } transition-all duration-300 group-hover:scale-[1.02]`}
                />
                <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/75 backdrop-blur-md border border-white/15 text-[10px] font-mono text-white/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 shadow-lg">
                  {isZoomed ? <ZoomOut className="w-3 h-3" /> : <ZoomIn className="w-3 h-3" />}
                  <span>{isZoomed ? "Fit to Box" : "Inspect Full-Res"}</span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-textSecondary p-8">
                <Music className="w-16 h-16 mb-2 opacity-40" />
                <span className="text-xs">No artwork available</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Details & Action Bar */}
        <div className="px-5 py-4 border-t border-border bg-card/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-shrink-0">
          {/* Track and Codec Specs */}
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-white truncate leading-tight">
              {track.title}
            </h3>
            <p className="text-xs text-textSecondary truncate mt-0.5">
              {track.artist} {track.album ? `• ${track.album}` : ""}
            </p>
            <div className="flex items-center flex-wrap gap-1.5 mt-2 text-[10px] font-mono">
              <span className="px-1.5 py-0.5 rounded bg-badgeMaxBg text-badgeMax border border-badgeMax/40 font-bold">
                {formatName}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-surface border border-border text-textSecondary">
                {bitDepth}b / {sampleRateKhz}kHz
              </span>
              {track.drScore && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold">
                  DR{track.drScore}
                </span>
              )}
              {track.bitrate && (
                <span className="px-1.5 py-0.5 rounded bg-surface border border-border text-textSecondary">
                  ~{track.bitrate} kbps
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end flex-shrink-0">
            {hdCoverUrl && (
              <>
                <button
                  onClick={handleDownloadArtwork}
                  title="Download Full Resolution Artwork (JPG)"
                  className="px-3 py-1.5 rounded-lg bg-surface hover:bg-cardHover border border-border text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-accent" />
                  <span>Download Cover</span>
                </button>

                <button
                  onClick={handleCopyLink}
                  title="Copy Direct HD Image URL"
                  className="p-2 rounded-lg bg-surface hover:bg-cardHover border border-border text-textSecondary hover:text-white transition-colors cursor-pointer"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-accent" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>

                <a
                  href={hdCoverUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open Ultra-HD Image in New Tab"
                  className="p-2 rounded-lg bg-surface hover:bg-cardHover border border-border text-textSecondary hover:text-white transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </>
            )}

            <button
              onClick={() => {
                onClose();
                setIsLyricsOpen(true);
              }}
              title="View Synced Lyrics"
              className="p-2 rounded-lg bg-surface hover:bg-cardHover border border-border text-textSecondary hover:text-primary transition-colors cursor-pointer"
            >
              <Mic2 className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                onClose();
                setIsSignalPathOpen(true);
              }}
              title="Inspect Bit-Perfect Signal Path"
              className="p-2 rounded-lg bg-surface hover:bg-cardHover border border-border text-textSecondary hover:text-badgeMax transition-colors cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
