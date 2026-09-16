"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  SearchResultItem,
  SearchSuggestion,
  PreSearchTrendingData,
  RecentSearchItem,
  PlayableTrack,
} from "@/types";
import { TrackRow } from "@/components/TrackRow";
import { ArtistModal } from "@/components/ArtistModal";
import { AlbumModal } from "@/components/AlbumModal";
import { usePlayer } from "@/context/PlayerContext";
import {
  Search,
  Loader2,
  Disc3,
  Flame,
  Clock,
  X,
  User,
  Music,
  Sparkles,
  Play,
  RotateCcw,
  ShieldCheck,
  Award,
  Zap,
  Headphones,
  Activity,
  Link2,
  ArrowUpDown,
  Compass,
} from "lucide-react";

const RECENT_SEARCHES_KEY = "kv_recent_searches_v1";
const MAX_RECENTS = 8;

// Audiophile Reference Benchmarks with rich telemetry metadata
const AUDIOPHILE_BENCHMARKS = [
  {
    title: "Acoustic Dynamics",
    badge: "DR14+ Reference",
    query: "Acoustic Vocal Reference",
    description: "Uncompressed micro-dynamics & natural vocal decay",
    telemetry: "DR ≥ 14dB • Peak Uncompressed",
    icon: Activity,
    accent: "text-emerald-400",
    bgGradient: "from-emerald-950/30 to-card",
    borderColor: "hover:border-emerald-500/50",
  },
  {
    title: "Binaural 3D Soundstage",
    badge: "Spatial Imaging",
    query: "Binaural Recording",
    description: "Headphone pinna cues & holographic 360° instrument placement",
    telemetry: "Dummy Head • 3D Acoustic Space",
    icon: Headphones,
    accent: "text-sky-400",
    bgGradient: "from-sky-950/30 to-card",
    borderColor: "hover:border-sky-500/50",
  },
  {
    title: "Sub-Bass 20Hz Linear",
    badge: "Subwoofer Test",
    query: "Sub-Bass Test",
    description: "Deep low-frequency extension & room resonance boundary test",
    telemetry: "20Hz - 60Hz Linear • Fast Transient",
    icon: Zap,
    accent: "text-purple-400",
    bgGradient: "from-purple-950/30 to-card",
    borderColor: "hover:border-purple-500/50",
  },
  {
    title: "Jazz Live Room Separation",
    badge: "Instrument Separation",
    query: "Jazz Fusion Live",
    description: "Multi-instrument live soundstage width, depth & brass transient attack",
    telemetry: "Studio Live Room • Stereo Cross-Feed",
    icon: Music,
    accent: "text-amber-400",
    bgGradient: "from-amber-950/30 to-card",
    borderColor: "hover:border-amber-500/50",
  },
  {
    title: "Direct-to-Disc Vinyl",
    badge: "Pure Analog Master",
    query: "Direct to Disc",
    description: "Pure analog lacquer mastering with extended air and high transient headroom",
    telemetry: "Non-RIAA Master • Wide Air",
    icon: Disc3,
    accent: "text-rose-400",
    bgGradient: "from-rose-950/30 to-card",
    borderColor: "hover:border-rose-500/50",
  },
  {
    title: "Classical Hall Uncompressed",
    badge: "Symphonic Dynamic",
    query: "Orchestral Symphony Reference",
    description: "Massive 100-piece orchestral crescendo without dynamic range compression",
    telemetry: "Full Orchestra • 120dB Dynamic Span",
    icon: ShieldCheck,
    accent: "text-indigo-400",
    bgGradient: "from-indigo-950/30 to-card",
    borderColor: "hover:border-indigo-500/50",
  },
];

