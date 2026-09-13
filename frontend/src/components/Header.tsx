"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Settings,
  Sparkles,
  CheckCircle2,
  Sliders,
  ShieldCheck,
  Download,
  HardDrive,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { usePlayer } from "@/context/PlayerContext";
import { useDownloads } from "@/context/DownloadContext";

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const {
    currentTrack,
    bitPerfectMode,
    setBitPerfectMode,
    setIsSignalPathOpen,
    getLiveTelemetry,
  } = usePlayer();
  const { activeJobs, setIsManagerOpen } = useDownloads();

  const [telemetryBitrate, setTelemetryBitrate] = useState<number>(0);

  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target?.scrollTop > 20) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    const mainEl = document.getElementById("main-content");
    if (mainEl) {
      mainEl.addEventListener("scroll", handleScroll);
      return () => mainEl.removeEventListener("scroll", handleScroll);
    }
  }, []);

  // Poll live bitrate throttled for top header pill
  useEffect(() => {
    const interval = setInterval(() => {
      const data = getLiveTelemetry();
      setTelemetryBitrate(data.instantBitrateKbps);
    }, 1000);
    return () => clearInterval(interval);
  }, [getLiveTelemetry]);

  const bitDepth = currentTrack?.bitDepth || (currentTrack?.hires ? 24 : 16);
  const sampleRateKhz = currentTrack?.sampleRate
    ? (currentTrack.sampleRate / 1000).toFixed(1)
    : currentTrack?.hires
    ? "96.0"
    : "44.1";
  const formatName = currentTrack?.format || (currentTrack?.isDsd ? "DSD" : "FLAC");
  const isHiRes = bitDepth > 16 || parseFloat(sampleRateKhz) > 44.1;

  return (
    <header
      className={`sticky top-0 z-30 transition-all duration-200 border-b ${
        scrolled
          ? "bg-black/95 backdrop-blur-md border-border shadow-lg"
          : "bg-transparent border-transparent"
      }`}
    >
      <div className="flex items-center justify-between h-14 md:h-16 px-4 md:px-8">
        {/* Left: Desktop History Navigation / Mobile Brand */}
        <div className="flex items-center space-x-3">
          {/* Desktop History Buttons */}
          <div className="hidden md:flex items-center space-x-2">
            <button
              onClick={() => router.back()}
              className="w-8 h-8 rounded-full bg-black/60 border border-border/80 flex items-center justify-center text-textSecondary hover:text-white hover:border-white/40 transition-colors cursor-pointer"
              title="Go back"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => router.forward()}
              className="w-8 h-8 rounded-full bg-black/60 border border-border/80 flex items-center justify-center text-textSecondary hover:text-white hover:border-white/40 transition-colors cursor-pointer"
              title="Go forward"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile Top Brand (Shown only on mobile) */}
          <Link href="/" className="flex md:hidden items-center space-x-2">
            <Logo className="w-5 h-3.5 text-white" />
            <span className="font-extrabold tracking-[0.16em] text-xs text-white">KV-TIDAL</span>
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-badgeMax border border-badgeMax/30">
              MAX
            </span>
          </Link>
        </div>

        {/* Center: Desktop Global Quick Search (shown when not on /search) */}
        <div className="hidden md:flex flex-1 max-w-md mx-6">
          {pathname !== "/search" && pathname !== "/search/" && (
            <Link
              href="/search/"
              className="w-full flex items-center space-x-3 bg-card/80 hover:bg-card border border-border hover:border-borderHover rounded-full px-4 py-2 text-xs text-textSecondary hover:text-white transition-all shadow-sm group"
            >
              <Search className="w-4 h-4 text-textSecondary group-hover:text-primary transition-colors" />
              <span>Search songs, artists, albums, or NAS files...</span>
            </Link>
          )}
        </div>

        {/* Right: Interactive Audiophile DAC Stream Monitor & Settings */}
        <div className="flex items-center space-x-2 md:space-x-3">
          {/* Quick Bit-Perfect / DSP Bypass Switch */}
          <button
            onClick={() => setBitPerfectMode(!bitPerfectMode)}
            title={
              bitPerfectMode
                ? "Bit-Perfect Direct: Active (Byte-for-byte passthrough to DAC). Click to engage DSP."
                : "DSP Parametric EQ: Active. Click to bypass and engage Bit-Perfect Direct."
            }
            className={`hidden lg:flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border transition-all cursor-pointer hover:scale-105 ${
              bitPerfectMode
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-purple-500/15 text-purple-400 border-purple-500/30"
            }`}
          >
            {bitPerfectMode ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            ) : (
              <Sliders className="w-3 h-3 text-purple-400" />
            )}
            <span>{bitPerfectMode ? "DIRECT BIT-PERFECT" : "DSP ACTIVE"}</span>
          </button>

          {/* Interactive DAC Stream Monitor Button */}
          <button
            onClick={() => setIsSignalPathOpen(true)}
            title="Inspect Bit-Perfect Hardware Signal Chain"
            className="hidden sm:flex items-center space-x-2 px-3 py-1 rounded-full bg-card/90 hover:bg-card border border-border hover:border-primary/50 text-white text-[11px] font-mono shadow-sm transition-all cursor-pointer group"
          >
            {/* Clock Lock Indicator Dot */}
            <span
              className={`w-2 h-2 rounded-full ${
                bitPerfectMode
                  ? "bg-emerald-400 shadow-[0_0_6px_#10b981]"
                  : "bg-purple-400 shadow-[0_0_6px_#a855f7]"
              }`}
            />
            <span className="font-semibold text-primary group-hover:underline">
              {bitDepth}-bit / {sampleRateKhz}kHz {formatName}
            </span>
            {telemetryBitrate > 0 && (
              <span className="text-textSecondary text-[10px] hidden xl:inline">
                • {telemetryBitrate} kbps
              </span>
            )}
            <Sparkles className="w-3 h-3 text-primary animate-pulse ml-0.5" />
          </button>

          {/* Mobile Compact DAC Indicator */}
          {currentTrack && (
            <button
              onClick={() => setIsSignalPathOpen(true)}
              title="Inspect Bit-Perfect Hardware Signal Chain"
              className="flex sm:hidden items-center space-x-1 px-2 py-0.5 rounded-full bg-card/90 border border-border text-[10px] font-mono text-primary cursor-pointer"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  bitPerfectMode
                    ? "bg-emerald-400 shadow-[0_0_4px_#10b981]"
                    : "bg-purple-400 shadow-[0_0_4px_#a855f7]"
                }`}
              />
              <span>{sampleRateKhz}k</span>
            </button>
          )}

          {/* Synology NAS & Soulseek P2P Download Manager Trigger */}
          {activeJobs.length > 0 ? (
            (() => {
              const primaryJob = activeJobs[0];
              const pct = Math.min(100, Math.max(0, primaryJob.progress_percent));
              const speedText = primaryJob.speed_kbps
                ? primaryJob.speed_kbps >= 1024
                  ? `${(primaryJob.speed_kbps / 1024).toFixed(1)} MB/s`
                  : `${primaryJob.speed_kbps} KB/s`
                : "";
              const strokeCircumference = 2 * Math.PI * 9;
              const strokeDashoffset = strokeCircumference - (strokeCircumference * pct) / 100;
              const sourceLabel = primaryJob.source === "soulseek" ? "Soulseek P2P FLAC" : "Lossless FLAC";

              return (
                <button
                  onClick={() => setIsManagerOpen(true)}
                  title={`[${sourceLabel}] ${primaryJob.title} - ${primaryJob.artist} (${pct}%${speedText ? ` • ${speedText}` : ""}) — Click to view download queue`}
                  className="flex items-center space-x-2 px-2.5 py-1 rounded-full bg-primary/10 hover:bg-primary/20 border border-primary/40 hover:border-primary text-white text-[11px] font-mono shadow-[0_0_12px_rgba(0,255,255,0.25)] transition-all cursor-pointer group"
                >
                  {/* Radial progress ring around download icon */}
                  <div className="relative w-5 h-5 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 -rotate-90" viewBox="0 0 24 24">
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        className="text-zinc-700/60"
                        strokeWidth="2.5"
                        stroke="currentColor"
                        fill="transparent"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        className="text-primary transition-all duration-300"
                        strokeWidth="2.5"
                        strokeDasharray={strokeCircumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                      />
                    </svg>
                    <Download className="w-2.5 h-2.5 text-primary absolute animate-pulse" />
                  </div>

                  {/* Percentage */}
                  <span className="font-bold text-primary">
                    {pct}%
                  </span>

                  {/* Live Speed */}
                  {speedText && (
                    <span className="text-textSecondary text-[10px] hidden sm:inline">
                      • {speedText}
                    </span>
                  )}

                  {/* Additional queue count badge */}
                  {activeJobs.length > 1 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-primary text-black ml-0.5">
                      +{activeJobs.length - 1}
                    </span>
                  )}
                </button>
              );
            })()
          ) : (
            <button
              onClick={() => setIsManagerOpen(true)}
              title="Open Synology NAS Download Pipeline"
              className="relative p-2 rounded-full hover:bg-card text-textSecondary hover:text-white transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          {/* Direct NAS File Browser Shortcut */}
          <Link
            href="/files/"
            className="p-2 rounded-full hover:bg-card text-textSecondary hover:text-white transition-colors cursor-pointer"
            title="Synology NAS File Explorer"
          >
            <HardDrive className="w-4 h-4" />
          </Link>

          {/* Desktop Settings Link (Hidden on mobile since bottom navigation bar has Settings tab) */}
          <Link
            href="/settings/"
            className="hidden md:inline-flex p-2 rounded-full hover:bg-card text-textSecondary hover:text-white transition-colors cursor-pointer"
            title="Synology NAS, ALSA DAC & Subsonic Settings"
          >
            <Settings className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
