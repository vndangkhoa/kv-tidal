"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingTrack, TrendingAlbum, TrendingArtist, PlayableTrack, SearchResultItem } from "@/types";
import { TrackRow } from "@/components/TrackRow";
import { MediaShelf, MediaShelfItem } from "@/components/MediaShelf";
import { AlbumModal } from "@/components/AlbumModal";
import { ArtistModal } from "@/components/ArtistModal";
import { PlaylistModal } from "@/components/PlaylistModal";
import { ArtworkModal } from "@/components/ArtworkModal";
import { DsdVaultView } from "@/components/DsdVaultView";
import { CuratedMixesView } from "@/components/CuratedMixesView";
import { PopularArtistsView } from "@/components/PopularArtistsView";
import { AlbumsGridView } from "@/components/AlbumsGridView";
import { usePlayer } from "@/context/PlayerContext";
import {
  Sparkles,
  RefreshCw,
  Flame,
  Play,
  Disc,
  Radio,
  Users,
  Activity,
  ShieldCheck,
  Award,
} from "lucide-react";

// Curated Audiophile Master Playlists
const CURATED_PLAYLISTS = [
  {
    id: "playlist-vpop",
    title: "V-Pop Master Hits",
    subtitle: "Sơn Tùng, LISA, Orange, Jack & more • FLAC 24/96",
    coverUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
    searchQuery: "Sơn Tùng M-TP",
  },
  {
    id: "playlist-billboard",
    title: "Billboard Global Top 50",
    subtitle: "International Hi-Res chart leaders • DR12 Master",
    coverUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80",
    searchQuery: "Billboard Hot 100",
  },
  {
    id: "playlist-acoustic",
    title: "Audiophile Acoustic & Vocal",
    subtitle: "Bit-perfect uncompressed dynamics • DR14 Ref",
    coverUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
    searchQuery: "Acoustic Vocal",
  },
  {
    id: "playlist-chill",
    title: "Late Night Chill & Lo-Fi",
    subtitle: "Relaxing deep melodies in bit-perfect FLAC",
    coverUrl: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80",
    searchQuery: "Lofi Chill",
  },
  {
    id: "playlist-bass",
    title: "Deep Bass & Electronic Master",
    subtitle: "Fast punchy low-end transient response • 24b",
    coverUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80",
    searchQuery: "Electronic Bass",
  },
  {
    id: "playlist-jazz",
    title: "Hi-Res Jazz & Fusion Classics",
    subtitle: "Studio live room instrument separation • DR15",
    coverUrl: "https://images.unsplash.com/photo-1525994886773-080587e161c2?w=600&auto=format&fit=crop&q=80",
    searchQuery: "Jazz Fusion",
  },
];

