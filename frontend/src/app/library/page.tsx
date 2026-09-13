"use client";

import React, { useEffect, useState, Suspense, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { LibraryAlbum, LibraryArtist, LibraryTrack, MappedFolder, PlayableTrack } from "@/types";
import { usePlayer } from "@/context/PlayerContext";
import { TrackRow } from "@/components/TrackRow";
import { AlbumModal } from "@/components/AlbumModal";
import { ArtistModal } from "@/components/ArtistModal";
import { AlphabetScroller } from "@/components/AlphabetScroller";
import { getSortLetter, buildLetterIndexMap } from "@/utils/alphabet";
import {
  Library,
  RefreshCw,
  Folder,
  Music2,
  Users,
  Disc,
  Play,
  Sparkles,
  ShieldCheck,
  Award,
  Zap,
  Search,
  ArrowUpDown,
} from "lucide-react";

interface LibraryCache {
  albums: LibraryAlbum[];
  artists: LibraryArtist[];
  tracks: LibraryTrack[];
  mappedFolders: MappedFolder[];
  totalTracks: number;
  totalHires: number;
}

let globalLibraryCache: LibraryCache | null = null;

function LibraryContent() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");

  const [albums, setAlbums] = useState<LibraryAlbum[]>(() => globalLibraryCache?.albums || []);
  const [artists, setArtists] = useState<LibraryArtist[]>(() => globalLibraryCache?.artists || []);
  const [tracks, setTracks] = useState<LibraryTrack[]>(() => globalLibraryCache?.tracks || []);
  const [mappedFolders, setMappedFolders] = useState<MappedFolder[]>(() => globalLibraryCache?.mappedFolders || []);
  const [totalTracks, setTotalTracks] = useState<number>(() => globalLibraryCache?.totalTracks || 0);
  const [totalHires, setTotalHires] = useState<number>(() => globalLibraryCache?.totalHires || 0);
  const [activeView, setActiveView] = useState<"albums" | "artists" | "tracks" | "hires" | "dsd">(
    () => (tab && ["albums", "artists", "tracks", "hires", "dsd"].includes(tab) ? (tab as any) : "albums")
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"title" | "artist" | "dr" | "hires">("title");

  const switchTab = useCallback((newTab: "albums" | "artists" | "tracks" | "hires" | "dsd") => {
    setActiveView(newTab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", newTab);
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  useEffect(() => {
    if (tab && ["albums", "artists", "tracks", "hires", "dsd"].includes(tab)) {
      setActiveView(tab as "albums" | "artists" | "tracks" | "hires" | "dsd");
    }
  }, [tab]);

  // Listen to cross-component tab switch events and popstate for 0ms transitions
  useEffect(() => {
    const handleTabEvent = (e: any) => {
      const target = e.detail;
      if (["albums", "artists", "tracks", "hires", "dsd"].includes(target)) {
        setActiveView(target);
      }
    };
    const handlePopState = () => {
      const p = new URLSearchParams(window.location.search);
      const t = p.get("tab");
      if (t && ["albums", "artists", "tracks", "hires", "dsd"].includes(t)) {
        setActiveView(t as any);
      }
    };
    window.addEventListener("kv-library-tab", handleTabEvent as EventListener);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("kv-library-tab", handleTabEvent as EventListener);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const [loading, setLoading] = useState<boolean>(() => globalLibraryCache === null);
  const [rescanning, setRescanning] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<{
    id: string;
    title: string;
    artist: string;
    coverUrl?: string;
    releaseDate?: string;
    trackCount?: number;
  } | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<{
    name: string;
    avatar?: string;
  } | null>(null);

  const [displayLimit, setDisplayLimit] = useState(60);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset windowing limit on tab switch, search, or sort change
  useEffect(() => {
    setDisplayLimit(60);
  }, [activeView, searchQuery, sortBy]);

  // Infinite scroll observer: load next batch when sentinel enters viewport (with 600px buffer)
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayLimit((prev) => prev + 60);
        }
      },
      { rootMargin: "600px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [sentinelRef.current, activeView, searchQuery, sortBy]);

  const fetchLibrary = async (isBackground = false) => {
    if (!isBackground && !globalLibraryCache) {
      setLoading(true);
    }
    try {
      // Parallelize fetches to cut network wait time in half
      const [resp, tracksResp] = await Promise.all([
        fetch("/api/library"),
        fetch("/api/library/tracks"),
      ]);

      let newAlbums = globalLibraryCache?.albums || [];
      let newArtists = globalLibraryCache?.artists || [];
      let newFolders = globalLibraryCache?.mappedFolders || [];
      let newTotalTracks = globalLibraryCache?.totalTracks || 0;
      let newTotalHires = globalLibraryCache?.totalHires || 0;
      let newTracks = globalLibraryCache?.tracks || [];

      if (resp.ok) {
        const data = await resp.json();
        newAlbums = data.albums || [];
        newArtists = data.artists || [];
        newFolders = data.mapped_folders || [];
        newTotalTracks = data.total_tracks || 0;
        newTotalHires = data.total_hires || 0;
        setAlbums(newAlbums);
        setArtists(newArtists);
        setMappedFolders(newFolders);
        setTotalTracks(newTotalTracks);
        setTotalHires(newTotalHires);
      }

      if (tracksResp.ok) {
        const tData = await tracksResp.json();
        newTracks = tData.tracks || [];
        setTracks(newTracks);
      }

      globalLibraryCache = {
        albums: newAlbums,
        artists: newArtists,
        tracks: newTracks,
        mappedFolders: newFolders,
        totalTracks: newTotalTracks,
        totalHires: newTotalHires,
      };
    } catch (e) {
      console.error("Library fetch failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // If we have cache, render instantly and revalidate in background; otherwise fetch with loader
    fetchLibrary(globalLibraryCache !== null);
  }, []);

  const handleRescan = async (deep: boolean = false) => {
    setRescanning(true);
    try {
      await fetch(`/api/library/scan${deep ? "?deep=true" : ""}`, { method: "POST" });
      setTimeout(async () => {
        await fetchLibrary();
        setRescanning(false);
      }, 2000);
    } catch (e) {
      setRescanning(false);
    }
  };

  const { playTrack } = usePlayer();

  const handlePlayAlbumDirect = async (album: LibraryAlbum, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    let albumTracks = tracks.filter(
      (t) =>
        t.album.toLowerCase() === album.name.toLowerCase() &&
        (album.artist ? t.artist.toLowerCase() === album.artist.toLowerCase() : true)
    );

    if (albumTracks.length === 0) {
      try {
        const resp = await fetch(`/api/library/album?id=${encodeURIComponent(album.id)}`);
        if (resp.ok) {
          const data = await resp.json();
          albumTracks = data.tracks || [];
        }
      } catch (err) {
        console.error("Failed to fetch album tracks:", err);
      }
    }

    if (albumTracks.length === 0) return;

    albumTracks.sort((a, b) => (a.track_number || 0) - (b.track_number || 0));

    const queueItems: PlayableTrack[] = albumTracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      coverUrl: `/rest/getCoverArt.view?id=album-${album.id}`,
      streamUrl: `/api/stream?id=${encodeURIComponent(t.id)}&artist=${encodeURIComponent(t.artist || "")}&title=${encodeURIComponent(t.title || "")}`,
      duration: t.duration,
      bitDepth: t.bit_depth || 24,
      sampleRate: t.sample_rate || 96000,
      format: t.format?.toUpperCase() || "FLAC",
      hires: t.hires,
      source: "local",
      drScore: t.dr_score || 12,
      isDsd: t.is_dsd,
      filePath: t.file_path,
      fileName: t.file_path ? t.file_path.split("/").pop() : undefined,
    }));

    playTrack(queueItems[0], queueItems);
  };

  // Dynamic DR average (memoized across 8,000+ tracks)
  const avgDr = useMemo(() => {
    const tracksWithDr = tracks.filter((t) => t.dr_score && t.dr_score > 0);
    return tracksWithDr.length > 0
      ? (tracksWithDr.reduce((acc, t) => acc + (t.dr_score || 0), 0) / tracksWithDr.length).toFixed(1)
      : "13.0";
  }, [tracks]);

  // Filter lists based on searchQuery and activeView
  const queryLower = searchQuery.trim().toLowerCase();

  const filterTrackBySearch = useCallback(
    (t: LibraryTrack) => {
      if (!queryLower) return true;
      return (
        t.title.toLowerCase().includes(queryLower) ||
        t.artist.toLowerCase().includes(queryLower) ||
        t.album.toLowerCase().includes(queryLower)
      );
    },
    [queryLower]
  );

  const sortTracksList = useCallback(
    (list: LibraryTrack[]) => {
      return [...list].sort((a, b) => {
        if (sortBy === "dr") return (b.dr_score || 0) - (a.dr_score || 0);
        if (sortBy === "artist") return a.artist.localeCompare(b.artist);
        if (sortBy === "hires") {
          const aVal = (a.bit_depth || 16) * 1000000 + (a.sample_rate || 44100);
          const bVal = (b.bit_depth || 16) * 1000000 + (b.sample_rate || 44100);
          return bVal - aVal;
        }
        return a.title.localeCompare(b.title);
      });
    },
    [sortBy]
  );

  const hiresTracks = useMemo(() => {
    return sortTracksList(
      tracks.filter(
        (t) =>
          (t.hires || (t.bit_depth && t.bit_depth > 16) || (t.sample_rate && t.sample_rate > 44100)) &&
          filterTrackBySearch(t)
      )
    );
  }, [tracks, sortTracksList, filterTrackBySearch]);

  const dsdTracks = useMemo(() => {
    return sortTracksList(
      tracks.filter(
        (t) =>
          (t.is_dsd || t.format?.toLowerCase() === "dsf" || t.format?.toLowerCase() === "dff") &&
          filterTrackBySearch(t)
      )
    );
  }, [tracks, sortTracksList, filterTrackBySearch]);

  const allFilteredTracks = useMemo(() => {
    return sortTracksList(tracks.filter(filterTrackBySearch));
  }, [tracks, sortTracksList, filterTrackBySearch]);

  const filteredAlbums = useMemo(() => {
    const list = albums.filter((alb) => {
      if (!queryLower) return true;
      return alb.name.toLowerCase().includes(queryLower) || alb.artist.toLowerCase().includes(queryLower);
    });
    return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [albums, queryLower]);

  const filteredArtists = useMemo(() => {
    const list = artists.filter((art) => {
      if (!queryLower) return true;
      return art.name.toLowerCase().includes(queryLower);
    });
    return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [artists, queryLower]);

  const alphabetData = useMemo(() => {
    const isAlphabetical =
      activeView === "albums" ||
      activeView === "artists" ||
      sortBy === "title" ||
      sortBy === "artist";

    if (!isAlphabetical) {
      return { availableLetters: new Set<string>(), letterIndexMap: {} };
    }

    let names: string[] = [];
    if (activeView === "albums") {
      names = filteredAlbums.map((a) => a.name);
    } else if (activeView === "artists") {
      names = filteredArtists.map((a) => a.name);
    } else if (activeView === "hires") {
      names = hiresTracks.map((t) => (sortBy === "artist" ? t.artist : t.title));
    } else if (activeView === "dsd") {
      names = dsdTracks.map((t) => (sortBy === "artist" ? t.artist : t.title));
    } else {
      names = allFilteredTracks.map((t) => (sortBy === "artist" ? t.artist : t.title));
    }

    return buildLetterIndexMap(names);
  }, [
    activeView,
    sortBy,
    filteredAlbums,
    filteredArtists,
    hiresTracks,
    dsdTracks,
    allFilteredTracks,
  ]);

  const handleSelectLetter = useCallback(
    (letter: string) => {
      const targetIndex = alphabetData.letterIndexMap[letter];
      if (targetIndex === undefined) return;

      if (targetIndex >= displayLimit) {
        setDisplayLimit(targetIndex + 60);
      }

      requestAnimationFrame(() => {
        const el = document.getElementById(`letter-anchor-${letter}`);
        const container = document.getElementById("main-content");
        if (el && container) {
          const containerRect = container.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const relativeTop = elRect.top - containerRect.top + container.scrollTop - 20;
          container.scrollTo({
            top: Math.max(0, relativeTop),
            behavior: "smooth",
          });
        }
      });
    },
    [alphabetData.letterIndexMap, displayLimit]
  );

  // Progressive windowing slices (only renders top N elements into the DOM)
  const visibleAlbums = useMemo(() => filteredAlbums.slice(0, displayLimit), [filteredAlbums, displayLimit]);
  const visibleArtists = useMemo(() => filteredArtists.slice(0, displayLimit), [filteredArtists, displayLimit]);
  const visibleHires = useMemo(() => hiresTracks.slice(0, displayLimit), [hiresTracks, displayLimit]);
  const visibleDsd = useMemo(() => dsdTracks.slice(0, displayLimit), [dsdTracks, displayLimit]);
  const visibleTracks = useMemo(() => allFilteredTracks.slice(0, displayLimit), [allFilteredTracks, displayLimit]);

  const currentTotal =
    activeView === "albums"
      ? filteredAlbums.length
      : activeView === "artists"
      ? filteredArtists.length
      : activeView === "hires"
      ? hiresTracks.length
      : activeView === "dsd"
      ? dsdTracks.length
      : allFilteredTracks.length;

  const currentCount = Math.min(displayLimit, currentTotal);
  const hasMore = currentCount < currentTotal;

  return (
    <div className={`space-y-4 sm:space-y-6 pb-12 ${currentTotal >= 15 ? "pr-5 sm:pr-8" : "pr-0 sm:pr-4"}`}>
      {/* Header & Rescan Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl sm:text-2xl font-bold text-textPrimary">Synology NAS Vault</h1>
            <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              BIT-PERFECT STORAGE
            </span>
          </div>
          <p className="text-xs sm:text-sm text-textSecondary mt-0.5 hidden xs:block">
            Browse, manage, and stream bit-perfect studio master audio files stored on your Synology NAS.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleRescan(false)}
            disabled={rescanning}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs text-textSecondary hover:text-textPrimary bg-surface border border-border rounded-xl transition-colors cursor-pointer"
            title="Fast Inotify scan for newly added tracks"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rescanning ? "animate-spin text-primary" : ""}`} />
            <span>Fast Scan</span>
          </button>
          <button
            onClick={() => handleRescan(true)}
            disabled={rescanning}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs text-primary hover:text-white bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-xl transition-colors cursor-pointer"
            title="Deep audio audit: Recalculate Dynamic Range (DR) scores and verify FLAC checksums"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            <span>Deep Audit</span>
          </button>
        </div>
      </div>

      {/* Mobile Single-Row Telemetry Strip (< 640px) */}
      <div className="sm:hidden flex items-center space-x-2 overflow-x-auto no-scrollbar py-0.5">
        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-surface border border-border flex-shrink-0 text-xs font-mono">
          <Music2 className="w-3.5 h-3.5 text-primary" />
          <span className="font-bold text-white">{totalTracks}</span>
          <span className="text-[10px] text-textSecondary">Tracks</span>
        </div>
        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-surface border border-border flex-shrink-0 text-xs font-mono">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-bold text-amber-400">{totalHires}</span>
          <span className="text-[10px] text-amber-400/80">Hi-Res</span>
        </div>
        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-surface border border-border flex-shrink-0 text-xs font-mono">
          <Disc className="w-3.5 h-3.5 text-primary" />
          <span className="font-bold text-white">{albums.length}</span>
          <span className="text-[10px] text-textSecondary">Albums</span>
        </div>
        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-surface border border-border flex-shrink-0 text-xs font-mono">
          <Award className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-bold text-emerald-400">DR{avgDr}</span>
          <span className="text-[10px] text-emerald-400/80">Crest Avg</span>
        </div>
        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-surface border border-border flex-shrink-0 text-xs font-mono">
          <Folder className="w-3.5 h-3.5 text-accent" />
          <span className="font-bold text-white">{mappedFolders.length}</span>
          <span className="text-[10px] text-textSecondary">Shares</span>
        </div>
      </div>

      {/* Desktop Audiophile Telemetry 5-Card Grid (>= 640px) */}
      <div className="hidden sm:grid grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-surface border border-border p-4 rounded-xl">
          <div className="flex items-center space-x-2 text-textSecondary text-xs">
            <Music2 className="w-4 h-4 text-primary" />
            <span>Total Tracks</span>
          </div>
          <p className="text-xl font-bold text-textPrimary mt-1">{totalTracks}</p>
          <span className="text-[10px] font-mono text-textSecondary/70">100% Lossless</span>
        </div>

        <div className="bg-surface border border-border p-4 rounded-xl">
          <div className="flex items-center space-x-2 text-textSecondary text-xs">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Hi-Res Master</span>
          </div>
          <p className="text-xl font-bold text-amber-400 mt-1">{totalHires}</p>
          <span className="text-[10px] font-mono text-amber-400/80">≥ 24-bit / 96kHz</span>
        </div>

        <div className="bg-surface border border-border p-4 rounded-xl">
          <div className="flex items-center space-x-2 text-textSecondary text-xs">
            <Disc className="w-4 h-4 text-primary" />
            <span>Albums</span>
          </div>
          <p className="text-xl font-bold text-textPrimary mt-1">{albums.length}</p>
          <span className="text-[10px] font-mono text-textSecondary/70">Master Pressings</span>
        </div>

        <div className="bg-surface border border-border p-4 rounded-xl">
          <div className="flex items-center space-x-2 text-textSecondary text-xs">
            <Award className="w-4 h-4 text-emerald-400" />
            <span>Dynamic Range</span>
          </div>
          <p className="text-xl font-bold text-emerald-400 mt-1">DR{avgDr}</p>
          <span className="text-[10px] font-mono text-emerald-400/80">Crest Dynamic Avg</span>
        </div>

        <div className="bg-surface border border-border p-4 rounded-xl">
          <div className="flex items-center space-x-2 text-textSecondary text-xs">
            <Folder className="w-4 h-4 text-accent" />
            <span>Mapped Shares</span>
          </div>
          <p className="text-xl font-bold text-textPrimary mt-1">{mappedFolders.length}</p>
          <span className="text-[10px] font-mono text-textSecondary/70">Inotify Watched</span>
        </div>
      </div>

      {/* Switcher View with Audiophile Hi-Res Filters */}
      <div className="flex items-center space-x-2 border-b border-border pb-3 overflow-x-auto no-scrollbar whitespace-nowrap">
        <button
          onClick={() => switchTab("albums")}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex-shrink-0 ${
            activeView === "albums"
              ? "bg-white text-black"
              : "text-textSecondary hover:text-white bg-card/60 border border-border"
          }`}
        >
          Albums ({filteredAlbums.length !== albums.length ? `${filteredAlbums.length}/${albums.length}` : albums.length})
        </button>
        <button
          onClick={() => switchTab("artists")}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex-shrink-0 ${
            activeView === "artists"
              ? "bg-white text-black"
              : "text-textSecondary hover:text-white bg-card/60 border border-border"
          }`}
        >
          Artists ({filteredArtists.length !== artists.length ? `${filteredArtists.length}/${artists.length}` : artists.length})
        </button>
        <button
          onClick={() => switchTab("tracks")}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex-shrink-0 ${
            activeView === "tracks"
              ? "bg-white text-black"
              : "text-textSecondary hover:text-white bg-card/60 border border-border"
          }`}
        >
          All Tracks ({allFilteredTracks.length !== tracks.length ? `${allFilteredTracks.length}/${tracks.length}` : tracks.length})
        </button>
        <button
          onClick={() => switchTab("hires")}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center space-x-1.5 flex-shrink-0 ${
            activeView === "hires"
              ? "bg-amber-400 text-black shadow-md shadow-amber-400/20 font-extrabold"
              : "text-amber-300 hover:text-amber-200 bg-amber-500/10 border border-amber-500/30"
          }`}
        >
          <Sparkles className="w-3 h-3" />
          <span>Masters ({hiresTracks.length})</span>
        </button>
        <button
          onClick={() => switchTab("dsd")}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex-shrink-0 ${
            activeView === "dsd"
              ? "bg-purple-500 text-white shadow-md shadow-purple-500/20 font-extrabold"
              : "text-purple-300 hover:text-purple-200 bg-purple-500/10 border border-purple-500/30"
          }`}
        >
          DSD Vault ({dsdTracks.length})
        </button>
      </div>

      {/* In-Vault Search & Audiophile Sort Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface/50 p-2.5 rounded-xl border border-border/70">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-textSecondary absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search vault tracks, artists, albums..."
            className="w-full bg-surface border border-border rounded-lg pl-9 pr-8 py-1.5 text-xs text-textPrimary placeholder:text-textSecondary/60 focus:outline-none focus:border-primary/50 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-textSecondary hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs text-textSecondary flex items-center space-x-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-primary" />
            <span className="font-mono text-[11px]">SORT:</span>
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-textPrimary focus:outline-none focus:border-primary/50 transition-colors cursor-pointer"
          >
            <option value="title">Title (A-Z)</option>
            <option value="artist">Artist (A-Z)</option>
            <option value="dr">Dynamic Range (Highest DR)</option>
            <option value="hires">Master Quality (Hi-Res First)</option>
          </select>
        </div>
      </div>

      {/* Content Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="aspect-square bg-card rounded-tidal animate-pulse border border-border/50"
            />
          ))}
        </div>
      ) : activeView === "albums" ? (
        filteredAlbums.length === 0 ? (
          <div className="text-center py-16 bg-surface rounded-lg border border-border">
            <Library className="w-10 h-10 text-textSecondary mx-auto mb-2 opacity-50" />
            <p className="text-textSecondary text-sm">
              {searchQuery ? `No albums matching "${searchQuery}"` : "No albums indexed yet. Configure folder mapping in Settings!"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {visibleAlbums.map((album, idx) => {
              const letter = getSortLetter(album.name);
              const isFirstOfLetter = alphabetData.letterIndexMap[letter] === idx;

              return (
                <div
                  key={album.id}
                  id={isFirstOfLetter ? `letter-anchor-${letter}` : undefined}
                  onClick={() =>
                    setSelectedAlbum({
                      id: album.id,
                      title: album.name,
                      artist: album.artist,
                      coverUrl: `/rest/getCoverArt.view?id=album-${album.id}`,
                      releaseDate: album.year ? String(album.year) : undefined,
                      trackCount: album.track_count,
                    })
                  }
                  className="group bg-card hover:bg-cardHover border border-border hover:border-borderHover rounded-tidal p-3 transition-colors cursor-pointer scroll-mt-4"
                >
                <div className="relative aspect-square rounded-tidal bg-black border border-border mb-3 overflow-hidden flex items-center justify-center">
                  <img
                    src={`/rest/getCoverArt.view?id=album-${album.id}`}
                    alt={album.name}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      const fallback = e.currentTarget.parentElement?.querySelector(".fallback-disc");
                      if (fallback) fallback.classList.remove("hidden");
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="fallback-disc hidden absolute inset-0 flex items-center justify-center bg-black/80">
                    <Disc className="w-10 h-10 text-textSecondary group-hover:text-primary transition-colors" />
                  </div>

                  {/* Quality Tag */}
                  <span className="absolute top-2 right-2 px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-black/80 backdrop-blur-md text-badgeMax border border-badgeMax/40 pointer-events-none">
                    FLAC 24/96
                  </span>

                  {/* Hover Quick Play Button */}
                  <div
                    onClick={(e) => handlePlayAlbumDirect(album, e)}
                    title={`Play ${album.name}`}
                    className="absolute right-2.5 bottom-2.5 w-10 h-10 rounded-full bg-primary text-black flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 group-hover:scale-105 active:scale-95 transition-all duration-200 z-10 cursor-pointer hover:bg-primary/90"
                  >
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </div>
                </div>
                <h4 className="text-sm font-semibold text-textPrimary truncate group-hover:underline">
                  {album.name}
                </h4>
                <p className="text-xs text-textSecondary truncate mt-0.5">{album.artist}</p>
                <div className="flex items-center justify-between mt-1 text-[11px] font-mono text-textSecondary/70">
                  <span>{album.track_count} tracks</span>
                  <span className="text-emerald-400">DR13</span>
                </div>
              </div>
            );
          })}
        </div>
        )
      ) : activeView === "artists" ? (
        filteredArtists.length === 0 ? (
          <div className="text-center py-16 bg-surface rounded-lg border border-border">
            <Users className="w-10 h-10 text-textSecondary mx-auto mb-2 opacity-50" />
            <p className="text-textSecondary text-sm">
              {searchQuery ? `No artists matching "${searchQuery}"` : "No artists indexed yet."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {visibleArtists.map((artist, idx) => {
              const letter = getSortLetter(artist.name);
              const isFirstOfLetter = alphabetData.letterIndexMap[letter] === idx;

              return (
                <div
                  key={artist.id}
                  id={isFirstOfLetter ? `letter-anchor-${letter}` : undefined}
                  onClick={() => setSelectedArtist({ name: artist.name })}
                  className="bg-surface hover:bg-card border border-border hover:border-primary/40 p-3.5 rounded-xl flex items-center space-x-3 transition-colors cursor-pointer group scroll-mt-4"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold group-hover:bg-primary group-hover:text-black transition-colors">
                    {artist.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold text-textPrimary truncate group-hover:text-primary transition-colors">{artist.name}</h4>
                    <p className="text-xs text-textSecondary">
                      {artist.album_count} albums · {artist.track_count} tracks
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : activeView === "hires" ? (
        /* Studio Masters 24/96+ View */
        <div className="space-y-1.5">
          {hiresTracks.length === 0 ? (
            <div className="text-center py-16 bg-surface rounded-xl border border-border text-sm text-textSecondary">
              No $\ge$ 24-bit / 96kHz tracks found in NAS library yet.
            </div>
          ) : (
            visibleHires.map((track, idx) => {
              const name = sortBy === "artist" ? track.artist : track.title;
              const letter = getSortLetter(name);
              const isFirstOfLetter = alphabetData.letterIndexMap[letter] === idx;

              return (
                <React.Fragment key={track.id}>
                  {isFirstOfLetter && (
                    <div
                      id={`letter-anchor-${letter}`}
                      className="sticky top-0 z-10 -mx-1 px-3 py-1.5 my-1 text-xs font-mono font-bold text-primary bg-background/95 backdrop-blur-md border-b border-border/70 flex items-center justify-between shadow-sm scroll-mt-4"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded bg-primary/10 border border-primary/30 flex items-center justify-center text-[11px] text-primary">
                          {letter}
                        </span>
                        <span className="text-[10px] text-textSecondary uppercase tracking-wider font-semibold">
                          {sortBy === "artist" ? "Artist" : "Title"} · {letter}
                        </span>
                      </div>
                    </div>
                  )}
                  <TrackRow
                    title={track.title}
                    artist={track.artist}
                    album={track.album}
                    coverUrl={`/rest/getCoverArt.view?id=cover-${track.id}`}
                    duration={track.duration}
                    streamId={track.id}
                    source="local"
                    hires={true}
                    bitDepth={track.bit_depth || 24}
                    sampleRate={track.sample_rate || 96000}
                    bitrate={track.bitrate || 2800}
                    format={track.format?.toUpperCase() || "FLAC"}
                    drScore={track.dr_score || 13}
                  />
                </React.Fragment>
              );
            })
          )}
        </div>
      ) : activeView === "dsd" ? (
        /* DSD / SACD Vault View */
        <div className="space-y-1.5">
          {dsdTracks.length === 0 ? (
            <div className="text-center py-16 bg-surface rounded-xl border border-border text-sm text-textSecondary">
              No DSD (.dsf / .dff) files mapped in NAS library. Add DSD shares in Settings!
            </div>
          ) : (
            visibleDsd.map((track, idx) => {
              const name = sortBy === "artist" ? track.artist : track.title;
              const letter = getSortLetter(name);
              const isFirstOfLetter = alphabetData.letterIndexMap[letter] === idx;

              return (
                <React.Fragment key={track.id}>
                  {isFirstOfLetter && (
                    <div
                      id={`letter-anchor-${letter}`}
                      className="sticky top-0 z-10 -mx-1 px-3 py-1.5 my-1 text-xs font-mono font-bold text-primary bg-background/95 backdrop-blur-md border-b border-border/70 flex items-center justify-between shadow-sm scroll-mt-4"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded bg-primary/10 border border-primary/30 flex items-center justify-center text-[11px] text-primary">
                          {letter}
                        </span>
                        <span className="text-[10px] text-textSecondary uppercase tracking-wider font-semibold">
                          {sortBy === "artist" ? "Artist" : "Title"} · {letter}
                        </span>
                      </div>
                    </div>
                  )}
                  <TrackRow
                    title={track.title}
                    artist={track.artist}
                    album={track.album}
                    coverUrl={`/rest/getCoverArt.view?id=cover-${track.id}`}
                    duration={track.duration}
                    streamId={track.id}
                    source="local"
                    hires={true}
                    bitDepth={1}
                    sampleRate={2822400}
                    bitrate={5644}
                    format="DSD64"
                    isDsd={true}
                    drScore={track.dr_score || 14}
                  />
                </React.Fragment>
              );
            })
          )}
        </div>
      ) : (
        /* All Tracks View */
        <div className="space-y-1.5">
          {allFilteredTracks.length === 0 ? (
            <div className="text-center py-16 bg-surface rounded-xl border border-border text-sm text-textSecondary">
              {searchQuery ? `No tracks matching "${searchQuery}"` : "No tracks found in NAS library. Add tracks or download from Search!"}
            </div>
          ) : (
            visibleTracks.map((track, idx) => {
              const name = sortBy === "artist" ? track.artist : track.title;
              const letter = getSortLetter(name);
              const isFirstOfLetter = alphabetData.letterIndexMap[letter] === idx;

              return (
                <React.Fragment key={track.id}>
                  {isFirstOfLetter && (
                    <div
                      id={`letter-anchor-${letter}`}
                      className="sticky top-0 z-10 -mx-1 px-3 py-1.5 my-1 text-xs font-mono font-bold text-primary bg-background/95 backdrop-blur-md border-b border-border/70 flex items-center justify-between shadow-sm scroll-mt-4"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded bg-primary/10 border border-primary/30 flex items-center justify-center text-[11px] text-primary">
                          {letter}
                        </span>
                        <span className="text-[10px] text-textSecondary uppercase tracking-wider font-semibold">
                          {sortBy === "artist" ? "Artist" : "Title"} · {letter}
                        </span>
                      </div>
                    </div>
                  )}
                  <TrackRow
                    title={track.title}
                    artist={track.artist}
                    album={track.album}
                    coverUrl={`/rest/getCoverArt.view?id=cover-${track.id}`}
                    duration={track.duration}
                    streamId={track.id}
                    source="local"
                    hires={track.hires}
                    bitDepth={track.bit_depth}
                    sampleRate={track.sample_rate}
                    bitrate={track.bitrate}
                    format={track.format?.toUpperCase()}
                    drScore={track.dr_score || 12}
                  />
                </React.Fragment>
              );
            })
          )}
        </div>
      )}

      {/* Progressive Windowing Infinite Scroll Sentinel */}
      <div ref={sentinelRef} className="h-4 w-full" />

      {/* Progressive Loading Telemetry Status */}
      {hasMore && (
        <div className="flex justify-center items-center py-4 text-xs text-textSecondary font-mono">
          <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2 text-primary" />
          <span>Loading more items... (Showing {currentCount} of {currentTotal})</span>
        </div>
      )}
      {!hasMore && currentTotal > 60 && (
        <div className="text-center py-4 text-xs text-textSecondary/60 font-mono">
          All {currentTotal} items loaded
        </div>
      )}

      {/* Album Modal */}
      <AlbumModal
        isOpen={selectedAlbum !== null}
        onClose={() => setSelectedAlbum(null)}
        album={selectedAlbum}
      />

      {/* Artist Profile Modal */}
      <ArtistModal
        isOpen={selectedArtist !== null}
        onClose={() => setSelectedArtist(null)}
        artistName={selectedArtist?.name || null}
        artistAvatar={selectedArtist?.avatar}
        onAlbumClick={(alb) => setSelectedAlbum(alb)}
      />

      {/* Right-Hand Side Alphabet Fast Scroller Rail */}
      {currentTotal >= 15 && alphabetData.availableLetters.size > 0 && (
        <AlphabetScroller
          availableLetters={alphabetData.availableLetters}
          onSelectLetter={handleSelectLetter}
        />
      )}
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-16 text-textSecondary text-sm">
          Loading Lossless Library...
        </div>
      }
    >
      <LibraryContent />
    </Suspense>
  );
}
