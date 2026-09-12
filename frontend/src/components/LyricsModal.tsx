"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { X, Mic2, AlignLeft, RefreshCw, Sparkles, Music } from "lucide-react";

export function LyricsModal() {
  const {
    currentTrack,
    progress,
    seek,
    lyrics,
    isLoadingLyrics,
    fetchLyrics,
    isLyricsOpen,
    setIsLyricsOpen,
  } = usePlayer();

  const [viewMode, setViewMode] = useState<"synced" | "plain">("synced");
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const [userIsScrolling, setUserIsScrolling] = useState<boolean>(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isLyricsOpen) {
        setIsLyricsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLyricsOpen, setIsLyricsOpen]);

  // Compute active lyric line index based on current playback progress
  const lines = lyrics?.lines || [];
  const hasSynced = Boolean(lyrics?.synced && lines.length > 0);

  // Fallback to plain if no synced lines exist
  useEffect(() => {
    if (!hasSynced && lyrics?.plain) {
      setViewMode("plain");
    } else if (hasSynced) {
      setViewMode("synced");
    }
  }, [hasSynced, lyrics?.plain]);

  // Calculate the currently active singing line
  const activeIndex = hasSynced
    ? lines.reduce((acc, line, idx) => {
        if (progress >= line.time) return idx;
        return acc;
      }, -1)
    : -1;

  // Auto-scroll active line into center
  useEffect(() => {
    if (viewMode !== "synced" || userIsScrolling) return;

    if (activeLineRef.current && lyricsContainerRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeIndex, viewMode, userIsScrolling]);

  const handleContainerScroll = () => {
    setUserIsScrolling(true);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      setUserIsScrolling(false);
    }, 2500);
  };

  if (!isLyricsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      {/* Dynamic blurred album artwork backdrop */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-3xl overflow-hidden">
        {currentTrack?.coverUrl && (
          <img
            src={currentTrack.coverUrl}
            alt=""
            className="w-full h-full object-cover opacity-20 scale-125 filter blur-3xl animate-pulse duration-1000"
          />
        )}
      </div>

      {/* Main lyrics card */}
      <div className="relative w-full max-w-3xl h-[88vh] bg-surface/90 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20 flex-shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            {currentTrack?.coverUrl ? (
              <img
                src={currentTrack.coverUrl}
                alt={currentTrack.title}
                className="w-12 h-12 rounded-xl object-cover border border-white/10 shadow-md flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-card border border-white/10 flex items-center justify-center flex-shrink-0">
                <Music className="w-6 h-6 text-textSecondary" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-base font-bold text-textPrimary truncate">
                {currentTrack?.title || "No Track Selected"}
              </h3>
              <p className="text-xs text-textSecondary truncate">{currentTrack?.artist}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* View Mode Toggle */}
            {hasSynced && (
              <div className="flex items-center bg-card/80 border border-white/10 rounded-lg p-0.5 text-xs">
                <button
                  onClick={() => setViewMode("synced")}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                    viewMode === "synced"
                      ? "bg-primary text-background font-semibold shadow-sm"
                      : "text-textSecondary hover:text-textPrimary"
                  }`}
                >
                  <Mic2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Karaoke Sync</span>
                </button>
                <button
                  onClick={() => setViewMode("plain")}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                    viewMode === "plain"
                      ? "bg-primary text-background font-semibold shadow-sm"
                      : "text-textSecondary hover:text-textPrimary"
                  }`}
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Full Lyrics</span>
                </button>
              </div>
            )}

            {/* Refresh button */}
            <button
              onClick={() => fetchLyrics(currentTrack)}
              disabled={isLoadingLyrics}
              title="Refresh Lyrics from LRCLIB & NAS"
              className="p-2 rounded-lg text-textSecondary hover:text-textPrimary hover:bg-card/60 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingLyrics ? "animate-spin text-primary" : ""}`} />
            </button>

            {/* Close button */}
            <button
              onClick={() => setIsLyricsOpen(false)}
              className="p-2 rounded-lg text-textSecondary hover:text-textPrimary hover:bg-card/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sync Status Banner */}
        <div className="px-6 py-2 bg-black/30 border-b border-white/5 flex items-center justify-between text-[11px] text-textSecondary font-mono flex-shrink-0">
          <div className="flex items-center space-x-2">
            {hasSynced ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-emerald-400 font-medium">Real-Time LRC Synchronized</span>
              </>
            ) : (
              <span>Static Lyrics View</span>
            )}
            {lyrics?.source && (
              <span className="text-textSecondary/60">
                • Source: {lyrics.source === "local-lrc" ? "Synology NAS (.lrc)" : lyrics.source === "local-tag" ? "FLAC Vorbis Tag" : "LRCLIB Database"}
              </span>
            )}
          </div>
          {hasSynced && viewMode === "synced" && (
            <span className="text-textSecondary/70 hidden sm:inline">Click any line to seek</span>
          )}
        </div>

        {/* Content Area */}
        <div
          ref={lyricsContainerRef}
          onScroll={handleContainerScroll}
          className="flex-1 min-h-0 overflow-y-auto px-6 py-8 space-y-6 select-none scrollbar-thin scrollbar-thumb-white/10"
        >
          {isLoadingLyrics ? (
            <div className="h-full flex flex-col items-center justify-center space-y-3 py-20 text-center">
              <RefreshCw className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm font-medium text-textPrimary">Searching lyrics database...</p>
              <p className="text-xs text-textSecondary">Fetching from LRCLIB & local NAS Vorbis tags</p>
            </div>
          ) : lyrics?.instrumental ? (
            <div className="h-full flex flex-col items-center justify-center space-y-3 py-20 text-center">
              <Sparkles className="w-10 h-10 text-accent opacity-70" />
              <p className="text-lg font-semibold text-textPrimary">Instrumental Track</p>
              <p className="text-xs text-textSecondary">This song contains no vocal lyrics.</p>
            </div>
          ) : viewMode === "synced" && hasSynced ? (
            <div className="space-y-4 py-20 text-center">
              {lines.map((line, idx) => {
                const isActive = idx === activeIndex;
                const isPast = idx < activeIndex;

                if (!line.text.trim()) {
                  return <div key={idx} className="h-6" />;
                }

                return (
                  <div
                    key={`${idx}-${line.time}`}
                    ref={isActive ? activeLineRef : null}
                    onClick={() => seek(line.time)}
                    className={`cursor-pointer transition-all duration-300 px-4 py-2 rounded-xl group ${
                      isActive
                        ? "text-2xl sm:text-3xl font-bold text-white scale-105 drop-shadow-[0_0_16px_rgba(255,255,255,0.4)]"
                        : isPast
                        ? "text-base sm:text-lg text-white/40 hover:text-white/70"
                        : "text-base sm:text-lg text-white/50 hover:text-white/80"
                    }`}
                  >
                    <span className="group-hover:underline decoration-primary/40 underline-offset-4">
                      {line.text}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : lyrics?.plain ? (
            <div className="max-w-xl mx-auto py-8 whitespace-pre-line text-center text-base sm:text-lg text-textPrimary/90 leading-relaxed font-sans">
              {lyrics.plain}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center space-y-3 py-20 text-center">
              <Mic2 className="w-10 h-10 text-textSecondary opacity-40" />
              <p className="text-base font-semibold text-textPrimary">No Lyrics Found</p>
              <p className="text-xs text-textSecondary max-w-sm">
                No synced or plain lyrics are available for "{currentTrack?.title}" by {currentTrack?.artist}.
              </p>
              <button
                onClick={() => fetchLyrics(currentTrack)}
                className="mt-2 px-4 py-2 rounded-lg bg-surface border border-white/10 text-xs font-semibold text-textPrimary hover:bg-card transition-colors"
              >
                Try Search Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
