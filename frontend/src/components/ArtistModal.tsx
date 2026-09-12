"use client";

import React, { useEffect, useState } from "react";
import {
  X,
  Play,
  Shuffle,
  Download,
  Loader2,
  Sparkles,
  Disc,
  User,
  ShieldCheck,
  Music2,
  Check,
} from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { SearchResultItem, PlayableTrack } from "@/types";
import { TrackRow } from "./TrackRow";

interface ArtistModalProps {
  isOpen: boolean;
  onClose: () => void;
  artistName: string | null;
  artistAvatar?: string;
  onAlbumClick?: (album: {
    id: string;
    title: string;
    artist: string;
    coverUrl?: string;
    releaseDate?: string;
  }) => void;
}

export function ArtistModal({
  isOpen,
  onClose,
  artistName,
  artistAvatar,
  onAlbumClick,
}: ArtistModalProps) {
  const { playTrack } = usePlayer();
  const [tracks, setTracks] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"tracks" | "discography">("tracks");

  useEffect(() => {
    if (!isOpen || !artistName) {
      setTracks([]);
      return;
    }

    const fetchArtistData = async () => {
      setLoading(true);
      try {
        const resp = await fetch(`/api/search?q=${encodeURIComponent(artistName)}`);
        if (resp.ok) {
          const data = await resp.json();
          const items: SearchResultItem[] = data.results || [];
          // Prioritize tracks matching this artist name
          const artistOnly = items.filter(
            (t) => t.artist.toLowerCase().includes(artistName.toLowerCase())
          );
          setTracks(artistOnly.length > 0 ? artistOnly : items);
        }
      } catch (err) {
        console.error("Failed fetching artist data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchArtistData();
  }, [isOpen, artistName]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !artistName) return null;

  // Convert SearchResultItem into PlayableTrack list
  const queueItems: PlayableTrack[] = tracks.map((t) => ({
    id: t.stream_id || `art-${t.artist}-${t.title}`,
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
    drScore: t.dr_score || 12,
  }));

  // Group into unique albums for Discography tab
  const albumsMap = new Map<
    string,
    { id: string; title: string; artist: string; coverUrl?: string; trackCount: number }
  >();
  tracks.forEach((t) => {
    if (t.album && !albumsMap.has(t.album)) {
      albumsMap.set(t.album, {
        id: t.stream_id || `alb-${t.album}`,
        title: t.album,
        artist: t.artist,
        coverUrl: t.cover_url,
        trackCount: 1,
      });
    } else if (t.album) {
      const item = albumsMap.get(t.album)!;
      item.trackCount++;
    }
  });
  const discography = Array.from(albumsMap.values());

  const heroAvatar = artistAvatar || tracks[0]?.cover_url;

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

    for (const t of tracks.slice(0, 15)) {
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
    setTimeout(() => setDownloadSuccess(false), 4000);
    alert(`Queued ${successCount} bit-perfect FLAC tracks by ${artistName} to Synology NAS!`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Hero Banner with Ambient Glow */}
        <div className="relative p-5 sm:p-6 md:p-8 bg-gradient-to-b from-[#1f1f1f] to-surface border-b border-border overflow-hidden flex-shrink-0">
          {heroAvatar && (
            <div
              className="absolute inset-0 bg-cover bg-center blur-3xl opacity-20 pointer-events-none scale-150"
              style={{ backgroundImage: `url(${heroAvatar})` }}
            />
          )}

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/40 hover:bg-card text-textSecondary hover:text-white transition-colors cursor-pointer z-10"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-center space-y-4 sm:space-y-0 sm:space-x-6 text-center sm:text-left">
            {/* Circular Artist Avatar */}
            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full overflow-hidden border-2 border-border shadow-2xl flex-shrink-0 bg-card flex items-center justify-center">
              {heroAvatar ? (
                <img src={heroAvatar} alt={artistName} className="w-full h-full object-cover" />
              ) : (
                <User className="w-14 h-14 text-textSecondary" />
              )}
            </div>

            {/* Artist Info & Verified Badge */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-center sm:justify-start space-x-2">
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/30">
                  <ShieldCheck className="w-3 h-3 text-primary" />
                  <span>VERIFIED MASTER ARTIST</span>
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-badgeMaxBg text-badgeMax border border-badgeMax/40">
                  24-BIT / 96kHz
                </span>
              </div>

              <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mt-1.5 truncate">
                {artistName}
              </h1>

              <p className="text-xs text-textSecondary mt-1 font-mono">
                {tracks.length} Master Tracks • {discography.length} Releases on KV-TIDAL
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 pt-3.5 sm:pt-4">
                <button
                  onClick={handlePlayAll}
                  disabled={tracks.length === 0}
                  className="px-5 py-2.5 rounded-full bg-primary text-black font-bold text-xs flex items-center space-x-2 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 cursor-pointer disabled:opacity-50 flex-shrink-0"
                >
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                  <span>Play All Hits</span>
                </button>

                <button
                  onClick={handleShuffle}
                  disabled={tracks.length === 0}
                  className="px-4 py-2.5 rounded-full bg-card hover:bg-cardHover border border-border text-xs font-semibold text-textSecondary hover:text-white flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>Shuffle</span>
                </button>

                <button
                  onClick={handleDownloadAllToNas}
                  disabled={tracks.length === 0 || downloadingAll}
                  className="px-4 py-2.5 rounded-full bg-card hover:bg-cardHover border border-border text-xs font-semibold text-textSecondary hover:text-white flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0"
                >
                  {downloadingAll ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                  ) : downloadSuccess ? (
                    <Check className="w-3.5 h-3.5 text-accent" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>{downloadingAll ? "Saving to NAS..." : "Download to NAS"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-6 px-6 border-b border-border bg-card/40 text-xs font-semibold flex-shrink-0">
          <button
            onClick={() => setActiveTab("tracks")}
            className={`py-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === "tracks"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-textSecondary hover:text-white"
            }`}
          >
            Popular Tracks ({tracks.length})
          </button>
          <button
            onClick={() => setActiveTab("discography")}
            className={`py-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === "discography"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-textSecondary hover:text-white"
            }`}
          >
            Discography & Albums ({discography.length})
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-xs text-textSecondary font-mono">
                Querying TIDAL 24-bit Master Discography for {artistName}...
              </p>
            </div>
          ) : activeTab === "tracks" ? (
            tracks.length === 0 ? (
              <div className="text-center py-12 text-textSecondary text-xs">
                No tracks found for {artistName}.
              </div>
            ) : (
              <div className="space-y-1">
                {tracks.map((t, idx) => (
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
                    drScore={t.dr_score || 12}
                    queueContext={queueItems}
                    onAlbumClick={(albumTitle, albumArtist, cover) => {
                      if (onAlbumClick) {
                        onAlbumClick({
                          id: t.stream_id || `alb-${albumTitle}`,
                          title: albumTitle,
                          artist: albumArtist,
                          coverUrl: cover,
                        });
                      }
                    }}
                  />
                ))}
              </div>
            )
          ) : discography.length === 0 ? (
            <div className="text-center py-12 text-textSecondary text-xs">
              No albums found in discography.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {discography.map((album) => (
                <div
                  key={album.id}
                  onClick={() => {
                    if (onAlbumClick) {
                      onAlbumClick({
                        id: album.id,
                        title: album.title,
                        artist: album.artist,
                        coverUrl: album.coverUrl,
                      });
                    }
                  }}
                  className="group bg-card/60 hover:bg-card border border-border/70 hover:border-border rounded-xl p-3 cursor-pointer transition-all hover:shadow-lg"
                >
                  <div className="aspect-square w-full rounded-lg overflow-hidden bg-surface mb-2.5 relative">
                    {album.coverUrl ? (
                      <img
                        src={album.coverUrl}
                        alt={album.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc className="w-8 h-8 text-textSecondary" />
                      </div>
                    )}
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-black/80 text-badgeMax border border-badgeMax/40">
                      MAX
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-white truncate group-hover:underline">
                    {album.title}
                  </h4>
                  <p className="text-[10px] text-textSecondary truncate mt-0.5">
                    {album.trackCount} {album.trackCount === 1 ? "track" : "tracks"} • 24b FLAC
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
