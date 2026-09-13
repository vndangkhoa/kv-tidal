"use client";

import React from "react";
import { useDownloads } from "@/context/DownloadContext";
import { DownloadStage, DownloadJob } from "@/types";
import {
  X,
  HardDrive,
  Download,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Trash2,
  ExternalLink,
  Tag,
  Database,
  Radio,
  Disc,
  Play,
  Pause,
} from "lucide-react";
import Link from "next/link";

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function formatSpeed(kbps?: number): string {
  if (!kbps || kbps === 0) return "";
  if (kbps > 1024) {
    return `${(kbps / 1024).toFixed(1)} MB/s`;
  }
  return `${kbps} KB/s`;
}

function formatEta(seconds?: number): string {
  if (seconds === undefined || seconds === null) return "";
  if (seconds < 60) return `${seconds}s left`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s left`;
}

function getStageBadge(stage: DownloadStage, source?: string) {
  switch (stage) {
    case "queued":
      return (
        <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
          <Clock className="w-2.5 h-2.5" />
          <span>Queued</span>
        </span>
      );
    case "paused":
      return (
        <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <Pause className="w-2.5 h-2.5" />
          <span>Paused</span>
        </span>
      );
    case "resolving":
      return (
        <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
          <Radio className="w-2.5 h-2.5 animate-pulse" />
          <span>{source === "soulseek" ? "Searching Soulseek" : "Resolving Stream"}</span>
        </span>
      );
    case "downloading_audio":
      return (
        <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-500/40">
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          <span>
            {source === "soulseek"
              ? "Soulseek P2P FLAC"
              : source === "web-stream"
              ? "Web Stream FLAC"
              : "Lossless FLAC"}
          </span>
        </span>
      );
    case "tagging_and_writing":
      return (
        <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30">
          <Tag className="w-2.5 h-2.5" />
          <span>Tagging & NAS Write</span>
        </span>
      );
    case "indexing_library":
      return (
        <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <Database className="w-2.5 h-2.5 animate-pulse" />
          <span>Indexing Library</span>
        </span>
      );
    case "completed":
      return (
        <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-semibold">
          <CheckCircle2 className="w-2.5 h-2.5" />
          <span>Saved to NAS</span>
        </span>
      );
    case "failed":
      return (
        <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-rose-500/15 text-rose-300 border border-rose-500/30">
          <AlertCircle className="w-2.5 h-2.5" />
          <span>Failed</span>
        </span>
      );
  }
}

export function DownloadManagerDrawer() {
  const {
    isManagerOpen,
    setIsManagerOpen,
    jobs,
    activeJobs,
    completedJobs,
    cancelJob,
    pauseJob,
    resumeJob,
    clearCompleted,
  } = useDownloads();

  if (!isManagerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm select-none transition-opacity">
      {/* Backdrop click to close */}
      <div
        className="flex-1 cursor-pointer"
        onClick={() => setIsManagerOpen(false)}
      />

      {/* Drawer Container */}
      <div className="w-full max-w-md sm:max-w-lg bg-surface border-l border-border h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-border/80 flex items-center justify-between bg-card/60">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  NAS Download Pipeline
                </h2>
                {activeJobs.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-primary text-black">
                    {activeJobs.length} active
                  </span>
                )}
              </div>
              <p className="text-[11px] text-textSecondary mt-0.5">
                Bit-perfect FLAC extraction & Synology storage
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            {completedJobs.length > 0 && (
              <button
                onClick={clearCompleted}
                title="Clear completed downloads"
                className="text-[11px] px-2 py-1 rounded-lg text-textSecondary hover:text-white hover:bg-card border border-transparent hover:border-border transition-colors cursor-pointer mr-1"
              >
                Clear Done
              </button>
            )}
            <button
              onClick={() => setIsManagerOpen(false)}
              className="p-1.5 rounded-lg text-textSecondary hover:text-white hover:bg-card transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
          {jobs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 my-auto">
              <div className="w-16 h-16 rounded-2xl bg-card border border-border/70 flex items-center justify-center text-textSecondary shadow-inner">
                <Download className="w-8 h-8 opacity-40" />
              </div>
              <h3 className="text-sm font-semibold text-white">No Downloads in Queue</h3>
              <p className="text-xs text-textSecondary max-w-xs leading-relaxed">
                Click the download icon on any song, album, or mix to save bit-perfect FLAC files directly to your Synology NAS music directory.
              </p>
            </div>
          ) : (
            <>
              {/* 1. Active Downloads Section */}
              {activeJobs.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono font-bold uppercase tracking-wider text-textSecondary">
                    <span>Active Downloads ({activeJobs.length})</span>
                    <span className="text-[10px] text-primary flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                      <span>Live Synology I/O</span>
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {activeJobs.map((job) => (
                      <ActiveJobCard
                        key={job.id}
                        job={job}
                        onCancel={cancelJob}
                        onPause={pauseJob}
                        onResume={resumeJob}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Completed Downloads History */}
              {completedJobs.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono font-bold uppercase tracking-wider text-textSecondary">
                    <span>Completed & Stored ({completedJobs.length})</span>
                  </div>

                  <div className="space-y-2">
                    {completedJobs.map((job) => (
                      <CompletedJobCard key={job.id} job={job} onRemove={cancelJob} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Drawer Footer Status */}
        <div className="p-3 sm:p-4 border-t border-border/70 bg-card/40 text-[11px] text-textSecondary flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
            <span>NAS Music Storage Target Active</span>
          </div>
          <Link
            href="/files"
            onClick={() => setIsManagerOpen(false)}
            className="text-primary hover:underline hover:text-white transition-colors flex items-center space-x-1"
          >
            <span>Browse Files</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function ActiveJobCard({
  job,
  onCancel,
  onPause,
  onResume,
}: {
  job: DownloadJob;
  onCancel: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}) {
  const speedText = formatSpeed(job.speed_kbps);
  const etaText = formatEta(job.eta_seconds);
  const transferredText =
    job.total_bytes && job.total_bytes > 0
      ? `${formatBytes(job.downloaded_bytes)} / ${formatBytes(job.total_bytes)}`
      : job.downloaded_bytes > 0
      ? formatBytes(job.downloaded_bytes)
      : "";

  return (
    <div className="p-3.5 rounded-xl bg-card border border-border/80 space-y-3 shadow-sm hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-lg bg-surface border border-border/70 overflow-hidden flex-shrink-0 flex items-center justify-center">
            {job.cover_url ? (
              <img
                src={job.cover_url}
                alt={job.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <Disc className="w-5 h-5 text-primary/60" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-semibold text-white truncate">
              {job.title}
            </h4>
            <p className="text-[11px] text-textSecondary truncate mt-0.5">
              {job.artist} {job.album ? `• ${job.album}` : ""}
            </p>
            {job.source === "soulseek" ? (
              <span className="inline-flex items-center space-x-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-400 border border-cyan-800/50 mt-1">
                <Radio className="w-2.5 h-2.5 animate-pulse" />
                <span>Soulseek P2P Lossless FLAC</span>
              </span>
            ) : job.source === "tidal" ? (
              <span className="inline-flex items-center space-x-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 mt-1">
                <span>Tidal HiFi Direct</span>
              </span>
            ) : job.source === "web-stream" ? (
              <span className="inline-flex items-center space-x-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50 mt-1">
                <span>Web Stream Audio</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center space-x-1.5 flex-shrink-0">
          {getStageBadge(job.stage, job.source)}

          {job.stage === "paused" ? (
            <button
              onClick={() => onResume(job.id)}
              title="Resume download"
              className="p-1 rounded text-primary hover:text-white hover:bg-primary/20 border border-primary/30 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : job.stage !== "completed" && job.stage !== "failed" ? (
            <button
              onClick={() => onPause(job.id)}
              title="Pause download"
              className="p-1 rounded text-amber-400 hover:text-white hover:bg-amber-500/20 border border-amber-500/30 transition-colors cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
            </button>
          ) : null}

          <button
            onClick={() => onCancel(job.id)}
            title="Remove download"
            className="p-1 rounded text-textSecondary hover:text-rose-400 hover:bg-surface transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress Bar & Telemetry */}
      <div className="space-y-1.5">
        <div className="w-full bg-surface h-1.5 rounded-full overflow-hidden border border-border/50">
          <div
            className="bg-primary h-full transition-all duration-300 rounded-full shadow-[0_0_8px_rgba(0,255,255,0.4)]"
            style={{ width: `${Math.max(job.progress_percent, 5)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-textSecondary">
          <span>{job.progress_percent}%</span>
          <div className="flex items-center space-x-2">
            {transferredText && <span>{transferredText}</span>}
            {speedText && <span className="text-primary">{speedText}</span>}
            {etaText && <span>• {etaText}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function CompletedJobCard({
  job,
  onRemove,
}: {
  job: DownloadJob;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="p-3 rounded-xl bg-card/60 border border-border/60 hover:border-border transition-colors flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center space-x-3 min-w-0 flex-1">
        <div className="w-9 h-9 rounded-lg bg-surface border border-border/60 overflow-hidden flex-shrink-0 flex items-center justify-center">
          {job.cover_url ? (
            <img
              src={job.cover_url}
              alt={job.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <Disc className="w-4 h-4 text-emerald-400/60" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center space-x-1.5">
            <span className="font-semibold text-white truncate text-xs">
              {job.title}
            </span>
            <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
          </div>
          <p className="text-[11px] text-textSecondary truncate mt-0.5">
            {job.artist}
          </p>
          {job.saved_path && (
            <p className="text-[10px] font-mono text-textSecondary/70 truncate mt-0.5">
              {job.saved_path.split("/").slice(-2).join("/")}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-1.5 flex-shrink-0">
        <Link
          href="/files"
          title="Open in Files"
          className="p-1.5 rounded-lg text-textSecondary hover:text-primary hover:bg-surface transition-colors cursor-pointer"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
        <button
          onClick={() => onRemove(job.id)}
          title="Dismiss"
          className="p-1.5 rounded-lg text-textSecondary hover:text-rose-400 hover:bg-surface transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
