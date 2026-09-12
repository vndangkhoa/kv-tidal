"use client";

import React from "react";
import { CheckCircle2, AlertCircle, X, ExternalLink, HardDrive } from "lucide-react";
import Link from "next/link";

export interface ToastItem {
  id: string;
  type: "success" | "error" | "info";
  title: string;
  artist?: string;
  message: string;
  savedPath?: string;
}

interface ToastNotificationProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastNotificationContainer({
  toasts,
  onDismiss,
}: ToastNotificationProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-4 md:right-8 z-50 flex flex-col space-y-2.5 max-w-sm w-full pointer-events-none select-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start space-x-3 p-3.5 rounded-xl bg-surface/95 backdrop-blur-md border border-border shadow-2xl animate-in slide-in-from-bottom-5 duration-200 text-xs"
        >
          <div className="flex-shrink-0 mt-0.5">
            {toast.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : toast.type === "error" ? (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            ) : (
              <HardDrive className="w-4 h-4 text-primary" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white truncate">
              {toast.title}
            </div>
            {toast.artist && (
              <div className="text-textSecondary truncate text-[11px]">
                {toast.artist}
              </div>
            )}
            <div
              className={`text-[11px] mt-0.5 ${
                toast.type === "success"
                  ? "text-emerald-400/90"
                  : toast.type === "error"
                  ? "text-rose-400/90"
                  : "text-textSecondary"
              }`}
            >
              {toast.message}
            </div>

            {toast.savedPath && (
              <div className="mt-2 pt-1.5 border-t border-border/50 flex items-center justify-between">
                <span className="text-[10px] font-mono text-textSecondary truncate max-w-[190px]">
                  {toast.savedPath.split("/").slice(-2).join("/")}
                </span>
                <Link
                  href="/files"
                  className="flex items-center space-x-1 text-[10px] font-medium text-primary hover:underline hover:text-white transition-colors ml-2 flex-shrink-0"
                >
                  <span>Open in Files</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </Link>
              </div>
            )}
          </div>

          <button
            onClick={() => onDismiss(toast.id)}
            className="flex-shrink-0 p-1 text-textSecondary hover:text-white transition-colors cursor-pointer rounded-md hover:bg-card"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
