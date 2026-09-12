"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Home,
  Search,
  Compass,
  Heart,
  Disc,
  Users,
  FolderArchive,
  Sparkles,
  Zap,
  Sliders,
  ShieldCheck,
  Activity,
  ListMusic,
  HardDrive,
  Settings,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { usePlayer } from "@/context/PlayerContext";

interface NavItemProps {
  href?: string;
  onClick?: () => void;
  icon: React.ElementType;
  label: string;
  badge?: string | number;
  badgeColor?: "primary" | "amber" | "emerald";
  active?: boolean;
}

function NavItem({ href, onClick, icon: Icon, label, badge, badgeColor = "primary", active }: NavItemProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  let isActive = active;
  if (isActive === undefined && href) {
    if (href.includes("?")) {
      const [path, query] = href.split("?");
      const currentTab = searchParams.get("tab");
      const targetTab = new URLSearchParams(query).get("tab");
      isActive = pathname === path && currentTab === targetTab;
    } else {
      const hasTabParam = Boolean(searchParams.get("tab"));
      isActive = (pathname === href || (href !== "/" && pathname?.startsWith(href))) && !hasTabParam;
    }
  }

  const content = (
    <div
      className={`group relative flex items-center justify-between px-3 py-2 rounded-[4px] text-xs font-semibold tracking-wide transition-all select-none cursor-pointer ${
        isActive
          ? "bg-gradient-to-r from-primary/15 via-card to-card text-white font-bold shadow-sm"
          : "text-textSecondary hover:text-white hover:bg-card/60"
      }`}
    >
      {/* TIDAL Left Cyan Indicator Pill */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-primary rounded-r-full shadow-[0_0_8px_rgba(0,255,255,0.7)]" />
      )}

      <div className="flex items-center space-x-3 min-w-0">
        <Icon
          className={`w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-105 ${
            isActive ? "text-primary drop-shadow-[0_0_6px_rgba(0,255,255,0.5)]" : "text-textSecondary group-hover:text-white"
          }`}
        />
        <span className="truncate">{label}</span>
      </div>

      {badge !== undefined && (
        <span
          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border transition-colors flex-shrink-0 ${
            badgeColor === "amber"
              ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
              : badgeColor === "emerald"
              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
              : "bg-primary/10 text-primary border-primary/20"
          }`}
        >
          {badge}
        </span>
      )}
    </div>
  );

  const handleLinkClick = (e: React.MouseEvent) => {
    if (href && (pathname === "/library" || pathname === "/library/")) {
      const [path, query] = href.split("?");
      if (path === "/library" || path === "/library/") {
        e.preventDefault();
        const targetTab = new URLSearchParams(query || "").get("tab") || "albums";
        window.dispatchEvent(new CustomEvent("kv-library-tab", { detail: targetTab }));
        const url = new URL(window.location.href);
        if (targetTab) {
          url.searchParams.set("tab", targetTab);
        } else {
          url.searchParams.delete("tab");
        }
        window.history.replaceState(null, "", url.toString());
      }
    }
  };

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full text-left">
        {content}
      </button>
    );
  }

  return (
    <Link href={href || "#"} onClick={handleLinkClick} className="block">
      {content}
    </Link>
  );
}

function SidebarNavList() {
  const {
    setIsSignalPathOpen,
    setIsEqOpen,
    setIsVuMeterOpen,
    setIsQueueOpen,
    bitPerfectMode,
    queue,
  } = usePlayer();

  return (
    <div className="space-y-6">
      {/* Main Discover */}
      <div className="space-y-0.5">
        <NavItem href="/" icon={Home} label="Home" />
        <NavItem href="/search/" icon={Search} label="Search" />
        <NavItem href="/library/" icon={Compass} label="Explore NAS" badge="Hi-Res" />
      </div>

      {/* My Collection */}
      <div className="space-y-1">
        <h3 className="px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-textSecondary/60">
          My Collection
        </h3>
        <div className="space-y-0.5">
          <NavItem href="/library/?tab=tracks" icon={Heart} label="Tracks" />
          <NavItem href="/library/?tab=albums" icon={Disc} label="Albums" />
          <NavItem href="/library/?tab=artists" icon={Users} label="Artists" />
          <NavItem href="/files/" icon={FolderArchive} label="NAS File System" />
        </div>
      </div>

      {/* Audiophile Vaults */}
      <div className="space-y-1">
        <h3 className="px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-textSecondary/60">
          Audiophile Vaults
        </h3>
        <div className="space-y-0.5">
          <NavItem
            href="/library/?tab=hires"
            icon={Sparkles}
            label="Hi-Res Masters"
            badge="24-bit"
            badgeColor="amber"
          />
          <NavItem
            href="/library/?tab=dsd"
            icon={Zap}
            label="DSD Direct Stream"
            badge="DSD"
            badgeColor="emerald"
          />
        </div>
      </div>

      {/* Studio Tools */}
      <div className="space-y-1">
        <h3 className="px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-textSecondary/60">
          Studio Tools
        </h3>
        <div className="space-y-0.5">
          <NavItem
            onClick={() => setIsSignalPathOpen(true)}
            icon={ShieldCheck}
            label="Signal Path"
            badge="Direct"
            badgeColor="amber"
          />
          <NavItem
            onClick={() => setIsEqOpen(true)}
            icon={Sliders}
            label="Parametric EQ"
            badge={bitPerfectMode ? "Bypass" : "DSP Active"}
            badgeColor={bitPerfectMode ? "primary" : "emerald"}
          />
          <NavItem
            onClick={() => setIsVuMeterOpen(true)}
            icon={Activity}
            label="VU Meters"
          />
          <NavItem
            onClick={() => setIsQueueOpen(true)}
            icon={ListMusic}
            label="Play Queue"
            badge={queue.length > 0 ? queue.length : undefined}
          />
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { setIsSignalPathOpen, bitPerfectMode, deviceTelemetry } = usePlayer();

  return (
    <aside className="hidden md:flex flex-col w-64 h-[calc(100vh-76px)] bg-black border-r border-border select-none flex-shrink-0 z-30">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-border/50">
        <Link href="/" className="flex items-center space-x-2.5 group">
          <Logo className="w-6 h-4 text-white group-hover:text-primary transition-colors" />
          <span className="font-extrabold tracking-[0.18em] text-sm text-white group-hover:text-primary transition-colors">
            KV-TIDAL
          </span>
        </Link>
        <button
          onClick={() => setIsSignalPathOpen(true)}
          title="Inspect Bit-Perfect Signal Path"
          className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/15 text-badgeMax border border-badgeMax/30 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-[0_0_10px_rgba(229,160,13,0.15)]"
        >
          MAX
        </button>
      </div>

      {/* Navigation Scroll Area */}
      <div className="flex-1 overflow-y-auto px-3 py-4 no-scrollbar">
        <Suspense fallback={null}>
          <SidebarNavList />
        </Suspense>
      </div>

      {/* Docked Bottom: Hardware Telemetry & Settings */}
      <div className="p-3 border-t border-border/60 bg-surface/30 space-y-2">
        <Link
          href="/settings/"
          className="block p-2.5 rounded-lg bg-card/60 hover:bg-card/90 border border-border/70 transition-all cursor-pointer group hover:border-primary/40"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-textSecondary group-hover:text-white flex items-center space-x-1.5 transition-colors">
              <HardDrive className="w-3.5 h-3.5 text-primary" />
              <span>Synology NAS</span>
            </span>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_6px_#10b981]" />
            </span>
          </div>
          <p className="text-[11px] text-textSecondary group-hover:text-textPrimary mt-1.5 leading-tight transition-colors">
            {bitPerfectMode
              ? "Bit-Perfect FLAC Engine online & direct locked."
              : "Studio DSP active (64-bit float precision)."}
          </p>
          {deviceTelemetry?.active_device_name && (
            <div className="mt-1.5 pt-1 border-t border-border/40 flex items-center justify-between text-[9px] font-mono text-textSecondary/80">
              <span className="truncate max-w-[130px]">{deviceTelemetry.active_device_name}</span>
              <span className="text-emerald-400 font-bold">ALSA DIRECT</span>
            </div>
          )}
        </Link>

        <Suspense fallback={null}>
          <NavItem href="/settings/" icon={Settings} label="Settings" />
        </Suspense>
      </div>
    </aside>
  );
}
