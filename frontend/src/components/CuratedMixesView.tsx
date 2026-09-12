"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/context/PlayerContext";
import {
  Play,
  Sparkles,
  Disc,
  Flame,
  Radio,
  Sliders,
  Compass,
  Headphones,
  Music,
  Check,
  Clock,
  Layers,
} from "lucide-react";
import { PlayableTrack } from "@/types";

export interface CuratedPlaylist {
  id: string;
  title: string;
  subtitle: string;
  category: "calibration" | "mood" | "genre";
  categoryLabel: string;
  coverUrl: string;
  drScore: number;
  trackCount: number;
  sampleRate: number;
  bitDepth: number;
  searchQuery: string;
  sampleTracks: { title: string; artist: string; duration: number }[];
}

export const CURATED_PLAYLIST_COLLECTIONS: CuratedPlaylist[] = [
  // Calibration & Audiophile Reference
  {
    id: "mix-acoustic-vocal",
    title: "Audiophile Acoustic & Vocal Reference",
    subtitle: "Bit-perfect uncompressed dynamics • Pure acoustic intimacy & breath detail",
    category: "calibration",
    categoryLabel: "Acoustic & Imaging Reference",
    coverUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
    drScore: 14,
    trackCount: 16,
    sampleRate: 96000,
    bitDepth: 24,
    searchQuery: "Acoustic Vocal Master",
    sampleTracks: [
      { title: "I Drink Wine", artist: "Adele", duration: 376 },
      { title: "Don't Know Why", artist: "Norah Jones", duration: 185 },
      { title: "Fast Car", artist: "Tracy Chapman", duration: 296 },
      { title: "The Nearness of You", artist: "Diana Krall", duration: 284 },
    ],
  },
  {
    id: "mix-bass-transient",
    title: "Deep Bass & Sub-Bass Transient Check",
    subtitle: "Fast punchy low-end impulse response • Sub-30Hz test tracks for DAC & woofers",
    category: "calibration",
    categoryLabel: "Sub-Bass & Impulse Response",
    coverUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80",
    drScore: 13,
    trackCount: 14,
    sampleRate: 96000,
    bitDepth: 24,
    searchQuery: "Electronic Bass Sub",
    sampleTracks: [
      { title: "Limit to Your Love", artist: "James Blake", duration: 276 },
      { title: "Angel", artist: "Massive Attack", duration: 379 },
      { title: "Royals (Bass Heavy Ref)", artist: "Lorde", duration: 190 },
    ],
  },
  {
    id: "mix-soundstage-imaging",
    title: "Soundstage & Spatial Imaging Test",
    subtitle: "Holographic 3D stereo room separation and micro-dynamic placement",
    category: "calibration",
    categoryLabel: "Stereo Imaging & Staging",
    coverUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
    drScore: 15,
    trackCount: 12,
    sampleRate: 192000,
    bitDepth: 24,
    searchQuery: "Audiophile Soundstage",
    sampleTracks: [
      { title: "Hotel California (Live Master)", artist: "Eagles", duration: 432 },
      { title: "Bubbles", artist: "Yosi Horikawa", duration: 320 },
      { title: "Keith Don't Go", artist: "Nils Lofgren", duration: 345 },
    ],
  },

  // Moods & Audiophile Ambience
  {
    id: "mix-chill-lofi",
    title: "Late Night Chill & Lo-Fi FLAC",
    subtitle: "Deep relaxing melodies in bit-perfect uncompressed FLAC",
    category: "mood",
    categoryLabel: "Midnight Relax & Focus",
    coverUrl: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80",
    drScore: 12,
    trackCount: 20,
    sampleRate: 96000,
    bitDepth: 24,
    searchQuery: "Lofi Chill",
    sampleTracks: [
      { title: "Snowman Lounge", artist: "WYS", duration: 160 },
      { title: "Affection", artist: "Jinsang", duration: 178 },
      { title: "Contemplation", artist: "Idealism", duration: 145 },
    ],
  },
  {
    id: "mix-vinyl-warmth",
    title: "Analog Tape & Vinyl Warmth",
    subtitle: "Organic analog harmonics, tube pre-amp saturation & warm dynamic timbre",
    category: "mood",
    categoryLabel: "Analog & Tube Timbre",
    coverUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80",
    drScore: 14,
    trackCount: 15,
    sampleRate: 96000,
    bitDepth: 24,
    searchQuery: "Vinyl Warmth Analog",
    sampleTracks: [
      { title: "Tin Pan Alley", artist: "Stevie Ray Vaughan", duration: 550 },
      { title: "Ain't No Sunshine", artist: "Bill Withers", duration: 124 },
      { title: "Little Wing", artist: "Jimi Hendrix", duration: 146 },
    ],
  },
  {
    id: "mix-coffee-acoustic",
    title: "Hi-Res Coffeehouse & Live Lounge",
    subtitle: "Crisp fingers on fretboard, warm upright bass & live studio ambience",
    category: "mood",
    categoryLabel: "Acoustic Lounge",
    coverUrl: "https://images.unsplash.com/photo-1525994886773-080587e161c2?w=600&auto=format&fit=crop&q=80",
    drScore: 13,
    trackCount: 18,
    sampleRate: 96000,
    bitDepth: 24,
    searchQuery: "Coffeehouse Acoustic",
    sampleTracks: [
      { title: "Banana Pancakes", artist: "Jack Johnson", duration: 192 },
      { title: "Gravity", artist: "John Mayer", duration: 245 },
      { title: "Ho Hey", artist: "The Lumineers", duration: 163 },
    ],
  },

  // Genre Master Series
  {
    id: "mix-vpop-masters",
    title: "V-Pop Master Hits (Studio 24/96)",
    subtitle: "Top charting Vietnamese pop productions in full studio 24-bit lossless",
    category: "genre",
    categoryLabel: "Vietnam Chart Leaders",
    coverUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
    drScore: 12,
    trackCount: 25,
    sampleRate: 96000,
    bitDepth: 24,
    searchQuery: "Sơn Tùng M-TP",
    sampleTracks: [
      { title: "Đừng Làm Trái Tim Anh Đau", artist: "Sơn Tùng M-TP", duration: 280 },
      { title: "Thiên Lý Ơi", artist: "Jack - J97", duration: 250 },
      { title: "Nâng Chén Tiêu Sầu", artist: "Bích Phương", duration: 215 },
    ],
  },
  {
    id: "mix-billboard-global",
    title: "Billboard Global Top 50 Masters",
    subtitle: "Worldwide streaming chart leaders mastered for high-fidelity sound systems",
    category: "genre",
    categoryLabel: "Global Hit Series",
    coverUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80",
    drScore: 12,
    trackCount: 50,
    sampleRate: 96000,
    bitDepth: 24,
    searchQuery: "Billboard Hot 100",
    sampleTracks: [
      { title: "Espresso", artist: "Sabrina Carpenter", duration: 175 },
      { title: "Birds of a Feather", artist: "Billie Eilish", duration: 194 },
      { title: "Cruel Summer", artist: "Taylor Swift", duration: 178 },
    ],
  },
  {
    id: "mix-jazz-fusion",
    title: "Hi-Res Jazz & Fusion Classics",
    subtitle: "Legendary live room acoustic separation, drum brush textures & horn dynamics",
    category: "genre",
    categoryLabel: "Audiophile Jazz & Fusion",
    coverUrl: "https://images.unsplash.com/photo-1525994886773-080587e161c2?w=600&auto=format&fit=crop&q=80",
    drScore: 15,
    trackCount: 16,
    sampleRate: 192000,
    bitDepth: 24,
    searchQuery: "Jazz Fusion",
    sampleTracks: [
      { title: "So What", artist: "Miles Davis", duration: 562 },
      { title: "Take Five", artist: "Dave Brubeck", duration: 324 },
      { title: "Cantaloupe Island", artist: "Herbie Hancock", duration: 332 },
    ],
  },
];

