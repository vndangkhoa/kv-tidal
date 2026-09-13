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
  Columns,
  LayoutList,
  FolderTree,
  ChevronRight,
  Music,
  Disc,
  Image as ImageIcon,
  Copy,
  ExternalLink,
  ZoomIn,
  Scissors,
  ClipboardPaste,
  Columns2,
  ArrowRightLeft,
  FolderOpen,
  MoreVertical,
} from "lucide-react";
import {
  FileContextMenu,
  ContextMenuPosition,
  ContextMenuTarget,
} from "@/components/files/FileContextMenu";

export interface ColumnItem {
  path: string;
  title: string;
  entries: FsEntry[];
  selectedPath: string | null;
  loading?: boolean;
}

export default function FilesPage() {
  const { playTrack, addAllToQueue, activeDeviceId, currentTrack } = usePlayer();
  const [currentPath, setCurrentPath] = useState<string>("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [diskSpace, setDiskSpace] = useState<DiskUsage | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // View Mode: 'columns' (macOS Finder style) | 'list' (Classic Table) | 'split' (Dual Pane)
  const [viewMode, setViewMode] = useState<"columns" | "list" | "split">("columns");
  const [columnHistory, setColumnHistory] = useState<ColumnItem[]>([]);
  const [quickLookFile, setQuickLookFile] = useState<FsEntry | null>(null);
  const columnsContainerRef = useRef<HTMLDivElement>(null);

  // Clipboard Engine State (Cut / Copy / Move)
  const [clipboard, setClipboard] = useState<{
    action: "cut" | "copy";
    paths: string[];
    sourceDir: string;
  } | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    position: ContextMenuPosition;
    target: ContextMenuTarget;
  } | null>(null);

  // Mobile Bottom Sheet Action State
  const [mobileActionEntry, setMobileActionEntry] = useState<FsEntry | null>(null);
  const [mobileActionMenuOpen, setMobileActionMenuOpen] = useState<boolean>(false);

  // Split View (Dual-Pane) State
  const [activePane, setActivePane] = useState<"left" | "right">("left");
  const [paneBPath, setPaneBPath] = useState<string>("");
  const [paneBParentPath, setPaneBParentPath] = useState<string | null>(null);
  const [paneBEntries, setPaneBEntries] = useState<FsEntry[]>([]);
  const [paneBLoading, setPaneBLoading] = useState<boolean>(false);
  const [paneBSelectedPaths, setPaneBSelectedPaths] = useState<Set<string>>(new Set());
  const [paneBSearchQuery, setPaneBSearchQuery] = useState<string>("");
  const [paneBSortField, setPaneBSortField] = useState<"name" | "size" | "format" | "date">("name");
  const [paneBSortAsc, setPaneBSortAsc] = useState<boolean>(true);

  // Tag Editor State
  const [tagEditFile, setTagEditFile] = useState<FsEntry | null>(null);
  const [tagForm, setTagForm] = useState({
    title: "",
    artist: "",
    album: "",
    year: "",
    track_number: "",
  });
  const [isSavingTags, setIsSavingTags] = useState<boolean>(false);

  // Auto-organizer State
  const [organizeModalOpen, setOrganizeModalOpen] = useState<boolean>(false);
  const [organizePattern, setOrganizePattern] = useState<string>(
    "{artist}/{album}/{track:02d} - {title}.{ext}"
  );
  const [organizeDryRunResults, setOrganizeDryRunResults] = useState<any | null>(null);
  const [isOrganizing, setIsOrganizing] = useState<boolean>(false);
  const [zoomCoverUrl, setZoomCoverUrl] = useState<string | null>(null);
  const [pathCopied, setPathCopied] = useState<boolean>(false);

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
        const current = data.current_path || "";
        setCurrentPath(current);
        setParentPath(data.parent_path || null);
        setEntries(data.entries || []);
        if (data.disk_space) {
          setDiskSpace(data.disk_space);
        }

        // Initialize / reset root column
        setColumnHistory([
          {
            path: current,
            title: current.split("/").filter(Boolean).pop() || "Root",
            entries: data.entries || [],
            selectedPath: null,
          },
        ]);
        setQuickLookFile(null);
      }
    } catch (e) {
      console.error("Browse failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadPaneBDirectory = async (path?: string) => {
    setPaneBLoading(true);
    setPaneBSelectedPaths(new Set());
    try {
      const url = path ? `/api/fs/browse?path=${encodeURIComponent(path)}` : `/api/fs/browse`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        setPaneBPath(data.current_path || "");
        setPaneBParentPath(data.parent_path || null);
        setPaneBEntries(data.entries || []);
      }
    } catch (e) {
      console.error("Pane B Browse failed:", e);
    } finally {
      setPaneBLoading(false);
    }
  };

  useEffect(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const saved = localStorage.getItem("kvtidal_files_view_mode");
    if (isMobile) {
      setViewMode("list");
    } else if (saved === "list" || saved === "columns" || saved === "split") {
      setViewMode(saved as any);
      if (saved === "split") {
        loadPaneBDirectory();
      }
    }
    loadDirectory();
  }, []);

  // Keyboard navigation for Column View
  useEffect(() => {
    if (viewMode !== "columns") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === " " && quickLookFile) {
        e.preventDefault();
        handlePlayDirect(quickLookFile);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewMode, quickLookFile]);

  // Handle clicking items in Miller Column View
  const handleColumnItemClick = async (colIdx: number, item: FsEntry) => {
    if (item.is_dir) {
      setQuickLookFile(null);
      const updatedHistory = columnHistory.slice(0, colIdx + 1);
      updatedHistory[colIdx] = {
        ...updatedHistory[colIdx],
        selectedPath: item.path,
      };

      const newCol: ColumnItem = {
        path: item.path,
        title: item.name,
        entries: [],
        selectedPath: null,
        loading: true,
      };
      setColumnHistory([...updatedHistory, newCol]);
      setCurrentPath(item.path);

      try {
        const resp = await fetch(`/api/fs/browse?path=${encodeURIComponent(item.path)}`);
        if (resp.ok) {
          const data = await resp.json();
          setColumnHistory((prev) => {
            const next = [...prev];
            if (next[colIdx + 1] && next[colIdx + 1].path === item.path) {
              next[colIdx + 1] = {
                ...next[colIdx + 1],
                entries: data.entries || [],
                loading: false,
              };
            }
            return next;
          });
          setTimeout(() => {
            if (columnsContainerRef.current) {
              columnsContainerRef.current.scrollTo({
                left: columnsContainerRef.current.scrollWidth,
                behavior: "smooth",
              });
            }
          }, 60);
        }
      } catch (e) {
        console.error("Error loading column:", e);
      }
    } else {
      const isImg =
        item.name.toLowerCase().endsWith(".jpg") ||
        item.name.toLowerCase().endsWith(".jpeg") ||
        item.name.toLowerCase().endsWith(".png");
      if (isImg) {
        setZoomCoverUrl(`/api/fs/download?path=${encodeURIComponent(item.path)}`);
      }
      const updatedHistory = columnHistory.slice(0, colIdx + 1);
      updatedHistory[colIdx] = {
        ...updatedHistory[colIdx],
        selectedPath: item.path,
      };
      setColumnHistory(updatedHistory);
      if (item.format) {
        setQuickLookFile(item);
      }
      setTimeout(() => {
        if (columnsContainerRef.current) {
          columnsContainerRef.current.scrollTo({
            left: columnsContainerRef.current.scrollWidth,
            behavior: "smooth",
          });
        }
      }, 60);
    }
  };

  // Tag Editor Handlers
  const openTagEditor = (entry: FsEntry) => {
    setTagEditFile(entry);
    setTagForm({
      title: entry.title || entry.name.replace(/\.[^/.]+$/, ""),
      artist: entry.artist || "",
      album: entry.album || "",
      year: "",
      track_number: entry.track_number ? String(entry.track_number) : "",
    });
  };

  const handleSaveTags = async () => {
    if (!tagEditFile) return;
    setIsSavingTags(true);
    try {
      const payload = {
        file_path: tagEditFile.path,
        title: tagForm.title.trim() || undefined,
        artist: tagForm.artist.trim() || undefined,
        album: tagForm.album.trim() || undefined,
        year: tagForm.year ? parseInt(tagForm.year) : undefined,
        track_number: tagForm.track_number ? parseInt(tagForm.track_number) : undefined,
      };
      const resp = await fetch("/api/fs/tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        const data = await resp.json();
        showNotification(`Tags updated for "${data.track.title}"!`);
        // Update columnHistory and entries
        setColumnHistory((prev) =>
          prev.map((col) => ({
            ...col,
            entries: col.entries.map((e) =>
              e.path === tagEditFile.path
                ? {
                    ...e,
                    title: data.track.title,
                    artist: data.track.artist,
                    album: data.track.album,
                    track_number: data.track.track_number,
                  }
                : e
            ),
          }))
        );
        setEntries((prev) =>
          prev.map((e) =>
            e.path === tagEditFile.path
              ? {
                  ...e,
                  title: data.track.title,
                  artist: data.track.artist,
                  album: data.track.album,
                  track_number: data.track.track_number,
                }
              : e
          )
        );
        if (quickLookFile && quickLookFile.path === tagEditFile.path) {
          setQuickLookFile((prev) =>
            prev
              ? {
                  ...prev,
                  title: data.track.title,
                  artist: data.track.artist,
                  album: data.track.album,
                  track_number: data.track.track_number,
                }
              : null
          );
        }
        setTagEditFile(null);
      } else {
        const err = await resp.json().catch(() => ({}));
        showNotification(`Failed to update tags: ${err.error || resp.statusText}`);
      }
    } catch (e: any) {
      showNotification(`Error: ${e.message}`);
    } finally {
      setIsSavingTags(false);
    }
  };

  // Auto-Organize Handlers
  const handlePreviewOrganize = async () => {
    setIsOrganizing(true);
    try {
      const resp = await fetch("/api/fs/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_dir: currentPath || "/volume2/music",
          pattern: organizePattern,
          dry_run: true,
          selected_paths: selectedPaths.size > 0 ? Array.from(selectedPaths) : undefined,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setOrganizeDryRunResults(data);
      } else {
        const err = await resp.json().catch(() => ({}));
        showNotification(`Dry-run failed: ${err.error || resp.statusText}`);
      }
    } catch (e: any) {
      showNotification(`Organize preview error: ${e.message}`);
    } finally {
      setIsOrganizing(false);
    }
  };

  const handleApplyOrganize = async () => {
    setIsOrganizing(true);
    try {
      const resp = await fetch("/api/fs/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_dir: currentPath || "/volume2/music",
          pattern: organizePattern,
          dry_run: false,
          selected_paths: selectedPaths.size > 0 ? Array.from(selectedPaths) : undefined,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        showNotification(`Successfully organized and moved ${data.moved_count} file(s)!`);
        setOrganizeModalOpen(false);
        setOrganizeDryRunResults(null);
        loadDirectory(currentPath);
      } else {
        const err = await resp.json().catch(() => ({}));
        showNotification(`Organize apply failed: ${err.error || resp.statusText}`);
      }
    } catch (e: any) {
      showNotification(`Organize error: ${e.message}`);
    } finally {
      setIsOrganizing(false);
    }
  };

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
        streamUrl: `/api/stream?path=${encodeURIComponent(entry.path)}&title=${encodeURIComponent(
          entry.title || entry.name
        )}&artist=${encodeURIComponent(entry.artist || "Synology NAS Vault")}`,
        format: entry.format || "FLAC",
        bitDepth: entry.bit_depth || 24,
        sampleRate: entry.sample_rate || 96000,
        hires: entry.hires ?? true,
        source: "local" as const,
        drScore: entry.dr_score || 13,
        isDsd: entry.format?.toLowerCase() === "dsf" || entry.format?.toLowerCase() === "dff",
        duration: entry.duration,
        coverUrl: entry.cover_url || `/api/fs/cover?path=${encodeURIComponent(entry.path)}`,
        filePath: entry.path,
        fileName: entry.name,
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
      streamUrl: `/api/stream?path=${encodeURIComponent(entry.path)}&title=${encodeURIComponent(
        entry.title || entry.name
      )}&artist=${encodeURIComponent(entry.artist || "Synology NAS Vault")}`,
      coverUrl: entry.cover_url || `/api/fs/cover?path=${encodeURIComponent(entry.path)}`,
      format: entry.format,
      bitDepth: entry.bit_depth || 24,
      sampleRate: entry.sample_rate || 96000,
      hires: entry.hires ?? true,
      source: "local" as const,
      drScore: entry.dr_score || 13,
      isDsd: entry.format.toLowerCase() === "dsf" || entry.format.toLowerCase() === "dff",
      duration: entry.duration,
      filePath: entry.path,
      fileName: entry.name,
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
  const handleScanFolder = async (folderPath?: string) => {
    setIsScanning(true);
    try {
      const target = folderPath || currentPath || "./music";
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

  // Helper to parse breadcrumbs
  const getBreadcrumbs = (path: string) => {
    if (!path) return [];
    const isAbs = path.startsWith("/");
    const parts = path.split("/").filter((p) => p && p !== ".");
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
  };

  const breadcrumbs = useMemo(() => getBreadcrumbs(currentPath), [currentPath]);
  const paneBBreadcrumbs = useMemo(() => getBreadcrumbs(paneBPath), [paneBPath]);

  // Pane B Filter and sort entries
  const paneBFilteredEntries = useMemo(() => {
    let result = paneBEntries;
    if (paneBSearchQuery.trim()) {
      const q = paneBSearchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.format && e.format.toLowerCase().includes(q)) ||
          (e.artist && e.artist.toLowerCase().includes(q)) ||
          (e.album && e.album.toLowerCase().includes(q))
      );
    }

    return [...result].sort((a, b) => {
      if (a.is_dir !== b.is_dir) {
        return a.is_dir ? -1 : 1;
      }
      let cmp = 0;
      if (paneBSortField === "name") {
        if (a.track_number && b.track_number && a.track_number !== b.track_number) {
          cmp = a.track_number - b.track_number;
        } else {
          cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        }
      } else if (paneBSortField === "size") {
        cmp = a.size_bytes - b.size_bytes;
      } else if (paneBSortField === "format") {
        cmp = (a.format || "").localeCompare(b.format || "");
      } else if (paneBSortField === "date") {
        cmp = (a.modified_at || 0) - (b.modified_at || 0);
      }
      return paneBSortAsc ? cmp : -cmp;
    });
  }, [paneBEntries, paneBSearchQuery, paneBSortField, paneBSortAsc]);

  const paneBSelectedEntries = useMemo(() => {
    return paneBEntries.filter((e) => paneBSelectedPaths.has(e.path));
  }, [paneBEntries, paneBSelectedPaths]);

  const paneBSelectedTotalBytes = useMemo(() => {
    return paneBSelectedEntries.reduce((sum, e) => sum + e.size_bytes, 0);
  }, [paneBSelectedEntries]);

  const togglePaneBSelectAll = () => {
    if (paneBSelectedPaths.size === paneBFilteredEntries.length && paneBFilteredEntries.length > 0) {
      setPaneBSelectedPaths(new Set());
    } else {
      setPaneBSelectedPaths(new Set(paneBFilteredEntries.map((e) => e.path)));
    }
  };

  const togglePaneBSelectOne = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(paneBSelectedPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setPaneBSelectedPaths(next);
  };

  // Clipboard Actions (Cut / Copy / Paste)
  const handleCut = (targetEntries?: FsEntry[]) => {
    const items =
      targetEntries && targetEntries.length > 0
        ? targetEntries
        : activePane === "left"
        ? selectedEntries
        : paneBSelectedEntries;

    if (items.length === 0) {
      showNotification("No items selected to Cut");
      return;
    }

    const paths = items.map((i) => i.path);
    const sourceDir = activePane === "left" ? currentPath : paneBPath;
    setClipboard({ action: "cut", paths, sourceDir });
    setSelectedPaths(new Set());
    setPaneBSelectedPaths(new Set());
    showNotification(`Cut ${paths.length} item(s). Navigate to target folder and paste.`);
  };

  const handleCopy = (targetEntries?: FsEntry[]) => {
    const items =
      targetEntries && targetEntries.length > 0
        ? targetEntries
        : activePane === "left"
        ? selectedEntries
        : paneBSelectedEntries;

    if (items.length === 0) {
      showNotification("No items selected to Copy");
      return;
    }

    const paths = items.map((i) => i.path);
    const sourceDir = activePane === "left" ? currentPath : paneBPath;
    setClipboard({ action: "copy", paths, sourceDir });
    setSelectedPaths(new Set());
    setPaneBSelectedPaths(new Set());
    showNotification(`Copied ${paths.length} item(s) to clipboard.`);
  };

  const handlePaste = async (destinationDir?: string) => {
    if (!clipboard || clipboard.paths.length === 0) {
      showNotification("Clipboard is empty");
      return;
    }

    const dest = destinationDir || (activePane === "left" ? currentPath : paneBPath);
    if (!dest) {
      showNotification("No destination folder selected");
      return;
    }

    try {
      const resp = await fetch("/api/fs/batch-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: clipboard.action,
          paths: clipboard.paths,
          destination_dir: dest,
          conflict_resolution: "rename",
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const actionLabel = clipboard.action === "cut" ? "Moved" : "Copied";
        showNotification(
          `${actionLabel} ${data.transferred_count} item(s) successfully to ${
            dest.split("/").filter(Boolean).pop() || "destination"
          }`
        );
        if (clipboard.action === "cut") {
          setClipboard(null);
        }
        loadDirectory(currentPath);
        if (viewMode === "split") {
          loadPaneBDirectory(paneBPath);
        }
      } else {
        const err = await resp.json().catch(() => ({}));
        showNotification(`Transfer failed: ${err.error || resp.statusText}`);
      }
    } catch (e: any) {
      showNotification(`Transfer error: ${e?.message || "Connection error"}`);
    }
  };

  // Cross-pane transfer (Split View)
  const handleCrossPaneTransfer = async (
    action: "copy" | "cut",
    direction: "toRight" | "toLeft",
    targetEntries?: FsEntry[]
  ) => {
    const srcEntries =
      targetEntries && targetEntries.length > 0
        ? targetEntries
        : direction === "toRight"
        ? selectedEntries
        : paneBSelectedEntries;

    if (srcEntries.length === 0) {
      showNotification(`No items selected to ${action === "cut" ? "move" : "copy"}`);
      return;
    }

    const dest = direction === "toRight" ? paneBPath : currentPath;
    if (!dest) {
      showNotification("Target directory not loaded");
      return;
    }

    try {
      const resp = await fetch("/api/fs/batch-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          paths: srcEntries.map((e) => e.path),
          destination_dir: dest,
          conflict_resolution: "rename",
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        showNotification(
          `${action === "cut" ? "Moved" : "Copied"} ${data.transferred_count} item(s) to ${
            direction === "toRight" ? "Right Pane" : "Left Pane"
          }`
        );
        loadDirectory(currentPath);
        loadPaneBDirectory(paneBPath);
        if (direction === "toRight") {
          setSelectedPaths(new Set());
        } else {
          setPaneBSelectedPaths(new Set());
        }
      } else {
        const err = await resp.json().catch(() => ({}));
        showNotification(`Transfer failed: ${err.error || resp.statusText}`);
      }
    } catch (e: any) {
      showNotification(`Transfer error: ${e?.message || "Network error"}`);
    }
  };

  // Context Menu trigger
  const handleContextMenu = (
    e: React.MouseEvent,
    type: "file" | "folder" | "background",
    entry?: FsEntry,
    pane: "left" | "right" = "left"
  ) => {
    e.preventDefault();
    e.stopPropagation();

    setActivePane(pane);
    const selectedSet = pane === "left" ? selectedPaths : paneBSelectedPaths;
    const entryList = pane === "left" ? entries : paneBEntries;
    const path = pane === "left" ? currentPath : paneBPath;

    let selectedItems: FsEntry[] = [];
    if (entry && selectedSet.has(entry.path)) {
      selectedItems = entryList.filter((item) => selectedSet.has(item.path));
    } else if (entry) {
      selectedItems = [entry];
      if (pane === "left") {
        setSelectedPaths(new Set([entry.path]));
      } else {
        setPaneBSelectedPaths(new Set([entry.path]));
      }
    }

    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      target: {
        type,
        entry,
        selectedEntries: selectedItems,
        currentPath: path,
      },
    });
  };

  // Global Keyboard Shortcuts (Ctrl+C, Ctrl+X, Ctrl+V, Delete, Escape)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd && e.key.toLowerCase() === "c") {
        e.preventDefault();
        handleCopy();
      } else if (isCtrlOrCmd && e.key.toLowerCase() === "x") {
        e.preventDefault();
        handleCut();
      } else if (isCtrlOrCmd && e.key.toLowerCase() === "v") {
        e.preventDefault();
        handlePaste();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const activeSelected =
          activePane === "left" ? selectedEntries : paneBSelectedEntries;
        if (activeSelected.length > 0) {
          e.preventDefault();
          setDeleteConfirmPaths(activeSelected.map((i) => i.path));
        }
      } else if (e.key === "Escape") {
        if (contextMenu) {
          setContextMenu(null);
        } else if (clipboard) {
          setClipboard(null);
          showNotification("Clipboard cleared");
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [activePane, selectedEntries, paneBSelectedEntries, clipboard, contextMenu, currentPath, paneBPath]);

  return (
    <div
      className="space-y-6 pb-44 md:pb-24 relative min-h-screen"
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
            <span>{isUploading ? "Uploading..." : "Upload"}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="audio/*,.flac,.dsf,.dff,.wav,.mp3,.m4a,.aac,.ogg,.iso"
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
            <span className="hidden xs:inline">Play Folder</span>
          </button>

          {/* Queue Folder */}
          <button
            onClick={handleQueueFolder}
            className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-card hover:bg-cardHover text-textPrimary border border-border text-xs font-medium transition-colors cursor-pointer"
            title="Add all tracks in folder to active playback queue"
          >
            <ListPlus className="w-4 h-4 text-textSecondary" />
            <span>Queue Folder</span>
          </button>

          {/* Scan to Library */}
          <button
            onClick={() => handleScanFolder()}
            disabled={isScanning}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-card hover:bg-cardHover text-textSecondary hover:text-emerald-400 border border-border text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            title="Scan this folder directly into KV-TIDAL music library"
          >
            {isScanning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            ) : (
              <FolderSync className="w-3.5 h-3.5" />
            )}
            <span className="hidden xs:inline">{isScanning ? "Scanning..." : "Scan"}</span>
          </button>

          {/* Auto-Organize Files (Desktop only) */}
          <button
            onClick={() => setOrganizeModalOpen(true)}
            className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-card hover:bg-cardHover text-purple-300 hover:text-purple-200 border border-purple-500/30 text-xs font-medium transition-colors cursor-pointer"
            title="Auto-organize files by metadata tags"
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>Auto-Organize</span>
          </button>
        </div>

        {/* Center/Right: View Switcher + Search Filter & Refresh */}
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          {/* View Mode Switcher (Columns vs List) - Desktop only */}
          <div className="hidden md:flex items-center bg-card border border-border rounded-lg p-0.5 text-xs">
            <button
              onClick={() => {
                setViewMode("columns");
                localStorage.setItem("kvtidal_files_view_mode", "columns");
              }}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                viewMode === "columns"
                  ? "bg-primary text-black font-bold shadow-sm"
                  : "text-textSecondary hover:text-white"
              }`}
              title="macOS Finder Column View (Miller Columns)"
            >
              <Columns className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Columns</span>
            </button>
            <button
              onClick={() => {
                setViewMode("list");
                localStorage.setItem("kvtidal_files_view_mode", "list");
              }}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                viewMode === "list"
                  ? "bg-primary text-black font-bold shadow-sm"
                  : "text-textSecondary hover:text-white"
              }`}
              title="Classic Table List View"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              onClick={() => {
                setViewMode("split");
                localStorage.setItem("kvtidal_files_view_mode", "split");
                if (!paneBPath) {
                  loadPaneBDirectory(currentPath);
                }
              }}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                viewMode === "split"
                  ? "bg-primary text-black font-bold shadow-sm"
                  : "text-textSecondary hover:text-white"
              }`}
              title="Dual-Pane Split View (Total Commander / ForkLift style)"
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Split</span>
            </button>
          </div>
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

      {viewMode === "columns" ? (
        /* macOS Finder / Path Finder Miller Columns Browser */
        <div
          ref={columnsContainerRef}
          className="flex-1 min-h-[620px] flex overflow-x-auto border border-border rounded-xl bg-surface shadow-2xl scrollbar-thin divide-x divide-border/70 select-none"
        >
          {columnHistory.map((col, colIdx) => (
            <div
              key={col.path + colIdx}
              className="w-72 flex-shrink-0 flex flex-col h-[650px] bg-card/10 overflow-hidden"
            >
              {/* Column Header */}
              <div className="p-2.5 border-b border-border/70 bg-card/50 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-1.5 truncate max-w-[190px]">
                  <Folder className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                  <span className="font-bold text-textPrimary truncate" title={col.title}>
                    {col.title}
                  </span>
                </div>
                <span className="text-[10px] text-textSecondary px-1.5 py-0.5 rounded bg-card border border-border">
                  {col.entries.length}
                </span>
              </div>

              {/* Column Entries List */}
              <div
                className="flex-1 overflow-y-auto p-1 space-y-0.5 scrollbar-thin"
                onContextMenu={(e) => handleContextMenu(e, "background", undefined, "left")}
              >
                {col.loading ? (
                  <div className="p-8 text-center text-textSecondary text-xs flex flex-col items-center justify-center space-y-2">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span>Reading folder...</span>
                  </div>
                ) : col.entries.length === 0 ? (
                  <div className="p-8 text-center text-textSecondary text-xs">Directory is empty</div>
                ) : (
                  col.entries
                    .filter((item) => {
                      if (!searchQuery.trim()) return true;
                      const q = searchQuery.toLowerCase();
                      return (
                        item.name.toLowerCase().includes(q) ||
                        (item.title && item.title.toLowerCase().includes(q)) ||
                        (item.artist && item.artist.toLowerCase().includes(q))
                      );
                    })
                    .map((item) => {
                      const isSelected = col.selectedPath === item.path;
                      const isAudio = !item.is_dir && item.format;
                      const isCutItem =
                        clipboard?.action === "cut" && clipboard.paths.includes(item.path);
                      return (
                        <div
                          key={item.path}
                          onClick={() => handleColumnItemClick(colIdx, item)}
                          onContextMenu={(e) =>
                            handleContextMenu(e, item.is_dir ? "folder" : "file", item, "left")
                          }
                          className={`group flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-all ${
                            isCutItem
                              ? "opacity-40 border border-dashed border-amber-400/80 bg-amber-500/5"
                              : ""
                          } ${
                            isSelected
                              ? "bg-primary text-black font-semibold shadow-sm"
                              : "text-textPrimary hover:bg-card hover:text-white"
                          }`}
                        >
                          <div className="flex items-center space-x-2 truncate min-w-0">
                            {item.is_dir ? (
                              <Folder
                                className={`w-4 h-4 flex-shrink-0 ${
                                  isSelected ? "text-black fill-current" : "text-sky-400"
                                }`}
                              />
                            ) : isAudio ? (
                              <FileAudio
                                className={`w-4 h-4 flex-shrink-0 ${
                                  isSelected ? "text-black fill-current" : "text-emerald-400"
                                }`}
                              />
                            ) : item.name.toLowerCase().endsWith(".jpg") ||
                              item.name.toLowerCase().endsWith(".jpeg") ||
                              item.name.toLowerCase().endsWith(".png") ? (
                              <ImageIcon
                                className={`w-4 h-4 flex-shrink-0 ${
                                  isSelected ? "text-black fill-current" : "text-amber-400"
                                }`}
                              />
                            ) : (
                              <File className="w-4 h-4 flex-shrink-0 text-textSecondary" />
                            )}
                            <div className="truncate min-w-0">
                              <div className="truncate font-mono leading-tight" title={item.name}>
                                {item.title || item.name}
                              </div>
                              {isAudio && (
                                <div
                                  className={`text-[10px] truncate ${
                                    isSelected ? "text-black/80 font-normal" : "text-textSecondary"
                                  }`}
                                >
                                  {item.artist ? `${item.artist} • ` : ""}
                                  {formatSize(item.size_bytes)}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                            {item.is_dir ? (
                              <ChevronRight
                                className={`w-3.5 h-3.5 ${
                                  isSelected ? "text-black" : "text-textSecondary group-hover:text-white"
                                }`}
                              />
                            ) : isAudio && item.dr_score ? (
                              <span
                                className={`text-[9px] font-mono px-1 py-0.2 rounded font-bold ${
                                  isSelected
                                    ? "bg-black text-emerald-400"
                                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                                }`}
                              >
                                DR{item.dr_score}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          ))}

          {/* QuickLook Audio Inspector Pane */}
          {quickLookFile && (
            <div className="w-80 flex-shrink-0 flex flex-col h-[650px] bg-card/60 border-l border-primary/20 p-5 overflow-y-auto space-y-4 animate-in fade-in duration-200 shadow-2xl">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center space-x-2">
                  <Disc className="w-4 h-4 text-primary animate-spin" />
                  <span className="text-xs font-bold uppercase tracking-wider text-textSecondary">
                    Audio QuickLook
                  </span>
                </div>
                <button
                  onClick={() => setQuickLookFile(null)}
                  className="p-1 rounded-md hover:bg-card text-textSecondary hover:text-white cursor-pointer"
                  title="Close Inspector"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Large Vinyl Artwork Preview with Real Cover & Lightbox */}
              <div
                onClick={() => setZoomCoverUrl(`/api/fs/cover?path=${encodeURIComponent(quickLookFile.path)}`)}
                className="relative w-full aspect-square rounded-2xl bg-black border border-primary/30 overflow-hidden group shadow-xl cursor-zoom-in flex items-center justify-center"
                title="Click to view full resolution cover"
              >
                {/* Real album cover from disk / embedded tags */}
                <img
                  src={`/api/fs/cover?path=${encodeURIComponent(quickLookFile.path)}`}
                  alt={quickLookFile.title || quickLookFile.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                    const fb = document.getElementById("quicklook-vinyl-fallback");
                    if (fb) fb.style.display = "flex";
                  }}
                />

                {/* Stylized Vinyl Fallback */}
                <div
                  id="quicklook-vinyl-fallback"
                  style={{ display: "none" }}
                  className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/20 via-card to-emerald-900/20"
                >
                  <div className="w-24 h-24 rounded-full border-4 border-dashed border-primary/40 flex items-center justify-center bg-black/40 shadow-inner group-hover:scale-105 transition-transform duration-300">
                    <Music className="w-10 h-10 text-primary" />
                  </div>
                </div>

                {/* Overlaid Badges */}
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-white/20 text-[10px] text-white font-mono shadow-md">
                    <ZoomIn className="w-3 h-3 text-primary" />
                    <span>Zoom</span>
                  </span>
                </div>

                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                  <span className="px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-primary/30 text-[10px] font-mono font-bold text-emerald-400">
                    {quickLookFile.format || "FLAC"} • {quickLookFile.bit_depth || 16}b/
                    {(quickLookFile.sample_rate || 44100) >= 1000000
                      ? `${((quickLookFile.sample_rate || 2822400) / 1000000).toFixed(2)}MHz`
                      : `${((quickLookFile.sample_rate || 44100) / 1000).toFixed(1)}kHz`}
                  </span>
                  {quickLookFile.hires && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/30 border border-amber-500/40 text-[9px] font-bold text-amber-300">
                      HI-RES
                    </span>
                  )}
                </div>
              </div>

              {/* Track Info */}
              <div className="space-y-1">
                <h3
                  className="text-base font-bold text-white leading-tight truncate"
                  title={quickLookFile.title || quickLookFile.name}
                >
                  {quickLookFile.title || quickLookFile.name.replace(/\.[^/.]+$/, "")}
                </h3>
                <p className="text-xs text-primary font-semibold truncate">
                  {quickLookFile.artist || "Unknown Artist"}
                </p>
                <p className="text-xs text-textSecondary truncate">
                  {quickLookFile.album || "Unknown Album"}
                </p>
              </div>

              {/* Audiophile Dynamic Range Rating */}
              <div className="p-3 rounded-xl bg-card border border-border space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-textSecondary font-mono">Dynamic Range (DR):</span>
                  <span
                    className={`font-bold font-mono px-2 py-0.5 rounded text-[11px] ${
                      (quickLookFile.dr_score || 12) >= 12
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                        : (quickLookFile.dr_score || 12) >= 9
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                        : "bg-red-500/20 text-red-400 border border-red-500/40"
                    }`}
                  >
                    DR{quickLookFile.dr_score || 12}
                  </span>
                </div>
                <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      (quickLookFile.dr_score || 12) >= 12
                        ? "bg-emerald-400"
                        : (quickLookFile.dr_score || 12) >= 9
                        ? "bg-amber-400"
                        : "bg-red-400"
                    }`}
                    style={{ width: `${Math.min(100, ((quickLookFile.dr_score || 12) / 20) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Technical Specs Grid (6 Audiophile Dimensions) */}
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="p-2 rounded-lg bg-card/60 border border-border">
                  <div className="text-textSecondary text-[10px]">Format & Codec</div>
                  <div className="text-white font-semibold">{quickLookFile.format || "WAV"} ({quickLookFile.bit_depth || 16}-Bit)</div>
                </div>
                <div className="p-2 rounded-lg bg-card/60 border border-border">
                  <div className="text-textSecondary text-[10px]">Sample Rate</div>
                  <div className="text-white font-semibold">
                    {(quickLookFile.sample_rate || 44100) >= 1000000
                      ? `${((quickLookFile.sample_rate || 2822400) / 1000000).toFixed(2)} MHz`
                      : `${((quickLookFile.sample_rate || 44100) / 1000).toFixed(1)} kHz`}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-card/60 border border-border">
                  <div className="text-textSecondary text-[10px]">Duration</div>
                  <div className="text-white font-semibold">{formatDuration(quickLookFile.duration)}</div>
                </div>
                <div className="p-2 rounded-lg bg-card/60 border border-border">
                  <div className="text-textSecondary text-[10px]">File Size</div>
                  <div className="text-white font-semibold">{formatSize(quickLookFile.size_bytes)}</div>
                </div>
                <div className="p-2 rounded-lg bg-card/60 border border-border">
                  <div className="text-textSecondary text-[10px]">Channels</div>
                  <div className="text-white font-semibold">{quickLookFile.channels || 2} ch (Stereo)</div>
                </div>
                <div className="p-2 rounded-lg bg-card/60 border border-border">
                  <div className="text-textSecondary text-[10px]">Track #</div>
                  <div className="text-white font-semibold">#{quickLookFile.track_number || 1}</div>
                </div>
              </div>

              {/* Physical File Path with 1-Click Copy */}
              <div className="p-2.5 rounded-xl bg-card border border-border/80 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-mono text-textSecondary tracking-wider">Physical Path</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(quickLookFile.path);
                      setPathCopied(true);
                      setTimeout(() => setPathCopied(false), 2000);
                      showNotification("Path copied to clipboard");
                    }}
                    className="text-[10px] font-mono text-primary hover:underline flex items-center space-x-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{pathCopied ? "Copied!" : "Copy"}</span>
                  </button>
                </div>
                <div className="text-[11px] font-mono text-textSecondary break-all select-all leading-tight bg-black/40 p-2 rounded-lg border border-border/40">
                  {quickLookFile.path}
                </div>
              </div>

              {/* Quick Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => handlePlayDirect(quickLookFile)}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-primary text-black font-bold text-xs shadow-lg hover:bg-primary/90 transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Play Bit-Perfect</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      const track = getAudioTracks([quickLookFile]);
                      if (track.length > 0) addAllToQueue(track);
                      showNotification("Added track to queue");
                    }}
                    className="flex items-center justify-center space-x-1.5 py-2 rounded-lg bg-card hover:bg-cardHover border border-border text-xs font-medium text-textPrimary transition-colors cursor-pointer"
                  >
                    <ListPlus className="w-3.5 h-3.5" />
                    <span>Queue</span>
                  </button>

                  <a
                    href={`/api/fs/download?path=${encodeURIComponent(quickLookFile.path)}`}
                    download
                    className="flex items-center justify-center space-x-1.5 py-2 rounded-lg bg-card hover:bg-cardHover border border-border text-xs font-medium text-textPrimary transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-primary" />
                    <span>Download</span>
                  </a>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => openTagEditor(quickLookFile)}
                    className="flex items-center justify-center space-x-1.5 py-2 rounded-lg bg-card hover:bg-cardHover border border-border text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit Tags</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedPaths(new Set([quickLookFile.path]));
                      setOrganizeModalOpen(true);
                    }}
                    className="flex items-center justify-center space-x-1.5 py-2 rounded-lg bg-card hover:bg-cardHover border border-border text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
                  >
                    <FolderTree className="w-3.5 h-3.5" />
                    <span>Organize</span>
                  </button>
                </div>

                <button
                  onClick={() => setInspectEntry(quickLookFile)}
                  className="w-full flex items-center justify-center space-x-1.5 py-1.5 text-[11px] font-mono text-textSecondary hover:text-primary transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Inspect Technical Vorbis Headers</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : viewMode === "list" ? (
        /* Entries List Table */
        <div
          className="bg-surface border border-border rounded-xl overflow-hidden shadow-lg"
          onContextMenu={(e) => handleContextMenu(e, "background", undefined, "left")}
        >
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
              const isCutItem =
                clipboard?.action === "cut" && clipboard.paths.includes(entry.path);
              return (
                <div
                  key={entry.path}
                  onContextMenu={(e) =>
                    handleContextMenu(e, entry.is_dir ? "folder" : "file", entry, "left")
                  }
                  className={`flex items-center justify-between p-3 hover:bg-card/50 transition-colors text-sm group ${
                    isCutItem
                      ? "opacity-40 border border-dashed border-amber-400/80 bg-amber-500/5"
                      : ""
                  } ${
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
                                ? "text-textPrimary hover:text-primary font-medium"
                                : "text-textPrimary"
                            }`}
                          >
                            {entry.name}
                          </span>
                        </div>

                        <div className="flex items-center space-x-1.5 mt-0.5 truncate text-[11px] text-textSecondary">
                          {/* Hi-Res Badges inside subtitle */}
                          {entry.format?.toLowerCase() === "dsf" || entry.format?.toLowerCase() === "dff" ? (
                            <span className="px-1.5 py-0.2 text-[8px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded flex-shrink-0 flex items-center space-x-0.5 shadow-sm">
                              <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                              <span>DSD DIRECT</span>
                            </span>
                          ) : entry.hires ? (
                            <span className="px-1.5 py-0.2 text-[8px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded flex-shrink-0 flex items-center space-x-0.5 shadow-sm">
                              <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                              <span>
                                {entry.bit_depth || 24}B/
                                {entry.sample_rate ? Math.round(entry.sample_rate / 1000) : 96}k{" "}
                                {entry.format || "FLAC"}
                              </span>
                            </span>
                          ) : entry.format === "FLAC" || entry.format === "WAV" || entry.format === "ALAC" ? (
                            <span className="px-1.5 py-0.2 text-[8px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded flex-shrink-0 shadow-sm">
                              {entry.bit_depth || 16}B/
                              {entry.sample_rate ? (entry.sample_rate / 1000).toFixed(1) : "44.1"}k CD
                            </span>
                          ) : entry.format ? (
                            <span className="px-1.5 py-0.2 text-[8px] font-mono font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded flex-shrink-0 shadow-sm">
                              {entry.format}
                            </span>
                          ) : null}

                          {entry.artist && entry.album ? (
                            <span className="truncate">
                              {entry.artist} • {entry.album}
                            </span>
                          ) : entry.artist ? (
                            <span className="truncate">{entry.artist}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Date, Size & Action Buttons */}
                  <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0 font-mono text-xs text-textSecondary">
                    {/* Date Modified */}
                    <span className="hidden md:inline text-[11px] text-textSecondary/70 w-24 text-right">
                      {formatDate(entry.modified_at)}
                    </span>

                    {/* Size */}
                    <span className="w-14 sm:w-16 text-right text-[11px] sm:text-xs">
                      {entry.is_dir ? "Folder" : formatSize(entry.size_bytes)}
                    </span>

                    {/* Desktop Actions Menu (Hidden on Mobile) */}
                    <div className="hidden md:flex items-center space-x-1">
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

                    {/* Mobile More Options Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMobileActionEntry(entry);
                        setMobileActionMenuOpen(true);
                      }}
                      className="md:hidden p-1.5 -mr-1 rounded-lg text-textSecondary hover:text-white active:bg-cardHover transition-colors cursor-pointer"
                      title="File actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    ) : (
      /* Dual-Pane Split View (Total Commander / ForkLift Style) */
      <div className="space-y-4">
        {/* Split Mode Central Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-border/80 p-3 rounded-xl shadow-lg text-xs font-mono">
          <div className="flex items-center space-x-2">
            <span className="text-textSecondary">Active Focus:</span>
            <button
              onClick={() => setActivePane(activePane === "left" ? "right" : "left")}
              className="px-2.5 py-1 rounded-lg font-bold bg-primary/15 text-primary border border-primary/40 flex items-center space-x-1.5 hover:bg-primary/25 transition-colors cursor-pointer"
              title="Click to toggle active pane focus (or press Tab)"
            >
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span>{activePane === "left" ? "Pane A (Left)" : "Pane B (Right)"}</span>
            </button>
          </div>

          {/* Cross-Pane Transfer Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleCrossPaneTransfer("copy", "toRight")}
              disabled={selectedPaths.size === 0}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-card hover:bg-cardHover border border-border text-sky-300 disabled:opacity-30 transition-colors cursor-pointer"
              title="Copy selected items from Left to Right Pane (F5)"
            >
              <span>Copy to Right</span>
              <ArrowRightLeft className="w-3.5 h-3.5 text-sky-400" />
            </button>
            <button
              onClick={() => handleCrossPaneTransfer("cut", "toRight")}
              disabled={selectedPaths.size === 0}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-card hover:bg-cardHover border border-border text-amber-300 disabled:opacity-30 transition-colors cursor-pointer"
              title="Move selected items from Left to Right Pane (F6)"
            >
              <span>Move to Right</span>
              <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
            </button>

            <div className="h-4 w-[1px] bg-border mx-1 hidden sm:block" />

            <button
              onClick={() => handleCrossPaneTransfer("copy", "toLeft")}
              disabled={paneBSelectedPaths.size === 0}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-card hover:bg-cardHover border border-border text-sky-300 disabled:opacity-30 transition-colors cursor-pointer"
              title="Copy selected items from Right to Left Pane"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-sky-400 rotate-180" />
              <span>Copy to Left</span>
            </button>
            <button
              onClick={() => handleCrossPaneTransfer("cut", "toLeft")}
              disabled={paneBSelectedPaths.size === 0}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-card hover:bg-cardHover border border-border text-amber-300 disabled:opacity-30 transition-colors cursor-pointer"
              title="Move selected items from Right to Left Pane"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400 rotate-180" />
              <span>Move to Left</span>
            </button>

            <div className="h-4 w-[1px] bg-border mx-1 hidden sm:block" />

            <button
              onClick={() => {
                if (activePane === "left") {
                  loadPaneBDirectory(currentPath);
                } else {
                  loadDirectory(paneBPath);
                }
                showNotification("Synchronized both panes to the same folder");
              }}
              className="px-2.5 py-1.5 rounded-lg bg-card hover:bg-cardHover text-textSecondary hover:text-white border border-border transition-colors cursor-pointer"
              title="Sync both panes to the active folder"
            >
              Sync Panes
            </button>
          </div>
        </div>

        {/* Dual Panes Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 select-none">
          {/* ======================= PANE A (LEFT) ======================= */}
          <div
            onClick={() => setActivePane("left")}
            className={`flex flex-col bg-surface border rounded-xl overflow-hidden shadow-xl transition-all min-h-[580px] ${
              activePane === "left"
                ? "border-primary ring-1 ring-primary/40 shadow-primary/5"
                : "border-border opacity-90 hover:opacity-100"
            }`}
            onContextMenu={(e) => handleContextMenu(e, "background", undefined, "left")}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const dataStr = e.dataTransfer.getData("application/json");
              if (dataStr) {
                try {
                  const data = JSON.parse(dataStr);
                  if (data.paths && data.paths.length > 0) {
                    fetch("/api/fs/batch-transfer", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: e.altKey ? "copy" : "cut",
                        paths: data.paths,
                        destination_dir: currentPath,
                        conflict_resolution: "rename",
                      }),
                    }).then((res) => {
                      if (res.ok) {
                        showNotification(`Transferred ${data.paths.length} items to Left Pane`);
                        loadDirectory(currentPath);
                        loadPaneBDirectory(paneBPath);
                      }
                    });
                  }
                } catch (_) {}
              }
            }}
          >
            {/* Left Pane Header */}
            <div className="p-3 border-b border-border bg-card/60 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/20 text-primary border border-primary/30">
                  PANE A
                </span>
                <span className="text-xs font-bold text-textPrimary truncate max-w-[140px]" title={currentPath}>
                  {currentPath.split("/").filter(Boolean).pop() || "Root"}
                </span>
                <span className="text-[10px] font-mono text-textSecondary">({filteredEntries.length})</span>
              </div>

              {/* Path Breadcrumbs for Left Pane */}
              <div className="flex items-center space-x-1 text-[11px] font-mono overflow-x-auto max-w-[280px] scrollbar-none">
                {parentPath && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      loadDirectory(parentPath);
                    }}
                    className="p-1 rounded bg-card hover:text-primary transition-colors cursor-pointer"
                    title="Parent folder"
                  >
                    <ArrowLeft className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    loadDirectory();
                  }}
                  className="px-1.5 py-0.5 rounded bg-card hover:bg-cardHover text-primary transition-colors cursor-pointer"
                >
                  Root
                </button>
                {breadcrumbs.slice(-2).map((crumb) => (
                  <React.Fragment key={crumb.path}>
                    <span className="text-textSecondary/40">/</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        loadDirectory(crumb.path);
                      }}
                      className="px-1 py-0.5 rounded hover:bg-card text-textSecondary hover:text-white truncate max-w-[90px]"
                    >
                      {crumb.label}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              {/* Reload button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  loadDirectory(currentPath);
                }}
                className="p-1.5 rounded hover:bg-card text-textSecondary hover:text-white transition-colors cursor-pointer"
                title="Reload Pane A"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Left Pane Search Bar */}
            <div className="p-2 border-b border-border/60 bg-card/20 flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="w-3 h-3 text-textSecondary absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter Left Pane..."
                  className="w-full bg-card border border-border/80 rounded-md pl-7 pr-6 py-1 text-xs text-textPrimary placeholder:text-textSecondary/50 font-mono focus:outline-none focus:border-primary"
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
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSelectAll();
                }}
                className="p-1.5 rounded hover:bg-card text-textSecondary hover:text-primary transition-colors cursor-pointer"
                title="Select / Deselect all in Left Pane"
              >
                {selectedPaths.size === filteredEntries.length && filteredEntries.length > 0 ? (
                  <CheckSquare className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Left Pane Items List */}
            <div className="flex-1 overflow-y-auto max-h-[560px] divide-y divide-border/60 scrollbar-thin">
              {loading ? (
                <div className="p-12 text-center text-textSecondary text-xs flex flex-col items-center justify-center space-y-2">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span>Loading Left Pane...</span>
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="p-12 text-center text-textSecondary text-xs">Directory is empty</div>
              ) : (
                filteredEntries.map((entry) => {
                  const isSelected = selectedPaths.has(entry.path);
                  const isCutItem =
                    clipboard?.action === "cut" && clipboard.paths.includes(entry.path);
                  return (
                    <div
                      key={entry.path}
                      draggable={true}
                      onDragStart={(e) => {
                        const dragPaths = isSelected ? Array.from(selectedPaths) : [entry.path];
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify({ paths: dragPaths, sourcePane: "left" })
                        );
                      }}
                      onClick={() => {
                        setActivePane("left");
                        setSelectedPaths(new Set([entry.path]));
                      }}
                      onDoubleClick={() => {
                        if (entry.is_dir) {
                          loadDirectory(entry.path);
                        } else if (entry.format) {
                          handlePlayDirect(entry);
                        }
                      }}
                      onContextMenu={(e) =>
                        handleContextMenu(e, entry.is_dir ? "folder" : "file", entry, "left")
                      }
                      className={`flex items-center justify-between px-3 py-2 text-xs transition-colors cursor-pointer group ${
                        isCutItem
                          ? "opacity-40 border border-dashed border-amber-400/80 bg-amber-500/5"
                          : ""
                      } ${
                        isSelected
                          ? "bg-primary/15 text-white font-medium"
                          : "text-textPrimary hover:bg-card/60"
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 truncate min-w-0 flex-1 pr-2">
                        <button
                          onClick={(e) => toggleSelectOne(entry.path, e)}
                          className="text-textSecondary hover:text-primary transition-colors cursor-pointer flex-shrink-0"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <Square className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100" />
                          )}
                        </button>

                        {entry.is_dir ? (
                          <Folder className="w-4 h-4 text-sky-400 flex-shrink-0" />
                        ) : entry.format ? (
                          <FileAudio className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <File className="w-4 h-4 text-textSecondary flex-shrink-0" />
                        )}

                        <div className="truncate min-w-0 flex-1">
                          <span className="truncate block font-mono">
                            {entry.title || entry.name}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 flex-shrink-0 font-mono text-[11px] text-textSecondary">
                        {entry.dr_score ? (
                          <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            DR{entry.dr_score}
                          </span>
                        ) : null}
                        <span>{entry.is_dir ? "Dir" : formatSize(entry.size_bytes)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ======================= PANE B (RIGHT) ======================= */}
          <div
            onClick={() => setActivePane("right")}
            className={`flex flex-col bg-surface border rounded-xl overflow-hidden shadow-xl transition-all min-h-[580px] ${
              activePane === "right"
                ? "border-primary ring-1 ring-primary/40 shadow-primary/5"
                : "border-border opacity-90 hover:opacity-100"
            }`}
            onContextMenu={(e) => handleContextMenu(e, "background", undefined, "right")}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const dataStr = e.dataTransfer.getData("application/json");
              if (dataStr) {
                try {
                  const data = JSON.parse(dataStr);
                  if (data.paths && data.paths.length > 0) {
                    fetch("/api/fs/batch-transfer", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: e.altKey ? "copy" : "cut",
                        paths: data.paths,
                        destination_dir: paneBPath,
                        conflict_resolution: "rename",
                      }),
                    }).then((res) => {
                      if (res.ok) {
                        showNotification(`Transferred ${data.paths.length} items to Right Pane`);
                        loadDirectory(currentPath);
                        loadPaneBDirectory(paneBPath);
                      }
                    });
                  }
                } catch (_) {}
              }
            }}
          >
            {/* Right Pane Header */}
            <div className="p-3 border-b border-border bg-card/60 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  PANE B
                </span>
                <span className="text-xs font-bold text-textPrimary truncate max-w-[140px]" title={paneBPath}>
                  {paneBPath.split("/").filter(Boolean).pop() || "Root"}
                </span>
                <span className="text-[10px] font-mono text-textSecondary">({paneBFilteredEntries.length})</span>
              </div>

              {/* Path Breadcrumbs for Right Pane */}
              <div className="flex items-center space-x-1 text-[11px] font-mono overflow-x-auto max-w-[280px] scrollbar-none">
                {paneBParentPath && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      loadPaneBDirectory(paneBParentPath);
                    }}
                    className="p-1 rounded bg-card hover:text-primary transition-colors cursor-pointer"
                    title="Parent folder"
                  >
                    <ArrowLeft className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    loadPaneBDirectory();
                  }}
                  className="px-1.5 py-0.5 rounded bg-card hover:bg-cardHover text-primary transition-colors cursor-pointer"
                >
                  Root
                </button>
                {paneBBreadcrumbs.slice(-2).map((crumb) => (
                  <React.Fragment key={crumb.path}>
                    <span className="text-textSecondary/40">/</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        loadPaneBDirectory(crumb.path);
                      }}
                      className="px-1 py-0.5 rounded hover:bg-card text-textSecondary hover:text-white truncate max-w-[90px]"
                    >
                      {crumb.label}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              {/* Reload button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  loadPaneBDirectory(paneBPath);
                }}
                className="p-1.5 rounded hover:bg-card text-textSecondary hover:text-white transition-colors cursor-pointer"
                title="Reload Pane B"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Right Pane Search Bar */}
            <div className="p-2 border-b border-border/60 bg-card/20 flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="w-3 h-3 text-textSecondary absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={paneBSearchQuery}
                  onChange={(e) => setPaneBSearchQuery(e.target.value)}
                  placeholder="Filter Right Pane..."
                  className="w-full bg-card border border-border/80 rounded-md pl-7 pr-6 py-1 text-xs text-textPrimary placeholder:text-textSecondary/50 font-mono focus:outline-none focus:border-primary"
                />
                {paneBSearchQuery && (
                  <button
                    onClick={() => setPaneBSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-textSecondary hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePaneBSelectAll();
                }}
                className="p-1.5 rounded hover:bg-card text-textSecondary hover:text-primary transition-colors cursor-pointer"
                title="Select / Deselect all in Right Pane"
              >
                {paneBSelectedPaths.size === paneBFilteredEntries.length && paneBFilteredEntries.length > 0 ? (
                  <CheckSquare className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Right Pane Items List */}
            <div className="flex-1 overflow-y-auto max-h-[560px] divide-y divide-border/60 scrollbar-thin">
              {paneBLoading ? (
                <div className="p-12 text-center text-textSecondary text-xs flex flex-col items-center justify-center space-y-2">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span>Loading Right Pane...</span>
                </div>
              ) : paneBFilteredEntries.length === 0 ? (
                <div className="p-12 text-center text-textSecondary text-xs">Directory is empty</div>
              ) : (
                paneBFilteredEntries.map((entry) => {
                  const isSelected = paneBSelectedPaths.has(entry.path);
                  const isCutItem =
                    clipboard?.action === "cut" && clipboard.paths.includes(entry.path);
                  return (
                    <div
                      key={entry.path}
                      draggable={true}
                      onDragStart={(e) => {
                        const dragPaths = isSelected ? Array.from(paneBSelectedPaths) : [entry.path];
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify({ paths: dragPaths, sourcePane: "right" })
                        );
                      }}
                      onClick={() => {
                        setActivePane("right");
                        setPaneBSelectedPaths(new Set([entry.path]));
                      }}
                      onDoubleClick={() => {
                        if (entry.is_dir) {
                          loadPaneBDirectory(entry.path);
                        } else if (entry.format) {
                          handlePlayDirect(entry);
                        }
                      }}
                      onContextMenu={(e) =>
                        handleContextMenu(e, entry.is_dir ? "folder" : "file", entry, "right")
                      }
                      className={`flex items-center justify-between px-3 py-2 text-xs transition-colors cursor-pointer group ${
                        isCutItem
                          ? "opacity-40 border border-dashed border-amber-400/80 bg-amber-500/5"
                          : ""
                      } ${
                        isSelected
                          ? "bg-primary/15 text-white font-medium"
                          : "text-textPrimary hover:bg-card/60"
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 truncate min-w-0 flex-1 pr-2">
                        <button
                          onClick={(e) => togglePaneBSelectOne(entry.path, e)}
                          className="text-textSecondary hover:text-primary transition-colors cursor-pointer flex-shrink-0"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <Square className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100" />
                          )}
                        </button>

                        {entry.is_dir ? (
                          <Folder className="w-4 h-4 text-sky-400 flex-shrink-0" />
                        ) : entry.format ? (
                          <FileAudio className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <File className="w-4 h-4 text-textSecondary flex-shrink-0" />
                        )}

                        <div className="truncate min-w-0 flex-1">
                          <span className="truncate block font-mono">
                            {entry.title || entry.name}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 flex-shrink-0 font-mono text-[11px] text-textSecondary">
                        {entry.dr_score ? (
                          <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            DR{entry.dr_score}
                          </span>
                        ) : null}
                        <span>{entry.is_dir ? "Dir" : formatSize(entry.size_bytes)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    )}

      {/* Floating Multi-Select Action Bar */}
      {selectedPaths.size > 0 && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-50 bg-surface/95 backdrop-blur-md border border-primary/40 rounded-2xl shadow-2xl px-3.5 py-2 md:px-5 md:py-3 flex items-center space-x-2 md:space-x-4 max-w-[calc(100vw-1.5rem)] overflow-x-auto no-scrollbar animate-in slide-in-from-bottom-5 transition-all duration-200 ${
            Boolean(currentTrack)
              ? clipboard
                ? "bottom-[180px] md:bottom-[152px]"
                : "bottom-[128px] md:bottom-[92px]"
              : clipboard
              ? "bottom-[132px] md:bottom-[72px]"
              : "bottom-20 md:bottom-6"
          }`}
        >
          <div className="text-xs font-mono flex-shrink-0">
            <span className="text-primary font-bold">{selectedPaths.size}</span>
            <span className="text-textSecondary"> selected ({formatSize(selectedTotalBytes)})</span>
          </div>

          <div className="h-4 w-[1px] bg-border flex-shrink-0" />

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
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-primary text-black text-xs font-bold transition-transform hover:scale-105 cursor-pointer flex-shrink-0"
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
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-card hover:bg-cardHover text-textPrimary text-xs font-medium border border-border cursor-pointer flex-shrink-0"
          >
            <ListPlus className="w-3.5 h-3.5" />
            <span>Queue</span>
          </button>

          {/* Cut Selected */}
          <button
            onClick={() =>
              handleCut(activePane === "left" ? selectedEntries : paneBSelectedEntries)
            }
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-card hover:bg-cardHover text-amber-300 border border-amber-500/30 text-xs font-medium cursor-pointer flex-shrink-0"
            title="Cut selected items (Ctrl+X)"
          >
            <Scissors className="w-3.5 h-3.5 text-amber-400" />
            <span>Cut</span>
          </button>

          {/* Copy Selected */}
          <button
            onClick={() =>
              handleCopy(activePane === "left" ? selectedEntries : paneBSelectedEntries)
            }
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-card hover:bg-cardHover text-sky-300 border border-sky-500/30 text-xs font-medium cursor-pointer flex-shrink-0"
            title="Copy selected items (Ctrl+C)"
          >
            <Copy className="w-3.5 h-3.5 text-sky-400" />
            <span>Copy</span>
          </button>

          {viewMode === "split" && (
            <>
              <button
                onClick={() =>
                  handleCrossPaneTransfer(
                    "copy",
                    activePane === "left" ? "toRight" : "toLeft"
                  )
                }
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-card hover:bg-cardHover text-sky-300 border border-sky-500/30 text-xs font-medium cursor-pointer flex-shrink-0"
                title={`Copy to ${activePane === "left" ? "Right" : "Left"} Pane`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-sky-400" />
                <span>To {activePane === "left" ? "Right" : "Left"}</span>
              </button>
              <button
                onClick={() =>
                  handleCrossPaneTransfer(
                    "cut",
                    activePane === "left" ? "toRight" : "toLeft"
                  )
                }
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-card hover:bg-cardHover text-amber-300 border border-amber-500/30 text-xs font-medium cursor-pointer flex-shrink-0"
                title={`Move to ${activePane === "left" ? "Right" : "Left"} Pane`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
                <span>Move</span>
              </button>
            </>
          )}

          {/* Batch Delete */}
          <button
            onClick={() => setDeleteConfirmPaths(Array.from(selectedPaths))}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xs font-semibold cursor-pointer flex-shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>

          {/* Deselect All */}
          <button
            onClick={() => {
              if (activePane === "left") setSelectedPaths(new Set());
              else setPaneBSelectedPaths(new Set());
            }}
            className="p-1 rounded-lg hover:bg-card text-textSecondary hover:text-white flex-shrink-0"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Floating Clipboard Dock */}
      {clipboard && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-50 bg-surface/95 backdrop-blur-xl border border-primary/50 px-4 py-2 rounded-2xl shadow-2xl flex items-center space-x-3 text-xs font-mono max-w-[calc(100vw-1.5rem)] overflow-x-auto no-scrollbar animate-in slide-in-from-bottom-3 transition-all duration-200 ${
            Boolean(currentTrack)
              ? "bottom-[128px] md:bottom-[92px]"
              : "bottom-20 md:bottom-6"
          }`}
        >
          <div className="flex items-center space-x-2">
            {clipboard.action === "cut" ? (
              <Scissors className="w-4 h-4 text-amber-400 animate-pulse" />
            ) : (
              <Copy className="w-4 h-4 text-sky-400 animate-pulse" />
            )}
            <span>
              <span className="font-bold text-primary capitalize">{clipboard.action}</span>:{" "}
              <span className="text-white font-semibold">
                {clipboard.paths.length} item{clipboard.paths.length > 1 ? "s" : ""}
              </span>
            </span>
          </div>

          <div className="h-4 w-[1px] bg-border" />

          <button
            onClick={() => handlePaste()}
            className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-primary hover:bg-primary/90 text-black font-bold transition-all cursor-pointer shadow-md"
            title="Paste items into currently active folder (Ctrl+V)"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span>Paste Here</span>
          </button>

          <button
            onClick={() => setClipboard(null)}
            className="p-1 rounded-lg hover:bg-card text-textSecondary hover:text-white transition-colors cursor-pointer"
            title="Clear clipboard (Esc)"
          >
            <X className="w-3.5 h-3.5" />
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

      {/* Audio Metadata Tag Editor Modal */}
      {tagEditFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="bg-surface border border-primary/40 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                <Pencil className="w-4 h-4 text-primary" />
                <h3 className="text-base font-bold text-textPrimary">Edit Audio Metadata Tags</h3>
              </div>
              <button
                onClick={() => setTagEditFile(null)}
                className="p-1 rounded text-textSecondary hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-textSecondary block mb-1 font-mono">Title</label>
                <input
                  type="text"
                  value={tagForm.title}
                  onChange={(e) => setTagForm({ ...tagForm, title: e.target.value })}
                  className="w-full bg-card border border-border rounded-xl p-2.5 text-textPrimary font-mono focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-textSecondary block mb-1 font-mono">Artist</label>
                <input
                  type="text"
                  value={tagForm.artist}
                  onChange={(e) => setTagForm({ ...tagForm, artist: e.target.value })}
                  className="w-full bg-card border border-border rounded-xl p-2.5 text-textPrimary font-mono focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-textSecondary block mb-1 font-mono">Album</label>
                <input
                  type="text"
                  value={tagForm.album}
                  onChange={(e) => setTagForm({ ...tagForm, album: e.target.value })}
                  className="w-full bg-card border border-border rounded-xl p-2.5 text-textPrimary font-mono focus:outline-none focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-textSecondary block mb-1 font-mono">Year</label>
                  <input
                    type="number"
                    placeholder="e.g. 2024"
                    value={tagForm.year}
                    onChange={(e) => setTagForm({ ...tagForm, year: e.target.value })}
                    className="w-full bg-card border border-border rounded-xl p-2.5 text-textPrimary font-mono focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-textSecondary block mb-1 font-mono">Track #</label>
                  <input
                    type="number"
                    placeholder="e.g. 1"
                    value={tagForm.track_number}
                    onChange={(e) => setTagForm({ ...tagForm, track_number: e.target.value })}
                    className="w-full bg-card border border-border rounded-xl p-2.5 text-textPrimary font-mono focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-border">
              <button
                onClick={() => setTagEditFile(null)}
                className="px-4 py-2 rounded-xl text-xs text-textSecondary hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTags}
                disabled={isSavingTags}
                className="px-4 py-2 rounded-xl bg-primary text-black font-bold text-xs shadow-md disabled:opacity-50 cursor-pointer flex items-center space-x-1.5"
              >
                {isSavingTags && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSavingTags ? "Writing to Disk..." : "Save Tags"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Audiophile Auto-Organize Modal */}
      {organizeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="bg-surface border border-purple-500/40 rounded-2xl w-full max-w-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border pb-3 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <FolderTree className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-bold text-textPrimary">Smart Audiophile Library Organizer</h3>
              </div>
              <button
                onClick={() => {
                  setOrganizeModalOpen(false);
                  setOrganizeDryRunResults(null);
                }}
                className="p-1 rounded text-textSecondary hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs overflow-y-auto pr-1">
              <p className="text-textSecondary">
                Automatically organize audio files into structured folders based on their internal metadata tags.
              </p>

              <div>
                <label className="text-textSecondary block mb-1 font-mono">Naming Pattern Template</label>
                <input
                  type="text"
                  value={organizePattern}
                  onChange={(e) => setOrganizePattern(e.target.value)}
                  className="w-full bg-card border border-border rounded-xl p-2.5 text-textPrimary font-mono focus:outline-none focus:border-purple-400"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setOrganizePattern("{artist}/{album}/{track:02d} - {title}.{ext}")}
                    className="px-2 py-1 rounded bg-card hover:bg-cardHover border border-border text-[11px] font-mono text-purple-300 cursor-pointer"
                  >
                    Artist / Album / Track - Title
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrganizePattern("{artist}/{album} ({year})/{track:02d} - {title}.{ext}")}
                    className="px-2 py-1 rounded bg-card hover:bg-cardHover border border-border text-[11px] font-mono text-purple-300 cursor-pointer"
                  >
                    Artist / Album (Year) / Track - Title
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrganizePattern("{artist} - {album}/{track:02d}. {title}.{ext}")}
                    className="px-2 py-1 rounded bg-card hover:bg-cardHover border border-border text-[11px] font-mono text-purple-300 cursor-pointer"
                  >
                    Artist - Album / Track. Title
                  </button>
                </div>
              </div>

              {/* Dry-run preview table */}
              {organizeDryRunResults && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white">
                      Proposed Moves: {organizeDryRunResults.proposed_moves_count} of{" "}
                      {organizeDryRunResults.total_candidates} files
                    </span>
                  </div>
                  {organizeDryRunResults.proposed_moves_count === 0 ? (
                    <div className="p-4 text-center rounded-xl bg-black/40 border border-border text-emerald-400 font-mono">
                      All files are already organized according to this pattern!
                    </div>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-1.5 bg-black/40 p-3 rounded-xl border border-border font-mono text-[11px]">
                      {organizeDryRunResults.proposed_moves.map((m: any, idx: number) => (
                        <div key={idx} className="p-2 rounded bg-card/60 border border-border/40 space-y-1">
                          <div className="text-textSecondary truncate">From: {m.source_path}</div>
                          <div className="text-emerald-400 font-semibold truncate">To: {m.destination_path}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border flex-shrink-0">
              <button
                onClick={handlePreviewOrganize}
                disabled={isOrganizing}
                className="px-4 py-2 rounded-xl bg-card hover:bg-cardHover text-purple-300 border border-purple-500/30 font-semibold text-xs cursor-pointer flex items-center space-x-1.5"
              >
                {isOrganizing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Preview Moves (Dry Run)</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setOrganizeModalOpen(false);
                    setOrganizeDryRunResults(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs text-textSecondary hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyOrganize}
                  disabled={
                    isOrganizing ||
                    !organizeDryRunResults ||
                    organizeDryRunResults.proposed_moves_count === 0
                  }
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md disabled:opacity-40 cursor-pointer flex items-center space-x-1.5"
                >
                  {isOrganizing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Apply & Move Files</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Cover Lightbox Modal */}
      {zoomCoverUrl && (
        <div
          onClick={() => setZoomCoverUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200 cursor-zoom-out"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-2xl w-full bg-card border border-border/80 rounded-2xl overflow-hidden shadow-2xl p-4 flex flex-col items-center space-y-3 cursor-default"
          >
            <div className="w-full flex justify-between items-center pb-2 border-b border-border/60">
              <div className="flex items-center space-x-2 text-xs font-mono text-textSecondary">
                <ImageIcon className="w-4 h-4 text-primary" />
                <span>High-Resolution Album Artwork</span>
              </div>
              <button
                onClick={() => setZoomCoverUrl(null)}
                className="p-1 rounded-md text-textSecondary hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="w-full max-h-[70vh] flex items-center justify-center overflow-hidden rounded-xl bg-black/60">
              <img
                src={zoomCoverUrl}
                alt="Album Art Zoom"
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-2xl"
              />
            </div>
            <div className="flex items-center justify-between w-full pt-1 text-[11px] text-textSecondary font-mono">
              <span>Click outside to close</span>
              <a
                href={zoomCoverUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center space-x-1"
              >
                <span>Open raw image</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Native Right-Click Context Menu */}
      <FileContextMenu
        position={contextMenu?.position || null}
        target={contextMenu?.target || null}
        onClose={() => setContextMenu(null)}
        onPlay={(entry) => handlePlayDirect(entry)}
        onPlayFolder={handlePlayFolder}
        onQueue={(entry) => {
          const track = getAudioTracks([entry]);
          if (track.length > 0) {
            addAllToQueue(track);
            showNotification(`Added ${track[0].title} to queue`);
          }
        }}
        onQueueFolder={handleQueueFolder}
        onQueueSelected={() => {
          const activeItems =
            activePane === "left" ? selectedEntries : paneBSelectedEntries;
          const tracks = getAudioTracks(activeItems);
          if (tracks.length > 0) {
            addAllToQueue(tracks);
            showNotification(`Added ${tracks.length} tracks to queue`);
          }
        }}
        onOpenFolder={(entry) => {
          if (activePane === "left") {
            loadDirectory(entry.path);
          } else {
            loadPaneBDirectory(entry.path);
          }
        }}
        onCut={(entries) => handleCut(entries)}
        onCopy={(entries) => handleCopy(entries)}
        onPaste={(dest) => handlePaste(dest)}
        canPaste={Boolean(clipboard && clipboard.paths.length > 0)}
        clipboardCount={clipboard?.paths.length || 0}
        clipboardAction={clipboard?.action}
        onRename={(entry) => {
          setRenameEntry(entry);
          setRenameNewName(entry.name);
        }}
        onDelete={(entries) => {
          setDeleteConfirmPaths(entries.map((e) => e.path));
        }}
        onNewFolder={() => setNewFolderOpen(true)}
        onUpload={() => fileInputRef.current?.click()}
        onEditTags={(entry) => openTagEditor(entry)}
        onInspectHeaders={(entry) => setInspectEntry(entry)}
        onDownload={(entry) => {
          window.open(`/api/fs/download?path=${encodeURIComponent(entry.path)}`, "_blank");
        }}
        onScanLibrary={(path) => handleScanFolder(path)}
        onRefresh={() => {
          loadDirectory(currentPath);
          if (viewMode === "split") loadPaneBDirectory(paneBPath);
        }}
        onSelectAll={() => {
          if (activePane === "left") {
            setSelectedPaths(new Set(filteredEntries.map((e) => e.path)));
          } else {
            setPaneBSelectedPaths(new Set(paneBFilteredEntries.map((e) => e.path)));
          }
        }}
        isSplitView={viewMode === "split"}
        onCopyToOppositePane={(entries) =>
          handleCrossPaneTransfer(
            "copy",
            activePane === "left" ? "toRight" : "toLeft",
            entries
          )
        }
        onMoveToOppositePane={(entries) =>
          handleCrossPaneTransfer(
            "cut",
            activePane === "left" ? "toRight" : "toLeft",
            entries
          )
        }
        oppositePaneName={activePane === "left" ? "Right Pane" : "Left Pane"}
      />

      {/* Mobile File Action Bottom Sheet */}
      {mobileActionMenuOpen && mobileActionEntry && (
        <div
          onClick={() => {
            setMobileActionMenuOpen(false);
            setMobileActionEntry(null);
          }}
          className="md:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface border-t border-border rounded-t-2xl p-5 pb-safe space-y-4 max-w-lg mx-auto w-full shadow-2xl animate-in slide-in-from-bottom-4 duration-200 max-h-[85vh] overflow-y-auto"
          >
            {/* Drag Handle */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto -mt-1 mb-2" />

            {/* Header: Icon + Name + Details */}
            <div className="flex items-start justify-between border-b border-border/60 pb-3">
              <div className="flex items-start space-x-3 min-w-0 flex-1">
                <div className="p-2.5 rounded-xl bg-card border border-border flex-shrink-0 mt-0.5">
                  {mobileActionEntry.is_dir ? (
                    <Folder className="w-6 h-6 text-primary" />
                  ) : mobileActionEntry.format ? (
                    <FileAudio className="w-6 h-6 text-accent" />
                  ) : (
                    <File className="w-6 h-6 text-textSecondary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-white break-words" title={mobileActionEntry.name}>
                    {mobileActionEntry.name}
                  </h3>
                  <div className="text-xs text-textSecondary mt-0.5 space-y-0.5">
                    {mobileActionEntry.artist && (
                      <p className="truncate text-white/90">
                        {mobileActionEntry.artist} {mobileActionEntry.album ? `• ${mobileActionEntry.album}` : ""}
                      </p>
                    )}
                    <p className="font-mono text-[11px] text-textSecondary/80">
                      {mobileActionEntry.is_dir ? "Folder" : formatSize(mobileActionEntry.size_bytes)} • {formatDate(mobileActionEntry.modified_at)}
                    </p>
                    {mobileActionEntry.format && (
                      <div className="flex items-center space-x-1.5 pt-1">
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-primary/15 text-primary border border-primary/30">
                          {mobileActionEntry.bit_depth ? `${mobileActionEntry.bit_depth}B/` : ""}
                          {mobileActionEntry.sample_rate ? `${(mobileActionEntry.sample_rate / 1000).toFixed(1)}k ` : ""}
                          {mobileActionEntry.format}
                        </span>
                        {mobileActionEntry.hires && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                            HI-RES MASTER
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setMobileActionMenuOpen(false);
                  setMobileActionEntry(null);
                }}
                className="p-2 text-textSecondary hover:text-white rounded-full cursor-pointer ml-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Actions List with 48px touch targets */}
            <div className="divide-y divide-border/50 text-sm font-medium">
              {/* If Audio File */}
              {mobileActionEntry.format && (
                <>
                  <button
                    onClick={() => {
                      handlePlayDirect(mobileActionEntry, false);
                      setMobileActionMenuOpen(false);
                    }}
                    className="w-full py-3 flex items-center space-x-3 text-white hover:text-primary transition-colors cursor-pointer text-left"
                  >
                    <Play className="w-5 h-5 text-primary fill-current" />
                    <span>Play Bit-Perfect (Browser)</span>
                  </button>

                  {activeDeviceId !== "browser" && (
                    <button
                      onClick={() => {
                        handlePlayDirect(mobileActionEntry, true);
                        setMobileActionMenuOpen(false);
                      }}
                      className="w-full py-3 flex items-center space-x-3 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer text-left"
                    >
                      <Speaker className="w-5 h-5 text-emerald-400" />
                      <span>Stream to Host USB DAC</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      const track = getAudioTracks([mobileActionEntry]);
                      if (track.length > 0) {
                        addAllToQueue(track);
                        showNotification(`Added ${track[0].title} to queue`);
                      }
                      setMobileActionMenuOpen(false);
                    }}
                    className="w-full py-3 flex items-center space-x-3 text-textSecondary hover:text-white transition-colors cursor-pointer text-left"
                  >
                    <ListPlus className="w-5 h-5 text-primary" />
                    <span>Add to Queue</span>
                  </button>

                  <button
                    onClick={() => {
                      setInspectEntry(mobileActionEntry);
                      setMobileActionMenuOpen(false);
                    }}
                    className="w-full py-3 flex items-center space-x-3 text-textSecondary hover:text-white transition-colors cursor-pointer text-left"
                  >
                    <Info className="w-5 h-5 text-primary" />
                    <span>Inspect Vorbis & Technical Headers</span>
                  </button>
                </>
              )}

              {/* If Folder */}
              {mobileActionEntry.is_dir && (
                <>
                  <button
                    onClick={() => {
                      loadDirectory(mobileActionEntry.path);
                      setMobileActionMenuOpen(false);
                    }}
                    className="w-full py-3 flex items-center space-x-3 text-white hover:text-primary transition-colors cursor-pointer text-left"
                  >
                    <FolderOpen className="w-5 h-5 text-primary" />
                    <span>Open Folder</span>
                  </button>

                  <button
                    onClick={() => {
                      handlePlayFolder();
                      setMobileActionMenuOpen(false);
                    }}
                    className="w-full py-3 flex items-center space-x-3 text-textSecondary hover:text-white transition-colors cursor-pointer text-left"
                  >
                    <Play className="w-5 h-5 text-primary fill-current" />
                    <span>Play All Tracks in Folder</span>
                  </button>

                  <button
                    onClick={() => {
                      handleScanFolder(mobileActionEntry.path);
                      setMobileActionMenuOpen(false);
                    }}
                    className="w-full py-3 flex items-center space-x-3 text-textSecondary hover:text-white transition-colors cursor-pointer text-left"
                  >
                    <FolderSync className="w-5 h-5 text-emerald-400" />
                    <span>Scan Folder to Music Library</span>
                  </button>
                </>
              )}

              {/* Download raw file (for non-folders) */}
              {!mobileActionEntry.is_dir && (
                <a
                  href={`/api/fs/download?path=${encodeURIComponent(mobileActionEntry.path)}`}
                  download
                  onClick={() => setMobileActionMenuOpen(false)}
                  className="w-full py-3 flex items-center space-x-3 text-textSecondary hover:text-white transition-colors cursor-pointer text-left block"
                >
                  <Download className="w-5 h-5 text-primary" />
                  <span>Download Raw File</span>
                </a>
              )}

              {/* Rename */}
              <button
                onClick={() => {
                  setRenameEntry(mobileActionEntry);
                  setRenameNewName(mobileActionEntry.name);
                  setMobileActionMenuOpen(false);
                }}
                className="w-full py-3 flex items-center space-x-3 text-textSecondary hover:text-white transition-colors cursor-pointer text-left"
              >
                <Pencil className="w-5 h-5 text-amber-400" />
                <span>Rename</span>
              </button>

              {/* Cut / Move */}
              <button
                onClick={() => {
                  handleCut([mobileActionEntry]);
                  setMobileActionMenuOpen(false);
                }}
                className="w-full py-3 flex items-center space-x-3 text-textSecondary hover:text-white transition-colors cursor-pointer text-left"
              >
                <Scissors className="w-5 h-5 text-accent" />
                <span>Cut (Move to another folder)</span>
              </button>

              {/* Copy */}
              <button
                onClick={() => {
                  handleCopy([mobileActionEntry]);
                  setMobileActionMenuOpen(false);
                }}
                className="w-full py-3 flex items-center space-x-3 text-textSecondary hover:text-white transition-colors cursor-pointer text-left"
              >
                <Copy className="w-5 h-5 text-sky-400" />
                <span>Copy</span>
              </button>

              {/* Delete */}
              <button
                onClick={() => {
                  setDeleteConfirmPaths([mobileActionEntry.path]);
                  setMobileActionMenuOpen(false);
                }}
                className="w-full py-3 flex items-center space-x-3 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer text-left"
              >
                <Trash2 className="w-5 h-5 text-rose-400" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
