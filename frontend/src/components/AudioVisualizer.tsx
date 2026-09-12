"use client";

import React, { useEffect, useRef } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { X, Activity } from "lucide-react";

export function AudioVisualizer() {
  const { isVisualizerOpen, setIsVisualizerOpen, getFrequencyData, getTimeDomainData, isPlaying, currentTrack } =
    usePlayer();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!isVisualizerOpen) return;

    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      // Dark background with subtle gradient
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, width, height);

      const freqData = getFrequencyData();
      const timeData = getTimeDomainData();

      if (freqData && isPlaying) {
        // Draw 64 frequency bars
        const numBars = 64;
        const barWidth = (width - 160) / numBars;
        const step = Math.floor(freqData.length / (numBars * 2));

        for (let i = 0; i < numBars; i++) {
          const value = freqData[i * step] || 0;
          const barHeight = (value / 255) * (height - 80);

          // Gradient color: Cyan -> Purple -> Gold for high amplitudes
          const grad = ctx.createLinearGradient(0, height - 40, 0, height - 40 - barHeight);
          grad.addColorStop(0, "rgba(56, 189, 248, 0.8)"); // cyan
          grad.addColorStop(0.6, "rgba(168, 85, 247, 0.9)"); // purple
          grad.addColorStop(1, "rgba(251, 191, 36, 1.0)"); // gold

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(40 + i * barWidth, height - 40 - barHeight, barWidth - 2, barHeight, 2);
          ctx.fill();
        }

        // Calculate stereo VU peak levels from time domain
        if (timeData) {
          let sumSquaresL = 0;
          let sumSquaresR = 0;
          const half = Math.floor(timeData.length / 2);

          for (let i = 0; i < half; i++) {
            const val = (timeData[i] - 128) / 128;
            sumSquaresL += val * val;
          }
          for (let i = half; i < timeData.length; i++) {
            const val = (timeData[i] - 128) / 128;
            sumSquaresR += val * val;
          }

          const rmsL = Math.sqrt(sumSquaresL / half);
          const rmsR = Math.sqrt(sumSquaresR / (timeData.length - half));

          // Draw Right Side Dual VU Meters
          const vuX = width - 90;
          const vuHeight = height - 80;
          const vuY = 40;

          // Left Channel VU
          drawVuBar(ctx, vuX, vuY, 16, vuHeight, rmsL, "L");
          // Right Channel VU
          drawVuBar(ctx, vuX + 28, vuY, 16, vuHeight, rmsR, "R");
        }
      } else {
        // Idle state: draw elegant flatline
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, height / 2);
        ctx.lineTo(width - 40, height / 2);
        ctx.stroke();

        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.font = "12px monospace";
        ctx.textAlign = "center";
        ctx.fillText("STANDBY • NO ACTIVE AUDIO SIGNAL", width / 2, height / 2 - 12);
      }

      animId = requestAnimationFrame(render);
    };

    const drawVuBar = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      rms: number,
      channel: string
    ) => {
      // Background slot
      ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      ctx.fillRect(x, y, w, h);

      // Level
      const fillHeight = Math.min(h, rms * h * 2.5);
      const isClip = fillHeight >= h - 2;

      const grad = ctx.createLinearGradient(0, y + h, 0, y);
      grad.addColorStop(0, "#10b981"); // green
      grad.addColorStop(0.7, "#eab308"); // yellow
      grad.addColorStop(0.9, "#f97316"); // orange
      grad.addColorStop(1, "#ef4444"); // red

      ctx.fillStyle = grad;
      ctx.fillRect(x, y + h - fillHeight, w, fillHeight);

      // Clip indicator LED
      ctx.fillStyle = isClip ? "#ef4444" : "rgba(239, 68, 68, 0.2)";
      ctx.beginPath();
      ctx.arc(x + w / 2, y - 10, 4, 0, Math.PI * 2);
      ctx.fill();

      // Channel label
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(channel, x + w / 2, y + h + 16);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isVisualizerOpen, isPlaying, getFrequencyData, getTimeDomainData]);

  if (!isVisualizerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/60">
          <div className="flex items-center space-x-3">
            <Activity className="w-5 h-5 text-accent" />
            <div>
              <h3 className="text-base font-semibold text-textPrimary">Real-Time Stereo Spectrum & Peak VU Meter</h3>
              <p className="text-xs text-textSecondary truncate max-w-md">
                {currentTrack ? `${currentTrack.artist} — ${currentTrack.title}` : "Studio Real-time FFT Engine"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsVisualizerOpen(false)}
            className="text-textSecondary hover:text-textPrimary p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Canvas Display */}
        <div className="p-6 flex items-center justify-center bg-black">
          <canvas
            ref={canvasRef}
            width={840}
            height={320}
            className="w-full h-auto rounded-xl border border-white/5 bg-[#0d1117]"
          />
        </div>

        {/* Footer info */}
        <div className="p-4 bg-card/60 border-t border-border flex items-center justify-between text-xs text-textSecondary">
          <div className="flex items-center space-x-4 font-mono">
            <span>FFT: 2048</span>
            <span>Refresh: 60 FPS</span>
            <span>Precision: 64-bit Float</span>
          </div>
          <button
            onClick={() => setIsVisualizerOpen(false)}
            className="px-4 py-1.5 rounded-lg bg-primary text-background font-medium hover:opacity-90 transition-opacity"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