export function CuratedMixesView() {
  const router = useRouter();
  const { playTrack } = usePlayer();
  const [selectedMix, setSelectedMix] = useState<CuratedPlaylist>(CURATED_PLAYLIST_COLLECTIONS[0]);
  const [activeCategory, setActiveCategory] = useState<"all" | "calibration" | "mood" | "genre">("all");

  const handlePlayMix = (mix: CuratedPlaylist) => {
    if (!mix.sampleTracks || mix.sampleTracks.length === 0) return;

    const queueItems: PlayableTrack[] = mix.sampleTracks.map((t, idx) => ({
      id: `${mix.id}-trk-${idx}`,
      title: t.title,
      artist: t.artist,
      album: mix.title,
      coverUrl: mix.coverUrl,
      streamUrl: `/api/stream?artist=${encodeURIComponent(t.artist)}&title=${encodeURIComponent(t.title)}`,
      duration: t.duration,
      bitDepth: mix.bitDepth,
      sampleRate: mix.sampleRate,
      format: "FLAC",
      hires: true,
      source: "tidal",
      drScore: mix.drScore,
    }));

    playTrack(queueItems[0], queueItems);
  };

  const handlePlaySingleTrack = (mix: CuratedPlaylist, t: { title: string; artist: string; duration: number }, idx: number) => {
    playTrack({
      id: `${mix.id}-trk-${idx}`,
      title: t.title,
      artist: t.artist,
      album: mix.title,
      coverUrl: mix.coverUrl,
      streamUrl: `/api/stream?artist=${encodeURIComponent(t.artist)}&title=${encodeURIComponent(t.title)}`,
      duration: t.duration,
      bitDepth: mix.bitDepth,
      sampleRate: mix.sampleRate,
      format: "FLAC",
      hires: true,
      source: "tidal",
      drScore: mix.drScore,
    });
  };

  const filteredPlaylists =
    activeCategory === "all"
      ? CURATED_PLAYLIST_COLLECTIONS
      : CURATED_PLAYLIST_COLLECTIONS.filter((p) => p.category === activeCategory);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. Mix of the Day Spotlight Hero */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-card via-[#1e1e1e] to-black border border-border p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xl">
        <div className="relative z-10 max-w-2xl space-y-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-primary/20 text-primary border border-primary/30 shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span>CURATED AUDIOPHILE SPOTLIGHT</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              DR{selectedMix.drScore} DYNAMICS
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {selectedMix.bitDepth}b / {selectedMix.sampleRate / 1000}kHz FLAC
            </span>
          </div>

          <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
            {selectedMix.title}
          </h1>
          <p className="text-xs md:text-sm text-textSecondary leading-relaxed max-w-xl">
            {selectedMix.subtitle}
          </p>

          <div className="bg-black/50 border border-border/80 rounded-xl p-3 text-xs font-mono flex flex-wrap items-center gap-4 text-textSecondary">
            <div>
              <span className="text-textSecondary/70">Category: </span>
              <span className="text-white font-semibold">{selectedMix.categoryLabel}</span>
            </div>
            <div>
              <span className="text-textSecondary/70">Selection: </span>
              <span className="text-primary font-semibold">{selectedMix.trackCount} Master Tracks</span>
            </div>
            <div>
              <span className="text-textSecondary/70">Target: </span>
              <span className="text-emerald-400 font-semibold">Lossless Bit-Perfect</span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => handlePlayMix(selectedMix)}
              className="px-5 py-2.5 rounded-full bg-primary text-black font-bold text-xs flex items-center space-x-2 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
              <span>Play Entire Mix Bit-Perfect</span>
            </button>

            <button
              onClick={() => router.push(`/search/?q=${encodeURIComponent(selectedMix.searchQuery)}`)}
              className="px-4 py-2.5 rounded-full bg-card hover:bg-cardHover border border-border text-xs font-semibold text-textSecondary hover:text-white flex items-center space-x-2 transition-colors cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5 text-primary" />
              <span>Explore More in Catalog</span>
            </button>
          </div>
        </div>

        {/* Selected Mix Artwork Container */}
        <div className="w-40 h-40 md:w-52 md:h-52 rounded-2xl overflow-hidden border border-border/80 shadow-2xl flex-shrink-0 relative group">
          <img
            src={selectedMix.coverUrl}
            alt={selectedMix.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-3">
            <span className="text-[11px] font-mono text-white/90 truncate font-semibold">
              {selectedMix.trackCount} Tracks • Master Quality
            </span>
          </div>
        </div>
      </div>

      {/* 2. Interactive Category Filter Chips */}
      <div className="flex items-center space-x-2 border-b border-border/60 pb-3">
        {[
          { id: "all", label: "All Curated Mixes" },
          { id: "calibration", label: "Acoustic & Calibration References" },
          { id: "mood", label: "Moods & Analog Ambience" },
          { id: "genre", label: "Genre Studio Masters" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveCategory(tab.id as any)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              activeCategory === tab.id
                ? "bg-white text-black font-bold shadow-md"
                : "bg-card/70 hover:bg-card text-textSecondary hover:text-white border border-border"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 3. Responsive Mix Bento Grid (Fills the Screen!) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredPlaylists.map((mix) => {
          const isSelected = selectedMix.id === mix.id;

          return (
            <div
              key={mix.id}
              onClick={() => setSelectedMix(mix)}
              className={`group bg-card/60 hover:bg-card border rounded-2xl p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between select-none shadow-lg ${
                isSelected
                  ? "border-primary ring-1 ring-primary/40 bg-card"
                  : "border-border hover:border-borderHover"
              }`}
            >
              <div>
                {/* Artwork & Header Row */}
                <div className="flex items-start space-x-4">
                  <div className="relative aspect-square w-20 sm:w-24 rounded-xl overflow-hidden bg-black/60 border border-border/50 flex-shrink-0">
                    <img
                      src={mix.coverUrl}
                      alt={mix.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute right-1.5 bottom-1.5 w-7 h-7 rounded-full bg-primary text-black flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-1.5 mb-1">
                      <span className="text-[10px] font-mono font-bold uppercase text-primary">
                        {mix.categoryLabel}
                      </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-white truncate group-hover:text-primary transition-colors">
                      {mix.title}
                    </h3>
                    <p className="text-xs text-textSecondary line-clamp-2 mt-1 leading-relaxed">
                      {mix.subtitle}
                    </p>
                  </div>
                </div>

                {/* Sample Track Highlights Preview */}
                <div className="mt-3.5 pt-3 border-t border-border/40 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-textSecondary/70 uppercase">
                    <span>Featured Tracks</span>
                    <span>DR{mix.drScore}</span>
                  </div>
                  {mix.sampleTracks.slice(0, 3).map((t, idx) => (
                    <div
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlaySingleTrack(mix, t, idx);
                      }}
                      className="flex items-center justify-between py-1 px-2 rounded-lg bg-black/30 hover:bg-primary/10 group/track transition-colors text-xs"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <Play className="w-3 h-3 text-primary opacity-0 group-hover/track:opacity-100 transition-opacity flex-shrink-0" />
                        <span className="text-white font-medium truncate">{t.title}</span>
                        <span className="text-textSecondary truncate">• {t.artist}</span>
                      </div>
                      <span className="text-[10px] font-mono text-textSecondary/70 ml-2">
                        {Math.floor(t.duration / 60)}:{(t.duration % 60).toString().padStart(2, "0")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer Specs Bar */}
              <div className="mt-4 pt-2.5 border-t border-border/30 flex items-center justify-between text-[11px] font-mono text-textSecondary">
                <span className="text-white font-semibold">{mix.trackCount} Tracks</span>
                <span className="text-emerald-400">{mix.bitDepth}-bit / {mix.sampleRate / 1000}kHz</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayMix(mix);
                  }}
                  className="px-2.5 py-1 rounded-full bg-primary/20 hover:bg-primary text-primary hover:text-black font-semibold text-[10px] transition-colors"
                >
                  Play Mix
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
