"use client";

import React, { useState } from "react";
import { TrendingAlbum } from "@/types";
import { Disc, Play, Sparkles, Filter } from "lucide-react";

interface AlbumsGridViewProps {
  albums: TrendingAlbum[];
  onSelectAlbum: (album: TrendingAlbum) => void;
}

export function AlbumsGridView({ albums, onSelectAlbum }: AlbumsGridViewProps) {
  const [regionFilter, setRegionFilter] = useState<"all" | "vn" | "global">("all");

  const filtered = albums.filter((a) => {
    if (regionFilter === "all") return true;
    return a.region === regionFilter;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/70 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              Top Trending Studio Master Albums
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-badgeMax/15 text-badgeMax border border-badgeMax/30">
              FULL LP MASTERS
            </span>
          </div>
          <p className="text-xs text-textSecondary mt-1">
            Uncompressed full-length master releases • Click any album to inspect the complete tracklist, DR scores, and stream bit-perfect
          </p>
        </div>

        {/* Region Filter Buttons */}
        <div className="flex items-center space-x-1.5 text-xs">
          {[
            { id: "all", label: "All Albums" },
            { id: "vn", label: "Vietnam" },
            { id: "global", label: "Global" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setRegionFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-full font-semibold transition-all cursor-pointer ${
                regionFilter === tab.id
                  ? "bg-white text-black font-bold shadow-sm"
                  : "bg-card/70 hover:bg-card text-textSecondary hover:text-white border border-border"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Responsive Multi-Row Album Grid (Fills Desktop Screen) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {filtered.map((album, idx) => (
          <div
            key={`grid-alb-${album.id}-${idx}`}
            onClick={() => onSelectAlbum(album)}
            className="group bg-card/60 hover:bg-card border border-border hover:border-borderHover rounded-xl p-3 transition-all duration-200 cursor-pointer shadow-md hover:shadow-xl flex flex-col justify-between select-none"
          >
            <div>
              {/* Artwork Container */}
              <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-black/60 border border-border/50 mb-2.5">
                {album.cover_url ? (
                  <img
                    src={album.cover_url}
                    alt={album.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Disc className="w-10 h-10 text-textSecondary" />
                  </div>
                )}

                {/* MAX Hi-Res Badge */}
                <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-black/85 text-badgeMax border border-badgeMax/40 backdrop-blur-sm shadow-md">
                  MAX
                </span>

                {/* Rank Badge */}
                <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-black/85 text-white/80 border border-border backdrop-blur-sm">
                  #{idx + 1}
                </span>

                {/* Hover Play Button */}
                <div className="absolute right-2.5 bottom-2.5 w-9 h-9 rounded-full bg-primary text-black flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 group-hover:scale-105 active:scale-95 transition-all duration-200">
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                </div>
              </div>

              {/* Title & Artist */}
              <h3 className="text-xs sm:text-sm font-semibold text-white truncate group-hover:text-primary transition-colors">
                {album.title}
              </h3>
              <p className="text-[11px] text-textSecondary truncate mt-0.5">{album.artist}</p>
            </div>

            {/* Footer Metadata */}
            <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between text-[10px] font-mono text-textSecondary">
              <span>{album.release_date ? album.release_date.substring(0, 4) : "2024 Master"}</span>
              <span className="text-primary">{album.track_count ? `${album.track_count} tracks` : "Master LP"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
