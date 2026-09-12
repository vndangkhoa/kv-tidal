"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { DownloadJob, DownloadStage } from "@/types";
import { ToastItem, ToastNotificationContainer } from "@/components/ToastNotification";
import { usePlayer } from "@/context/PlayerContext";

interface DownloadTrackPayload {
  title: string;
  artist: string;
  album: string;
  track_number?: number;
  year?: number;
  cover_url?: string | null;
  stream_url?: string | null;
  track_id?: string | null;
  source?: string;
}

interface TrackDownloadStatus {
  isDownloading: boolean;
  isDone: boolean;
  isError: boolean;
  progress: number;
  stage?: DownloadStage;
  job?: DownloadJob;
}

interface DownloadContextType {
  jobs: DownloadJob[];
  activeJobs: DownloadJob[];
  completedJobs: DownloadJob[];
  isManagerOpen: boolean;
  setIsManagerOpen: (open: boolean) => void;
  downloadTrack: (track: DownloadTrackPayload) => Promise<string | null>;
  cancelJob: (id: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
  getTrackDownloadStatus: (title: string, artist: string) => TrackDownloadStatus;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const prevJobStages = useRef<Map<string, DownloadStage>>(new Map());

  const {
    currentTrack,
    streamQuality,
    switchStreamQuality,
    autoUpgradeToFlac,
  } = usePlayer();

  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;
  const streamQualityRef = useRef(streamQuality);
  streamQualityRef.current = streamQuality;
  const autoUpgradeRef = useRef(autoUpgradeToFlac);
  autoUpgradeRef.current = autoUpgradeToFlac;
  const switchStreamQualityRef = useRef(switchStreamQuality);
  switchStreamQualityRef.current = switchStreamQuality;

  const addToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const fetchQueue = useCallback(async () => {
    try {
      const resp = await fetch("/api/download/queue");
      if (!resp.ok) return;
      const data = await resp.json();
      const updatedJobs: DownloadJob[] = data.jobs || [];

      // Check for stage transitions to trigger notifications
      for (const job of updatedJobs) {
        const prevStage = prevJobStages.current.get(job.id);
        if (prevStage && prevStage !== job.stage) {
          if (job.stage === "completed") {
            const cur = currentTrackRef.current;
            const isCurrent =
              cur &&
              ((cur.title.toLowerCase().trim() === job.title.toLowerCase().trim() &&
                cur.artist.toLowerCase().trim() === job.artist.toLowerCase().trim()) ||
               (job.track_id && cur.id === job.track_id));

            const isNotLossless =
              streamQualityRef.current === "opus" ||
              cur?.source === "web-stream-opus" ||
              cur?.format?.toLowerCase().includes("opus") ||
              (cur && !cur.source?.includes("local") && cur.source !== "tidal-direct-hifi");

            if (isCurrent && isNotLossless) {
              if (autoUpgradeRef.current) {
                switchStreamQualityRef.current("flac");
                addToast({
                  type: "success",
                  title: job.title,
                  artist: job.artist,
                  message: "⚡ FLAC Master ready! Hot-swapped seamlessly to Bit-Perfect Master.",
                  savedPath: job.saved_path,
                });
              } else {
                addToast({
                  type: "success",
                  title: job.title,
                  artist: job.artist,
                  message: "Bit-perfect FLAC Master saved to Synology NAS",
                  savedPath: job.saved_path,
                  action: {
                    label: "⚡ Switch to FLAC Master Now",
                    onClick: () => switchStreamQualityRef.current("flac"),
                  },
                });
              }
            } else {
              addToast({
                type: "success",
                title: job.title,
                artist: job.artist,
                message: "Bit-perfect FLAC saved to Synology NAS",
                savedPath: job.saved_path,
              });
            }
          } else if (job.stage === "failed") {
            addToast({
              type: "error",
              title: job.title,
              artist: job.artist,
              message: job.error || "Download failed",
            });
          }
        }
        prevJobStages.current.set(job.id, job.stage);
      }

      setJobs(updatedJobs);
    } catch {
      // Ignore network errors in background poll
    }
  }, [addToast]);

  const hasActiveJobs = jobs.some(
    (j) => j.stage !== "completed" && j.stage !== "failed"
  );

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    const pollInterval = hasActiveJobs ? 800 : 5000;
    const interval = setInterval(fetchQueue, pollInterval);
    return () => clearInterval(interval);
  }, [hasActiveJobs, fetchQueue]);

  const downloadTrack = async (payload: DownloadTrackPayload): Promise<string | null> => {
    try {
      const resp = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        const data = await resp.json();
        // Record immediate stage
        if (data.job_id) {
          prevJobStages.current.set(data.job_id, "queued");
        }
        await fetchQueue();
        return data.job_id || null;
      }
      return null;
    } catch {
      return null;
    }
  };

  const cancelJob = async (id: string) => {
    try {
      await fetch(`/api/download/${id}`, { method: "DELETE" });
      prevJobStages.current.delete(id);
      await fetchQueue();
    } catch (e) {
      console.error("Failed canceling job", e);
    }
  };

  const clearCompleted = async () => {
    try {
      await fetch("/api/download/clear", { method: "POST" });
      await fetchQueue();
    } catch (e) {
      console.error("Failed clearing completed jobs", e);
    }
  };

  const getTrackDownloadStatus = (title: string, artist: string): TrackDownloadStatus => {
    const job = jobs.find(
      (j) =>
        j.title.toLowerCase() === title.toLowerCase() &&
        j.artist.toLowerCase() === artist.toLowerCase()
    );

    if (!job) {
      return { isDownloading: false, isDone: false, isError: false, progress: 0 };
    }

    const isDownloading =
      job.stage !== "completed" && job.stage !== "failed";
    const isDone = job.stage === "completed";
    const isError = job.stage === "failed";

    return {
      isDownloading,
      isDone,
      isError,
      progress: job.progress_percent,
      stage: job.stage,
      job,
    };
  };

  const activeJobs = jobs.filter(
    (j) => j.stage !== "completed" && j.stage !== "failed"
  );
  const completedJobs = jobs.filter((j) => j.stage === "completed");

  return (
    <DownloadContext.Provider
      value={{
        jobs,
        activeJobs,
        completedJobs,
        isManagerOpen,
        setIsManagerOpen,
        downloadTrack,
        cancelJob,
        clearCompleted,
        getTrackDownloadStatus,
      }}
    >
      {children}
      <ToastNotificationContainer toasts={toasts} onDismiss={dismissToast} />
    </DownloadContext.Provider>
  );
}

export function useDownloads() {
  const ctx = useContext(DownloadContext);
  if (!ctx) {
    throw new Error("useDownloads must be used within a DownloadProvider");
  }
  return ctx;
}
