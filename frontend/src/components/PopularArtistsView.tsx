"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/context/PlayerContext";
import { TrendingArtist, PopularArtistItem, SearchResultItem, PlayableTrack } from "@/types";
import {
  Play,
  Sparkles,
  Users,
  Music2,
  Award,
  ShieldCheck,
  Loader2,
  HardDrive,
  RefreshCw,
} from "lucide-react";

// Curated foundational roster with verified TIDAL CDN high-res photography
export const INITIAL_POPULAR_ARTISTS: PopularArtistItem[] = [
  // V-Pop Masters
  {
    id: "20631677",
    name: "Jack - J97",
    category: "vpop",
    category_label: "V-Pop Hitmaker",
    cover_url: "https://resources.tidal.com/images/7ad9b613/7a0a/41bd/9c54/a4af97a104ba/750x750.jpg",
    track_count: 22,
    monthly_streams: "3.2M",
    bio: "Top streaming Vietnamese pop vocalist with distinctive pentatonic acoustic melodies and modern EDM/pop arrangements in studio 24/96 FLAC.",
  },
  {
    id: "5891026",
    name: "Sơn Tùng M-TP",
    category: "vpop",
    category_label: "V-Pop Pioneer",
    cover_url: "https://resources.tidal.com/images/7644673e/c5a8/41d8/8bc2/57f432ba9617/750x750.jpg",
    track_count: 28,
    monthly_streams: "5.8M",
    bio: "Vietnam's leading superstar producer & singer, pioneering international-level mastering and punchy dynamic mixes.",
  },
  {
    id: "9707197",
    name: "Vũ.",
    category: "vpop",
    category_label: "Indie Acoustic Master",
    cover_url: "https://resources.tidal.com/images/9d51601b/5925/4c35/98f1/8d2886457271/750x750.jpg",
    track_count: 19,
    monthly_streams: "2.1M",
    bio: "The Prince of Indie Vietnam. Warm, intimate vocal textures accompanied by pure acoustic guitars and warm live room reverberation.",
  },

  // Global Icons
  {
    id: "3521920",
    name: "Adele",
    category: "global",
    category_label: "Global Soul Icon",
    cover_url: "https://resources.tidal.com/images/7a3dcc0f/5392/45fd/9778/381e56bbcf91/750x750.jpg",
    track_count: 35,
    monthly_streams: "48M",
    bio: "Grammy-winning powerhouse vocalist whose master recordings are celebrated for their monumental dynamic scale and emotional transparency.",
  },
  {
    id: "7514330",
    name: "Billie Eilish",
    category: "global",
    category_label: "Hi-Res Bass & Vocal",
    cover_url: "https://resources.tidal.com/images/b2a74265/ad7f/4e14/b170/cc31e0ed8a4e/750x750.jpg",
    track_count: 31,
    monthly_streams: "62M",
    bio: "Pioneering whisper vocals and earth-shaking sub-bass mastery produced by Finneas, reference material for subwoofers and DACs.",
  },
  {
    id: "4761957",
    name: "The Weeknd",
    category: "global",
    category_label: "Synth-Pop Reference",
    cover_url: "https://resources.tidal.com/images/5598dc62/acf6/49f1/b468/192ad3555278/750x750.jpg",
    track_count: 44,
    monthly_streams: "85M",
    bio: "Master of 80s analog synthesizer reproduction and punchy drum transients, mixed with pristine stereo depth.",
  },

  // Audiophile Legends
  {
    id: "10249",
    name: "Norah Jones",
    category: "audiophile",
    category_label: "Audiophile Reference Vocal",
    cover_url: "https://resources.tidal.com/images/caf22e1e/8bf7/482f/a722/f7ca82175991/750x750.jpg",
    track_count: 26,
    monthly_streams: "12M",
    bio: "Blue Note Records legend. Her debut album is one of the most widely used reference recordings in high-end audio history.",
  },
  {
    id: "55",
    name: "Miles Davis",
    category: "audiophile",
    category_label: "Jazz Master & SACD Legend",
    cover_url: "https://resources.tidal.com/images/e11debbb/a25d/4410/9dc0/bb6114ddff30/750x750.jpg",
    track_count: 42,
    monthly_streams: "6M",
    bio: "The architect of modern modal jazz. Columbia 30th Street Studio session recordings remastered in bit-perfect DSD and 24-bit FLAC.",
  },
];

