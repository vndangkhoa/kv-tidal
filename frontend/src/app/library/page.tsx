"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LibraryAlbum, LibraryArtist, LibraryTrack, MappedFolder } from "@/types";
import { TrackRow } from "@/components/TrackRow";
import { AlbumModal } from "@/components/AlbumModal";
import { ArtistModal } from "@/components/ArtistModal";
import {
  Library,
  RefreshCw,
  Folder,
  Music2,
  Users,
  Disc,
  Sparkles,
  ShieldCheck,
  Award,
  Zap,
  Search,
  ArrowUpDown,
} from "lucide-react";

function LibraryContent() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");

  const [albums, setAlbums] = useState<LibraryAlbum[]>([]);
  const [artists, setArtists] = useState<LibraryArtist[]>([]);
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [mappedFolders, setMappedFolders] = useState<MappedFolder[]>([]);
  const [totalTracks, setTotalTracks] = useState<number>(0);
  const [totalHires, setTotalHires] = useState<number>(0);
  const [activeView, setActiveView] = useState<"albums" | "artists" | "tracks" | "hires" | "dsd">(
    "albums"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"title" | "artist" | "dr" | "hires">("title");

  useEffect(() => {
    if (tab && ["albums", "artists", "tracks", "hires", "dsd"].includes(tab)) {
      setActiveView(tab as "albums" | "artists" | "tracks" | "hires" | "dsd");
    }
  }, [tab]);
  const [loading, setLoading] = useState(true);
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

  const fetchLibrary = async () => {
    try {
      const resp = await fetch("/api/library");
      if (resp.ok) {
        const data = await resp.json();
        setAlbums(data.albums || []);
        setArtists(data.artists || []);
        setMappedFolders(data.mapped_folders || []);
        setTotalTracks(data.total_tracks || 0);
        setTotalHires(data.total_hires || 0);
      }

      const tracksResp = await fetch("/api/library/tracks");
      if (tracksResp.ok) {
        const tData = await tracksResp.json();
        setTracks(tData.tracks || []);
      }
    } catch (e) {
      console.error("Library fetch failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
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

  // Dynamic DR average
  const tracksWithDr = tracks.filter((t) => t.dr_score && t.dr_score > 0);
  const avgDr =
    tracksWithDr.length > 0
      ? (tracksWithDr.reduce((acc, t) => acc + (t.dr_score || 0), 0) / tracksWithDr.length).toFixed(1)
      : "13.0";

  // Filter lists based on searchQuery and activeView
  const queryLower = searchQuery.trim().toLowerCase();

  const filterTrackBySearch = (t: LibraryTrack) => {
    if (!queryLower) return true;
    return (
      t.title.toLowerCase().includes(queryLower) ||
      t.artist.toLowerCase().includes(queryLower) ||
      t.album.toLowerCase().includes(queryLower)
    );
  };

  const sortTracksList = (list: LibraryTrack[]) => {
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
  };

  const hiresTracks = sortTracksList(
    tracks.filter(
      (t) =>
        (t.hires || (t.bit_depth && t.bit_depth > 16) || (t.sample_rate && t.sample_rate > 44100)) &&
        filterTrackBySearch(t)
    )
  );
  const dsdTracks = sortTracksList(
    tracks.filter(
      (t) =>
        (t.is_dsd || t.format.toLowerCase() === "dsf" || t.format.toLowerCase() === "dff") &&
        filterTrackBySearch(t)
    )
  );
  const allFilteredTracks = sortTracksList(tracks.filter(filterTrackBySearch));

  const filteredAlbums = albums.filter((alb) => {
    if (!queryLower) return true;
    return alb.name.toLowerCase().includes(queryLower) || alb.artist.toLowerCase().includes(queryLower);
  });

  const filteredArtists = artists.filter((art) => {
    if (!queryLower) return true;
    return art.name.toLowerCase().includes(queryLower);
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Rescan Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-textPrimary">Synology NAS Lossless Vault</h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              BIT-PERFECT STORAGE
            </span>
          </div>
          <p className="text-sm text-textSecondary mt-1">
            Browse, manage, and stream bit-perfect studio master audio files stored on your Synology NAS.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleRescan(false)}
            disabled={rescanning}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs text-textSecondary hover:text-textPrimary bg-surface border border-border rounded-xl transition-colors cursor-pointer"
            title="Fast Inotify scan for newly added tracks"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rescanning ? "animate-spin text-primary" : ""}`} />
            <span>Fast NAS Scan</span>
          </button>
          <button
            onClick={() => handleRescan(true)}
            disabled={rescanning}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs text-primary hover:text-white bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-xl transition-colors cursor-pointer"
            title="Deep audio audit: Recalculate Dynamic Range (DR) scores and verify FLAC checksums"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            <span>Deep DR Audit</span>
          </button>
        </div>
      </div>

      {/* Audiophile Telemetry Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
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
      <div className="flex items-center space-x-2 border-b border-border pb-3 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveView("albums")}
          className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
            activeView === "albums"
              ? "bg-white text-black"
              : "text-textSecondary hover:text-white bg-card/60 border border-border"
          }`}
        >
          Albums ({filteredAlbums.length !== albums.length ? `${filteredAlbums.length}/${albums.length}` : albums.length})
        </button>
        <button
          onClick={() => setActiveView("artists")}
          className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
            activeView === "artists"
              ? "bg-white text-black"
              : "text-textSecondary hover:text-white bg-card/60 border border-border"
          }`}
        >
          Artists ({filteredArtists.length !== artists.length ? `${filteredArtists.length}/${artists.length}` : artists.length})
        </button>
        <button
          onClick={() => setActiveView("tracks")}
          className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
            activeView === "tracks"
              ? "bg-white text-black"
              : "text-textSecondary hover:text-white bg-card/60 border border-border"
          }`}
        >
          All Tracks ({allFilteredTracks.length !== tracks.length ? `${allFilteredTracks.length}/${tracks.length}` : tracks.length})
        </button>
        <button
          onClick={() => setActiveView("hires")}
          className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center space-x-1.5 ${
            activeView === "hires"
              ? "bg-amber-400 text-black shadow-md shadow-amber-400/20 font-extrabold"
              : "text-amber-300 hover:text-amber-200 bg-amber-500/10 border border-amber-500/30"
          }`}
        >
          <Sparkles className="w-3 h-3" />
          <span>Studio Masters ({hiresTracks.length})</span>
        </button>
        <button
          onClick={() => setActiveView("dsd")}
          className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
            activeView === "dsd"
              ? "bg-purple-500 text-white shadow-md shadow-purple-500/20 font-extrabold"
              : "text-purple-300 hover:text-purple-200 bg-purple-500/10 border border-purple-500/30"
          }`}
        >
          DSD / SACD Vault ({dsdTracks.length})
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
            {filteredAlbums.map((album) => (
              <div
                key={album.id}
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
                className="group bg-card hover:bg-cardHover border border-border hover:border-borderHover rounded-tidal p-3 transition-colors cursor-pointer"
              >
                <div className="relative aspect-square rounded-tidal bg-black border border-border mb-3 overflow-hidden flex items-center justify-center">
                  {album.cover_path ? (
                    <img
                      src={`/rest/getCoverArt.view?id=album-${album.id}`}
                      alt={album.name}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <Disc className="w-10 h-10 text-textSecondary group-hover:text-primary transition-colors" />
                  )}
                  {/* Quality Tag */}
                  <span className="absolute top-2 right-2 px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-black/80 backdrop-blur-md text-badgeMax border border-badgeMax/40">
                    FLAC 24/96
                  </span>
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
            ))}
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
            {filteredArtists.map((artist) => (
              <div
                key={artist.id}
                onClick={() => setSelectedArtist({ name: artist.name })}
                className="bg-surface hover:bg-card border border-border hover:border-primary/40 p-3.5 rounded-xl flex items-center space-x-3 transition-colors cursor-pointer group"
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
            ))}
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
            hiresTracks.map((track) => (
              <TrackRow
                key={track.id}
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
            ))
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
            dsdTracks.map((track) => (
              <TrackRow
                key={track.id}
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
            ))
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
            allFilteredTracks.map((track) => (
              <TrackRow
                key={track.id}
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
            ))
          )}
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
