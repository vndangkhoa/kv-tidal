"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { FsEntry, DiskUsage, PlayableTrack } from "@/types";
import { usePlayer } from "@/context/PlayerContext";
import {
  Folder,
  FileAudio,
  File,
  ArrowLeft,
  Download,
  MoveRight,
  Sparkles,
  Play,
  Info,
  X,
  Speaker,
  ShieldCheck,
  HardDrive,
  FolderPlus,
  UploadCloud,
  RotateCw,
  Search,
  Trash2,
  Pencil,
  ListPlus,
  CheckSquare,
  Square,
  FolderSync,
  Loader2,
  Check,
} from "lucide-react";

export default function FilesPage() {
  const { playTrack, addAllToQueue, activeDeviceId } = usePlayer();
  const [currentPath, setCurrentPath] = useState<string>("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [diskSpace, setDiskSpace] = useState<DiskUsage | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Selection & Filtering
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<"name" | "size" | "format" | "date">("name");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Modals & Actions
  const [selectedFile, setSelectedFile] = useState<FsEntry | null>(null);
  const [inspectEntry, setInspectEntry] = useState<FsEntry | null>(null);
  const [targetDest, setTargetDest] = useState<string>("");
  const [newFolderOpen, setNewFolderOpen] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>("");
  const [renameEntry, setRenameEntry] = useState<FsEntry | null>(null);
  const [renameNewName, setRenameNewName] = useState<string>("");
  const [deleteConfirmPaths, setDeleteConfirmPaths] = useState<string[] | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const loadDirectory = async (path?: string) => {
    setLoading(true);
    setSelectedPaths(new Set());
    try {
      const url = path ? `/api/fs/browse?path=${encodeURIComponent(path)}` : `/api/fs/browse`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        setCurrentPath(data.current_path || "");
        setParentPath(data.parent_path || null);
        setEntries(data.entries || []);
        if (data.disk_space) {
          setDiskSpace(data.disk_space);
        }
      }
    } catch (e) {
      console.error("Browse failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirectory();
  }, []);

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatDate = (epochSec?: number) => {
    if (!epochSec) return "-";
    const date = new Date(epochSec * 1000);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "-";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Filter and sort entries
  const filteredEntries = useMemo(() => {
    let result = entries;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.format && e.format.toLowerCase().includes(q)) ||
          (e.artist && e.artist.toLowerCase().includes(q)) ||
          (e.album && e.album.toLowerCase().includes(q))
      );
    }

    return [...result].sort((a, b) => {
      // Keep folders on top
      if (a.is_dir !== b.is_dir) {
        return a.is_dir ? -1 : 1;
      }

      let cmp = 0;
      if (sortField === "name") {
        if (a.track_number && b.track_number && a.track_number !== b.track_number) {
          cmp = a.track_number - b.track_number;
        } else {
          cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        }
      } else if (sortField === "size") {
        cmp = a.size_bytes - b.size_bytes;
      } else if (sortField === "format") {
        cmp = (a.format || "").localeCompare(b.format || "");
      } else if (sortField === "date") {
        cmp = (a.modified_at || 0) - (b.modified_at || 0);
      }

      return sortAsc ? cmp : -cmp;
    });
  }, [entries, searchQuery, sortField, sortAsc]);

  // Audio queue helper
  const getAudioTracks = (targetEntries: FsEntry[]): PlayableTrack[] => {
    return targetEntries
      .filter((e) => !e.is_dir && e.format)
      .sort((a, b) => {
        if (a.track_number && b.track_number && a.track_number !== b.track_number) {
          return a.track_number - b.track_number;
        }
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      })
      .map((entry) => ({
        id: entry.path,
        title: entry.title || entry.name.replace(/\.[^/.]+$/, ""),
        artist: entry.artist || "Synology NAS Vault",
        album: entry.album || currentPath.split("/").pop() || "Lossless Storage",
        streamUrl: `/api/fs/download?path=${encodeURIComponent(entry.path)}`,
        format: entry.format || "FLAC",
        bitDepth: entry.bit_depth || 24,
        sampleRate: entry.sample_rate || 96000,
        hires: entry.hires ?? true,
        source: "local" as const,
        drScore: entry.dr_score || 13,
        isDsd: entry.format?.toLowerCase() === "dsf" || entry.format?.toLowerCase() === "dff",
        duration: entry.duration,
      }));
  };

  const handlePlayFolder = () => {
    const tracks = getAudioTracks(filteredEntries);
    if (tracks.length === 0) {
      showNotification("No playable audio tracks in this folder");
      return;
    }
    playTrack(tracks[0], tracks);
    showNotification(`Playing ${tracks.length} tracks from folder`);
  };

  const handleQueueFolder = () => {
    const tracks = getAudioTracks(filteredEntries);
    if (tracks.length === 0) {
      showNotification("No playable audio tracks in this folder");
      return;
    }
    addAllToQueue(tracks);
    showNotification(`Added ${tracks.length} tracks to queue`);
  };

  const handlePlayDirect = (entry: FsEntry, hardwareCast: boolean = false) => {
    if (!entry.format) return;
    const track: PlayableTrack = {
      id: entry.path,
      title: entry.title || entry.name.replace(/\.[^/.]+$/, ""),
      artist: entry.artist || "Synology NAS Vault",
      album: entry.album || currentPath.split("/").pop() || "Lossless Storage",
      streamUrl: `/api/fs/download?path=${encodeURIComponent(entry.path)}`,
      format: entry.format,
      bitDepth: entry.bit_depth || 24,
      sampleRate: entry.sample_rate || 96000,
      hires: entry.hires ?? true,
      source: "local" as const,
      drScore: entry.dr_score || 13,
      isDsd: entry.format.toLowerCase() === "dsf" || entry.format.toLowerCase() === "dff",
      duration: entry.duration,
    };

    playTrack(track);

    if (hardwareCast && activeDeviceId !== "browser") {
      fetch("/api/devices/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: entry.path }),
      }).catch(() => {});
    }
  };

  // Upload handler
  const handleUploadFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadProgress(`Uploading ${files.length} file(s)...`);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }
    try {
      const url = currentPath
        ? `/api/fs/upload?path=${encodeURIComponent(currentPath)}`
        : `/api/fs/upload`;
      const resp = await fetch(url, {
        method: "POST",
        body: formData,
      });
      if (resp.ok) {
        const data = await resp.json();
        showNotification(`Uploaded ${data.uploaded_count} file(s) successfully!`);
        loadDirectory(currentPath);
      } else {
        const err = await resp.json().catch(() => ({}));
        showNotification(`Upload failed: ${err.error || "Unknown error"}`);
      }
    } catch (e: any) {
      showNotification(`Upload request failed: ${e?.message || "Connection error"}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  // Create Directory
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const resp = await fetch("/api/fs/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: currentPath || "./music",
          name: newFolderName.trim(),
        }),
      });
      if (resp.ok) {
        setNewFolderOpen(false);
        setNewFolderName("");
        showNotification("Folder created successfully!");
        loadDirectory(currentPath);
      } else {
        const err = await resp.json().catch(() => ({}));
        showNotification(`Create folder failed: ${err.error || "Unknown error"}`);
      }
    } catch (e: any) {
      showNotification(`Failed to create folder: ${e?.message || "Connection error"}`);
    }
  };

  // Rename Item
  const handleRename = async () => {
    if (!renameEntry || !renameNewName.trim()) return;
    try {
      const resp = await fetch("/api/fs/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          old_path: renameEntry.path,
          new_name: renameNewName.trim(),
        }),
      });
      if (resp.ok) {
        setRenameEntry(null);
        setRenameNewName("");
        showNotification("Item renamed successfully!");
        loadDirectory(currentPath);
      } else {
        const err = await resp.json().catch(() => ({}));
        showNotification(`Rename failed: ${err.error || "Unknown error"}`);
      }
    } catch (e: any) {
      showNotification(`Rename request failed: ${e?.message || "Connection error"}`);
    }
  };

  // Delete Items
  const handleDelete = async () => {
    if (!deleteConfirmPaths || deleteConfirmPaths.length === 0) return;
    try {
      const resp = await fetch("/api/fs/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: deleteConfirmPaths }),
      });
      if (resp.ok) {
        const count = deleteConfirmPaths.length;
        setSelectedPaths(new Set());
        setDeleteConfirmPaths(null);
        showNotification(`Deleted ${count} item(s)`);
        loadDirectory(currentPath);
      } else {
        const err = await resp.json().catch(() => ({}));
        showNotification(`Delete failed: ${err.error || "Unknown error"}`);
      }
    } catch (e: any) {
      showNotification(`Delete request failed: ${e?.message || "Connection error"}`);
    }
  };

  // Scan folder into library
  const handleScanFolder = async () => {
    setIsScanning(true);
    try {
      const target = currentPath || "./music";
      const resp = await fetch("/api/fs/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: target }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.tracks_indexed > 0) {
          showNotification(
            `Successfully indexed ${data.tracks_indexed} track(s) across ${data.albums_indexed} album(s)!`
          );
        } else {
          showNotification("Scan complete: No audio tracks found in this folder");
        }
      } else {
        const err = await resp.json().catch(() => ({}));
        showNotification(`Scan error: ${err.error || resp.statusText || "Failed"}`);
      }
    } catch (e: any) {
      showNotification(`Scan request failed: ${e?.message || "Connection error"}`);
    } finally {
      setIsScanning(false);
    }
  };

  // Transfer file
  const handleTransfer = async () => {
    if (!selectedFile || !targetDest.trim()) return;
    try {
      const resp = await fetch("/api/fs/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_path: selectedFile.path,
          destination_path: targetDest,
        }),
      });
      if (resp.ok) {
        setSelectedFile(null);
        setTargetDest("");
        loadDirectory(currentPath);
        showNotification("File transferred successfully with POSIX permissions!");
      } else {
        const err = await resp.json().catch(() => ({}));
        showNotification(`Transfer error: ${err.error || "Failed"}`);
      }
    } catch (e: any) {
      showNotification(`Transfer request failed: ${e?.message || "Connection error"}`);
    }
  };

  // Multi-selection helpers
  const toggleSelectAll = () => {
    if (selectedPaths.size === filteredEntries.length && filteredEntries.length > 0) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(filteredEntries.map((e) => e.path)));
    }
  };

  const toggleSelectOne = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setSelectedPaths(next);
  };

  // Selected tracks for batch operations
  const selectedEntries = useMemo(() => {
    return entries.filter((e) => selectedPaths.has(e.path));
  }, [entries, selectedPaths]);

  const selectedTotalBytes = useMemo(() => {
    return selectedEntries.reduce((sum, e) => sum + e.size_bytes, 0);
  }, [selectedEntries]);

  // Clickable breadcrumbs
  const breadcrumbs = useMemo(() => {
    if (!currentPath) return [];
    const isAbs = currentPath.startsWith("/");
    // Filter out empty and current dir dot '.'
    const parts = currentPath.split("/").filter((p) => p && p !== ".");
    const crumbs: { label: string; path: string }[] = [];
    let accumulated = isAbs ? "" : "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (isAbs) {
        accumulated += "/" + part;
      } else {
        accumulated = accumulated ? `${accumulated}/${part}` : part;
      }
      crumbs.push({ label: part, path: accumulated });
    }
    return crumbs;
  }, [currentPath]);

  return (
    <div
      className="space-y-6 pb-24 relative min-h-screen"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleUploadFiles(e.dataTransfer.files);
        }
      }}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDragOver && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm border-4 border-dashed border-primary flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-150">
          <UploadCloud className="w-16 h-16 text-primary animate-bounce mb-4" />
          <h2 className="text-xl font-bold text-white">Drop Audio Files or Folders Here</h2>
          <p className="text-sm text-textSecondary mt-2">
            Files will be uploaded directly to <span className="font-mono text-primary">{currentPath}</span>
          </p>
        </div>
      )}

      {/* Header & Storage Status */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-textPrimary">Synology NAS File System & DAC Router</h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              RAW POSIX ACCESS
            </span>
          </div>
          <p className="text-sm text-textSecondary mt-1">
            Directly inspect technical Vorbis/FLAC headers, organize audio directories, and route bit-perfect audio directly to hardware DACs.
          </p>
        </div>

        {/* NAS Storage Gauge */}
        {diskSpace && (
          <div className="bg-surface border border-border px-4 py-2.5 rounded-xl text-xs font-mono flex items-center space-x-3 shadow-md">
            <HardDrive className="w-5 h-5 text-primary flex-shrink-0" />
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] gap-4">
                <span className="text-textSecondary">NAS Volume:</span>
                <span className="text-white font-semibold">
                  {formatSize(diskSpace.free_bytes)} free of {formatSize(diskSpace.total_bytes)}
                </span>
              </div>
              <div className="w-44 bg-card rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-primary to-emerald-400 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, diskSpace.used_percent)}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="flex items-center justify-between bg-primary/15 border border-primary/40 text-primary px-4 py-2.5 rounded-xl text-xs font-medium animate-in fade-in">
          <div className="flex items-center space-x-2">
            <Check className="w-4 h-4 text-primary" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification(null)} className="hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-border p-3 rounded-xl shadow-lg">
        {/* Left: Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* New Folder */}
          <button
            onClick={() => setNewFolderOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-card hover:bg-cardHover text-textPrimary text-xs font-medium border border-border transition-colors cursor-pointer"
            title="Create new folder"
          >
            <FolderPlus className="w-4 h-4 text-primary" />
            <span>New Folder</span>
          </button>

          {/* Upload Files */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-card hover:bg-cardHover text-textPrimary text-xs font-medium border border-border transition-colors cursor-pointer disabled:opacity-50"
            title="Upload audio files to NAS"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            ) : (
              <UploadCloud className="w-4 h-4 text-emerald-400" />
            )}
            <span>{isUploading ? "Uploading..." : "Upload Files"}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) {
                handleUploadFiles(e.target.files);
                e.target.value = "";
              }
            }}
          />

          <div className="h-4 w-[1px] bg-border mx-1 hidden sm:block" />

          {/* Play Folder */}
          <button
            onClick={handlePlayFolder}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-semibold transition-colors cursor-pointer"
            title="Play all tracks in current folder"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Play Folder</span>
          </button>

          {/* Queue Folder */}
          <button
            onClick={handleQueueFolder}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-card hover:bg-cardHover text-textPrimary border border-border text-xs font-medium transition-colors cursor-pointer"
            title="Add all tracks in folder to active playback queue"
          >
            <ListPlus className="w-4 h-4 text-textSecondary" />
            <span>Queue Folder</span>
          </button>

          {/* Scan to Library */}
          <button
            onClick={handleScanFolder}
            disabled={isScanning}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-card hover:bg-cardHover text-textSecondary hover:text-emerald-400 border border-border text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            title="Scan this folder directly into KV-TIDAL music library"
          >
            {isScanning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            ) : (
              <FolderSync className="w-3.5 h-3.5" />
            )}
            <span>{isScanning ? "Scanning..." : "Scan to Library"}</span>
          </button>
        </div>

        {/* Right: Search Filter & Refresh */}
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-textSecondary absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter current folder..."
              className="w-full bg-card border border-border rounded-lg pl-8 pr-7 py-1.5 text-xs text-textPrimary placeholder:text-textSecondary/60 focus:outline-none focus:border-primary font-mono"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-textSecondary hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <button
            onClick={() => loadDirectory(currentPath)}
            className="p-2 rounded-lg bg-card hover:bg-cardHover text-textSecondary hover:text-primary transition-colors cursor-pointer"
            title="Reload directory"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive Path Breadcrumb Bar */}
      <div className="flex items-center space-x-1.5 bg-surface border border-border p-2.5 rounded-xl overflow-x-auto text-xs font-mono scrollbar-none">
        {parentPath && (
          <button
            onClick={() => loadDirectory(parentPath)}
            className="p-1 rounded bg-card hover:text-primary hover:bg-cardHover transition-colors cursor-pointer flex-shrink-0"
            title="Go to parent folder"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={() => loadDirectory()}
          className="px-2 py-0.5 rounded bg-card hover:bg-cardHover text-primary font-bold transition-colors cursor-pointer flex-shrink-0 flex items-center space-x-1"
          title="Root NAS directory"
        >
          <span>Volume Root</span>
        </button>

        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={crumb.path}>
            <span className="text-textSecondary/40">/</span>
            <button
              onClick={() => loadDirectory(crumb.path)}
              className={`px-1.5 py-0.5 rounded hover:bg-card transition-colors cursor-pointer truncate max-w-[200px] ${
                idx === breadcrumbs.length - 1
                  ? "text-white font-bold bg-card/60"
                  : "text-textSecondary hover:text-textPrimary"
              }`}
            >
              {crumb.label}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Entries List Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-lg">
        {/* Table Header */}
        <div className="p-3 border-b border-border bg-card/40 text-xs font-semibold text-textSecondary uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <button
              onClick={toggleSelectAll}
              className="text-textSecondary hover:text-primary transition-colors cursor-pointer"
              title="Select / Deselect all"
            >
              {selectedPaths.size === filteredEntries.length && filteredEntries.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-primary" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={() => {
                if (sortField === "name") setSortAsc(!sortAsc);
                else {
                  setSortField("name");
                  setSortAsc(true);
                }
              }}
              className="hover:text-white transition-colors cursor-pointer flex items-center space-x-1"
            >
              <span>File / Folder Name</span>
              {sortField === "name" && <span>{sortAsc ? "▲" : "▼"}</span>}
            </button>
          </div>

          <div className="flex items-center space-x-6 text-right">
            <button
              onClick={() => {
                if (sortField === "date") setSortAsc(!sortAsc);
                else {
                  setSortField("date");
                  setSortAsc(false);
                }
              }}
              className="hidden md:inline hover:text-white transition-colors cursor-pointer"
            >
              <span>Modified</span>
              {sortField === "date" && <span>{sortAsc ? "▲" : "▼"}</span>}
            </button>

            <button
              onClick={() => {
                if (sortField === "size") setSortAsc(!sortAsc);
                else {
                  setSortField("size");
                  setSortAsc(false);
                }
              }}
              className="hover:text-white transition-colors cursor-pointer"
            >
              <span>Size / Actions</span>
              {sortField === "size" && <span>{sortAsc ? "▲" : "▼"}</span>}
            </button>
          </div>
        </div>

        {/* Loading / Empty / Rows */}
        {loading ? (
          <div className="p-12 text-center text-textSecondary text-sm flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span>Reading NAS volume & parsing Vorbis headers...</span>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-12 text-center text-textSecondary text-sm">
            {searchQuery ? "No matching files found in this folder." : "Directory is empty."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredEntries.map((entry) => {
              const isSelected = selectedPaths.has(entry.path);
              return (
                <div
                  key={entry.path}
                  className={`flex items-center justify-between p-3 hover:bg-card/50 transition-colors text-sm group ${
                    isSelected ? "bg-primary/5" : ""
                  }`}
                >
                  {/* Left: Checkbox + Icon & Name + Quality Badge */}
                  <div className="flex items-center space-x-3 min-w-0 flex-1 pr-3">
                    <button
                      onClick={(e) => toggleSelectOne(entry.path, e)}
                      className="text-textSecondary hover:text-primary transition-colors cursor-pointer flex-shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4 opacity-40 group-hover:opacity-100" />
                      )}
                    </button>

                    <div
                      onClick={() => {
                        if (entry.is_dir) {
                          loadDirectory(entry.path);
                        } else if (entry.format) {
                          handlePlayDirect(entry, false);
                        }
                      }}
                      className={`flex items-center space-x-2.5 min-w-0 flex-1 ${
                        entry.is_dir || entry.format ? "cursor-pointer" : ""
                      }`}
                    >
                      {entry.is_dir ? (
                        <Folder className="w-5 h-5 text-primary flex-shrink-0" />
                      ) : entry.format ? (
                        <FileAudio className="w-5 h-5 text-accent flex-shrink-0" />
                      ) : (
                        <File className="w-5 h-5 text-textSecondary flex-shrink-0" />
                      )}

                      <div className="min-w-0 flex-1 flex flex-col">
                        <div className="flex items-center space-x-2 truncate">
                          {entry.track_number && (
                            <span className="text-[11px] font-mono text-textSecondary/80 font-bold">
                              {entry.track_number < 10 ? `0${entry.track_number}` : entry.track_number}.
                            </span>
                          )}
                          <span
                            className={`truncate ${
                              entry.is_dir
                                ? "text-textPrimary hover:text-primary font-medium"
                                : entry.format
                                ? "text-textPrimary hover:text-primary"
                                : "text-textPrimary"
                            }`}
                          >
                            {entry.name}
                          </span>
                        </div>
                        {entry.artist && entry.album && (
                          <span className="text-[11px] text-textSecondary truncate">
                            {entry.artist} • {entry.album}
                          </span>
                        )}
                      </div>

                      {/* Hi-Res Badges */}
                      {entry.format?.toLowerCase() === "dsf" || entry.format?.toLowerCase() === "dff" ? (
                        <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded flex-shrink-0 flex items-center space-x-0.5 shadow-sm">
                          <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                          <span>DSD DIRECT</span>
                        </span>
                      ) : entry.hires ? (
                        <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded flex-shrink-0 flex items-center space-x-0.5 shadow-sm">
                          <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                          <span>
                            {entry.bit_depth || 24}B/
                            {entry.sample_rate ? Math.round(entry.sample_rate / 1000) : 96}k{" "}
                            {entry.format || "FLAC"}
                          </span>
                        </span>
                      ) : entry.format === "FLAC" || entry.format === "WAV" || entry.format === "ALAC" ? (
                        <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded flex-shrink-0 shadow-sm">
                          {entry.bit_depth || 16}B/
                          {entry.sample_rate ? (entry.sample_rate / 1000).toFixed(1) : "44.1"}k CD
                        </span>
                      ) : entry.format ? (
                        <span className="px-1.5 py-0.5 text-[9px] font-mono font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded flex-shrink-0 shadow-sm">
                          {entry.format} AUDIO
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Right: Date, Size & Action Buttons */}
                  <div className="flex items-center space-x-3 flex-shrink-0 font-mono text-xs text-textSecondary">
                    {/* Date Modified */}
                    <span className="hidden md:inline text-[11px] text-textSecondary/70 w-24 text-right">
                      {formatDate(entry.modified_at)}
                    </span>

                    {/* Size */}
                    <span className="w-16 text-right">
                      {entry.is_dir ? "Folder" : formatSize(entry.size_bytes)}
                    </span>

                    {/* Actions Menu */}
                    <div className="flex items-center space-x-1">
                      {/* Audio Play Direct */}
                      {entry.format && (
                        <button
                          onClick={() => handlePlayDirect(entry, false)}
                          className="p-1.5 rounded hover:bg-card text-textSecondary hover:text-primary transition-colors cursor-pointer"
                          title="Play bit-perfect stream in browser"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                      )}

                      {/* Cast to ALSA Hardware DAC */}
                      {entry.format && activeDeviceId !== "browser" && (
                        <button
                          onClick={() => handlePlayDirect(entry, true)}
                          className="p-1.5 rounded hover:bg-card text-textSecondary hover:text-emerald-400 transition-colors cursor-pointer"
                          title="Route bit-perfect to Synology host USB DAC"
                        >
                          <Speaker className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Vorbis/FLAC Header Inspector */}
                      {entry.format && (
                        <button
                          onClick={() => setInspectEntry(entry)}
                          className="p-1.5 rounded hover:bg-card text-textSecondary hover:text-white transition-colors cursor-pointer"
                          title="Inspect Vorbis & Technical Audio Headers"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Download */}
                      {!entry.is_dir && (
                        <a
                          href={`/api/fs/download?path=${encodeURIComponent(entry.path)}`}
                          download
                          className="p-1.5 rounded hover:bg-card text-textSecondary hover:text-primary transition-colors cursor-pointer"
                          title="Download raw file"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}

                      {/* Rename */}
                      <button
                        onClick={() => {
                          setRenameEntry(entry);
                          setRenameNewName(entry.name);
                        }}
                        className="p-1.5 rounded hover:bg-card text-textSecondary hover:text-amber-400 transition-colors cursor-pointer"
                        title="Rename"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      {/* Move / Transfer */}
                      <button
                        onClick={() => {
                          setSelectedFile(entry);
                          setTargetDest(`${currentPath}/${entry.name}`);
                        }}
                        className="p-1.5 rounded hover:bg-card text-textSecondary hover:text-accent transition-colors cursor-pointer"
                        title="Move / Transfer"
                      >
                        <MoveRight className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => setDeleteConfirmPaths([entry.path])}
                        className="p-1.5 rounded hover:bg-card text-textSecondary hover:text-red-400 transition-colors cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Multi-Select Action Bar */}
      {selectedPaths.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-surface/95 backdrop-blur-md border border-primary/40 rounded-2xl shadow-2xl px-5 py-3 flex items-center space-x-4 animate-in slide-in-from-bottom-5">
          <div className="text-xs font-mono">
            <span className="text-primary font-bold">{selectedPaths.size}</span>
            <span className="text-textSecondary"> selected ({formatSize(selectedTotalBytes)})</span>
          </div>

          <div className="h-4 w-[1px] bg-border" />

          {/* Play Selected */}
          <button
            onClick={() => {
              const tracks = getAudioTracks(selectedEntries);
              if (tracks.length === 0) {
                showNotification("No audio tracks in selection");
                return;
              }
              playTrack(tracks[0], tracks);
              showNotification(`Playing ${tracks.length} selected tracks`);
            }}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-primary text-black text-xs font-bold transition-transform hover:scale-105 cursor-pointer"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Play</span>
          </button>

          {/* Queue Selected */}
          <button
            onClick={() => {
              const tracks = getAudioTracks(selectedEntries);
              if (tracks.length === 0) {
                showNotification("No audio tracks in selection");
                return;
              }
              addAllToQueue(tracks);
              showNotification(`Added ${tracks.length} tracks to queue`);
            }}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-card hover:bg-cardHover text-textPrimary text-xs font-medium border border-border cursor-pointer"
          >
            <ListPlus className="w-3.5 h-3.5" />
            <span>Queue</span>
          </button>

          {/* Batch Delete */}
          <button
            onClick={() => setDeleteConfirmPaths(Array.from(selectedPaths))}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xs font-semibold cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>

          {/* Deselect All */}
          <button
            onClick={() => setSelectedPaths(new Set())}
            className="p-1 rounded-lg hover:bg-card text-textSecondary hover:text-white"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* New Folder Modal */}
      {newFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                <FolderPlus className="w-5 h-5 text-primary" />
                <h3 className="text-base font-bold text-textPrimary">Create New Folder</h3>
              </div>
              <button
                onClick={() => {
                  setNewFolderOpen(false);
                  setNewFolderName("");
                }}
                className="p-1.5 rounded-lg hover:bg-card text-textSecondary hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-textSecondary font-mono">Folder Name:</label>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                }}
                autoFocus
                placeholder="e.g. Pink Floyd - The Dark Side of the Moon [FLAC 24-96]"
                className="w-full bg-card border border-border rounded-xl p-2.5 text-xs text-textPrimary font-mono focus:outline-none focus:border-primary"
              />
              <p className="text-[11px] text-textSecondary/70 font-mono">
                Location: <span className="text-textSecondary">{currentPath}</span>
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => {
                  setNewFolderOpen(false);
                  setNewFolderName("");
                }}
                className="px-4 py-2 rounded-xl text-xs text-textSecondary hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="px-4 py-2 rounded-xl bg-primary text-black font-bold text-xs shadow-md disabled:opacity-50 cursor-pointer"
              >
                Create Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                <Pencil className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-textPrimary">
                  Rename {renameEntry.is_dir ? "Folder" : "File"}
                </h3>
              </div>
              <button
                onClick={() => setRenameEntry(null)}
                className="p-1.5 rounded-lg hover:bg-card text-textSecondary hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-textSecondary font-mono">New Name:</label>
              <input
                type="text"
                value={renameNewName}
                onChange={(e) => setRenameNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                }}
                autoFocus
                className="w-full bg-card border border-border rounded-xl p-2.5 text-xs text-textPrimary font-mono focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setRenameEntry(null)}
                className="px-4 py-2 rounded-xl text-xs text-textSecondary hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                disabled={!renameNewName.trim() || renameNewName === renameEntry.name}
                className="px-4 py-2 rounded-xl bg-primary text-black font-bold text-xs shadow-md disabled:opacity-50 cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {deleteConfirmPaths && deleteConfirmPaths.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="bg-surface border border-red-500/40 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center space-x-2 border-b border-border pb-3">
              <Trash2 className="w-5 h-5 text-red-400" />
              <h3 className="text-base font-bold text-textPrimary">Confirm Deletion</h3>
            </div>

            <p className="text-xs text-textSecondary">
              Are you sure you want to permanently delete the following{" "}
              <span className="text-white font-bold">{deleteConfirmPaths.length}</span> item(s) from your Synology NAS?
            </p>

            <div className="max-h-40 overflow-y-auto space-y-1 bg-card/60 p-2.5 rounded-xl border border-border text-xs font-mono">
              {deleteConfirmPaths.map((p) => (
                <div key={p} className="truncate text-red-300">
                  {p.split("/").pop()}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setDeleteConfirmPaths(null)}
                className="px-4 py-2 rounded-xl text-xs text-textSecondary hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md cursor-pointer transition-colors"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Technical Metadata Inspector Modal */}
      {inspectEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <h3 className="text-base font-bold text-textPrimary">Audio Header & Tag Inspector</h3>
              </div>
              <button
                onClick={() => setInspectEntry(null)}
                className="p-1.5 rounded-lg hover:bg-card text-textSecondary hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between p-2 rounded bg-card/60">
                <span className="text-textSecondary">File Name:</span>
                <span className="text-white font-semibold truncate max-w-[280px]">{inspectEntry.name}</span>
              </div>
              {inspectEntry.title && (
                <div className="flex justify-between p-2 rounded bg-card/60">
                  <span className="text-textSecondary">Track Title:</span>
                  <span className="text-white font-semibold truncate max-w-[280px]">{inspectEntry.title}</span>
                </div>
              )}
              {inspectEntry.artist && (
                <div className="flex justify-between p-2 rounded bg-card/60">
                  <span className="text-textSecondary">Artist:</span>
                  <span className="text-primary font-semibold truncate max-w-[280px]">{inspectEntry.artist}</span>
                </div>
              )}
              {inspectEntry.album && (
                <div className="flex justify-between p-2 rounded bg-card/60">
                  <span className="text-textSecondary">Album:</span>
                  <span className="text-white truncate max-w-[280px]">{inspectEntry.album}</span>
                </div>
              )}
              <div className="flex justify-between p-2 rounded bg-card/60">
                <span className="text-textSecondary">Audio Codec:</span>
                <span className="text-primary font-bold">{inspectEntry.format || "FLAC"}</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-card/60">
                <span className="text-textSecondary">Bit Depth & Sample Rate:</span>
                <span className="text-emerald-400 font-bold">
                  {inspectEntry.bit_depth || 24}-bit / {inspectEntry.sample_rate || 96000} Hz
                </span>
              </div>
              <div className="flex justify-between p-2 rounded bg-card/60">
                <span className="text-textSecondary">Channels:</span>
                <span className="text-white font-semibold">{inspectEntry.channels || 2} (Stereo)</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-card/60">
                <span className="text-textSecondary">Dynamic Range:</span>
                <span className="text-amber-400 font-bold">DR{inspectEntry.dr_score || 13} (High Fidelity)</span>
              </div>
              {inspectEntry.duration && (
                <div className="flex justify-between p-2 rounded bg-card/60">
                  <span className="text-textSecondary">Duration:</span>
                  <span className="text-white font-semibold">{formatDuration(inspectEntry.duration)}</span>
                </div>
              )}
              <div className="flex justify-between p-2 rounded bg-card/60">
                <span className="text-textSecondary">File Size:</span>
                <span className="text-white font-semibold">{formatSize(inspectEntry.size_bytes)}</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-card/60">
                <span className="text-textSecondary">Full NAS Path:</span>
                <span className="text-textPrimary truncate max-w-[280px] text-[11px]">{inspectEntry.path}</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setInspectEntry(null)}
                className="px-4 py-2 bg-primary text-black font-bold text-xs rounded-xl cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Dialog Modal */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-textPrimary">Transfer File on Synology NAS</h3>
            <p className="text-xs text-textSecondary">
              Moving: <span className="text-primary font-mono">{selectedFile.name}</span>
            </p>
            <input
              type="text"
              value={targetDest}
              onChange={(e) => setTargetDest(e.target.value)}
              className="w-full bg-card border border-border rounded-xl p-2.5 text-xs text-textPrimary font-mono focus:outline-none focus:border-primary"
              placeholder="Destination path"
            />
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setSelectedFile(null)}
                className="px-4 py-2 rounded-xl text-xs text-textSecondary hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleTransfer}
                className="px-4 py-2 rounded-xl bg-primary text-black font-bold text-xs shadow-md cursor-pointer"
              >
                Execute Transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
