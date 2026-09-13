"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { AudioOutputDevice } from "@/types";
import {
  Laptop,
  Headphones,
  Speaker,
  Tv,
  CheckCircle2,
  RefreshCw,
  Sliders,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Pencil,
  Check,
  X,
  ShieldCheck,
  Disc,
} from "lucide-react";
import Link from "next/link";

interface DevicePickerPopoverProps {
  className?: string;
}

export function DevicePickerPopover({ className = "" }: DevicePickerPopoverProps) {
  const {
    outputDevices,
    activeDeviceId,
    selectOutputDevice,
    fetchOutputDevices,
    deviceTelemetry,
    setIsSignalPathOpen,
  } = usePlayer();

  const [isOpen, setIsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showHdmiGroup, setShowHdmiGroup] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState("");
  const [deviceAliases, setDeviceAliases] = useState<Record<string, string>>({});

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Load custom aliases from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("kv_audio_device_aliases");
      if (saved) {
        setDeviceAliases(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
  }, []);

  const saveAlias = (deviceId: string, alias: string) => {
    const next = { ...deviceAliases, [deviceId]: alias.trim() };
    if (!alias.trim()) {
      delete next[deviceId];
    }
    setDeviceAliases(next);
    try {
      localStorage.setItem("kv_audio_device_aliases", JSON.stringify(next));
    } catch {
      // ignore
    }
    setEditingDeviceId(null);
  };

  // Close on outside click and Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setEditingDeviceId(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setEditingDeviceId(null);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRefreshing(true);
    try {
      await fetchOutputDevices();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const activeDevice = outputDevices.find((d) => d.id === activeDeviceId);

  // Group devices
  const browserDevices = outputDevices.filter((d) => d.id === "browser" || d.category === "browser");
  const bitPerfectDevices = outputDevices.filter(
    (d) => d.id !== "browser" && d.category !== "browser" && d.category !== "hdmi"
  );
  const hdmiDevices = outputDevices.filter((d) => d.category === "hdmi");

  // Icon selector based on category
  const getDeviceIcon = (device: AudioOutputDevice) => {
    if (device.id === "browser" || device.category === "browser") {
      return <Laptop className="w-4 h-4 text-cyan-400" />;
    }
    if (device.category === "usb_dac") {
      return <Headphones className="w-4 h-4 text-emerald-400" />;
    }
    if (device.category === "digital") {
      return <Disc className="w-4 h-4 text-purple-400" />;
    }
    if (device.category === "hdmi") {
      return <Tv className="w-4 h-4 text-amber-400" />;
    }
    return <Speaker className="w-4 h-4 text-emerald-400" />;
  };

  // Button trigger icon
  const getTriggerIcon = () => {
    if (!activeDevice || activeDevice.id === "browser") {
      return <Laptop className="w-4 h-4" />;
    }
    if (activeDevice.category === "usb_dac") {
      return <Headphones className="w-4 h-4" />;
    }
    if (activeDevice.category === "hdmi") {
      return <Tv className="w-4 h-4" />;
    }
    return <Speaker className="w-4 h-4" />;
  };

  const isBitPerfectActive = deviceTelemetry?.is_exclusive_bit_perfect ?? activeDevice?.is_bit_perfect ?? false;

  const renderDeviceRow = (dev: AudioOutputDevice) => {
    const isSelected = activeDeviceId === dev.id;
    const isEditing = editingDeviceId === dev.id;
    const customName = deviceAliases[dev.id];
    const displayName = customName || dev.name;

    return (
      <div
        key={dev.id}
        onClick={() => {
          if (!isEditing) {
            selectOutputDevice(dev.id);
          }
        }}
        className={`group relative p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between space-x-3 ${
          isSelected
            ? "bg-card border-primary/70 shadow-lg shadow-primary/10 ring-1 ring-primary/40"
            : "bg-[#181818] hover:bg-[#222222] border-white/10 text-textSecondary hover:text-white"
        }`}
      >
        <div className="flex items-start space-x-2.5 min-w-0 flex-1">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
              isSelected ? "bg-primary/15 border border-primary/30" : "bg-card border border-border"
            }`}
          >
            {getDeviceIcon(dev)}
          </div>

          <div className="min-w-0 flex-1">
            {isEditing ? (
              <div
                className="flex items-center space-x-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveAlias(dev.id, editNickname);
                    if (e.key === "Escape") setEditingDeviceId(null);
                  }}
                  autoFocus
                  placeholder="Enter friendly nickname..."
                  className="bg-black/60 border border-primary text-xs font-semibold text-white rounded px-2 py-0.5 w-full focus:outline-none"
                />
                <button
                  onClick={() => saveAlias(dev.id, editNickname)}
                  className="p-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                  title="Save Nickname"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEditingDeviceId(null)}
                  className="p-1 rounded bg-card text-textSecondary hover:text-white"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5">
                <span
                  className={`text-xs font-semibold truncate ${
                    isSelected ? "text-white" : "text-textPrimary group-hover:text-white"
                  }`}
                  title={displayName}
                >
                  {displayName}
                </span>

                {customName && (
                  <span className="text-[10px] text-textSecondary/60 font-mono truncate hidden sm:inline">
                    ({dev.name})
                  </span>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingDeviceId(dev.id);
                    setEditNickname(customName || dev.name);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-primary transition-opacity text-textSecondary"
                  title="Rename device"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )}

            <div className="flex items-center space-x-2 mt-0.5 text-[10px] font-mono text-textSecondary">
              <span className="truncate">{dev.hardware_id}</span>
              <span>•</span>
              <span className="text-textSecondary/80">
                {(dev.max_sample_rate / 1000).toFixed(0)} kHz
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0">
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider ${
              dev.is_bit_perfect
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : "bg-surface text-textSecondary border border-border"
            }`}
          >
            {dev.is_bit_perfect ? "Bit-Perfect" : "Resampled"}
          </span>

          {isSelected ? (
            <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 animate-in zoom-in-50 duration-150" />
          ) : (
            <div className="w-4 h-4 rounded-full border border-white/20 group-hover:border-primary/50 transition-colors" />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Trigger Button in Player Bar */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        title={`Audio Output: ${activeDevice ? (deviceAliases[activeDevice.id] || activeDevice.name) : "Web Browser"}`}
        className={`p-1.5 rounded transition-all cursor-pointer relative group flex items-center space-x-1.5 ${
          isOpen
            ? "text-primary bg-primary/15 ring-1 ring-primary/40 shadow-[0_0_10px_rgba(0,255,255,0.2)]"
            : isBitPerfectActive
            ? "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 hover:text-emerald-300"
            : "text-textSecondary hover:text-white hover:bg-card"
        }`}
      >
        {getTriggerIcon()}

        {/* Live Active Dot */}
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isBitPerfectActive
              ? "bg-emerald-400 shadow-[0_0_6px_#34d399]"
              : "bg-primary shadow-[0_0_6px_#06b6d4]"
          }`}
        />
      </button>

      {/* Floating Modern Glassmorphism Popover (Responsive Card on Mobile) */}
      {isOpen && (
        <>
          {/* Mobile Dimmed Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 sm:hidden animate-in fade-in duration-150"
            onClick={() => {
              setIsOpen(false);
              setEditingDeviceId(null);
            }}
          />

          <div
            ref={popoverRef}
            className="fixed inset-x-3 bottom-6 z-50 sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-full sm:mb-3 w-auto sm:w-[380px] max-w-[calc(100vw-24px)] bg-[#141414] backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.85)] p-4 select-none animate-in fade-in slide-in-from-bottom-2 duration-150 space-y-3.5 max-h-[85vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase tracking-wider text-textPrimary">
                  Audio Output Target
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider border ${
                    isBitPerfectActive
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                  }`}
                >
                  {isBitPerfectActive ? "BIT-PERFECT DIRECT" : "WEB AUDIO"}
                </span>
              </div>

              <div className="flex items-center space-x-1">
                <button
                  onClick={handleRefresh}
                  title="Scan for connected audio devices"
                  className="p-1 rounded-lg hover:bg-card text-textSecondary hover:text-white transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg hover:bg-card text-textSecondary hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Device Lists with Smooth Scrolling */}
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-0.5 custom-scrollbar flex-1 min-h-0">
              {/* Section 1: This Device (Web Browser) */}
              <div className="space-y-1.5">
                <div className="flex items-center space-x-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-textSecondary/80 px-1">
                  <Laptop className="w-3 h-3 text-cyan-400" />
                  <span>This Device</span>
                </div>
                <div className="space-y-1.5">
                  {browserDevices.map(renderDeviceRow)}
                </div>
              </div>

              {/* Section 2: Audiophile Hardware (Bit-Perfect ALSA) */}
              {bitPerfectDevices.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-textSecondary/80 px-1">
                    <span className="flex items-center space-x-1.5">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      <span>Audiophile Direct Hardware</span>
                    </span>
                    <span className="text-[9px] text-emerald-400/80">Kernel ALSA Direct</span>
                  </div>
                  <div className="space-y-1.5">
                    {bitPerfectDevices.map(renderDeviceRow)}
                  </div>
                </div>
              )}

              {/* Section 3: Display & HDMI Audio (Collapsible) */}
              {hdmiDevices.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <button
                    onClick={() => setShowHdmiGroup(!showHdmiGroup)}
                    className="w-full flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-textSecondary/80 px-1 py-1 hover:text-white transition-colors cursor-pointer"
                  >
                    <span className="flex items-center space-x-1.5">
                      <Tv className="w-3 h-3 text-amber-400" />
                      <span>Display & HDMI Audio ({hdmiDevices.length} outputs)</span>
                    </span>
                    {showHdmiGroup ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>

                  {showHdmiGroup && (
                    <div className="space-y-1.5 pl-1 animate-in fade-in duration-150">
                      {hdmiDevices.map(renderDeviceRow)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Popover Footer Shortcuts */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-textSecondary shrink-0">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setIsSignalPathOpen(true);
                }}
                className="flex items-center space-x-1 hover:text-primary transition-colors cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-primary" />
                <span>Signal Path</span>
              </button>

              <Link
                href="/settings"
                onClick={() => setIsOpen(false)}
                className="flex items-center space-x-1 hover:text-accent transition-colors"
              >
                <Sliders className="w-3 h-3 text-accent" />
                <span>Audio Transport Settings</span>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
