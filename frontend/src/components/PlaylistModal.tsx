"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  X,
  Play,
  Shuffle,
  Download,
  Loader2,
  Sparkles,
  Music2,
  Check,
  Radio,
  Clock,
  ListMusic,
  Search,
} from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { SearchResultItem, PlayableTrack } from "@/types";
import { TrackRow } from "./TrackRow";

interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlist: {
    id: string;
    title: string;
    subtitle: string;
    coverUrl?: string;
    searchQuery: string;
  } | null;
}

export function PlaylistModal({ isOpen, onClose, playlist }: PlaylistModalProps) {
  const { playTrack } = usePlayer();
  const [tracks, setTracks] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !playlist) {
      setTracks([]);
      setSearchFilter("");
      setToastMessage(null);
      return;
    }

    const fetchPlaylistTracks = async () => {
      setLoading(true);
      try {
        const resp = await fetch(`/api/search?q=${encodeURIComponent(playlist.searchQuery)}`);
        if (resp.ok) {
          const data = await resp.json();
          setTracks(data.results || []);
        }
      } catch (err) {
        console.error("Failed fetching playlist tracks:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPlaylistTracks();
  }, [isOpen, playlist]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const queueItems: PlayableTrack[] = useMemo(() => {
    return tracks.map((t) => ({
      id: t.stream_id || `pl-${t.artist}-${t.title}`,
      title: t.title,
      artist: t.artist,
      album: t.album,
      coverUrl: t.cover_url,
      streamUrl: `/api/stream?artist=${encodeURIComponent(t.artist)}&title=${encodeURIComponent(
        t.title
      )}${t.stream_id ? `&id=${encodeURIComponent(t.stream_id)}` : ""}`,
      duration: t.duration,
      bitDepth: t.bit_depth || 24,
      sampleRate: t.sample_rate || 96000,
      bitrate: t.bitrate || 2850,
      format: t.format || "FLAC",
      hires: t.hires,
      source: t.source || "tidal",
      drScore: t.dr_score || 13,
    }));
  }, [tracks]);

  const filteredTracks = useMemo(() => {
    if (!searchFilter.trim()) return tracks;
    const q = searchFilter.toLowerCase();
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.album && t.album.toLowerCase().includes(q))
    );
  }, [tracks, searchFilter]);

  if (!isOpen || !playlist) return null;

  const totalDurationSecs = tracks.reduce((acc, t) => acc + (t.duration || 210), 0);
  const totalMins = Math.round(totalDurationSecs / 60);
  const durationFormatted =
    totalMins >= 60
      ? `${Math.floor(totalMins / 60)} hr ${totalMins % 60} min`
      : `${totalMins} min`;

  // Lossless ~2500 kbps (312.5 KB/s) estimate for 24-bit/96kHz bit-perfect FLAC
  const estimatedMb = Math.round((totalDurationSecs * 2500 * 125) / (1024 * 1024));
  const estimatedSize =
    estimatedMb >= 1024 ? `${(estimatedMb / 1024).toFixed(1)} GB` : `${estimatedMb} MB`;

  const handlePlayAll = () => {
    if (queueItems.length === 0) return;
    playTrack(queueItems[0], queueItems);
  };

  const handleShuffle = () => {
    if (queueItems.length === 0) return;
    const shuffled = [...queueItems].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
  };

  const handleDownloadAllToNas = async () => {
    if (tracks.length === 0 || downloadingAll) return;
    setDownloadingAll(true);
    let successCount = 0;

    for (const t of tracks.slice(0, 20)) {
      try {
        await fetch("/api/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: t.title,
            artist: t.artist,
            album: t.album,
            cover_url: t.cover_url,
            source: t.source || "tidal",
          }),
        });
        successCount++;
      } catch {
        // continue
      }
    }

    setDownloadingAll(false);
    setDownloadSuccess(true);
    setToastMessage(`Queued ${successCount} bit-perfect FLAC tracks to Synology NAS`);
    setTimeout(() => {
      setDownloadSuccess(false);
      setToastMessage(null);
    }, 4500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toast feedback banner */}
        {toastMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 text-xs px-4 py-2 rounded-full shadow-xl flex items-center space-x-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <Check className="w-4 h-4 text-emerald-400" />
            <span className="font-medium">{toastMessage}</span>
          </div>
        )}

        {/* Playlist Hero Banner with Ambient Glow */}
        <div className="relative p-6 sm:p-8 bg-gradient-to-b from-[#222222] to-surface border-b border-border flex-shrink-0">
          {playlist.coverUrl && (
            <div
              className="absolute inset-0 bg-cover bg-center blur-3xl opacity-30 pointer-events-none scale-125"
              style={{ backgroundImage: `url(${playlist.coverUrl})` }}
            />
          )}

          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 hover:bg-card text-textSecondary hover:text-white transition-colors cursor-pointer z-10"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6 text-center sm:text-left">
            {/* Playlist Square Cover */}
            <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl overflow-hidden border border-border/80 shadow-2xl shadow-black/80 flex-shrink-0 bg-card ring-1 ring-white/10">
              {playlist.coverUrl ? (
                <img
                  src={playlist.coverUrl}
                  alt={playlist.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ListMusic className="w-12 h-12 text-textSecondary" />
                </div>
              )}
            </div>

            {/* Playlist Info */}
            <div className="min-w-0 flex-1 flex flex-col justify-between self-stretch">
              <div>
                <div className="flex items-center justify-center sm:justify-start space-x-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/30">
                    CURATED MASTER MIX
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-badgeMaxBg text-badgeMax border border-badgeMax/40">
                    DR13+ DYNAMICS
                  </span>
                </div>

                <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight mt-2 truncate">
                  {playlist.title}
                </h1>

                <p className="text-xs text-textSecondary mt-1 line-clamp-2">
                  {playlist.subtitle}
                </p>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-2.5 gap-y-1 text-xs text-textSecondary mt-2.5 font-mono">
                  <span>{tracks.length} tracks</span>
                  <span>•</span>
                  <span>~{durationFormatted}</span>
                  <span>•</span>
                  <span className="text-emerald-400 font-medium">Bit-Perfect 24/96</span>
                  <span>•</span>
                  <span className="text-textSecondary/70">~{estimatedSize} FLAC</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 pt-4">
                <button
                  onClick={handlePlayAll}
                  disabled={tracks.length === 0}
                  className="px-5 py-2.5 rounded-full bg-primary text-black font-bold text-xs flex items-center space-x-2 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/25 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                  <span>Play All</span>
                </button>

                <button
                  onClick={handleShuffle}
                  disabled={tracks.length === 0}
                  className="px-4 py-2.5 rounded-full bg-card hover:bg-cardHover border border-border text-xs font-semibold text-textSecondary hover:text-white flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>Shuffle</span>
                </button>

                <button
                  onClick={handleDownloadAllToNas}
                  disabled={tracks.length === 0 || downloadingAll}
                  className="px-4 py-2.5 rounded-full bg-card hover:bg-cardHover border border-border text-xs font-semibold text-textSecondary hover:text-white flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {downloadingAll ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                  ) : downloadSuccess ? (
                    <Check className="w-3.5 h-3.5 text-accent" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>{downloadingAll ? "Saving to NAS..." : "Save to NAS"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* In-playlist Search Filter Bar */}
        <div className="px-4 sm:px-6 py-2.5 bg-surface border-b border-border/60 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-textSecondary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter tracks or artists..."
              className="w-full bg-card/80 border border-border/80 rounded-lg pl-8 pr-7 py-1 text-xs text-white placeholder:text-textSecondary/60 focus:outline-none focus:border-primary/60 transition-colors"
            />
            {searchFilter && (
              <button
                onClick={() => setSearchFilter("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textSecondary hover:text-white text-xs p-0.5"
                title="Clear filter"
              >
                ✕
              </button>
            )}
          </div>

          <div className="text-[11px] font-mono text-textSecondary/80 hidden sm:block">
            {filteredTracks.length} of {tracks.length} tracks
          </div>
        </div>

        {/* Column Headers */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-2 border-b border-border/40 text-[10px] font-mono uppercase tracking-wider text-textSecondary/60 flex-shrink-0 bg-surface/80">
          <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
            <span className="w-7 text-center">#</span>
            <span className="w-10 text-center">Cover</span>
            <span className="min-w-0 flex-1">Title & Artist</span>
          </div>
          <div className="hidden md:block w-1/4 px-4">Album</div>
          <div className="flex items-center space-x-2 sm:space-x-3 justify-end flex-shrink-0 pr-1">
            <Clock className="w-3 h-3 text-textSecondary/60" />
            <span className="w-10 text-right">Time</span>
          </div>
        </div>

        {/* Track List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-4 space-y-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-xs text-textSecondary font-mono">
                Loading bit-perfect FLAC tracks for {playlist.title}...
              </p>
            </div>
          ) : filteredTracks.length === 0 ? (
            <div className="text-center py-12 text-textSecondary text-xs">
              {searchFilter
                ? `No tracks found matching "${searchFilter}"`
                : "No tracks available in this playlist."}
            </div>
          ) : (
            filteredTracks.map((t, idx) => (
              <TrackRow
                key={`${t.id}-${idx}`}
                rank={idx + 1}
                title={t.title}
                artist={t.artist}
                album={t.album}
                coverUrl={t.cover_url}
                previewUrl={t.preview_url}
                streamId={t.stream_id}
                source={t.source}
                hires={t.hires}
                bitDepth={t.bit_depth || 24}
                sampleRate={t.sample_rate || 96000}
                bitrate={t.bitrate}
                format={t.format || "FLAC"}
                duration={t.duration}
                drScore={t.dr_score || 13}
                queueContext={queueItems}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
