"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/context/PlayerContext";
import { TrackRow } from "@/components/TrackRow";
import { LibraryTrack, PlayableTrack } from "@/types";
import {
  Disc,
  Sparkles,
  ShieldCheck,
  Zap,
  Play,
  Activity,
  FolderOpen,
  ArrowUpRight,
  HardDrive,
  Flame,
  Radio,
} from "lucide-react";

// Curated SACD & DSD Reference Master Albums
const SACD_REFERENCE_ALBUMS = [
  {
    id: "sacd-pink-floyd",
    title: "The Dark Side of the Moon",
    artist: "Pink Floyd",
    label: "Analogue Productions • SACD Master",
    format: "DSD64 (2.8MHz 1-bit)",
    drScore: 16,
    year: "1973/2021 Remaster",
    coverUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
    tracks: 10,
    searchQuery: "Pink Floyd Dark Side of the Moon",
  },
  {
    id: "sacd-miles-davis",
    title: "Kind of Blue (Stereo DSD)",
    artist: "Miles Davis",
    label: "Columbia / Sony Legacy SACD",
    format: "DSD64 (2.8MHz 1-bit)",
    drScore: 17,
    year: "1959/2013 DSD",
    coverUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
    tracks: 5,
    searchQuery: "Miles Davis Kind of Blue",
  },
  {
    id: "sacd-norah-jones",
    title: "Come Away With Me",
    artist: "Norah Jones",
    label: "Blue Note Records / Analogue Productions",
    format: "DSD128 (5.6MHz)",
    drScore: 14,
    year: "2002/2022 Remaster",
    coverUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80",
    tracks: 14,
    searchQuery: "Norah Jones Come Away With Me",
  },
  {
    id: "sacd-steely-dan",
    title: "Aja (Acoustic Sounds SACD)",
    artist: "Steely Dan",
    label: "Analogue Productions DSD",
    format: "DSD64 (2.8MHz 1-bit)",
    drScore: 16,
    year: "1977/2023 DSD",
    coverUrl: "https://images.unsplash.com/photo-1525994886773-080587e161c2?w=600&auto=format&fit=crop&q=80",
    tracks: 7,
    searchQuery: "Steely Dan Aja",
  },
  {
    id: "sacd-channel-classics",
    title: "Bach: Brandenburg Concertos",
    artist: "Florilegium",
    label: "Channel Classics Records • Native DSD256",
    format: "DSD256 (11.2MHz)",
    drScore: 18,
    year: "2019 Master",
    coverUrl: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80",
    tracks: 18,
    searchQuery: "Bach Brandenburg Concertos",
  },
  {
    id: "sacd-vpop-acoustic",
    title: "Tuyệt Phẩm Acoustic & Trữ Tình (DSD Ref)",
    artist: "Various Audiophile Artists",
    label: "Audiophile Vietnam SACD Series",
    format: "DSD64 (2.8MHz 1-bit)",
    drScore: 15,
    year: "2024 DSD Pressing",
    coverUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80",
    tracks: 12,
    searchQuery: "Acoustic Vietnam Audiophile",
  },
];