interface PopularArtistsViewProps {
  topArtists?: TrendingArtist[];
  onSelectArtist?: (artist: { name: string; avatar?: string }) => void;
}

export function PopularArtistsView({ topArtists = [], onSelectArtist }: PopularArtistsViewProps) {
  const router = useRouter();
  const { playTrack } = usePlayer();

  const [artists, setArtists] = useState<PopularArtistItem[]>(INITIAL_POPULAR_ARTISTS);
  const [selectedArtist, setSelectedArtist] = useState<PopularArtistItem>(INITIAL_POPULAR_ARTISTS[0]);
  const [activeTab, setActiveTab] = useState<"all" | "vpop" | "global" | "audiophile">("all");
  const [tracks, setTracks] = useState<SearchResultItem[]>([]);
  const [loadingTracks, setLoadingTracks] = useState<boolean>(false);
  const [loadingArtists, setLoadingArtists] = useState<boolean>(false);
  const [loadingPlayArtistId, setLoadingPlayArtistId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(16);

  // 1. Fetch live popular & trending artists from the backend
  useEffect(() => {
    const fetchArtists = async () => {
      setLoadingArtists(true);
      try {
        const resp = await fetch("/api/artists/popular");
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.artists) && data.artists.length > 0) {
            setArtists(data.artists);
            setSelectedArtist(data.artists[0]);
          }
        }
      } catch (err) {
        console.error("Failed fetching popular artists:", err);
      } finally {
        setLoadingArtists(false);
      }
    };

    fetchArtists();
  }, []);

  // 2. Fetch real top master tracks from TIDAL/NAS for the selected artist
  const fetchTopTracks = useCallback(async (artist: PopularArtistItem) => {
    setLoadingTracks(true);
    try {
      const resp = await fetch(
        `/api/artists/toptracks?id=${encodeURIComponent(artist.id)}&artist=${encodeURIComponent(
          artist.name
        )}&limit=10`
      );
      if (resp.ok) {
        const data = await resp.json();
        setTracks(data.tracks || []);
      } else {
        setTracks([]);
      }
    } catch (err) {
      console.error(`Failed fetching top tracks for ${artist.name}:`, err);
      setTracks([]);
    } finally {
      setLoadingTracks(false);
    }
  }, []);

  useEffect(() => {
    if (selectedArtist) {
      fetchTopTracks(selectedArtist);
    }
  }, [selectedArtist, fetchTopTracks]);

  // Convert SearchResultItem into PlayableTrack for bit-perfect audio streaming
  const toPlayable = (t: SearchResultItem): PlayableTrack => ({
    id: t.stream_id || `art-trk-${t.artist}-${t.title}`,
    title: t.title,
    artist: t.artist,
    album: t.album,
    coverUrl: t.cover_url || selectedArtist.cover_url,
    streamUrl: `/api/stream?artist=${encodeURIComponent(t.artist)}&title=${encodeURIComponent(t.title)}${
      t.stream_id ? `&id=${encodeURIComponent(t.stream_id)}` : ""
    }`,
    duration: t.duration,
    bitDepth: t.bit_depth || 24,
    sampleRate: t.sample_rate || 96000,
    bitrate: t.bitrate || 2980,
    format: t.format || "FLAC",
    hires: t.hires,
    source: t.source || "tidal",
    drScore: t.dr_score || 13,
  });

  const handlePlayTrack = (trackItem: SearchResultItem) => {
    const queue = tracks.map(toPlayable);
    const target = toPlayable(trackItem);
    playTrack(target, queue);
  };

  const handlePlayAllTracks = () => {
    if (tracks.length === 0) return;
    const queue = tracks.map(toPlayable);
    playTrack(queue[0], queue);
  };

  const handlePlayArtistImmediately = async (artist: PopularArtistItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const artistKey = artist.id || artist.name;
    setLoadingPlayArtistId(artistKey);
    try {
      const resp = await fetch(
        `/api/artists/toptracks?id=${encodeURIComponent(artist.id)}&artist=${encodeURIComponent(
          artist.name
        )}&limit=10`
      );
      if (resp.ok) {
        const data = await resp.json();
        const artistTracks: SearchResultItem[] = data.tracks || [];
        if (artistTracks.length > 0) {
          const queue = artistTracks.map((t) => ({
            id: t.stream_id || `art-trk-${t.artist}-${t.title}`,
            title: t.title,
            artist: t.artist,
            album: t.album,
            coverUrl: t.cover_url || artist.cover_url,
            streamUrl: `/api/stream?artist=${encodeURIComponent(t.artist)}&title=${encodeURIComponent(t.title)}${
              t.stream_id ? `&id=${encodeURIComponent(t.stream_id)}` : ""
            }`,
            duration: t.duration,
            bitDepth: t.bit_depth || 24,
            sampleRate: t.sample_rate || 96000,
            bitrate: t.bitrate || 2980,
            format: t.format || "FLAC",
            hires: t.hires,
            source: t.source || "tidal",
            drScore: t.dr_score || 13,
          }));
          playTrack(queue[0], queue);
        }
      }
    } catch (err) {
      console.error(`Failed playing artist ${artist.name}:`, err);
    } finally {
      setLoadingPlayArtistId(null);
    }
  };

  const handleSelectArtistCard = (artist: PopularArtistItem) => {
    setSelectedArtist(artist);
    // Smoothly scroll the actual scroll container (#main-content) to the top
    const mainEl = document.getElementById("main-content");
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleExploreDiscography = () => {
    if (onSelectArtist) {
      onSelectArtist({ name: selectedArtist.name, avatar: selectedArtist.cover_url });
    } else {
      router.push(`/search/?q=${encodeURIComponent(selectedArtist.name)}`);
    }
  };

  const handleTabChange = (tabId: "all" | "vpop" | "global" | "audiophile") => {
    setActiveTab(tabId);
    setVisibleCount(16);
  };

  const filteredArtists =
    activeTab === "all"
      ? artists
      : artists.filter((a) => a.category === activeTab);

  const displayedArtists = filteredArtists.slice(0, visibleCount);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. Artist Spotlight Hero */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-card via-[#1c1c1c] to-black border border-border p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xl">
        <div className="relative z-10 max-w-xl space-y-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-primary/20 text-primary border border-primary/30 shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span>ARTIST SPOTLIGHT</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-badgeMax/20 text-badgeMax border border-badgeMax/30">
              {selectedArtist.category_label}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              24-Bit / 96kHz FLAC
            </span>
          </div>

          <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            {selectedArtist.name}
          </h1>
          <p className="text-xs md:text-sm text-textSecondary leading-relaxed">
            {selectedArtist.bio}
          </p>

          <div className="flex items-center space-x-4 text-xs font-mono text-textSecondary pt-1">
            <span>
              Monthly Streams: <strong className="text-white">{selectedArtist.monthly_streams}</strong>
            </span>
            <span>•</span>
            <span>
              Studio Masters: <strong className="text-primary">{selectedArtist.track_count} Tracks</strong>
            </span>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={handlePlayAllTracks}
              disabled={loadingTracks || tracks.length === 0}
              className="px-5 py-2.5 rounded-full bg-primary text-black font-bold text-xs flex items-center space-x-2 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
              <span>Play Top Tracks Radio</span>
            </button>

            <button
              onClick={handleExploreDiscography}
              className="px-4 py-2.5 rounded-full bg-card hover:bg-cardHover border border-border text-xs font-semibold text-textSecondary hover:text-white flex items-center space-x-2 transition-colors cursor-pointer"
            >
              <Music2 className="w-3.5 h-3.5 text-primary" />
              <span>Explore Full Discography</span>
            </button>
          </div>
        </div>

        {/* Artist Large Portrait Artwork from Tidal CDN */}
        <div className="w-40 h-40 md:w-52 md:h-52 rounded-full overflow-hidden border-2 border-primary/50 shadow-2xl flex-shrink-0 relative group bg-card">
          <img
            src={selectedArtist.cover_url}
            alt={selectedArtist.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        </div>
      </div>

      {/* 2. Interactive Artist Circular Selector Row */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-textSecondary">
            Select Artist to Inspect
          </h2>
          <span className="text-xs font-mono text-textSecondary">Click any artist to load verified master tracks</span>
        </div>

        <div className="flex space-x-4 overflow-x-auto pb-3 no-scrollbar">
          {artists.map((artist) => {
            const isSelected = selectedArtist.name === artist.name;

            return (
              <div
                key={artist.id || artist.name}
                onClick={() => setSelectedArtist(artist)}
                className="group flex-shrink-0 flex flex-col items-center cursor-pointer select-none"
              >
                <div
                  className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 transition-all p-0.5 bg-card ${
                    isSelected
                      ? "border-primary ring-4 ring-primary/25 scale-105 shadow-xl"
                      : "border-border hover:border-textSecondary/60"
                  }`}
                >
                  <img
                    src={artist.cover_url}
                    alt={artist.name}
                    className="w-full h-full rounded-full object-cover group-hover:scale-105 transition-transform"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                </div>
                <span
                  className={`mt-2 text-xs font-semibold truncate max-w-[100px] text-center transition-colors ${
                    isSelected ? "text-primary font-bold" : "text-white group-hover:text-primary"
                  }`}
                >
                  {artist.name}
                </span>
                <span className="text-[10px] text-textSecondary font-mono truncate">
                  {artist.category_label.split(" ")[0]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Selected Artist Top Master Tracks Table */}
      <div className="bg-card/40 border border-border/80 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center space-x-2">
            <Award className="w-4 h-4 text-primary" />
            <h3 className="text-base font-bold text-white">
              {selectedArtist.name} — Top Studio Master Tracks
            </h3>
          </div>
          <div className="flex items-center space-x-3">
            {loadingTracks && (
              <div className="flex items-center space-x-1.5 text-xs text-primary font-mono animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Loading Tidal Masters...</span>
              </div>
            )}
            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
              DR12-15 Uncompressed Masters
            </span>
          </div>
        </div>

        {loadingTracks ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs text-textSecondary font-mono">
              Retrieving high-resolution bit-perfect tracks from TIDAL catalog for {selectedArtist.name}...
            </p>
          </div>
        ) : tracks.length === 0 ? (
          <div className="py-8 text-center text-xs text-textSecondary">
            No master tracks returned for {selectedArtist.name}. Click "Explore Full Discography" to browse full catalog.
          </div>
        ) : (
          <div className="space-y-1.5">
            {tracks.map((t, idx) => {
              const isLocal = t.source === "local";
              const isHires = (t.bit_depth && t.bit_depth > 16) || (t.sample_rate && t.sample_rate > 48000) || t.hires;

              return (
                <div
                  key={t.id || idx}
                  onClick={() => handlePlayTrack(t)}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-card/70 hover:bg-card border border-border/50 hover:border-primary/40 group transition-all cursor-pointer"
                >
                  <div className="flex items-center space-x-3.5 min-w-0">
                    <span className="w-6 text-center text-xs font-mono text-textSecondary group-hover:text-primary font-semibold">
                      {idx + 1}
                    </span>
                    <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 group-hover:bg-primary group-hover:text-black transition-colors">
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    </div>
                    <div className="truncate">
                      <p className="text-xs sm:text-sm font-semibold text-white group-hover:text-primary transition-colors truncate">
                        {t.title}
                      </p>
                      <p className="text-[11px] text-textSecondary truncate">{t.album}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 text-xs font-mono text-textSecondary flex-shrink-0">
                    {isLocal && (
                      <span className="hidden sm:inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
                        <HardDrive className="w-3 h-3 text-purple-400" />
                        <span>NAS</span>
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                      DR{t.dr_score || 13}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        isHires
                          ? "bg-badgeMax/15 text-badgeMax border-badgeMax/30"
                          : "bg-card text-textSecondary border-border"
                      }`}
                    >
                      {t.bit_depth && t.sample_rate
                        ? `${t.bit_depth}/${Math.round(t.sample_rate / 1000)}`
                        : isHires
                        ? "24/96"
                        : "16/44.1"}
                    </span>
                    <span className="hidden sm:inline text-textSecondary/80">
                      {Math.floor(t.duration / 60)}:{(t.duration % 60).toString().padStart(2, "0")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Categorized Artist Grid (V-Pop, Global, Audiophile) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/70 pb-3">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-primary" />
            <h2 className="text-lg font-bold text-white tracking-tight">
              Explore All Artists by Genre & Region
            </h2>
          </div>

          <div className="flex items-center space-x-1.5 text-xs">
            {[
              { id: "all", label: `All (${artists.length})` },
              { id: "vpop", label: `V-Pop (${artists.filter((a) => a.category === "vpop").length})` },
              { id: "global", label: `Global (${artists.filter((a) => a.category === "global").length})` },
              { id: "audiophile", label: `Audiophile (${artists.filter((a) => a.category === "audiophile").length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id as any)}
                className={`px-3 py-1 rounded-full font-semibold transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-white text-black font-bold shadow-sm"
                    : "bg-card/70 hover:bg-card text-textSecondary hover:text-white border border-border"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4">
          {displayedArtists.map((artist) => {
            const isPlayingThis = loadingPlayArtistId === (artist.id || artist.name);

            return (
              <div
                key={artist.id || artist.name}
                onClick={() => handleSelectArtistCard(artist)}
                className="group bg-card/60 hover:bg-card border border-border hover:border-primary/40 rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-md hover:shadow-xl flex flex-col items-center text-center select-none"
              >
                <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-border group-hover:border-primary/60 mb-3 transition-colors shadow-lg bg-card">
                  <img
                    src={artist.cover_url}
                    alt={artist.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  {/* Immediate Play button overlay */}
                  <div
                    onClick={(e) => handlePlayArtistImmediately(artist, e)}
                    className={`absolute inset-0 bg-black/50 transition-opacity flex items-center justify-center cursor-pointer ${
                      isPlayingThis ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                    title={`Play ${artist.name} Top Master Tracks`}
                  >
                    <div className="w-11 h-11 rounded-full bg-primary text-black flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-transform">
                      {isPlayingThis ? (
                        <Loader2 className="w-5 h-5 animate-spin text-black" />
                      ) : (
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      )}
                    </div>
                  </div>
                </div>

                <h3 className="text-sm font-bold text-white group-hover:text-primary transition-colors truncate max-w-full">
                  {artist.name}
                </h3>
                <p className="text-xs text-textSecondary mt-0.5 truncate">{artist.category_label}</p>
                <div className="mt-2.5 pt-2 border-t border-border/40 w-full flex items-center justify-around text-[10px] font-mono text-textSecondary">
                  <span>{artist.track_count} Masters</span>
                  <span className="text-emerald-400">{artist.monthly_streams} streams</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Load More Artists button */}
        {visibleCount < filteredArtists.length && (
          <div className="flex flex-col items-center justify-center pt-4 pb-2 space-y-2">
            <button
              onClick={() => setVisibleCount((prev) => prev + 16)}
              className="px-6 py-2.5 rounded-full bg-card hover:bg-cardHover border border-border hover:border-primary/50 text-xs font-semibold text-textSecondary hover:text-white flex items-center space-x-2 transition-all cursor-pointer shadow-md hover:shadow-primary/10"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>
                Load More Artists ({filteredArtists.length - visibleCount} remaining)
              </span>
            </button>
            <span className="text-[11px] font-mono text-textSecondary/70">
              Showing {displayedArtists.length} of {filteredArtists.length} artists
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
