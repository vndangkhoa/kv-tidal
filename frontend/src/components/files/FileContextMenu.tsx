"use client";

import React, { useEffect, useRef } from "react";
import { FsEntry } from "@/types";
import {
  Play,
  ListPlus,
  Scissors,
  Copy,
  ClipboardPaste,
  Pencil,
  Trash2,
  Download,
  ShieldCheck,
  Tag,
  FolderPlus,
  UploadCloud,
  FolderSync,
  RotateCw,
  ArrowRightLeft,
  CheckSquare,
  FolderOpen,
} from "lucide-react";

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface ContextMenuTarget {
  type: "file" | "folder" | "background";
  entry?: FsEntry;
  selectedEntries?: FsEntry[];
  currentPath: string;
}

export interface FileContextMenuProps {
  position: ContextMenuPosition | null;
  target: ContextMenuTarget | null;
  onClose: () => void;

  // Actions
  onPlay?: (entry: FsEntry) => void;
  onPlayFolder?: () => void;
  onQueue?: (entry: FsEntry) => void;
  onQueueFolder?: () => void;
  onQueueSelected?: () => void;
  onOpenFolder?: (entry: FsEntry) => void;

  onCut?: (entries?: FsEntry[]) => void;
  onCopy?: (entries?: FsEntry[]) => void;
  onPaste?: (destinationDir?: string) => void;
  canPaste?: boolean;
  clipboardCount?: number;
  clipboardAction?: "cut" | "copy";

  onRename?: (entry: FsEntry) => void;
  onDelete?: (entries: FsEntry[]) => void;
  onNewFolder?: () => void;
  onUpload?: () => void;
  onEditTags?: (entry: FsEntry) => void;
  onInspectHeaders?: (entry: FsEntry) => void;
  onDownload?: (entry: FsEntry) => void;
  onScanLibrary?: (path?: string) => void;
  onRefresh?: () => void;
  onSelectAll?: () => void;

  // Split view cross-pane actions
  isSplitView?: boolean;
  onMoveToOppositePane?: (entries: FsEntry[]) => void;
  onCopyToOppositePane?: (entries: FsEntry[]) => void;
  oppositePaneName?: string;
}