export default function HomePage() {
  const router = useRouter();
  const { playTrack, setIsSignalPathOpen } = usePlayer();

  const [vnTracks, setVnTracks] = useState<TrendingTrack[]>([]);
  const [globalTracks, setGlobalTracks] = useState<TrendingTrack[]>([]);
  const [vnAlbums, setVnAlbums] = useState<TrendingAlbum[]>([]);
  const [globalAlbums, setGlobalAlbums] = useState<TrendingAlbum[]>([]);
  const [topArtists, setTopArtists] = useState<TrendingArtist[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedFilter, setSelectedFilter] = useState<string>("all");

  // Selected Album for Modal Inspector
  const [selectedAlbum, setSelectedAlbum] = useState<{
    id: string;
    title: string;
    artist: string;
    coverUrl?: string;
    releaseDate?: string;
    trackCount?: number;
  } | null>(null);

  // Selected Artist for Profile Modal
  const [selectedArtist, setSelectedArtist] = useState<{
    name: string;
    avatar?: string;
  } | null>(null);

  // Selected Playlist for Curated Modal
  const [selectedPlaylist, setSelectedPlaylist] = useState<(typeof CURATED_PLAYLISTS)[0] | null>(
    null
  );

  // Selected Artwork Track for Lightbox
  const [selectedArtworkTrack, setSelectedArtworkTrack] = useState<PlayableTrack | null>(null);

  const fetchTrendingData = async () => {
    try {
      const resp = await fetch("/api/trending");
      if (resp.ok) {
        const data = await resp.json();
        setVnTracks(data.vietnam || []);
        setGlobalTracks(data.global || []);
        setVnAlbums(data.vietnam_albums || []);
        setGlobalAlbums(data.global_albums || []);
      }

      const artResp = await fetch("/api/search/trending");
      if (artResp.ok) {
        const artData = await artResp.json();
        setTopArtists(artData.top_artists || []);
      }
    } catch (e) {
      console.error("Failed fetching discovery data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrendingData();
  }, []);

  const handleForceRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/trending/refresh", { method: "POST" });
      await fetchTrendingData();
    } finally {
      setRefreshing(false);
    }
  };

  // Convert trending track to playable track format
  const toPlayable = (track: TrendingTrack): PlayableTrack => ({
    id: `${track.region}-${track.id}`,
    title: track.title,
    artist: track.artist,
    album: track.album,
    coverUrl: track.cover_url,
    streamUrl: `/api/stream?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}${
      track.preview_url ? `&url=${encodeURIComponent(track.preview_url)}` : ""
    }`,
    bitDepth: 24,
    sampleRate: 96000,
    bitrate: 2980,
    format: "FLAC",
    hires: true,
    source: "tidal",
    drScore: 13,
  });

  // Play track with continuous shelf queue
  const handlePlayTrackInShelfContext = (track: TrendingTrack, shelf: TrendingTrack[]) => {
    const queue = shelf.map(toPlayable);
    const target = queue.find((q) => q.id === `${track.region}-${track.id}`) || toPlayable(track);
    playTrack(target, queue);
  };

  const handlePlayTrack = (track: TrendingTrack) => {
    handlePlayTrackInShelfContext(track, [track, ...vnTracks, ...globalTracks]);
  };

  // Immediate album play handler for hover play button
  const handlePlayAlbumImmediately = async (a: TrendingAlbum) => {
    try {
      const resp = await fetch(`/api/trending/album?id=${encodeURIComponent(a.id)}`);
      if (resp.ok) {
        const data = await resp.json();
        const rawTracks: any[] = data.tracks || [];
        if (rawTracks.length > 0) {
          const queue: PlayableTrack[] = rawTracks.map((t) => ({
            id: `album-${t.trackId}`,
            title: t.trackName,
            artist: t.artistName,
            album: t.collectionName || a.title,
            coverUrl: a.cover_url,
            streamUrl: `/api/stream?artist=${encodeURIComponent(t.artistName)}&title=${encodeURIComponent(
              t.trackName
            )}`,
            duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : 210,
            bitDepth: 24,
            sampleRate: 96000,
            format: "FLAC",
            hires: true,
            source: "tidal",
            drScore: 13,
          }));
          playTrack(queue[0], queue);
          return;
        }
      }
    } catch (err) {
      console.error("Failed immediate album play:", err);
    }
    // Fallback: open album modal if fetch fails
    setSelectedAlbum({
      id: a.id,
      title: a.title,
      artist: a.artist,
      coverUrl: a.cover_url,
      releaseDate: a.release_date,
      trackCount: a.track_count,
    });
  };

  // Immediate playlist play handler for hover play button
  const handlePlayPlaylistImmediately = async (p: (typeof CURATED_PLAYLISTS)[0]) => {
    try {
      const resp = await fetch(`/api/search?q=${encodeURIComponent(p.searchQuery)}`);
      if (resp.ok) {
        const data = await resp.json();
        const results: SearchResultItem[] = data.results || [];
        if (results.length > 0) {
          const queue: PlayableTrack[] = results.map((t) => ({
            id: t.stream_id || `pl-${t.artist}-${t.title}`,
            title: t.title,
            artist: t.artist,
            album: t.album,
            coverUrl: t.cover_url,
            streamUrl: `/api/stream?artist=${encodeURIComponent(t.artist)}&title=${encodeURIComponent(
              t.title
            )}${t.stream_id ? `&id=${encodeURIComponent(t.stream_id)}` : ""}${
              t.preview_url ? `&url=${encodeURIComponent(t.preview_url)}` : ""
            }`,
            duration: t.duration,
            bitDepth: t.bit_depth || 24,
            sampleRate: t.sample_rate || 96000,
            bitrate: t.bitrate || 2850,
            format: t.format || "FLAC",
            hires: t.hires,
            source: t.source || "tidal",
            drScore: t.dr_score || 13,
          }));
          playTrack(queue[0], queue);
          return;
        }
      }
    } catch (err) {
      console.error("Failed immediate playlist play:", err);
    }
    setSelectedPlaylist(p);
  };

  // Convert tracks to shelf items with context queue
  const vnShelfItems: MediaShelfItem[] = vnTracks.slice(0, 10).map((t) => ({
    id: `vn-${t.id}`,
    title: t.title,
    subtitle: t.artist,
    coverUrl: t.cover_url,
    hires: true,
    onClick: () => handlePlayTrackInShelfContext(t, vnTracks.slice(0, 10)),
    onPlay: (e) => {
      e.stopPropagation();
      handlePlayTrackInShelfContext(t, vnTracks.slice(0, 10));
    },
  }));

  const globalShelfItems: MediaShelfItem[] = globalTracks.slice(0, 10).map((t) => ({
    id: `global-${t.id}`,
    title: t.title,
    subtitle: t.artist,
    coverUrl: t.cover_url,
    hires: true,
    onClick: () => handlePlayTrackInShelfContext(t, globalTracks.slice(0, 10)),
    onPlay: (e) => {
      e.stopPropagation();
      handlePlayTrackInShelfContext(t, globalTracks.slice(0, 10));
    },
  }));

  // Combine top albums
  const combinedAlbums = [...vnAlbums, ...globalAlbums];
  const albumShelfItems: MediaShelfItem[] = combinedAlbums.slice(0, 12).map((a) => ({
    id: `alb-${a.id}`,
    title: a.title,
    subtitle: `${a.artist} • ${a.release_date ? a.release_date.substring(0, 4) : "2024 Master"}`,
    coverUrl: a.cover_url,
    type: "album",
    hires: true,
    onClick: () =>
      setSelectedAlbum({
        id: a.id,
        title: a.title,
        artist: a.artist,
        coverUrl: a.cover_url,
        releaseDate: a.release_date,
        trackCount: a.track_count,
      }),
    onPlay: () => handlePlayAlbumImmediately(a),
  }));

  // Curated Playlists Shelf items
  const playlistShelfItems: MediaShelfItem[] = CURATED_PLAYLISTS.map((p) => ({
    id: p.id,
    title: p.title,
    subtitle: p.subtitle,
    coverUrl: p.coverUrl,
    type: "playlist",
    hires: true,
    onClick: () => setSelectedPlaylist(p),
    onPlay: () => handlePlayPlaylistImmediately(p),
  }));

  // Popular Artists Shelf items -> Opens dedicated ArtistModal
  const artistShelfItems: MediaShelfItem[] = topArtists.slice(0, 10).map((art) => ({
    id: `art-${art.name}`,
    title: art.name,
    subtitle: `${art.track_count} master tracks`,
    coverUrl: art.cover_url,
    type: "artist",
    onClick: () => setSelectedArtist({ name: art.name, avatar: art.cover_url }),
  }));

  const featuredTrack = vnTracks[0] || globalTracks[0];

  return (
    <div className="space-y-8 pb-12">
      {/* 1. KV-TIDAL Audiophile Category Filter Chips */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 no-scrollbar select-none text-xs font-semibold">
        {[
          { id: "all", label: "All Master Hits" },
          { id: "artists", label: "Popular Artists" },
          { id: "vpop", label: "Xu Hướng Việt Nam" },
          { id: "albums", label: "Top Albums" },
          { id: "global", label: "Billboard Hot 100" },
          { id: "playlists", label: "Curated Mixes" },
          { id: "masters", label: "Studio Masters (24/96+)" },
          { id: "dsd", label: "DSD / SACD Vault" },
          { id: "dr12", label: "DR12+ Uncompressed" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setSelectedFilter(f.id)}
            className={`px-3.5 py-1.5 rounded-full transition-all whitespace-nowrap cursor-pointer ${
              selectedFilter === f.id
                ? "bg-white text-black font-bold shadow-sm"
                : "bg-card/70 hover:bg-card text-textSecondary hover:text-white border border-border"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Dedicated View: DSD / SACD Vault */}
      {selectedFilter === "dsd" && <DsdVaultView />}

      {/* Dedicated View: Curated Mixes Hub */}
      {selectedFilter === "playlists" && <CuratedMixesView />}

      {/* Dedicated View: Popular Artists Discovery Center */}
      {selectedFilter === "artists" && (
        <PopularArtistsView
          topArtists={topArtists}
          onSelectArtist={(art) => setSelectedArtist(art)}
        />
      )}

      {/* Dedicated View: Full Albums Responsive Grid */}
      {selectedFilter === "albums" && (
        <AlbumsGridView
          albums={combinedAlbums}
          onSelectAlbum={(a) =>
            setSelectedAlbum({
              id: a.id,
              title: a.title,
              artist: a.artist,
              coverUrl: a.cover_url,
              releaseDate: a.release_date,
              trackCount: a.track_count,
            })
          }
        />
      )}

      {/* Dedicated View: DR12+ Uncompressed Dynamic Range Vault */}
      {selectedFilter === "dr12" && (
        <div className="space-y-8 animate-fadeIn">
          {/* DR12+ Audiophile Dynamic Range Banner */}
          <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-[#171c14] via-[#121212] to-black border border-emerald-500/30 p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xl">
            <div className="relative z-10 max-w-2xl space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>AUDIOPHILE DYNAMIC RANGE VAULT</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  CREST FACTOR ≥ 12dB
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/15 text-primary border border-primary/30">
                  ZERO BRICKWALL LIMITING
                </span>
              </div>

              <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
                DR12+ Uncompressed Master Dynamics
              </h1>
              <p className="text-xs md:text-sm text-textSecondary leading-relaxed">
                Recordings mastered with generous dynamic headroom. Drums and transients retain their punchy, organic impact; orchestral crescendos surge without distortion; and delicate vocal micro-details breathe freely.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-black/50 border border-emerald-500/20 rounded-xl p-3 text-xs font-mono text-textSecondary">
                <div>
                  <span className="text-[10px] uppercase text-textSecondary/70">Dynamic Target</span>
                  <p className="text-emerald-400 font-bold">DR12 — DR18</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-textSecondary/70">Loudness Target</span>
                  <p className="text-white font-bold">-14 to -20 LUFS</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-textSecondary/70">True Peak Ceiling</span>
                  <p className="text-primary font-bold">-0.5 dBTP</p>
                </div>
              </div>
            </div>

            <div className="hidden sm:flex flex-col items-center justify-center w-36 h-36 md:w-44 md:h-44 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-center">
              <Activity className="w-12 h-12 text-emerald-400 animate-pulse" />
              <span className="mt-2 text-xs font-mono font-bold text-white uppercase">CREST METER</span>
              <span className="text-[10px] text-emerald-300 font-mono">DR14 Reference</span>
            </div>
          </div>

          {/* Curated Mixes Shelf for DR12+ */}
          <MediaShelf
            title="Acoustic & Dynamic Range Reference Mixes"
            subtitle="Hand-crafted bit-perfect playlists engineered to test transients and dynamic headroom"
            items={playlistShelfItems}
          />

          {/* Top Chart Tracks with High Dynamic Range */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <div className="flex items-center space-x-2">
                <Flame className="w-4 h-4 text-emerald-400" />
                <h2 className="text-lg font-bold text-white tracking-tight">
                  High Dynamic Range Master Tracks (DR12+)
                </h2>
              </div>
              <span className="text-xs text-textSecondary font-mono">
                {vnTracks.length + globalTracks.length} uncompressed tracks
              </span>
            </div>

            <div className="space-y-1">
              {[...vnTracks, ...globalTracks].slice(0, 30).map((track, index) => (
                <TrackRow
                  key={`dr12-${track.region}-${track.id}-${index}`}
                  rank={index + 1}
                  title={track.title}
                  artist={track.artist}
                  album={track.album}
                  coverUrl={track.cover_url}
                  previewUrl={track.preview_url}
                  source="tidal"
                  hires={true}
                  format="FLAC"
                  bitDepth={24}
                  sampleRate={96000}
                  bitrate={2850}
                  drScore={13 + (index % 3)}
                  onArtistClick={(name) => setSelectedArtist({ name })}
                  onAlbumClick={(title, artist, cover) =>
                    setSelectedAlbum({ id: title, title, artist, coverUrl: cover })
                  }
                  onCoverClick={() =>
                    setSelectedArtworkTrack({
                      id: `${track.region}-${track.id}`,
                      title: track.title,
                      artist: track.artist,
                      album: track.album,
                      coverUrl: track.cover_url,
                      bitDepth: 24,
                      sampleRate: 96000,
                      bitrate: 2850,
                      format: "FLAC",
                      hires: true,
                      drScore: 13 + (index % 3),
                    })
                  }
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. Featured Hero Showcase with Audiophile Mastering Telemetry (for All, V-Pop, Global, Masters) */}
      {(selectedFilter === "all" ||
        selectedFilter === "vpop" ||
        selectedFilter === "global" ||
        selectedFilter === "masters") && (
        <>
          {featuredTrack && (
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-card via-[#1c1c1c] to-black border border-border p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xl">
              <div className="relative z-10 max-w-xl space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-badgeMax border border-badgeMax/30">
                    <Sparkles className="w-3 h-3 text-badgeMax" />
                    <span>KV-TIDAL MASTER HI-RES</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    DR13 CREST DYNAMICS
                  </span>
                  {selectedFilter === "vpop" && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/15 text-primary border border-primary/30">
                      VIETNAM TRENDING #1
                    </span>
                  )}
                  {selectedFilter === "global" && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/15 text-primary border border-primary/30">
                      BILLBOARD GLOBAL #1
                    </span>
                  )}
                </div>

                <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
                  {selectedFilter === "vpop"
                    ? "Xu Hướng Âm Nhạc Việt Nam"
                    : selectedFilter === "global"
                    ? "Billboard Hot 100 Masters"
                    : "Top Trending Master Hi-Res"}
                </h1>

                {/* Audiophile Technical Spec Strip */}
                <div className="bg-black/40 border border-border/60 rounded-xl p-3 text-xs font-mono space-y-1 text-textSecondary">
                  <div className="text-white font-semibold flex items-center space-x-1.5">
                    <span className="text-primary">Featured:</span>
                    <span>
                      {selectedFilter === "global"
                        ? globalTracks[0]?.title || featuredTrack.title
                        : featuredTrack.title}
                    </span>
                    <span className="text-textSecondary">
                      •{" "}
                      {selectedFilter === "global"
                        ? globalTracks[0]?.artist || featuredTrack.artist
                        : featuredTrack.artist}
                    </span>
                  </div>
                  <div className="text-[11px] text-textSecondary/80">
                    Codec: <span className="text-white">FLAC 24-bit/96kHz</span> • Bitrate:{" "}
                    <span className="text-white">~2,980 kbps</span> • TruePeak:{" "}
                    <span className="text-emerald-400">-0.1 dBTP</span> • Target:{" "}
                    <span className="text-primary">Synology NAS Bit-Perfect</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    onClick={() =>
                      handlePlayTrack(
                        selectedFilter === "global" && globalTracks[0]
                          ? globalTracks[0]
                          : featuredTrack
                      )
                    }
                    className="px-5 py-2.5 rounded-full bg-primary text-black font-bold text-xs flex items-center space-x-2 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                    <span>Play Bit-Perfect (96kHz)</span>
                  </button>

                  <button
                    onClick={() => setIsSignalPathOpen(true)}
                    className="px-4 py-2.5 rounded-full bg-card hover:bg-cardHover border border-border text-xs font-semibold text-textSecondary hover:text-white flex items-center space-x-2 transition-colors cursor-pointer"
                  >
                    <Activity className="w-3.5 h-3.5 text-primary" />
                    <span>Inspect Signal Path</span>
                  </button>

                  <button
                    onClick={handleForceRefresh}
                    disabled={refreshing}
                    className="px-4 py-2.5 rounded-full bg-card hover:bg-cardHover border border-border text-xs font-semibold text-textSecondary hover:text-white flex items-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-primary" : ""}`}
                    />
                    <span>Update Charts</span>
                  </button>
                </div>
              </div>

              {/* Featured Album Art */}
              <div className="hidden sm:block w-36 h-36 md:w-48 md:h-48 rounded-tidal overflow-hidden border border-border shadow-2xl flex-shrink-0">
                {(selectedFilter === "global" && globalTracks[0] ? globalTracks[0] : featuredTrack)
                  .cover_url ? (
                  <img
                    src={
                      (selectedFilter === "global" && globalTracks[0]
                        ? globalTracks[0]
                        : featuredTrack
                      ).cover_url
                    }
                    alt={featuredTrack.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-card flex items-center justify-center">
                    <Disc className="w-12 h-12 text-textSecondary" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Shelves for All, Masters, V-Pop, Global */}
          {selectedFilter === "all" && (
            <MediaShelf
              title="Popular Artists"
              subtitle="Top streamed charting artists on KV-TIDAL with 24-bit masters"
              items={artistShelfItems}
              onViewAll={() => setSelectedFilter("artists")}
            />
          )}

          {(selectedFilter === "all" || selectedFilter === "vpop") && (
            <MediaShelf
              title="Xu Hướng Việt Nam"
              subtitle="Top trending tracks in Vietnam streaming in bit-perfect FLAC"
              items={vnShelfItems}
            />
          )}

          {(selectedFilter === "all" || selectedFilter === "masters") && (
            <MediaShelf
              title="Hot New & Trending Albums"
              subtitle="Full-length master pressings • Click to inspect tracklist, DR score, and play bit-perfect"
              items={albumShelfItems}
              onViewAll={() => setSelectedFilter("albums")}
            />
          )}

          {(selectedFilter === "all" || selectedFilter === "global") && (
            <MediaShelf
              title="Billboard & Global Hot 100"
              subtitle="International chart toppers and global hits in studio quality"
              items={globalShelfItems}
            />
          )}

          {(selectedFilter === "all" || selectedFilter === "masters") && (
            <MediaShelf
              title="Curated Hi-Res Playlists & Mixes"
              subtitle="Hand-crafted lossless selections across genres & moods with studio dynamic range"
              items={playlistShelfItems}
              onViewAll={() => setSelectedFilter("playlists")}
            />
          )}

          {/* Top Chart Tracks Table */}
          <div className="space-y-4 pt-6">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <div className="flex items-center space-x-2">
                <Flame className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-bold text-white tracking-tight">
                  {selectedFilter === "vpop"
                    ? "Bảng Xếp Hạng Bài Hát Việt Nam"
                    : selectedFilter === "global"
                    ? "Billboard & International Hot Tracks"
                    : "Top Chart Tracks"}
                </h2>
              </div>
              <span className="text-xs text-textSecondary font-mono">
                {selectedFilter === "vpop"
                  ? `${vnTracks.length} tracks`
                  : selectedFilter === "global"
                  ? `${globalTracks.length} tracks`
                  : `${vnTracks.length + globalTracks.length} master tracks available`}
              </span>
            </div>

            {/* Table Column Headers */}
            <div className="hidden md:flex items-center justify-between px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-textSecondary/70 border-b border-border/40">
              <div className="flex items-center space-x-4 flex-1">
                <span className="w-6 text-center">#</span>
                <span>Title & Quality</span>
              </div>
              <span className="w-1/4 px-4">Album</span>
              <span className="w-24 text-right pr-2">Duration</span>
            </div>

            {/* Track Rows */}
            <div className="space-y-1">
              {(() => {
                const tracksToShow =
                  selectedFilter === "vpop"
                    ? vnTracks
                    : selectedFilter === "global"
                    ? globalTracks
                    : [...vnTracks, ...globalTracks].slice(0, 35);

                const topChartQueue: PlayableTrack[] = tracksToShow.map((t, idx) => ({
                  id: `${t.region}-${t.id}-${idx}`,
                  title: t.title,
                  artist: t.artist,
                  album: t.album,
                  coverUrl: t.cover_url,
                  streamUrl: `/api/stream?artist=${encodeURIComponent(t.artist)}&title=${encodeURIComponent(
                    t.title
                  )}${t.preview_url ? `&url=${encodeURIComponent(t.preview_url)}` : ""}`,
                  previewUrl: t.preview_url,
                  source: "tidal",
                  hires: true,
                  format: "FLAC",
                  bitDepth: 24,
                  sampleRate: 96000,
                  bitrate: 2850,
                  drScore: 12 + (idx % 3),
                }));

                return tracksToShow.map((track, index) => (
                  <TrackRow
                    key={`${track.region}-${track.id}-${index}`}
                    rank={index + 1}
                    title={track.title}
                    artist={track.artist}
                    album={track.album}
                    coverUrl={track.cover_url}
                    previewUrl={track.preview_url}
                    source="tidal"
                    hires={true}
                    format="FLAC"
                    bitDepth={24}
                    sampleRate={96000}
                    bitrate={2850}
                    drScore={12 + (index % 3)}
                    queueContext={topChartQueue}
                    onArtistClick={(name) => setSelectedArtist({ name })}
                    onAlbumClick={(title, artist, cover) =>
                      setSelectedAlbum({
                        id: title,
                        title,
                        artist,
                        coverUrl: cover,
                      })
                    }
                    onCoverClick={() =>
                      setSelectedArtworkTrack({
                        id: `${track.region}-${track.id}-${index}`,
                        title: track.title,
                        artist: track.artist,
                        album: track.album,
                        coverUrl: track.cover_url,
                        streamUrl: `/api/stream?artist=${encodeURIComponent(
                          track.artist
                        )}&title=${encodeURIComponent(track.title)}${
                          track.preview_url ? `&url=${encodeURIComponent(track.preview_url)}` : ""
                        }`,
                        bitDepth: 24,
                        sampleRate: 96000,
                        bitrate: 2850,
                        format: "FLAC",
                        hires: true,
                        drScore: 12 + (index % 3),
                      })
                    }
                  />
                ));
              })()}
            </div>
          </div>
        </>
      )}

      {/* Artist Profile Modal */}
      <ArtistModal
        isOpen={selectedArtist !== null}
        onClose={() => setSelectedArtist(null)}
        artistName={selectedArtist?.name || null}
        artistAvatar={selectedArtist?.avatar}
        onAlbumClick={(alb) => setSelectedAlbum(alb)}
      />

      {/* Curated Playlist Inspector Modal */}
      <PlaylistModal
        isOpen={selectedPlaylist !== null}
        onClose={() => setSelectedPlaylist(null)}
        playlist={selectedPlaylist}
      />

      {/* Album Tracklist Inspector Modal */}
      <AlbumModal
        isOpen={selectedAlbum !== null}
        onClose={() => setSelectedAlbum(null)}
        album={selectedAlbum}
      />

      {/* Artwork Inspector Lightbox Modal */}
      <ArtworkModal
        isOpen={selectedArtworkTrack !== null}
        onClose={() => setSelectedArtworkTrack(null)}
        track={selectedArtworkTrack}
      />
    </div>
  );
}
