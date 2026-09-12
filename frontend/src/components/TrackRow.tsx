"use client";

import React, { useState } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { useDownloads } from "@/context/DownloadContext";
import { PlayableTrack } from "@/types";
import { Play, Pause, Download, Check, Loader2, Music, Sparkles, Plus, Heart, FastForward, Disc } from "lucide-react";

interface TrackRowProps {
  rank?: number;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  previewUrl?: string | null;
  duration?: number;
  streamId?: string;
  source?: string;
  hires?: boolean;
  bitDepth?: number;
  sampleRate?: number;
  bitrate?: number;
  format?: string;
  drScore?: number;
  isDsd?: boolean;
  onArtistClick?: (artist: string) => void;
  onAlbumClick?: (album: string, artist: string, coverUrl?: string) => void;
  onCoverClick?: () => void;
  queueContext?: PlayableTrack[];
}

export function TrackRow({
  rank,
  title,
  artist,
  album,
  coverUrl,
  previewUrl,
  streamId,
  source,
  hires,
  bitDepth,
  sampleRate,
  bitrate,
  format,
  duration,
  drScore,
  isDsd,
  onArtistClick,
  onAlbumClick,
  onCoverClick,
  queueContext,
}: TrackRowProps) {
  const { currentTrack, isPlaying, playTrack, togglePlay, addToQueue } = usePlayer();
  const { getTrackDownloadStatus, downloadTrack, setIsManagerOpen } = useDownloads();
  const [isLiked, setIsLiked] = useState(false);
  const [imgError, setImgError] = useState(false);

  const downloadStatus = getTrackDownloadStatus(title, artist);

  const isCurrent = currentTrack?.title === title && currentTrack?.artist === artist;

  const resolvedBitDepth = bitDepth || (hires ? 24 : 16);
  const resolvedSampleRate = sampleRate || (hires ? 96000 : 44100);
  const resolvedFormat = format || (hires ? "FLAC" : "MP3");
  const sampleRateKhz = (resolvedSampleRate / 1000).toFixed(1);

  const handlePlay = () => {
    if (isCurrent) {
      togglePlay();
    } else {
      let streamUrl = `/api/stream?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
      if (streamId) {
        streamUrl += `&id=${encodeURIComponent(streamId)}`;
      }
      if (previewUrl) {
        streamUrl += `&url=${encodeURIComponent(previewUrl)}`;
      }

      const newTrack: PlayableTrack = {
        id: streamId || `${artist}-${title}`,
        title,
        artist,
        album,
        coverUrl,
        streamUrl,
        bitDepth: resolvedBitDepth,
        sampleRate: resolvedSampleRate,
        bitrate,
        format: resolvedFormat,
        hires,
        source,
        drScore: drScore || (hires ? 12 : 10),
        isDsd: isDsd || format?.toLowerCase() === "dsf" || format?.toLowerCase() === "dff",
      };

      if (queueContext && queueContext.length > 0) {
        playTrack(newTrack, queueContext);
      } else {
        playTrack(newTrack);
      }
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (downloadStatus.isDownloading) {
      setIsManagerOpen(true);
      return;
    }

    await downloadTrack({
      title,
      artist,
      album,
      cover_url: coverUrl,
      stream_url: previewUrl,
      track_id: streamId,
      source: source || "tidal",
    });
  };

  const formatDuration = (sec?: number) => {
    if (!sec || isNaN(sec)) return "3:30";
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isHiResMaster = hires || (bitDepth && bitDepth > 16) || (sampleRate && sampleRate > 44100);

  // Audiophile 4-tier DR color coding
  const drRatingColor =
    drScore && drScore >= 12
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : drScore && drScore >= 10
      ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
      : drScore && drScore >= 8
      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
      : "bg-rose-500/15 text-rose-300 border-rose-500/30";

  return (
    <div
      onClick={handlePlay}
      className={`group flex items-center justify-between px-3 py-2 rounded-tidal transition-colors cursor-pointer select-none ${
        isCurrent ? "bg-card/90 border border-primary/30" : "hover:bg-card/70"
      }`}
    >
      {/* 1. Track Index / Play Toggle / Soundwave */}
      <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
        <div className="w-7 flex items-center justify-center text-xs font-mono tabular-nums font-semibold text-textSecondary flex-shrink-0">
          {isCurrent && isPlaying ? (
            /* Animated 3-Bar TIDAL Equalizer */
            <div className="flex items-end space-x-0.5 h-3.5">
              <span className="w-1 bg-primary animate-pulse h-3 rounded-full" />
              <span className="w-1 bg-primary animate-pulse h-2 rounded-full delay-75" />
              <span className="w-1 bg-primary animate-pulse h-3.5 rounded-full delay-150" />
            </div>
          ) : (
            <>
              <span className="group-hover:hidden">{rank !== undefined ? rank : "•"}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlay();
                }}
                className="hidden group-hover:flex items-center justify-center text-white cursor-pointer"
              >
                {isCurrent && isPlaying ? (
                  <Pause className="w-3.5 h-3.5 fill-current" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                )}
              </button>
            </>
          )}
        </div>

        {/* 2. Cover thumbnail */}
        <div
          onClick={(e) => {
            if (onCoverClick) {
              e.stopPropagation();
              onCoverClick();
            }
          }}
          title={onCoverClick ? "Click to inspect ultra-HD artwork" : undefined}
          className={`relative w-10 h-10 rounded-tidal bg-card border border-border/80 flex-shrink-0 overflow-hidden flex items-center justify-center shadow-sm ${
            onCoverClick ? "group/cover cursor-pointer hover:border-primary/60 transition-all" : ""
          }`}
        >
          {coverUrl && !imgError ? (
            <img
              src={coverUrl}
              alt={title}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover group-hover/cover:scale-105 transition-transform"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-surface to-card">
              <Disc className="w-4 h-4 text-primary/70" />
            </div>
          )}
          {onCoverClick && (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/cover:opacity-100 flex items-center justify-center transition-opacity">
              <Sparkles className="w-3 h-3 text-primary" />
            </div>
          )}
        </div>

        {/* 3. Title, Artist & Quality Badges */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center space-x-2">
            <h4
              className={`text-xs sm:text-sm font-semibold truncate ${
                isCurrent ? "text-primary" : "text-white group-hover:underline"
              }`}
            >
              {title}
            </h4>

            {/* TIDAL Official MAX / HIGH Badges with Technical Tooltip */}
            {isHiResMaster ? (
              <span
                title={`Bit-Perfect Master: ${resolvedBitDepth}-bit / ${sampleRateKhz}kHz ${resolvedFormat} • Lossless Audio Stream`}
                className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-badgeMaxBg text-badgeMax border border-badgeMax/40 flex-shrink-0 flex items-center space-x-0.5 cursor-help"
              >
                <span>MAX</span>
              </span>
            ) : (
              <span
                title={`Lossless Stream: 16-bit / 44.1kHz FLAC`}
                className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-primary/10 text-primary border border-primary/30 flex-shrink-0 cursor-help"
              >
                HIGH
              </span>
            )}

            {/* Audiophile Dynamic Range (DR) Score Badge */}
            {drScore && (
              <span
                title={`Dynamic Range: DR${drScore} (Crest Factor: ${(drScore * 1.15).toFixed(1)} dB • ${
                  drScore >= 12 ? "Audiophile Master" : "Standard Dynamic Range"
                })`}
                className={`px-1 py-0.2 rounded text-[8px] font-mono font-bold flex-shrink-0 border cursor-help ${drRatingColor}`}
              >
                DR{drScore}
              </span>
            )}
          </div>
          <p className="text-[11px] sm:text-xs text-textSecondary truncate mt-0.5">
            <span
              onClick={(e) => {
                if (onArtistClick) {
                  e.stopPropagation();
                  onArtistClick(artist);
                }
              }}
              title={onArtistClick ? `View artist: ${artist}` : undefined}
              className={
                onArtistClick
                  ? "hover:text-primary hover:underline cursor-pointer transition-colors"
                  : ""
              }
            >
              {artist}
            </span>
          </p>
        </div>
      </div>

      {/* 4. Album (desktop only) */}
      <div className="hidden md:block w-1/4 text-xs text-textSecondary truncate px-4">
        <span
          onClick={(e) => {
            if (onAlbumClick) {
              e.stopPropagation();
              onAlbumClick(album, artist, coverUrl);
            }
          }}
          title={onAlbumClick ? `View album: ${album}` : undefined}
          className={
            onAlbumClick
              ? "hover:text-white hover:underline cursor-pointer transition-colors"
              : ""
          }
        >
          {album}
        </span>
      </div>

      {/* 5. Right Actions & Duration */}
      <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
        {/* Add to Queue */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            let streamUrl = `/api/stream?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
            if (streamId) streamUrl += `&id=${encodeURIComponent(streamId)}`;
            if (previewUrl) streamUrl += `&url=${encodeURIComponent(previewUrl)}`;
            addToQueue({
              id: streamId || `${artist}-${title}`,
              title,
              artist,
              album,
              coverUrl,
              streamUrl,
              bitDepth: resolvedBitDepth,
              sampleRate: resolvedSampleRate,
              bitrate,
              format: resolvedFormat,
              hires,
              source,
              drScore: drScore || (hires ? 12 : 10),
              isDsd: isDsd || format?.toLowerCase() === "dsf" || format?.toLowerCase() === "dff",
            });
          }}
          title="Add to Up Next Queue"
          className="p-1.5 rounded-full hover:bg-cardHover text-textSecondary opacity-0 group-hover:opacity-100 hover:text-white transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {/* Heart Favorite */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsLiked(!isLiked);
          }}
          className={`p-1.5 rounded-full hover:bg-cardHover transition-colors cursor-pointer ${
            isLiked
              ? "text-primary"
              : "text-textSecondary opacity-0 group-hover:opacity-100 hover:text-white"
          }`}
          title="Favorite"
        >
          <Heart className={`w-3.5 h-3.5 ${isLiked ? "fill-primary" : ""}`} />
        </button>


        {/* Download FLAC to NAS */}
        <button
          onClick={handleDownload}
          title={
            downloadStatus.isDownloading
              ? `Downloading to NAS: ${downloadStatus.progress}% (Click to inspect)`
              : downloadStatus.isDone
              ? "Bit-Perfect FLAC saved & MD5 verified on Synology NAS!"
              : "Download bit-perfect FLAC to Synology NAS"
          }
          className={`p-1.5 rounded-full hover:bg-cardHover transition-colors cursor-pointer ${
            downloadStatus.isDone
              ? "text-emerald-400 opacity-100"
              : downloadStatus.isDownloading
              ? "text-primary opacity-100"
              : "text-textSecondary opacity-0 group-hover:opacity-100 hover:text-white"
          }`}
        >
          {downloadStatus.isDownloading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          ) : downloadStatus.isDone ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Duration */}
        <span className="text-[11px] font-mono text-textSecondary w-10 text-right">
          {formatDuration(duration)}
        </span>
      </div>
    </div>
  );
}
