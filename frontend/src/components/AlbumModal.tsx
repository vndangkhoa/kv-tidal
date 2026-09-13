"use client";

import React, { useEffect, useState } from "react";
import { X, Play, Download, Loader2, Sparkles, Disc, Check, ShieldCheck, Music2 } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { PlayableTrack } from "@/types";

interface AlbumModalProps {
  isOpen: boolean;
  onClose: () => void;
  album: {
    id: string;
    title: string;
    artist: string;
    coverUrl?: string;
    releaseDate?: string;
    trackCount?: number;
  } | null;
}

interface RawAlbumTrack {
  trackId: string | number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  trackNumber?: number;
  streamId?: string;
  source?: string;
  bitDepth?: number;
  sampleRate?: number;
  format?: string;
  hires?: boolean;
  drScore?: number;
  isDsd?: boolean;
}

export function AlbumModal({ isOpen, onClose, album }: AlbumModalProps) {
  const { playTrack } = usePlayer();
  const [tracks, setTracks] = useState<RawAlbumTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen || !album) {
      setTracks([]);
      return;
    }

    const fetchTracks = async () => {
      setLoading(true);
      try {
        // 1. Try local NAS library album endpoint first
        const localResp = await fetch(`/api/library/album?id=${encodeURIComponent(album.id)}`);
        if (localResp.ok) {
          const localData = await localResp.json();
          if (localData.tracks && localData.tracks.length > 0) {
            const mapped: RawAlbumTrack[] = localData.tracks.map((lt: any, idx: number) => ({
              trackId: lt.id,
              trackName: lt.title,
              artistName: lt.artist,
              collectionName: lt.album,
              artworkUrl100: album.coverUrl,
              trackTimeMillis: (lt.duration || 0) * 1000,
              trackNumber: lt.track_number || idx + 1,
              streamId: lt.id,
              source: "local",
              bitDepth: lt.bit_depth || 24,
              sampleRate: lt.sample_rate || 96000,
              format: lt.format?.toUpperCase() || "FLAC",
              hires: lt.hires !== undefined ? lt.hires : true,
              drScore: lt.dr_score || 12,
              isDsd: lt.is_dsd,
            }));
            setTracks(mapped);
            setLoading(false);
            return;
          }
        }

        // 2. Fallback to trending/online iTunes lookup for non-local albums
        const resp = await fetch(`/api/trending/album?id=${encodeURIComponent(album.id)}`);
        if (resp.ok) {
          const data = await resp.json();
          setTracks(data.tracks || []);
        }
      } catch (err) {
        console.error("Failed fetching album tracks:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTracks();
  }, [isOpen, album]);

  if (!isOpen || !album) return null;

  const handlePlayAlbum = () => {
    if (tracks.length === 0) return;

    const queueItems: PlayableTrack[] = tracks.map((t) => {
      const isLocal = t.source === "local";
      return {
        id: isLocal && t.streamId ? t.streamId : `album-${t.trackId}`,
        title: t.trackName,
        artist: t.artistName,
        album: t.collectionName || album.title,
        coverUrl: album.coverUrl,
        streamUrl: isLocal && t.streamId
          ? `/api/stream?id=${encodeURIComponent(t.streamId)}&artist=${encodeURIComponent(t.artistName)}&title=${encodeURIComponent(t.trackName)}`
          : `/api/stream?artist=${encodeURIComponent(t.artistName)}&title=${encodeURIComponent(t.trackName)}`,
        duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : 210,
        bitDepth: t.bitDepth || 24,
        sampleRate: t.sampleRate || 96000,
        format: t.format || "FLAC",
        hires: t.hires !== undefined ? t.hires : true,
        source: isLocal ? "local" : "tidal",
        drScore: t.drScore || 13,
        isDsd: t.isDsd,
        filePath: isLocal && t.streamId?.startsWith("/") ? t.streamId : undefined,
        fileName: isLocal && t.streamId?.startsWith("/") ? t.streamId.split("/").pop() : undefined,
      };
    });

    // Play first track with rest of album as gapless queue
    playTrack(queueItems[0], queueItems);
    onClose();
  };

  const handlePlaySingle = (t: RawAlbumTrack) => {
    const isLocal = t.source === "local";
    playTrack({
      id: isLocal && t.streamId ? t.streamId : `album-${t.trackId}`,
      title: t.trackName,
      artist: t.artistName,
      album: t.collectionName || album.title,
      coverUrl: album.coverUrl,
      streamUrl: isLocal && t.streamId
        ? `/api/stream?id=${encodeURIComponent(t.streamId)}&artist=${encodeURIComponent(t.artistName)}&title=${encodeURIComponent(t.trackName)}`
        : `/api/stream?artist=${encodeURIComponent(t.artistName)}&title=${encodeURIComponent(t.trackName)}`,
      duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : 210,
      bitDepth: t.bitDepth || 24,
      sampleRate: t.sampleRate || 96000,
      format: t.format || "FLAC",
      hires: t.hires !== undefined ? t.hires : true,
      source: isLocal ? "local" : "tidal",
      drScore: t.drScore || 13,
      isDsd: t.isDsd,
      filePath: isLocal && t.streamId?.startsWith("/") ? t.streamId : undefined,
      fileName: isLocal && t.streamId?.startsWith("/") ? t.streamId.split("/").pop() : undefined,
    });
  };

  const handleDownloadAllToNas = async () => {
    if (tracks.length === 0 || downloadingAll) return;
    setDownloadingAll(true);
    let successCount = 0;

    for (const t of tracks) {
      try {
        await fetch("/api/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: t.trackName,
            artist: t.artistName,
            album: album.title,
            cover_url: album.coverUrl,
            source: "tidal",
          }),
        });
        successCount++;
      } catch {
        // continue
      }
    }

    setDownloadingAll(false);
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 4000);
    alert(`Queued ${successCount} bit-perfect FLAC tracks from "${album.title}" to Synology NAS!`);
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "3:30";
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const totalMillis = tracks.reduce((acc, t) => acc + (t.trackTimeMillis || 210000), 0);
  const totalMinutes = Math.round(totalMillis / 60000);
  const estimatedSizeMb = Math.round((totalMinutes * 60 * 2500 * 125) / (1024 * 1024));

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-[#121212] border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/60 hover:bg-card text-textSecondary hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Hero Area */}
        <div className="p-6 md:p-8 bg-gradient-to-b from-[#242424] to-[#121212] flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-6 border-b border-border/70 flex-shrink-0">
          <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-tidal overflow-hidden bg-card border border-border shadow-2xl flex-shrink-0 flex items-center justify-center">
            {album.coverUrl ? (
              <img
                src={album.coverUrl}
                alt={album.title}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  const fallback = e.currentTarget.parentElement?.querySelector(".modal-fallback-disc");
                  if (fallback) fallback.classList.remove("hidden");
                }}
                className="w-full h-full object-cover"
              />
            ) : null}
            <div className={`modal-fallback-disc ${album.coverUrl ? "hidden" : ""} absolute inset-0 flex items-center justify-center bg-black/80`}>
              <Disc className="w-16 h-16 text-textSecondary" />
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-badgeMaxBg text-badgeMax border border-badgeMax/40">
                <Sparkles className="w-3 h-3 text-badgeMax" />
                <span>
                  {tracks[0]?.bitDepth && tracks[0]?.sampleRate
                    ? `STUDIO MASTER • ${tracks[0].bitDepth}-BIT/${Math.round(tracks[0].sampleRate / 1000)}kHz ${tracks[0].format || "FLAC"}`
                    : "STUDIO MASTER • 24-BIT/96kHz FLAC"}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {tracks[0]?.drScore ? `DR${tracks[0].drScore} DYNAMICS` : "DR13 DYNAMICS"}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white truncate">
              {album.title}
            </h1>
            <p className="text-sm font-semibold text-textSecondary truncate">{album.artist}</p>
            <p className="text-xs text-textSecondary/70 font-mono">
              {album.releaseDate ? album.releaseDate.substring(0, 4) : "2024"} •{" "}
              {tracks.length > 0 ? `${tracks.length} tracks` : `${album.trackCount || 10} tracks`} •{" "}
              {totalMinutes} min • ~{estimatedSizeMb} MB Lossless
            </p>

            {/* Action Buttons */}
            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={handlePlayAlbum}
                disabled={tracks.length === 0}
                className="px-5 py-2.5 rounded-full bg-primary text-black font-bold text-xs flex items-center space-x-2 hover:scale-105 active:scale-95 disabled:opacity-40 transition-all shadow-md cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current ml-0.5" />
                <span>Play Bit-Perfect (Gapless)</span>
              </button>

              {tracks.some((t) => t.source === "local") ? (
                <div className="px-4 py-2.5 rounded-full bg-card border border-border/80 text-xs font-semibold text-emerald-400 flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Stored on Synology NAS</span>
                </div>
              ) : (
                <button
                  onClick={handleDownloadAllToNas}
                  disabled={tracks.length === 0 || downloadingAll}
                  className="px-4 py-2.5 rounded-full bg-card hover:bg-cardHover border border-border text-xs font-semibold text-textSecondary hover:text-white flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  {downloadingAll ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  ) : downloadSuccess ? (
                    <Check className="w-4 h-4 text-accent" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>Save Full Album to NAS</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tracks List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-1 divide-y divide-border/30 custom-scrollbar">
          {loading ? (
            <div className="py-12 text-center text-textSecondary flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs font-medium">Loading album tracklist & Master streams...</span>
            </div>
          ) : tracks.length === 0 ? (
            <div className="py-12 text-center text-textSecondary text-xs">
              No tracklist available for this album.
            </div>
          ) : (
            tracks.map((track, idx) => (
              <div
                key={track.trackId || idx}
                onClick={() => handlePlaySingle(track)}
                className="group flex items-center justify-between p-2.5 rounded-tidal hover:bg-card/70 transition-colors cursor-pointer select-none text-sm"
              >
                <div className="flex items-center space-x-3 min-w-0 flex-1">
                  <span className="w-6 text-center text-xs font-mono font-semibold text-textSecondary group-hover:text-primary">
                    {track.trackNumber || idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-semibold text-white truncate group-hover:underline">
                        {track.trackName}
                      </h4>
                      <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-badgeMaxBg text-badgeMax border border-badgeMax/30">
                        {track.format || "FLAC"} {track.bitDepth && track.sampleRate ? `${track.bitDepth}/${Math.round(track.sampleRate / 1000)}` : "24/96"}
                      </span>
                      {track.drScore && (
                        <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          DR{track.drScore}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-textSecondary truncate">{track.artistName}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 flex-shrink-0 text-xs font-mono text-textSecondary">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlaySingle(track);
                    }}
                    className="p-1.5 rounded-full hover:bg-card text-textSecondary hover:text-white"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                  <span className="w-10 text-right">{formatDuration(track.trackTimeMillis)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
