"use client";

import React from "react";
import { Play, Disc, User, Music } from "lucide-react";

export interface MediaShelfItem {
  id: string;
  title: string;
  subtitle: string;
  coverUrl?: string;
  type?: "track" | "album" | "playlist" | "artist";
  hires?: boolean;
  onClick?: () => void;
  onPlay?: (e: React.MouseEvent) => void;
}

interface MediaShelfProps {
  title: string;
  subtitle?: string;
  items: MediaShelfItem[];
  onViewAll?: () => void;
}

export function MediaShelf({ title, subtitle, items, onViewAll }: MediaShelfProps) {
  if (!items || items.length === 0) return null;

  return (
    <section className="space-y-3.5 my-6">
      {/* Header */}
      <div className="flex items-end justify-between px-0.5">
        <div>
          <h2 className="text-lg md:text-xl font-bold tracking-tight text-white">{title}</h2>
          {subtitle && <p className="text-xs text-textSecondary mt-0.5">{subtitle}</p>}
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs font-bold uppercase tracking-wider text-textSecondary hover:text-white transition-colors cursor-pointer"
          >
            View All
          </button>
        )}
      </div>

      {/* Horizontal Snap Shelf */}
      <div className="flex space-x-4 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
        {items.map((item) => {
          const isArtist = item.type === "artist";

          return (
            <div
              key={item.id}
              onClick={item.onClick}
              className="group flex-shrink-0 w-36 sm:w-44 snap-start cursor-pointer select-none"
            >
              {/* Artwork Container */}
              <div
                className={`relative aspect-square w-full overflow-hidden bg-card border border-border/70 mb-2.5 transition-all shadow-md ${
                  isArtist ? "rounded-full" : "rounded-tidal"
                }`}
              >
                {item.coverUrl ? (
                  <img
                    src={item.coverUrl}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {isArtist ? (
                      <User className="w-10 h-10 text-textSecondary" />
                    ) : (
                      <Disc className="w-10 h-10 text-textSecondary" />
                    )}
                  </div>
                )}

                {/* TIDAL Round Cyan Hover Play Button (Bottom Right) */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.onPlay) {
                      item.onPlay(e);
                    } else if (item.onClick) {
                      item.onClick();
                    }
                  }}
                  title={`Play ${item.title}`}
                  className={`absolute right-2.5 bottom-2.5 w-10 h-10 rounded-full bg-primary text-black flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 group-hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer ${
                    isArtist ? "hidden" : "flex"
                  }`}
                >
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                </div>

                {/* Hi-Res Badge overlay */}
                {item.hires && !isArtist && (
                  <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-black/80 text-badgeMax border border-badgeMax/40 backdrop-blur-sm">
                    MAX
                  </span>
                )}
              </div>

              {/* Title & Subtitle */}
              <div className={isArtist ? "text-center px-1" : "text-left"}>
                <h3 className="text-xs sm:text-sm font-semibold text-white truncate group-hover:underline">
                  {item.title}
                </h3>
                <p className="text-[11px] text-textSecondary truncate mt-0.5">
                  {item.subtitle}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