export function DsdVaultView() {
  const router = useRouter();
  const { playTrack, setIsSignalPathOpen } = usePlayer();
  const [localDsdTracks, setLocalDsdTracks] = useState<LibraryTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDsdTracks = async () => {
      try {
        const resp = await fetch("/api/library/tracks");
        if (resp.ok) {
          const data = await resp.json();
          const allTracks: LibraryTrack[] = data.tracks || [];
          const filtered = allTracks.filter(
            (t) =>
              t.is_dsd ||
              t.format.toLowerCase() === "dsf" ||
              t.format.toLowerCase() === "dff" ||
              (t.sample_rate && t.sample_rate >= 2822400)
          );
          setLocalDsdTracks(filtered);
        }
      } catch (err) {
        console.error("Failed fetching DSD library tracks:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDsdTracks();
  }, []);

  const handlePlayDsdReference = (sampler: typeof SACD_REFERENCE_ALBUMS[0]) => {
    const track: PlayableTrack = {
      id: sampler.id,
      title: `${sampler.title} (SACD DSD64 Master)`,
      artist: sampler.artist,
      album: sampler.title,
      coverUrl: sampler.coverUrl,
      streamUrl: `/api/stream?artist=${encodeURIComponent(sampler.artist)}&title=${encodeURIComponent(
        sampler.title
      )}`,
      bitDepth: 1,
      sampleRate: 2822400,
      bitrate: 5645,
      format: "DSF",
      hires: true,
      isDsd: true,
      source: "nas",
      drScore: sampler.drScore,
    };
    playTrack(track);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. Audiophile DSD / SACD Master Vault Hero Showcase */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#1c1810] via-[#121212] to-black border border-badgeMax/30 p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xl">
        <div className="relative z-10 max-w-2xl space-y-3.5">
          {/* Status Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-badgeMax/20 text-badgeMax border border-badgeMax/40 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-badgeMax" />
              <span>DIRECT STREAM DIGITAL (DSD) & SACD VAULT</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              1-BIT DELTA-SIGMA
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/15 text-primary border border-primary/30">
              DoP / ASIO DAC DIRECT
            </span>
          </div>

          <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
            Synology Native DSD & SACD Master Engine
          </h1>
          <p className="text-xs md:text-sm text-textSecondary leading-relaxed">
            Ultra-pure 1-bit pulse density audio sampled at 2.8224 MHz (64x CD) to 11.2896 MHz (256x). Zero decimation, zero quantization distortion, transmitted bit-perfect to your USB/Network DAC.
          </p>

          {/* Technical Telemetry Dashboard Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-black/50 border border-badgeMax/20 rounded-xl p-3 text-xs font-mono text-textSecondary">
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase text-textSecondary/70">Sampling Rate</span>
              <p className="text-white font-bold text-xs">2.8224 MHz</p>
              <span className="text-[9px] text-badgeMax">DSD64 Master</span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase text-textSecondary/70">Dynamic Range</span>
              <p className="text-emerald-400 font-bold text-xs">DR15+ Crest</p>
              <span className="text-[9px] text-textSecondary">Uncompressed</span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase text-textSecondary/70">Quantization</span>
              <p className="text-white font-bold text-xs">1-Bit PDM</p>
              <span className="text-[9px] text-primary">Native Stream</span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase text-textSecondary/70">Hardware Engine</span>
              <p className="text-emerald-300 font-bold text-xs">DAC Direct Lock</p>
              <span className="text-[9px] text-emerald-400/80">Bit-Perfect</span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => handlePlayDsdReference(SACD_REFERENCE_ALBUMS[0])}
              className="px-5 py-2.5 rounded-full bg-badgeMax text-black font-bold text-xs flex items-center space-x-2 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-badgeMax/20 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
              <span>Play SACD Reference Sampler</span>
            </button>

            <button
              onClick={() => setIsSignalPathOpen(true)}
              className="px-4 py-2.5 rounded-full bg-card hover:bg-cardHover border border-border text-xs font-semibold text-textSecondary hover:text-white flex items-center space-x-2 transition-colors cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-primary" />
              <span>Inspect DSD Signal Path</span>
            </button>

            <button
              onClick={() => router.push("/library/?tab=dsd")}
              className="px-4 py-2.5 rounded-full bg-card hover:bg-cardHover border border-border text-xs font-semibold text-textSecondary hover:text-white flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <HardDrive className="w-3.5 h-3.5 text-badgeMax" />
              <span>Manage NAS Vault</span>
            </button>
          </div>
        </div>

        {/* SACD Hologram Vinyl Artwork */}
        <div className="hidden sm:flex flex-col items-center justify-center w-40 h-40 md:w-52 md:h-52 rounded-2xl bg-gradient-to-tr from-amber-500/10 via-[#1e1910] to-black border border-badgeMax/30 shadow-2xl p-4 flex-shrink-0 text-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-radial from-badgeMax/10 via-transparent to-transparent opacity-50 pointer-events-none" />
          <Disc className="w-20 h-20 text-badgeMax animate-spin-slow" />
          <span className="mt-3 text-xs font-mono font-bold text-white tracking-widest uppercase">
            SACD • DSD256
          </span>
          <span className="text-[10px] text-badgeMax font-mono">11,289.6 kHz</span>
        </div>
      </div>

      {/* 2. Curated SACD Reference Master Albums Showcase */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/70 pb-3">
          <div>
            <h2 className="text-lg md:text-xl font-bold tracking-tight text-white flex items-center space-x-2">
              <Flame className="w-4 h-4 text-badgeMax" />
              <span>Prestigious SACD & DSD Reference Pressings</span>
            </h2>
            <p className="text-xs text-textSecondary mt-0.5">
              Hand-mastered uncompressed delta-sigma releases with audiophile dynamic crest factor (DR14+)
            </p>
          </div>
          <span className="text-xs font-mono text-badgeMax bg-badgeMax/10 border border-badgeMax/30 px-2.5 py-1 rounded-full">
            {SACD_REFERENCE_ALBUMS.length} Masters
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {SACD_REFERENCE_ALBUMS.map((album) => (
            <div
              key={album.id}
              onClick={() => handlePlayDsdReference(album)}
              className="group bg-card/60 hover:bg-card border border-border hover:border-badgeMax/40 rounded-xl p-3 transition-all duration-200 cursor-pointer shadow-md hover:shadow-xl hover:shadow-badgeMax/5 flex flex-col justify-between select-none"
            >
              <div>
                <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-black/60 border border-border/50 mb-2.5">
                  <img
                    src={album.coverUrl}
                    alt={album.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {/* Gold DSD Badge */}
                  <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-black/85 text-badgeMax border border-badgeMax/40 backdrop-blur-sm shadow-md">
                    DSD SACD
                  </span>

                  {/* DR Score Badge */}
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-black/85 text-emerald-400 border border-emerald-500/40 backdrop-blur-sm shadow-md">
                    DR{album.drScore}
                  </span>

                  {/* Hover Play Button */}
                  <div className="absolute right-2.5 bottom-2.5 w-9 h-9 rounded-full bg-badgeMax text-black flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 group-hover:scale-105 active:scale-95 transition-all duration-200">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </div>
                </div>

                <h3 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-badgeMax transition-colors">
                  {album.title}
                </h3>
                <p className="text-[11px] text-textSecondary truncate mt-0.5">{album.artist}</p>
              </div>

              <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between text-[10px] font-mono text-textSecondary">
                <span className="text-badgeMax truncate">{album.format.split(" ")[0]}</span>
                <span>{album.tracks} trk</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Synology NAS Local DSD Tracks / Empty Onboarding State */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between border-b border-border/70 pb-3">
          <div className="flex items-center space-x-2">
            <HardDrive className="w-4 h-4 text-emerald-400" />
            <h2 className="text-lg font-bold text-white tracking-tight">
              Synology NAS Local DSD Files
            </h2>
          </div>
          <span className="text-xs text-textSecondary font-mono">
            {localDsdTracks.length} local DSD tracks scanned
          </span>
        </div>

        {localDsdTracks.length > 0 ? (
          <div className="space-y-1">
            {localDsdTracks.map((track, idx) => (
              <TrackRow
                key={`dsd-track-${track.id}-${idx}`}
                rank={idx + 1}
                title={track.title}
                artist={track.artist}
                album={track.album}
                streamId={track.id}
                source="nas"
                hires={true}
                isDsd={true}
                format={track.format.toUpperCase()}
                bitDepth={1}
                sampleRate={track.sample_rate || 2822400}
                bitrate={track.bitrate || 5645}
                drScore={track.dr_score || 15}
              />
            ))}
          </div>
        ) : (
          /* Sleek Audiophile Empty State / Setup Guide */
          <div className="rounded-2xl border border-dashed border-badgeMax/30 bg-card/40 p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-badgeMax/10 border border-badgeMax/30 text-badgeMax flex items-center justify-center mx-auto shadow-inner">
              <FolderOpen className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base font-bold text-white">No Local DSD Files Detected in NAS Vault</h3>
              <p className="text-xs text-textSecondary leading-relaxed">
                KV-TIDAL scans mapped NAS folders for <span className="text-white font-mono">.dsf</span>,{" "}
                <span className="text-white font-mono">.dff</span>, and SACD ISO rip formats to deliver bit-perfect Direct Stream Digital playback to your DAC.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={() => router.push("/library")}
                className="px-4 py-2 rounded-full bg-badgeMax text-black font-bold text-xs flex items-center space-x-1.5 hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer"
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>Map NAS Music Library</span>
              </button>

              <button
                onClick={() => router.push("/settings")}
                className="px-4 py-2 rounded-full bg-card hover:bg-cardHover border border-border text-xs font-semibold text-textSecondary hover:text-white flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span>DAC Audio Device Settings</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
