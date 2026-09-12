"use client";

import React, { useEffect, useState, useMemo } from "react";
import { usePlayer } from "@/context/PlayerContext";
import {
  X,
  ListMusic,
  Play,
  Pause,
  Plus,
  Trash2,
  Sparkles,
  Music,
  Radio,
  RefreshCw,
  GripVertical,
  CornerDownRight,
  History,
  ListPlus,
  Clock,
} from "lucide-react";
import { PlayableTrack } from "@/types";

type QueueTab = "queue" | "history" | "suggested";

export function QueueDrawer() {
  const {
    currentTrack,
    queue,
    currentIndex,
    suggestedTracks,
    isLoadingSuggestions,
    autoplay,
    isPlaying,
    setAutoplay,
    playTrack,
    togglePlay,
    addToQueue,
    insertNextInQueue,
    reorderQueue,
    addAllToQueue,
    removeFromQueue,
    clearQueue,
    isQueueOpen,
    setIsQueueOpen,
    fetchSuggestions,
  } = usePlayer();

  const [activeTab, setActiveTab] = useState<QueueTab>("queue");
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isQueueOpen) {
        setIsQueueOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isQueueOpen, setIsQueueOpen]);

  // Upcoming queue items (after currentIndex)
  const upcomingQueue = useMemo(() => {
    if (currentIndex < 0) return queue;
    return queue.slice(currentIndex + 1);
  }, [queue, currentIndex]);

  // History tracks (before currentIndex, in reverse chronological order)
  const historyQueue = useMemo(() => {
    if (currentIndex <= 0) return [];
    return queue.slice(0, currentIndex).reverse();
  }, [queue, currentIndex]);

  // Helper to normalize song title for deduplication
  const normalizeTitle = (title: string) =>
    title
      .toLowerCase()
      .replace(/\s*[\(\[](feat|ft|with|prod|sped|slowed|acapella|remix|version).*?[\)\]]/gi, "")
      .replace(/[^a-z0-9]/gi, "")
      .trim();

  // Smart deduplication: exclude current song, queued songs, and repeated remix variations
  const filteredSuggestions = useMemo(() => {
    const seenTitles = new Set<string>();
    const seenIds = new Set<string>();

    if (currentTrack) {
      seenIds.add(currentTrack.id);
      seenTitles.add(normalizeTitle(currentTrack.title));
    }

    queue.forEach((t) => {
      seenIds.add(t.id);
      seenTitles.add(normalizeTitle(t.title));
    });

    return suggestedTracks.filter((track) => {
      if (seenIds.has(track.id)) return false;
      const normalized = normalizeTitle(track.title);
      if (seenTitles.has(normalized)) return false;
      seenTitles.add(normalized);
      return true;
    });
  }, [suggestedTracks, queue, currentTrack]);

  // Duration formatter
  const formatDuration = (sec?: number) => {
    if (!sec || isNaN(sec)) return "";
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Total upcoming duration summary
  const totalUpcomingDuration = useMemo(() => {
    const totalSec = upcomingQueue.reduce((acc, t) => acc + (t.duration || 210), 0);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remainingMins = mins % 60;
      return `${hrs}h ${remainingMins}m`;
    }
    return `${mins}m ${secs}s`;
  }, [upcomingQueue]);

  if (!isQueueOpen) return null;

  // Drag-and-drop handlers for queue reordering
  const handleDragStart = (e: React.DragEvent, localIdx: number) => {
    setDraggedIdx(localIdx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${localIdx}`);
  };

  const handleDragOver = (e: React.DragEvent, localIdx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIdx !== localIdx) {
      setDragOverIdx(localIdx);
    }
  };

  const handleDrop = (e: React.DragEvent, targetLocalIdx: number) => {
    e.preventDefault();
    if (draggedIdx !== null && draggedIdx !== targetLocalIdx) {
      const globalFrom = currentIndex + 1 + draggedIdx;
      const globalTo = currentIndex + 1 + targetLocalIdx;
      reorderQueue(globalFrom, globalTo);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-in fade-in duration-150">
      {/* Dimmed backdrop */}
      <div
        onClick={() => setIsQueueOpen(false)}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm transition-opacity"
      />

      {/* Drawer Container */}
      <div className="relative w-full max-w-lg h-full bg-[#0d0d0d] border-l border-border backdrop-blur-2xl shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-card/60">
          <div className="flex items-center space-x-2.5">
            <ListMusic className="w-5 h-5 text-primary" />
            <div>
              <h3 className="text-sm font-bold text-textPrimary tracking-wide">Play Queue</h3>
              {upcomingQueue.length > 0 && (
                <p className="text-[11px] text-textSecondary font-mono">
                  {upcomingQueue.length} {upcomingQueue.length === 1 ? "track" : "tracks"} • {totalUpcomingDuration}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => setIsQueueOpen(false)}
            aria-label="Close Queue"
            className="p-1.5 rounded-lg text-textSecondary hover:text-textPrimary hover:bg-card transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="px-5 py-2 border-b border-border bg-[#121212]/80 flex items-center justify-between">
          <div className="flex items-center space-x-1 bg-surface/80 p-1 rounded-lg border border-border/60">
            <button
              onClick={() => setActiveTab("queue")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                activeTab === "queue"
                  ? "bg-card text-primary shadow-sm"
                  : "text-textSecondary hover:text-textPrimary"
              }`}
            >
              Up Next {upcomingQueue.length > 0 && `(${upcomingQueue.length})`}
            </button>
            <button
              onClick={() => setActiveTab("suggested")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all flex items-center space-x-1 ${
                activeTab === "suggested"
                  ? "bg-card text-primary shadow-sm"
                  : "text-textSecondary hover:text-textPrimary"
              }`}
            >
              <Sparkles className="w-3 h-3 text-accent" />
              <span>Suggested {filteredSuggestions.length > 0 && `(${filteredSuggestions.length})`}</span>
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all flex items-center space-x-1 ${
                activeTab === "history"
                  ? "bg-card text-primary shadow-sm"
                  : "text-textSecondary hover:text-textPrimary"
              }`}
            >
              <History className="w-3 h-3" />
              <span>History {historyQueue.length > 0 && `(${historyQueue.length})`}</span>
            </button>
          </div>

          {activeTab === "queue" && upcomingQueue.length > 0 && (
            <button
              onClick={clearQueue}
              className="text-xs text-red-400 hover:text-red-300 flex items-center space-x-1 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
              title="Clear all upcoming tracks"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>

        {/* Autoplay Bar (Subtle & Compact) */}
        <div className="px-5 py-2.5 border-b border-border/60 bg-[#121212]/40 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => setAutoplay(!autoplay)}
              aria-label="Toggle Autoplay"
              className={`relative inline-flex h-4 w-8 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                autoplay ? "bg-primary" : "bg-neutral-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-black shadow transition duration-200 ease-in-out ${
                  autoplay ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
            <div>
              <span className="font-semibold text-textPrimary">Autoplay</span>
              <span className="text-[10px] text-textSecondary ml-1.5 hidden sm:inline">
                {autoplay ? "Similar songs play automatically" : "Playback stops at queue end"}
              </span>
            </div>
          </div>

          {currentTrack && (
            <span className="text-[10px] text-textSecondary font-mono uppercase tracking-wider flex items-center space-x-1">
              <Radio className="w-3 h-3 text-primary animate-pulse" />
              <span>Radio Active</span>
            </span>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 scrollbar-thin scrollbar-thumb-white/10">
          {/* TAB 1: QUEUE (Now Playing + Up Next + Quick Suggestions) */}
          {activeTab === "queue" && (
            <>
              {/* Now Playing Hero */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-textSecondary mb-2 px-1 flex items-center justify-between">
                  <span className="flex items-center space-x-1.5">
                    <Radio className="w-3.5 h-3.5 text-primary" />
                    <span>Now Playing</span>
                  </span>
                  {currentTrack && (
                    <span className="text-primary text-[10px] font-mono">
                      {currentTrack.hires ? "Hi-Res Master" : "Lossless FLAC"}
                    </span>
                  )}
                </div>

                {currentTrack ? (
                  <div className="group relative flex items-center space-x-3.5 p-3 rounded-xl bg-card/80 border border-primary/30 shadow-lg shadow-primary/5 hover:border-primary/50 transition-all">
                    {/* Album Art with Play/Pause Overlay */}
                    <div
                      onClick={togglePlay}
                      className="relative w-12 h-12 rounded-lg bg-surface border border-border/80 flex-shrink-0 overflow-hidden flex items-center justify-center cursor-pointer group/cover"
                    >
                      {currentTrack.coverUrl ? (
                        <img
                          src={currentTrack.coverUrl}
                          alt={currentTrack.title}
                          className="w-full h-full object-cover group-hover/cover:scale-105 transition-transform"
                        />
                      ) : (
                        <Music className="w-5 h-5 text-textSecondary" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/cover:opacity-100 flex items-center justify-center transition-opacity">
                        {isPlaying ? (
                          <Pause className="w-4 h-4 text-white fill-current" />
                        ) : (
                          <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                        )}
                      </div>
                    </div>

                    {/* Title, Artist, Badges */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-semibold text-primary truncate leading-tight">
                          {currentTrack.title}
                        </h4>
                        {currentTrack.hires ? (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-badgeMaxBg text-badgeMax border border-badgeMax/40 flex-shrink-0">
                            MAX
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-primary/10 text-primary border border-primary/30 flex-shrink-0">
                            HIGH
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-textSecondary truncate mt-0.5">{currentTrack.artist}</p>
                    </div>

                    {/* Animated Equalizer Waveform & Duration */}
                    <div className="flex items-center space-x-2.5 flex-shrink-0">
                      {isPlaying ? (
                        <div className="flex items-end space-x-0.5 h-4 px-2 py-1 rounded bg-primary/10 border border-primary/20">
                          <span className="w-0.5 bg-primary animate-pulse h-3 rounded-full" />
                          <span className="w-0.5 bg-primary animate-pulse h-2 rounded-full delay-75" />
                          <span className="w-0.5 bg-primary animate-pulse h-4 rounded-full delay-150" />
                        </div>
                      ) : (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-border text-textSecondary">
                          PAUSED
                        </span>
                      )}
                      {currentTrack.duration ? (
                        <span className="text-xs font-mono tabular-nums text-textSecondary hidden sm:inline">
                          {formatDuration(currentTrack.duration)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-card/30 border border-border/40 text-center">
                    <p className="text-xs text-textSecondary italic">No track currently playing</p>
                  </div>
                )}
              </div>

              {/* Up Next List (Reorderable) */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-textSecondary mb-2 px-1 flex items-center justify-between">
                  <span>Next In Queue ({upcomingQueue.length})</span>
                  {upcomingQueue.length > 1 && (
                    <span className="text-[10px] lowercase text-textSecondary/60 font-normal">
                      drag handle to reorder
                    </span>
                  )}
                </div>

                {upcomingQueue.length > 0 ? (
                  <div className="space-y-1">
                    {upcomingQueue.map((track, i) => {
                      const globalIdx = currentIndex + 1 + i;
                      const isBeingDragged = draggedIdx === i;
                      const isDropTarget = dragOverIdx === i;

                      return (
                        <div
                          key={`${track.id}-${globalIdx}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, i)}
                          onDragOver={(e) => handleDragOver(e, i)}
                          onDrop={(e) => handleDrop(e, i)}
                          onDragEnd={handleDragEnd}
                          className={`group flex items-center justify-between px-2.5 py-2 rounded-lg transition-all select-none ${
                            isBeingDragged
                              ? "opacity-30 bg-card border border-primary/50"
                              : isDropTarget
                              ? "border-t-2 border-primary bg-primary/5"
                              : "hover:bg-white/[0.05] border border-transparent"
                          }`}
                        >
                          {/* Drag Handle & Index */}
                          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                            <button
                              aria-label="Drag to reorder"
                              className="cursor-grab active:cursor-grabbing p-1 text-textSecondary/40 hover:text-textPrimary group-hover:opacity-100 opacity-60 transition-opacity"
                            >
                              <GripVertical className="w-3.5 h-3.5" />
                            </button>

                            {/* Thumbnail */}
                            <div className="w-9 h-9 rounded-md bg-card border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
                              {track.coverUrl ? (
                                <img
                                  src={track.coverUrl}
                                  alt={track.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Music className="w-4 h-4 text-textSecondary" />
                              )}
                            </div>

                            {/* Metadata */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-1.5">
                                <h5 className="text-xs font-semibold text-textPrimary truncate group-hover:text-primary transition-colors">
                                  {track.title}
                                </h5>
                                {track.hires && (
                                  <span className="px-1 py-0.1 rounded text-[8px] font-mono font-bold bg-badgeMaxBg text-badgeMax border border-badgeMax/40 flex-shrink-0">
                                    MAX
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-textSecondary truncate">{track.artist}</p>
                            </div>
                          </div>

                          {/* Duration & Actions */}
                          <div className="flex items-center space-x-1.5 pl-2 flex-shrink-0">
                            {track.duration && (
                              <span className="text-[11px] font-mono tabular-nums text-textSecondary group-hover:hidden sm:inline pr-1">
                                {formatDuration(track.duration)}
                              </span>
                            )}

                            <button
                              onClick={() => playTrack(track, queue)}
                              title="Play immediately"
                              className="p-1.5 rounded text-textSecondary hover:text-primary hover:bg-card transition-colors opacity-80 group-hover:opacity-100"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                            </button>

                            <button
                              onClick={() => removeFromQueue(globalIdx)}
                              title="Remove from queue"
                              className="p-1.5 rounded text-textSecondary hover:text-red-400 hover:bg-card transition-colors opacity-80 group-hover:opacity-100"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-card/30 border border-border/40 text-center space-y-1">
                    <p className="text-xs text-textSecondary">Upcoming queue is empty</p>
                    <p className="text-[11px] text-textSecondary/60">
                      {autoplay
                        ? "Autoplay will automatically pick similar tracks below."
                        : "Turn on Autoplay or add songs below to keep music going."}
                    </p>
                  </div>
                )}
              </div>

              {/* Recommended Songs Preview */}
              {filteredSuggestions.length > 0 && (
                <div className="pt-2 border-t border-border/50">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-textSecondary mb-2 px-1 flex items-center justify-between">
                    <span className="flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-accent" />
                      <span>
                        Recommended {currentTrack?.artist ? `• Based on ${currentTrack.artist}` : ""}
                      </span>
                    </span>
                    <button
                      onClick={() => fetchSuggestions(currentTrack)}
                      disabled={isLoadingSuggestions}
                      title="Refresh recommendations"
                      className="text-textSecondary hover:text-primary transition-colors p-1"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${isLoadingSuggestions ? "animate-spin text-primary" : ""}`}
                      />
                    </button>
                  </div>

                  <div className="space-y-1">
                    {filteredSuggestions.slice(0, 6).map((track) => (
                      <div
                        key={track.id}
                        className="group flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-white/[0.05] transition-all"
                      >
                        <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-md bg-card border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
                            {track.coverUrl ? (
                              <img
                                src={track.coverUrl}
                                alt={track.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Music className="w-4 h-4 text-textSecondary" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-1.5">
                              <h6 className="text-xs font-semibold text-textPrimary truncate group-hover:text-primary transition-colors">
                                {track.title}
                              </h6>
                              {track.hires && (
                                <span className="px-1 py-0.1 rounded text-[8px] font-mono font-bold bg-badgeMaxBg text-badgeMax border border-badgeMax/40 flex-shrink-0">
                                  MAX
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-textSecondary truncate">{track.artist}</p>
                          </div>
                        </div>

                        {/* Quick Actions: Play Next, Add to Queue, Play Now */}
                        <div className="flex items-center space-x-1 pl-2 flex-shrink-0">
                          <button
                            onClick={() => insertNextInQueue(track)}
                            title="Play Next (right after current song)"
                            className="p-1.5 rounded text-textSecondary hover:text-primary hover:bg-card transition-colors"
                          >
                            <CornerDownRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => addToQueue(track)}
                            title="Add to end of queue"
                            className="p-1.5 rounded text-textSecondary hover:text-textPrimary hover:bg-card transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => playTrack(track)}
                            title="Play immediately"
                            className="p-1.5 rounded text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {filteredSuggestions.length > 6 && (
                    <button
                      onClick={() => setActiveTab("suggested")}
                      className="w-full mt-2 py-1.5 text-xs text-primary/80 hover:text-primary hover:underline text-center font-semibold"
                    >
                      View all {filteredSuggestions.length} suggestions →
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* TAB 2: SUGGESTED SONGS (Deep Recommendations View) */}
          {activeTab === "suggested" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div>
                  <h4 className="text-xs font-bold text-textPrimary uppercase tracking-wider flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-accent" />
                    <span>Smart Radio Suggestions</span>
                  </h4>
                  {currentTrack && (
                    <p className="text-[11px] text-textSecondary">
                      Curated from <span className="text-primary font-medium">{currentTrack.artist}</span> & similar genres
                    </p>
                  )}
                </div>
                <div className="flex items-center space-x-1.5">
                  {filteredSuggestions.length > 0 && (
                    <button
                      onClick={() => addAllToQueue(filteredSuggestions)}
                      title="Add all suggested tracks to queue"
                      className="px-2.5 py-1 rounded bg-card hover:bg-surface border border-border text-xs font-semibold text-textPrimary hover:text-primary flex items-center space-x-1 transition-all"
                    >
                      <ListPlus className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Add All</span>
                    </button>
                  )}
                  <button
                    onClick={() => fetchSuggestions(currentTrack)}
                    disabled={isLoadingSuggestions}
                    title="Refresh suggestions"
                    className="p-1.5 rounded bg-card hover:bg-surface border border-border text-textSecondary hover:text-textPrimary transition-all"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isLoadingSuggestions ? "animate-spin text-primary" : ""}`}
                    />
                  </button>
                </div>
              </div>

              {isLoadingSuggestions ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-12 bg-card/40 rounded-lg animate-pulse border border-border/30" />
                  ))}
                </div>
              ) : filteredSuggestions.length > 0 ? (
                <div className="space-y-1">
                  {filteredSuggestions.map((track) => (
                    <div
                      key={track.id}
                      className="group flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-white/[0.05] transition-all"
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-md bg-card border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {track.coverUrl ? (
                            <img
                              src={track.coverUrl}
                              alt={track.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Music className="w-4 h-4 text-textSecondary" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-1.5">
                            <h5 className="text-xs font-semibold text-textPrimary truncate group-hover:text-primary transition-colors">
                              {track.title}
                            </h5>
                            {track.hires && (
                              <span className="px-1 py-0.1 rounded text-[8px] font-mono font-bold bg-badgeMaxBg text-badgeMax border border-badgeMax/40 flex-shrink-0">
                                MAX
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-textSecondary truncate">{track.artist}</p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center space-x-1 pl-2 flex-shrink-0">
                        {track.duration && (
                          <span className="text-[11px] font-mono tabular-nums text-textSecondary hidden sm:inline pr-1">
                            {formatDuration(track.duration)}
                          </span>
                        )}
                        <button
                          onClick={() => insertNextInQueue(track)}
                          title="Play Next"
                          className="p-1.5 rounded hover:bg-card text-textSecondary hover:text-primary transition-colors"
                        >
                          <CornerDownRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => addToQueue(track)}
                          title="Add to queue"
                          className="p-1.5 rounded hover:bg-card text-textSecondary hover:text-textPrimary transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => playTrack(track)}
                          title="Play immediately"
                          className="p-1.5 rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-xl bg-card/30 border border-border/40 text-center space-y-2">
                  <p className="text-xs text-textSecondary">No new suggestions found</p>
                  <button
                    onClick={() => fetchSuggestions(currentTrack)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Refresh suggestions
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: HISTORY (Recently Played in Current Session) */}
          {activeTab === "history" && (
            <div className="space-y-3">
              <div className="px-1">
                <h4 className="text-xs font-bold text-textPrimary uppercase tracking-wider flex items-center space-x-1.5">
                  <History className="w-3.5 h-3.5 text-primary" />
                  <span>Session History ({historyQueue.length})</span>
                </h4>
                <p className="text-[11px] text-textSecondary">
                  Tracks played earlier during this listening session
                </p>
              </div>

              {historyQueue.length > 0 ? (
                <div className="space-y-1">
                  {historyQueue.map((track, i) => (
                    <div
                      key={`hist-${track.id}-${i}`}
                      className="group flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-white/[0.05] transition-all"
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-md bg-card border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {track.coverUrl ? (
                            <img
                              src={track.coverUrl}
                              alt={track.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Music className="w-4 h-4 text-textSecondary" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h5 className="text-xs font-semibold text-textPrimary truncate group-hover:text-primary transition-colors">
                            {track.title}
                          </h5>
                          <p className="text-[11px] text-textSecondary truncate">{track.artist}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 pl-2 flex-shrink-0">
                        {track.duration && (
                          <span className="text-[11px] font-mono tabular-nums text-textSecondary hidden sm:inline pr-1">
                            {formatDuration(track.duration)}
                          </span>
                        )}
                        <button
                          onClick={() => addToQueue(track)}
                          title="Add back to queue"
                          className="p-1.5 rounded hover:bg-card text-textSecondary hover:text-textPrimary transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => playTrack(track)}
                          title="Play again"
                          className="p-1.5 rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-xl bg-card/30 border border-border/40 text-center space-y-1">
                  <Clock className="w-6 h-6 text-textSecondary/40 mx-auto mb-1" />
                  <p className="text-xs text-textSecondary">No previous songs in this session yet</p>
                  <p className="text-[11px] text-textSecondary/60">
                    Songs you listen to will appear here for easy replaying.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