export default function SearchPage() {
  const { playTrack } = usePlayer();

  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [formatFilter, setFormatFilter] = useState<"all" | "masters" | "dsd" | "dr12">("all");
  const [sortBy, setSortBy] = useState<"relevance" | "quality" | "dr" | "duration">("relevance");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Pre-search & Trending state
  const [trendingData, setTrendingData] = useState<PreSearchTrendingData | null>(null);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>([]);

  // Instant Typeahead / Autocomplete state
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState<number>(-1);

  // Modals state
  const [selectedArtist, setSelectedArtist] = useState<{ name: string; coverUrl?: string } | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<{
    id: string;
    title: string;
    artist: string;
    coverUrl?: string;
    releaseDate?: string;
    trackCount?: number;
  } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keyboard shortcut (Cmd+K / Ctrl+K or /) to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 1. Load Recent Searches from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load recent searches:", e);
    }
  }, []);

  // 2. Fetch Zero-State Trending & Discovery Data on mount
  useEffect(() => {
    const fetchTrending = async () => {
      try {
        setLoadingTrending(true);
        const resp = await fetch("/api/search/trending");
        if (resp.ok) {
          const data: PreSearchTrendingData = await resp.json();
          setTrendingData(data);
        }
      } catch (err) {
        console.error("Failed to fetch pre-search trending:", err);
      } finally {
        setLoadingTrending(false);
      }
    };
    fetchTrending();
  }, []);

  // 3. Save a query to Recent Searches
  const saveRecentSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;

    setRecentSearches((prev) => {
      const filtered = prev.filter(
        (item) => item.query.toLowerCase() !== trimmed.toLowerCase()
      );
      const updated = [{ query: trimmed, timestamp: Date.now() }, ...filtered].slice(
        0,
        MAX_RECENTS
      );
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save recent search:", e);
      }
      return updated;
    });
  }, []);

  const removeRecentSearch = (e: React.MouseEvent, term: string) => {
    e.stopPropagation();
    setRecentSearches((prev) => {
      const updated = prev.filter((item) => item.query !== term);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to update recent searches:", e);
      }
      return updated;
    });
  };

  const clearAllRecents = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch (e) {
      console.error("Failed to clear recent searches:", e);
    }
  };

  // 4. Debounced Typeahead Autocomplete fetcher
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/search/suggestions?q=${encodeURIComponent(trimmed)}`);
        if (resp.ok) {
          const data = await resp.json();
          setSuggestions(data.suggestions || []);
          setShowSuggestions(true);
          setActiveSuggestionIdx(-1);
        }
      } catch (err) {
        console.error("Typeahead error:", err);
      }
    }, 150);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const executeSearch = async (searchTerm: string, selectedSource = source) => {
    const trimmed = searchTerm.trim();
    if (!trimmed) return;

    setQuery(trimmed);
    setShowSuggestions(false);
    setLoading(true);
    setSearched(true);
    saveRecentSearch(trimmed);

    try {
      const resp = await fetch(
        `/api/search?q=${encodeURIComponent(trimmed)}&source=${selectedSource}`
      );
      if (resp.ok) {
        const data = await resp.json();
        setResults(data.results || []);
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (activeSuggestionIdx >= 0 && suggestions[activeSuggestionIdx]) {
      selectSuggestion(suggestions[activeSuggestionIdx]);
    } else {
      executeSearch(query);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestionIdx((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestionIdx((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === "Enter" && activeSuggestionIdx >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeSuggestionIdx]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (suggestion: SearchSuggestion) => {
    executeSearch(suggestion.text);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setSearched(false);
    setShowSuggestions(false);
    searchInputRef.current?.focus();
  };

  // Check if current query is a direct streaming URL
  const isDirectUrl = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (
      q.startsWith("http://") ||
      q.startsWith("https://") ||
      q.includes("tidal.com") ||
      q.includes("qobuz.com") ||
      q.includes("spotify.com")
    );
  }, [query]);

  // Filter results by format
  const filteredResults = useMemo(() => {
    return results.filter((item) => {
      if (formatFilter === "masters") {
        return item.hires || (item.bit_depth && item.bit_depth > 16) || (item.sample_rate && item.sample_rate > 44100);
      }
      if (formatFilter === "dsd") {
        return item.is_dsd || item.format?.toLowerCase() === "dsf" || item.format?.toLowerCase() === "dff";
      }
      if (formatFilter === "dr12") {
        return (item.dr_score || 12) >= 12;
      }
      return true;
    });
  }, [results, formatFilter]);

  // Sort filtered results
  const sortedResults = useMemo(() => {
    const list = [...filteredResults];
    if (sortBy === "quality") {
      return list.sort((a, b) => {
        const aQ = (a.bit_depth || 16) * (a.sample_rate || 44100);
        const bQ = (b.bit_depth || 16) * (b.sample_rate || 44100);
        return bQ - aQ;
      });
    }
    if (sortBy === "dr") {
      return list.sort((a, b) => (b.dr_score || 10) - (a.dr_score || 10));
    }
    if (sortBy === "duration") {
      return list.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    }
    return list;
  }, [filteredResults, sortBy]);

  // Transform SearchResultItem into PlayableTrack
  const toPlayableTrack = (item: SearchResultItem): PlayableTrack => {
    let streamUrl = `/api/stream?artist=${encodeURIComponent(item.artist)}&title=${encodeURIComponent(
      item.title
    )}`;
    if (item.stream_id) streamUrl += `&id=${encodeURIComponent(item.stream_id)}`;

    return {
      id: item.stream_id || item.id,
      title: item.title,
      artist: item.artist,
      album: item.album,
      coverUrl: item.cover_url,
      streamUrl,
      duration: item.duration,
      bitDepth: item.bit_depth || (item.hires ? 24 : 16),
      sampleRate: item.sample_rate || (item.hires ? 96000 : 44100),
      bitrate: item.bitrate || 2800,
      format: item.format || (item.hires ? "FLAC" : "MP3"),
      hires: item.hires,
      source: item.source,
      drScore: item.dr_score || (item.hires ? 13 : 11),
    };
  };

  const handlePlaySingle = (item: SearchResultItem, contextList: SearchResultItem[]) => {
    const track = toPlayableTrack(item);
    const queue = contextList.map(toPlayableTrack);
    playTrack(track, queue);
  };

  const topMatch = sortedResults.length > 0 ? sortedResults[0] : null;

  return (
    <div className="space-y-4 sm:space-y-8 pb-16">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-2.5">
          <h1 className="text-xl sm:text-2xl font-bold text-textPrimary">Search & Discovery</h1>
          <span className="text-[10px] sm:text-xs font-semibold px-2 sm:px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 whitespace-nowrap">
            Bit-Perfect
          </span>
        </div>
        <p className="hidden sm:block text-sm text-textSecondary mt-1">
          Instant multi-stage search across Tidal Master, Qobuz Studio, Apple Music CDN, and Synology NAS FLAC storage.
        </p>
      </div>

      {/* Search Input Bar with Attached Typeahead & Keyboard Shortcut */}
      <div ref={searchContainerRef} className="relative space-y-3">
        <form onSubmit={handleSubmit} className="relative">
          <div className="relative flex items-center">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search tracks, artists, or paste URL..."
              className="w-full bg-card border border-border rounded-full px-4 py-2.5 sm:py-3 pl-10 sm:pl-11 pr-24 sm:pr-32 text-sm text-textPrimary placeholder-textSecondary/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 transition-all shadow-lg"
            />
            <Search className="w-4 h-4 sm:w-5 sm:h-5 text-textSecondary absolute left-3.5 top-3 sm:top-3.5" />

            {/* Keyboard shortcut hint */}
            {!query && (
              <span className="hidden sm:inline-flex items-center absolute right-24 text-[10px] font-mono text-textSecondary/60 bg-surface/80 px-2 py-0.5 rounded border border-border/70 pointer-events-none">
                ⌘K / /
              </span>
            )}

            {/* Clear button */}
            {query.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-20 sm:right-24 text-textSecondary hover:text-textPrimary p-1 rounded-full hover:bg-cardHover transition-colors cursor-pointer"
                title="Clear input"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Search Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="absolute right-1.5 sm:right-2 px-3.5 sm:px-4 py-1.5 bg-primary text-black font-bold rounded-full text-xs hover:brightness-110 active:scale-95 transition-all flex items-center space-x-1.5 shadow-md cursor-pointer"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" /> : <span>Search</span>}
            </button>
          </div>
        </form>

        {/* URL Detection Banner */}
        {isDirectUrl && (
          <div className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-primary/10 border border-primary/30 text-xs text-primary animate-in fade-in slide-in-from-top-1 duration-150">
            <Link2 className="w-4 h-4 flex-shrink-0 animate-pulse" />
            <span className="font-semibold">Direct Lossless URL Detected:</span>
            <span className="text-textSecondary truncate">
              Press Enter or click Search to resolve bit-perfect audio stream.
            </span>
          </div>
        )}

        {/* Source Pills & Audiophile Quality Filters Toolbar */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap pt-1 pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:justify-between">
          {/* Source Filter */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-textSecondary/70 mr-1 hidden sm:inline">
              Source:
            </span>
            {["all", "tidal", "qobuz", "local"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSource(s);
                  if (searched && query.trim()) {
                    executeSearch(query, s);
                  }
                }}
                className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  source === s
                    ? "bg-primary/20 text-primary border border-primary/40 shadow-sm shadow-primary/20 font-bold"
                    : "bg-surface border border-border text-textSecondary hover:text-textPrimary hover:border-textSecondary/40"
                }`}
              >
                {s === "local" ? "NAS" : s}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-border flex-shrink-0 sm:hidden" />

          {/* Audiophile Quality Filters & Sorting */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-mono flex-shrink-0">
            <button
              onClick={() => setFormatFilter("all")}
              className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
                formatFilter === "all"
                  ? "bg-white text-black font-bold"
                  : "bg-card border-border text-textSecondary hover:text-white"
              }`}
            >
              All Formats
            </button>
            <button
              onClick={() => setFormatFilter("masters")}
              className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer flex items-center space-x-1 whitespace-nowrap ${
                formatFilter === "masters"
                  ? "bg-amber-400 text-black font-bold shadow-md shadow-amber-400/20"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-300 hover:text-white"
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>Masters (≥24/96)</span>
            </button>
            <button
              onClick={() => setFormatFilter("dr12")}
              className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer flex items-center space-x-1 whitespace-nowrap ${
                formatFilter === "dr12"
                  ? "bg-emerald-500 text-black font-bold shadow-md shadow-emerald-500/20"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:text-white"
              }`}
            >
              <Award className="w-3 h-3" />
              <span>DR12+</span>
            </button>

            {/* Sort Dropdown when results are displayed */}
            {searched && results.length > 0 && (
              <div className="flex items-center space-x-1 ml-1 sm:ml-2 border-l border-border/70 pl-2">
                <ArrowUpDown className="w-3 h-3 text-textSecondary" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  aria-label="Sort search results by"
                  className="bg-card border border-border rounded-lg px-2 py-1 text-xs text-textPrimary focus:outline-none focus:border-primary cursor-pointer whitespace-nowrap"
                >
                  <option value="relevance">Relevance</option>
                  <option value="quality">Hi-Res</option>
                  <option value="dr">DR Score</option>
                  <option value="duration">Duration</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Floating Instant Typeahead Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-2 bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-border/40 animate-in fade-in zoom-in-95 duration-100">
            <div className="px-3 py-2 text-[11px] font-semibold text-textSecondary/70 uppercase tracking-wider flex items-center justify-between">
              <span>Instant Suggestions</span>
              <span className="text-[10px] text-textSecondary/50">↑↓ to navigate • Enter to select</span>
            </div>
            <div className="py-1 max-h-80 overflow-y-auto">
              {suggestions.map((item, idx) => {
                const isActive = idx === activeSuggestionIdx;
                return (
                  <button
                    key={`${item.type}-${item.text}-${idx}`}
                    type="button"
                    onClick={() => selectSuggestion(item)}
                    onMouseEnter={() => setActiveSuggestionIdx(idx)}
                    className={`w-full px-3.5 py-2.5 flex items-center space-x-3 text-left transition-colors cursor-pointer ${
                      isActive ? "bg-primary/15 text-primary" : "hover:bg-surface text-textPrimary"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {item.cover_url ? (
                        <img
                          src={item.cover_url}
                          alt={item.text}
                          className="w-full h-full object-cover"
                        />
                      ) : item.type === "artist" ? (
                        <User className="w-4 h-4 text-primary" />
                      ) : item.type === "track" ? (
                        <Music className="w-4 h-4 text-accent" />
                      ) : (
                        <Search className="w-4 h-4 text-textSecondary" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.text}</div>
                      {item.subtext && (
                        <div className="text-xs text-textSecondary truncate">{item.subtext}</div>
                      )}
                    </div>

                    <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-surface border border-border/70 text-textSecondary/70">
                      {item.type}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* CONDITIONAL CONTENT: Loading Skeleton OR Search Results OR Rich Zero-State Discovery */}
      {loading ? (
        <div className="space-y-4">
          <div className="flex items-center space-x-2 text-sm text-textSecondary mb-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Searching lossless catalog and local Synology NAS FLAC storage...</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-44 bg-card/40 rounded-xl animate-pulse border border-border/50 col-span-1" />
            <div className="h-44 bg-card/40 rounded-xl animate-pulse border border-border/50 col-span-2" />
          </div>
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-16 bg-card/40 rounded-xl animate-pulse border border-border/50"
            />
          ))}
        </div>
      ) : searched ? (
        /* Search Results State */
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-textSecondary">Results for:</span>
              <span className="text-sm font-bold text-textPrimary">"{query}"</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-surface border border-border text-textSecondary font-mono">
                {sortedResults.length} tracks
              </span>
            </div>
            <button
              onClick={handleClear}
              className="text-xs font-semibold text-primary hover:underline flex items-center space-x-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Back to Discovery</span>
            </button>
          </div>

          {sortedResults.length > 0 ? (
            <div className="space-y-6">
              {/* Featured Top Match Hero Card (Desktop Spotlight) */}
              {topMatch && (
                <div className="bg-gradient-to-r from-card via-card/90 to-surface border border-border rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col md:flex-row items-center gap-4 sm:gap-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                  
                  {/* Big Artwork with Play Overlay */}
                  <div className="relative w-28 h-28 sm:w-40 sm:h-40 rounded-xl overflow-hidden bg-surface border border-border flex-shrink-0 shadow-lg group">
                    {topMatch.cover_url ? (
                      <img
                        src={topMatch.cover_url}
                        alt={topMatch.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc3 className="w-12 h-12 text-textSecondary/40" />
                      </div>
                    )}
                    <button
                      onClick={() => handlePlaySingle(topMatch, sortedResults)}
                      className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                    >
                      <div className="w-12 h-12 rounded-full bg-primary text-black flex items-center justify-center shadow-2xl transform active:scale-95 transition-transform">
                        <Play className="w-6 h-6 fill-current ml-0.5" />
                      </div>
                    </button>
                  </div>

                  {/* Top Match Info */}
                  <div className="flex-1 min-w-0 text-center md:text-left space-y-2">
                    <div className="flex items-center justify-center md:justify-start space-x-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                        Top Match
                      </span>
                      <span className="text-xs text-textSecondary uppercase font-mono">
                        {topMatch.source === "local" ? "Synology NAS" : topMatch.source}
                      </span>
                    </div>

                    <h2 className="text-xl md:text-2xl font-bold text-white truncate">
                      {topMatch.title}
                    </h2>

                    <div className="flex items-center justify-center md:justify-start space-x-2 text-sm text-textSecondary">
                      <button
                        onClick={() => setSelectedArtist({ name: topMatch.artist, coverUrl: topMatch.cover_url })}
                        className="hover:text-primary hover:underline transition-colors font-medium truncate"
                      >
                        {topMatch.artist}
                      </button>
                      <span>•</span>
                      <button
                        onClick={() =>
                          setSelectedAlbum({
                            id: topMatch.id,
                            title: topMatch.album,
                            artist: topMatch.artist,
                            coverUrl: topMatch.cover_url,
                          })
                        }
                        className="hover:text-white hover:underline transition-colors truncate"
                      >
                        {topMatch.album}
                      </button>
                    </div>

                    {/* Audio Specs Badges */}
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-1.5 pt-1 font-mono text-[11px]">
                      <span className="px-2 py-0.5 rounded bg-surface border border-border text-primary font-bold">
                        {topMatch.format || (topMatch.hires ? "FLAC 24-bit" : "FLAC 16-bit")}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-surface border border-border text-amber-300">
                        {((topMatch.sample_rate || 96000) / 1000).toFixed(1)} kHz
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                        DR{topMatch.dr_score || 13}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="pt-2 flex items-center justify-center md:justify-start space-x-3">
                      <button
                        onClick={() => handlePlaySingle(topMatch, sortedResults)}
                        className="px-5 py-2 rounded-full bg-primary text-black font-bold text-xs hover:brightness-110 active:scale-95 transition-all flex items-center space-x-2 shadow-lg cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Play Master</span>
                      </button>
                      <button
                        onClick={() => setSelectedArtist({ name: topMatch.artist, coverUrl: topMatch.cover_url })}
                        className="px-4 py-2 rounded-full bg-surface hover:bg-cardHover border border-border text-xs text-textSecondary hover:text-white transition-colors cursor-pointer"
                      >
                        Explore Artist
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Full Results Track Rows */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-3 py-1 text-xs font-semibold text-textSecondary uppercase tracking-wider">
                  <span>Track Catalog</span>
                  <span>Audio Specs</span>
                </div>
                {(() => {
                  const searchQueue: PlayableTrack[] = sortedResults.map(toPlayableTrack);

                  return sortedResults.map((item) => (
                    <TrackRow
                      key={item.id}
                      title={item.title}
                      artist={item.artist}
                      album={item.album}
                      coverUrl={item.cover_url}
                      previewUrl={item.preview_url}
                      duration={item.duration}
                      source={item.source}
                      hires={item.hires}
                      streamId={item.stream_id}
                      bitDepth={item.bit_depth || (item.hires ? 24 : 16)}
                      sampleRate={item.sample_rate || (item.hires ? 96000 : 44100)}
                      bitrate={item.bitrate || 2800}
                      format={item.format || (item.hires ? "FLAC" : "MP3")}
                      drScore={item.dr_score || (item.hires ? 13 : 11)}
                      queueContext={searchQueue}
                      onArtistClick={(artName) =>
                        setSelectedArtist({ name: artName, coverUrl: item.cover_url })
                      }
                      onAlbumClick={(albName, artName, covUrl) =>
                        setSelectedAlbum({
                          id: item.id,
                          title: albName,
                          artist: artName,
                          coverUrl: covUrl,
                        })
                      }
                    />
                  ));
                })()}
              </div>
            </div>
          ) : (
            <div className="text-center py-16 bg-surface rounded-2xl border border-border">
              <Disc3 className="w-10 h-10 text-textSecondary mx-auto mb-2 opacity-50" />
              <p className="text-textSecondary text-sm font-medium">
                No tracks found matching "{query}" under current filter.
              </p>
              <button
                onClick={handleClear}
                className="mt-4 px-4 py-1.5 rounded-full bg-primary text-black font-semibold text-xs cursor-pointer"
              >
                Reset Search
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Rich Zero-State Discovery (Replaces the empty void) */
        <div className="space-y-10">
          {/* SECTION 1: Quick Lossless Picks (1-Click Play) */}
          {trendingData && trendingData.quick_picks && trendingData.quick_picks.length > 0 && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-textSecondary flex items-center space-x-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>Quick Hi-Res Picks • Instant Play</span>
                  </h2>
                  <p className="text-xs text-textSecondary/70 mt-0.5">
                    Studio masters ready for immediate bit-perfect playback
                  </p>
                </div>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Ready to Stream
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3.5">
                {trendingData.quick_picks.map((pick) => (
                  <div
                    key={pick.id}
                    onClick={() => handlePlaySingle(pick, trendingData.quick_picks)}
                    className="group bg-card hover:bg-cardHover border border-border hover:border-primary/50 rounded-xl p-3 transition-all duration-200 cursor-pointer flex flex-col justify-between shadow-md"
                  >
                    <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-surface border border-border/60 mb-2.5">
                      {pick.cover_url ? (
                        <img
                          src={pick.cover_url}
                          alt={pick.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-8 h-8 text-textSecondary/50" />
                        </div>
                      )}
                      {/* Cyan Hover Play Button */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-primary text-black flex items-center justify-center shadow-xl group-hover:scale-105 active:scale-95 transition-transform">
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </div>
                      </div>
                      {/* Audio Quality Badge */}
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-black/80 text-primary border border-primary/30 backdrop-blur-sm">
                        24b / 96k
                      </span>
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-bold text-textPrimary truncate group-hover:text-primary transition-colors">
                        {pick.title}
                      </div>
                      <div className="text-[11px] text-textSecondary truncate mt-0.5">
                        {pick.artist}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 2: Trending Artists Carousel */}
          {trendingData && trendingData.top_artists && trendingData.top_artists.length > 0 && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-textSecondary flex items-center space-x-1.5">
                    <User className="w-4 h-4 text-primary" />
                    <span>Trending Artists</span>
                  </h2>
                  <p className="text-xs text-textSecondary/70 mt-0.5">
                    Top streamed across lossless charts
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                {trendingData.top_artists.map((artist) => (
                  <div
                    key={artist.name}
                    onClick={() =>
                      setSelectedArtist({ name: artist.name, coverUrl: artist.cover_url })
                    }
                    className="group flex flex-col items-center text-center cursor-pointer"
                  >
                    <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-card border-2 border-border/80 group-hover:border-primary transition-all duration-300 shadow-lg group-hover:shadow-primary/20 mb-2">
                      {artist.cover_url ? (
                        <img
                          src={artist.cover_url}
                          alt={artist.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User className="w-7 h-7 text-textSecondary" />
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-medium text-textPrimary truncate max-w-full group-hover:text-primary transition-colors">
                      {artist.name}
                    </span>
                    <span className="text-[10px] text-textSecondary font-mono">
                      {artist.track_count} tracks
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 3: Audiophile Reference Benchmarks (Interactive Cards) */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-textSecondary flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Audiophile Reference Benchmarks</span>
                </h2>
                <p className="text-xs text-textSecondary/70 mt-0.5">
                  Engineered acoustic presets to evaluate DAC transient speed, soundstage, and dynamic headroom
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {AUDIOPHILE_BENCHMARKS.map((bm) => {
                const Icon = bm.icon;
                return (
                  <div
                    key={bm.title}
                    onClick={() => executeSearch(bm.query)}
                    className={`group relative p-4 rounded-xl bg-gradient-to-br ${bm.bgGradient} border border-border ${bm.borderColor} transition-all duration-200 cursor-pointer shadow-md hover:shadow-xl hover:-translate-y-0.5 flex flex-col justify-between`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <div className="p-1.5 rounded-lg bg-surface/80 border border-border">
                            <Icon className={`w-4 h-4 ${bm.accent}`} />
                          </div>
                          <span className="text-xs font-bold text-white group-hover:text-primary transition-colors">
                            {bm.title}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-black/50 text-textSecondary border border-border/50">
                          {bm.badge}
                        </span>
                      </div>

                      <p className="text-xs text-textSecondary/90 leading-relaxed mb-3">
                        {bm.description}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[10px] font-mono">
                      <span className="text-textSecondary/70 truncate">{bm.telemetry}</span>
                      <span className={`${bm.accent} font-semibold flex items-center space-x-1 group-hover:translate-x-1 transition-transform`}>
                        <span>Test Now</span>
                        <span>→</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 4: Curated Hi-Res Genres & Audio Vaults */}
          {trendingData && trendingData.genres && trendingData.genres.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-textSecondary flex items-center space-x-1.5">
                <Compass className="w-4 h-4 text-primary" />
                <span>Lossless Vaults & Genres</span>
              </h2>
              <div className="flex flex-wrap gap-2.5">
                {trendingData.genres.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => executeSearch(genre)}
                    className="px-3.5 py-1.5 rounded-full bg-card hover:bg-cardHover border border-border hover:border-primary/40 text-xs font-medium text-textSecondary hover:text-white transition-all cursor-pointer shadow-sm flex items-center space-x-1.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
                    <span>{genre}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 5: Recent Searches & Trending Topics (2-Column Grid) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
            {/* Recent Searches */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-textSecondary flex items-center space-x-1.5">
                  <Clock className="w-4 h-4 text-primary" />
                  <span>Recent Searches</span>
                </h3>
                {recentSearches.length > 0 && (
                  <button
                    onClick={clearAllRecents}
                    className="text-xs text-textSecondary hover:text-white transition-colors cursor-pointer"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {recentSearches.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((item) => (
                    <button
                      key={item.query}
                      onClick={() => executeSearch(item.query)}
                      className="group px-3 py-1.5 rounded-full bg-card hover:bg-cardHover border border-border hover:border-primary/40 text-xs text-textPrimary flex items-center space-x-2 transition-all cursor-pointer shadow-sm"
                    >
                      <Clock className="w-3 h-3 text-textSecondary/60" />
                      <span>{item.query}</span>
                      <span
                        onClick={(e) => removeRecentSearch(e, item.query)}
                        className="text-textSecondary group-hover:text-white p-0.5 rounded-full hover:bg-surface transition-colors"
                        title="Remove term"
                      >
                        <X className="w-3 h-3" />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-textSecondary/60 italic">No recent searches yet.</p>
              )}
            </div>

            {/* Trending Keywords */}
            {trendingData && trendingData.trending_keywords.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-textSecondary flex items-center space-x-1.5">
                  <Flame className="w-4 h-4 text-primary" />
                  <span>Trending Searches</span>
                </h3>
                <div className="flex flex-wrap gap-2">
                  {trendingData.trending_keywords.map((kw) => (
                    <button
                      key={kw}
                      onClick={() => executeSearch(kw)}
                      className="px-3 py-1.5 rounded-full bg-surface hover:bg-card border border-border text-xs text-textSecondary hover:text-white transition-colors cursor-pointer flex items-center space-x-1.5 shadow-sm"
                    >
                      <Flame className="w-3 h-3 text-amber-400" />
                      <span>{kw}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals for Direct Discovery Inspection */}
      {selectedArtist && (
        <ArtistModal
          isOpen={selectedArtist !== null}
          artistName={selectedArtist.name}
          artistAvatar={selectedArtist.coverUrl}
          onClose={() => setSelectedArtist(null)}
          onAlbumClick={(alb) =>
            setSelectedAlbum({
              id: alb.id,
              title: alb.title,
              artist: alb.artist,
              coverUrl: alb.coverUrl,
              releaseDate: alb.releaseDate,
            })
          }
        />
      )}

      {selectedAlbum && (
        <AlbumModal
          isOpen={selectedAlbum !== null}
          album={selectedAlbum}
          onClose={() => setSelectedAlbum(null)}
        />
      )}
    </div>
  );
}