export const FileContextMenu: React.FC<FileContextMenuProps> = ({
  position,
  target,
  onClose,
  onPlay,
  onPlayFolder,
  onQueue,
  onQueueFolder,
  onQueueSelected,
  onOpenFolder,
  onCut,
  onCopy,
  onPaste,
  canPaste,
  clipboardCount,
  clipboardAction,
  onRename,
  onDelete,
  onNewFolder,
  onUpload,
  onEditTags,
  onInspectHeaders,
  onDownload,
  onScanLibrary,
  onRefresh,
  onSelectAll,
  isSplitView,
  onMoveToOppositePane,
  onCopyToOppositePane,
  oppositePaneName = "Opposite Pane",
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (!position || !target) return null;

  // Ensure menu stays completely inside window viewport
  const menuWidth = 240;
  const menuHeight = 360;
  const adjustedX =
    position.x + menuWidth > window.innerWidth
      ? Math.max(10, window.innerWidth - menuWidth - 16)
      : position.x;
  const adjustedY =
    position.y + menuHeight > window.innerHeight
      ? Math.max(10, window.innerHeight - menuHeight - 16)
      : position.y;

  const isMulti = (target.selectedEntries?.length || 0) > 1;
  const activeEntries = isMulti
    ? target.selectedEntries || []
    : target.entry
    ? [target.entry]
    : [];

  const handleAction = (actionFn?: () => void) => {
    if (actionFn) {
      actionFn();
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      style={{ top: adjustedY, left: adjustedX }}
      className="fixed z-50 w-60 bg-surface/95 backdrop-blur-xl border border-border/90 rounded-xl shadow-2xl p-1.5 text-xs select-none animate-in fade-in zoom-in-95 duration-100 divide-y divide-border/60"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Target Title Header */}
      <div className="px-2.5 py-1.5 mb-1 text-[11px] font-mono text-textSecondary truncate max-w-full">
        {target.type === "background" ? (
          <span className="text-primary font-bold">Current Folder</span>
        ) : isMulti ? (
          <span className="text-primary font-bold">{activeEntries.length} Items Selected</span>
        ) : (
          <span className="text-textPrimary font-semibold truncate block">
            {target.entry?.title || target.entry?.name}
          </span>
        )}
      </div>

      {/* Primary Actions Section */}
      <div className="py-1 space-y-0.5">
        {/* File Audio Actions */}
        {target.type === "file" && target.entry?.format && !isMulti && (
          <>
            <button
              onClick={() => handleAction(() => target.entry && onPlay?.(target.entry))}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-primary/20 hover:text-primary transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <Play className="w-3.5 h-3.5 text-primary fill-primary" />
                <span>Play Bit-Perfect</span>
              </div>
            </button>
            <button
              onClick={() => handleAction(() => target.entry && onQueue?.(target.entry))}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-cardHover hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <ListPlus className="w-3.5 h-3.5 text-textSecondary" />
                <span>Add to Queue</span>
              </div>
            </button>
          </>
        )}

        {/* Multi-item Audio Queue */}
        {isMulti && (
          <button
            onClick={() => handleAction(() => onQueueSelected?.())}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-cardHover hover:text-white transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-2">
              <ListPlus className="w-3.5 h-3.5 text-primary" />
              <span>Queue {activeEntries.length} Items</span>
            </div>
          </button>
        )}

        {/* Folder Actions */}
        {target.type === "folder" && !isMulti && (
          <>
            <button
              onClick={() => handleAction(() => target.entry && onOpenFolder?.(target.entry))}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-cardHover hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                <span>Open Folder</span>
              </div>
            </button>
            <button
              onClick={() => handleAction(() => onPlayFolder?.())}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-primary/20 hover:text-primary transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <Play className="w-3.5 h-3.5 text-primary fill-primary" />
                <span>Play Folder</span>
              </div>
            </button>
            <button
              onClick={() => handleAction(() => onQueueFolder?.())}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-cardHover hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <ListPlus className="w-3.5 h-3.5 text-textSecondary" />
                <span>Queue Folder</span>
              </div>
            </button>
          </>
        )}

        {/* Background Actions */}
        {target.type === "background" && (
          <>
            <button
              onClick={() => handleAction(() => onPlayFolder?.())}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-primary/20 hover:text-primary transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <Play className="w-3.5 h-3.5 text-primary fill-primary" />
                <span>Play Folder</span>
              </div>
            </button>
            <button
              onClick={() => handleAction(() => onQueueFolder?.())}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-cardHover hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <ListPlus className="w-3.5 h-3.5 text-textSecondary" />
                <span>Queue Folder</span>
              </div>
            </button>
          </>
        )}
      </div>

      {/* Clipboard / Transfer Section */}
      <div className="py-1 space-y-0.5">
        {target.type !== "background" && (
          <>
            <button
              onClick={() => handleAction(() => onCut?.(activeEntries))}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-cardHover hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <Scissors className="w-3.5 h-3.5 text-amber-400" />
                <span>Cut {isMulti ? `(${activeEntries.length})` : ""}</span>
              </div>
              <span className="text-[10px] text-textSecondary font-mono">Ctrl+X</span>
            </button>

            <button
              onClick={() => handleAction(() => onCopy?.(activeEntries))}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-cardHover hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <Copy className="w-3.5 h-3.5 text-sky-400" />
                <span>Copy {isMulti ? `(${activeEntries.length})` : ""}</span>
              </div>
              <span className="text-[10px] text-textSecondary font-mono">Ctrl+C</span>
            </button>
          </>
        )}

        {/* Paste Action */}
        <button
          onClick={() =>
            handleAction(() =>
              onPaste?.(target.type === "folder" ? target.entry?.path : undefined)
            )
          }
          disabled={!canPaste}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors ${
            canPaste
              ? "text-textPrimary hover:bg-emerald-500/20 hover:text-emerald-300 cursor-pointer"
              : "text-textSecondary/40 cursor-not-allowed"
          }`}
        >
          <div className="flex items-center space-x-2">
            <ClipboardPaste
              className={`w-3.5 h-3.5 ${canPaste ? "text-emerald-400" : "text-textSecondary/40"}`}
            />
            <span>
              {target.type === "folder"
                ? "Paste into Folder"
                : `Paste ${clipboardCount ? `(${clipboardCount})` : ""}`}
            </span>
          </div>
          <span className="text-[10px] text-textSecondary font-mono">Ctrl+V</span>
        </button>

        {/* Split View Quick Cross-Pane Transfers */}
        {isSplitView && target.type !== "background" && (
          <>
            <button
              onClick={() => handleAction(() => onCopyToOppositePane?.(activeEntries))}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-cardHover hover:text-sky-300 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <ArrowRightLeft className="w-3.5 h-3.5 text-sky-400" />
                <span>Copy to {oppositePaneName}</span>
              </div>
            </button>
            <button
              onClick={() => handleAction(() => onMoveToOppositePane?.(activeEntries))}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-cardHover hover:text-amber-300 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
                <span>Move to {oppositePaneName}</span>
              </div>
            </button>
          </>
        )}
      </div>

      {/* Directory Management & Tools Section */}
      <div className="py-1 space-y-0.5">
        {target.type === "background" && (
          <>
            <button
              onClick={() => handleAction(() => onNewFolder?.())}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-cardHover hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <FolderPlus className="w-3.5 h-3.5 text-primary" />
                <span>New Folder</span>
              </div>
            </button>

            <button
              onClick={() => handleAction(() => onUpload?.())}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-cardHover hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
                <span>Upload Files Here</span>
              </div>
            </button>

            <button
              onClick={() => handleAction(() => onRefresh?.())}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-cardHover hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <RotateCw className="w-3.5 h-3.5 text-textSecondary" />
                <span>Refresh Directory</span>
              </div>
            </button>

            <button
              onClick={() => handleAction(() => onSelectAll?.())}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-cardHover hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <CheckSquare className="w-3.5 h-3.5 text-textSecondary" />
                <span>Select All</span>
              </div>
              <span className="text-[10px] text-textSecondary font-mono">Ctrl+A</span>
            </button>
          </>
        )}

        {/* File Inspector / Tag Editor */}
        {target.type === "file" && !isMulti && (
          <>
            {target.entry?.format && (
              <button
                onClick={() => handleAction(() => target.entry && onEditTags?.(target.entry))}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-cardHover hover:text-amber-300 transition-colors cursor-pointer"
              >
                <div className="flex items-center space-x-2">
                  <Tag className="w-3.5 h-3.5 text-amber-400" />
                  <span>Edit Tags</span>
                </div>
              </button>
            )}

            <button
              onClick={() => handleAction(() => target.entry && onInspectHeaders?.(target.entry))}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-cardHover hover:text-primary transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                <span>Inspect Technical Headers</span>
              </div>
            </button>

            <button
              onClick={() => handleAction(() => target.entry && onDownload?.(target.entry))}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-cardHover hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <Download className="w-3.5 h-3.5 text-textSecondary" />
                <span>Download File</span>
              </div>
            </button>
          </>
        )}

        {/* Folder Scan */}
        {target.type === "folder" && !isMulti && (
          <button
            onClick={() => handleAction(() => target.entry && onScanLibrary?.(target.entry.path))}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-cardHover hover:text-emerald-300 transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-2">
              <FolderSync className="w-3.5 h-3.5 text-emerald-400" />
              <span>Scan to Music Library</span>
            </div>
          </button>
        )}

        {/* Rename Single Item */}
        {!isMulti && target.type !== "background" && target.entry && (
          <button
            onClick={() => handleAction(() => target.entry && onRename?.(target.entry))}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-textPrimary hover:bg-cardHover hover:text-white transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-2">
              <Pencil className="w-3.5 h-3.5 text-textSecondary" />
              <span>Rename</span>
            </div>
            <span className="text-[10px] text-textSecondary font-mono">F2</span>
          </button>
        )}
      </div>

      {/* Destructive Actions Section */}
      {target.type !== "background" && (
        <div className="pt-1">
          <button
            onClick={() => handleAction(() => onDelete?.(activeEntries))}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-2">
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Delete {isMulti ? `(${activeEntries.length} items)` : ""}</span>
            </div>
            <span className="text-[10px] text-red-400/60 font-mono">Del</span>
          </button>
        </div>
      )}
    </div>
  );
};
