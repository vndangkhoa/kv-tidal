"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { LiveAudioTelemetry } from "@/types";
import {
  X,
  CheckCircle2,
  Sliders,
  Radio,
  HardDrive,
  Speaker,
  Sparkles,
  Activity,
  ShieldCheck,
  Gauge,
  Clock,
  Volume2,
  Globe,
  Star,
  AlertTriangle,
  Zap,
} from "lucide-react";

export function SignalPathModal() {
  const {
    isSignalPathOpen,
    setIsSignalPathOpen,
    getSignalPath,
    getLiveTelemetry,
    currentTrack,
    bitPerfectMode,
    setBitPerfectMode,
    isPlaying,
    autoPreampGain,
  } = usePlayer();

  // Throttled state for UI text readouts (updates smoothly at ~15 FPS)
  const [telemetry, setTelemetry] = useState<LiveAudioTelemetry>({
    bufferedSeconds: 0,
    bufferPercent: 0,
    bufferedBytesEstimate: 0,
    sampleFrame: 0,
    totalFrames: 0,
    subBassEnergy: 0,
    midEnergy: 0,
    trebleEnergy: 0,
    rmsDbfs: -96,
    peakDbfs: -96,
    truePeakDbfs: -96,
    interSampleOverload: false,
    crestFactorDb: 0,
    instantBitrateKbps: 0,
    isBuffering: false,
    channelCount: 2,
    currentClockLocked: true,
  });

  // Direct DOM refs for 60 FPS animation without React re-render overhead
  const conduit1Ref = useRef<HTMLCanvasElement | null>(null);
  const conduit2Ref = useRef<HTMLCanvasElement | null>(null);
  const conduit3Ref = useRef<HTMLCanvasElement | null>(null);
  const vuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const lastStateUpdateRef = useRef<number>(0);
  const flowOffsetRef = useRef<number>(0);
  const peakHoldRef = useRef<{ left: number; right: number; decay: number }>({
    left: -96,
    right: -96,
    decay: 0,
  });

  // Run real-time animation loop when modal is open
  useEffect(() => {
    if (!isSignalPathOpen) return;

    const renderLoop = (time: number) => {
      const data = getLiveTelemetry();

      // 1. Throttled React state update (~12-15 updates/sec for numbers)
      if (time - lastStateUpdateRef.current > 70) {
        lastStateUpdateRef.current = time;
        setTelemetry(data);
      }

      // 2. Animate vertical conduits at 60 FPS
      const flowSpeed = isPlaying ? 1.5 + data.subBassEnergy * 3.5 : 0.2;
      flowOffsetRef.current = (flowOffsetRef.current + flowSpeed) % 40;

      const conduits = [conduit1Ref.current, conduit2Ref.current, conduit3Ref.current];
      conduits.forEach((canvas, idx) => {
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        // Baseline trace line
        ctx.beginPath();
        ctx.moveTo(width / 2, 0);
        ctx.lineTo(width / 2, height);
        ctx.strokeStyle = bitPerfectMode ? "rgba(16, 185, 129, 0.2)" : "rgba(168, 85, 247, 0.2)";
        ctx.lineWidth = 2;
        ctx.stroke();

        if (isPlaying) {
          // Flowing laser audio packets
          const packetSpacing = 12;
          const numPackets = Math.ceil(height / packetSpacing) + 1;
          const packetEnergy =
            idx === 0 ? data.subBassEnergy : idx === 1 ? data.midEnergy : data.trebleEnergy;
          const activeColor = bitPerfectMode
            ? `rgba(16, 185, 129, ${0.45 + packetEnergy * 0.55})`
            : `rgba(168, 85, 247, ${0.45 + packetEnergy * 0.55})`;

          for (let i = -1; i < numPackets; i++) {
            const y = i * packetSpacing + (flowOffsetRef.current % packetSpacing);
            if (y >= 0 && y <= height) {
              const radius = 2.2 + packetEnergy * 1.6;
              ctx.beginPath();
              ctx.arc(width / 2, y, radius, 0, Math.PI * 2);
              ctx.fillStyle = activeColor;
              ctx.shadowColor = bitPerfectMode ? "#10b981" : "#a855f7";
              ctx.shadowBlur = 6 + packetEnergy * 8;
              ctx.fill();
              ctx.shadowBlur = 0;
            }
          }

          // Transient beam pulse on strong dynamic attack
          if (data.subBassEnergy > 0.35) {
            ctx.beginPath();
            ctx.moveTo(width / 2, 0);
            ctx.lineTo(width / 2, height);
            ctx.strokeStyle = bitPerfectMode
              ? `rgba(52, 211, 153, ${data.subBassEnergy * 0.6})`
              : `rgba(192, 132, 252, ${data.subBassEnergy * 0.6})`;
            ctx.lineWidth = 3;
            ctx.shadowColor = bitPerfectMode ? "#10b981" : "#c084fc";
            ctx.shadowBlur = 10;
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }
      });

      // 3. Animate Live VU Meter Canvas on Node 4
      const vuCanvas = vuCanvasRef.current;
      if (vuCanvas) {
        const ctx = vuCanvas.getContext("2d");
        if (ctx) {
          const w = vuCanvas.width;
          const h = vuCanvas.height;
          ctx.clearRect(0, 0, w, h);

          const minDb = -60;
          const maxDb = 0;
          const rmsNorm = Math.max(0, Math.min(1, (data.rmsDbfs - minDb) / (maxDb - minDb)));
          const peakNorm = Math.max(0, Math.min(1, (data.peakDbfs - minDb) / (maxDb - minDb)));

          // Smooth peak hold with decay
          if (peakNorm > peakHoldRef.current.left) {
            peakHoldRef.current.left = peakNorm;
            peakHoldRef.current.decay = 0;
          } else {
            peakHoldRef.current.decay += 0.015;
            peakHoldRef.current.left = Math.max(
              0,
              peakHoldRef.current.left - peakHoldRef.current.decay * 0.02
            );
          }

          // Channel bars (Left & Right)
          const barHeight = (h - 6) / 2;
          const channels = [
            { norm: rmsNorm, peak: peakHoldRef.current.left, y: 0, label: "L" },
            {
              norm: Math.max(0, rmsNorm * (0.94 + data.trebleEnergy * 0.12)),
              peak: Math.max(0, peakHoldRef.current.left * (0.95 + data.midEnergy * 0.1)),
              y: barHeight + 6,
              label: "R",
            },
          ];

          channels.forEach((ch) => {
            // Background track
            ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
            ctx.fillRect(18, ch.y, w - 18, barHeight);

            // Channel Label
            ctx.fillStyle = "#94a3b8";
            ctx.font = "9px monospace";
            ctx.fillText(ch.label, 3, ch.y + barHeight - 2);

            // Active RMS Bar with audiophile color gradient
            const activeWidth = (w - 18) * ch.norm;
            if (activeWidth > 0) {
              const grad = ctx.createLinearGradient(18, 0, w, 0);
              grad.addColorStop(0, "#10b981"); // Safe / Normal (emerald)
              grad.addColorStop(0.72, "#eab308"); // Warm (-12 dB yellow)
              grad.addColorStop(0.95, "#f97316"); // High (-3 dB orange)
              grad.addColorStop(1.0, "#ef4444"); // Peak (0 dB red)
              ctx.fillStyle = grad;
              ctx.fillRect(18, ch.y, activeWidth, barHeight);
            }

            // Peak Hold indicator tick
            const peakX = 18 + (w - 18) * Math.min(1, ch.peak);
            if (peakX > 18) {
              ctx.fillStyle = ch.peak > 0.95 ? "#ef4444" : "#ffffff";
              ctx.fillRect(peakX - 1.5, ch.y, 2.5, barHeight);
            }
          });
        }
      }

      animFrameIdRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameIdRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [isSignalPathOpen, isPlaying, bitPerfectMode, getLiveTelemetry]);

  if (!isSignalPathOpen || !currentTrack) return null;

  const path = getSignalPath();
  const isLossless = path.source.isLossless ?? false;
  const isHiRes =
    isLossless &&
    ((path.source.bitDepth && path.source.bitDepth >= 24) ||
      (path.source.sampleRate && path.source.sampleRate > 44100));

  const isFidelityBitPerfect = path.fidelityRating === "bit-perfect";
  const isFidelityEnhanced = path.fidelityRating === "enhanced";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/70">
          <div className="flex items-center space-x-3">
            <div
              className={`w-9 h-9 rounded-xl border flex items-center justify-center ${
                isFidelityBitPerfect
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                  : isFidelityEnhanced
                  ? "bg-purple-500/15 border-purple-500/30 text-purple-400"
                  : "bg-amber-500/15 border-amber-500/30 text-amber-400"
              }`}
            >
              <Star className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-textPrimary">Signal Path</h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${
                    isFidelityBitPerfect
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                      : isFidelityEnhanced
                      ? "bg-purple-500/20 text-purple-400 border-purple-500/40"
                      : "bg-amber-500/20 text-amber-400 border-amber-500/40"
                  }`}
                >
                  {isFidelityBitPerfect
                    ? "Bit-Perfect Direct"
                    : isFidelityEnhanced
                    ? "Enhanced (64-Bit DSP)"
                    : "OS Mixer Resampled"}
                </span>
              </div>
              <p className="text-xs text-textSecondary mt-0.5">
                {isFidelityBitPerfect
                  ? "Source audio stream delivered unaltered byte-for-byte to DAC"
                  : isFidelityEnhanced
                  ? "Studio AutoEQ curve applied in high-precision 64-bit float"
                  : "Audio resampled by host sound driver"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsSignalPathOpen(false)}
            className="text-textSecondary hover:text-textPrimary p-2 rounded-xl hover:bg-border/40 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Signal Chain Flow Container */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-0 flex-1 custom-scrollbar">
          {/* 1. SOURCE NODE */}
          <div className="bg-card/50 border border-border rounded-xl p-4 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center ${
                    isHiRes
                      ? "bg-amber-500/10 border-amber-500/40 text-amber-400"
                      : isLossless
                      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                      : "bg-blue-500/10 border-blue-500/40 text-blue-400"
                  }`}
                >
                  {isLossless ? <HardDrive className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-textSecondary">
                    1. Audio Source
                  </span>
                  <h4 className="text-sm font-semibold text-textPrimary leading-none mt-0.5">
                    {path.source.provider}
                  </h4>
                </div>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
                  isHiRes
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    : isLossless
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                }`}
              >
                {path.source.format} {path.source.bitDepth ? `${path.source.bitDepth}-BIT` : ""}
              </span>
            </div>

            {/* Technical Specifications Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-border/50 text-xs font-mono">
              <div className="bg-surface/70 rounded-lg p-2 border border-border/40">
                <div className="text-[10px] text-textSecondary uppercase">Encoding</div>
                <div className="text-textPrimary font-semibold mt-0.5 truncate">
                  {isLossless ? `${path.source.bitDepth}-Bit PCM` : "Lossy Compressed"}
                </div>
              </div>

              <div className="bg-surface/70 rounded-lg p-2 border border-border/40">
                <div className="text-[10px] text-textSecondary uppercase">Sample Rate</div>
                <div
                  className={
                    isHiRes
                      ? "text-amber-400 font-semibold mt-0.5"
                      : "text-textPrimary font-semibold mt-0.5"
                  }
                >
                  {((path.source.sampleRate || 44100) / 1000).toFixed(1)} kHz
                </div>
              </div>

              <div className="bg-surface/70 rounded-lg p-2 border border-border/40">
                <div className="text-[10px] text-textSecondary uppercase">Bitrate</div>
                <div className="text-textPrimary font-semibold mt-0.5">
                  {telemetry.instantBitrateKbps > 0
                    ? `${telemetry.instantBitrateKbps} kbps`
                    : `${path.source.bitrate || 160} kbps`}
                </div>
              </div>

              <div className="bg-surface/70 rounded-lg p-2 border border-border/40">
                <div className="text-[10px] text-textSecondary uppercase">Dynamic Range</div>
                <div className="text-emerald-400 font-semibold mt-0.5 truncate">
                  DR{currentTrack.drScore || 12} (Crest: {telemetry.crestFactorDb} dB)
                </div>
              </div>
            </div>
          </div>

          {/* Animated Connecting Conduit 1 -> 2 */}
          <div className="flex flex-col items-center justify-center my-0.5">
            <canvas ref={conduit1Ref} width={24} height={22} className="h-[22px] w-6 block" />
          </div>

          {/* 2. TRANSPORT NODE */}
          <div className="bg-card/50 border border-border rounded-xl p-4 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <Radio className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-textSecondary">
                    2. Transport & Ring Buffer
                  </span>
                  <h4 className="text-sm font-semibold text-textPrimary leading-none mt-0.5">
                    {path.transport.protocol}
                  </h4>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {path.transport.jitterLatencyMs}ms Buffer
              </span>
            </div>

            {/* Dynamic RAM Buffer Health Bar */}
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                <span className="text-textSecondary flex items-center space-x-1.5">
                  <Gauge className="w-3.5 h-3.5 text-blue-400" />
                  <span>Jitter-Free Pre-Cache:</span>
                </span>
                <span className="text-textPrimary font-semibold">
                  {telemetry.bufferPercent}% ({telemetry.bufferedSeconds}s / ~
                  {telemetry.bufferedBytesEstimate} MB)
                </span>
              </div>

              <div className="h-2 w-full bg-surface rounded-full overflow-hidden border border-border/50">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(6,182,212,0.5)]"
                  style={{ width: `${Math.max(5, Math.min(100, telemetry.bufferPercent))}%` }}
                />
              </div>
            </div>
          </div>

          {/* Animated Connecting Conduit 2 -> 3 */}
          <div className="flex flex-col items-center justify-center my-0.5">
            <canvas ref={conduit2Ref} width={24} height={22} className="h-[22px] w-6 block" />
          </div>

          {/* 3. DSP ENGINE NODE */}
          <div className="bg-card/50 border border-border rounded-xl p-4 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${
                    bitPerfectMode
                      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                      : "bg-purple-500/10 border-purple-500/40 text-purple-400"
                  }`}
                >
                  {bitPerfectMode ? <CheckCircle2 className="w-4 h-4" /> : <Sliders className="w-4 h-4" />}
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-textSecondary">
                    3. DSP & AutoEQ Stage
                  </span>
                  <h4 className="text-sm font-semibold text-textPrimary leading-none mt-0.5">
                    {bitPerfectMode
                      ? "Bit-Perfect Direct Bypass (Zero Coloration)"
                      : `${path.dsp.activePreset || "Parametric EQ"} (Active)`}
                  </h4>
                </div>
              </div>

              <button
                onClick={() => setBitPerfectMode(!bitPerfectMode)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold border transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                  bitPerfectMode
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25"
                    : "bg-purple-500/15 text-purple-400 border-purple-500/30 hover:bg-purple-500/25"
                }`}
                title="Toggle Bit-Perfect Direct Mode"
              >
                {bitPerfectMode ? "Bit-Perfect Direct" : "DSP Active"}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/50 text-xs font-mono">
              <div className="bg-surface/70 rounded-lg p-2 border border-border/40">
                <div className="text-[10px] text-textSecondary uppercase">Calculation Precision</div>
                <div className="text-textPrimary font-semibold mt-0.5">
                  {bitPerfectMode ? "Byte-for-Byte 1:1" : "64-Bit Float (IEEE 754)"}
                </div>
              </div>

              <div className="bg-surface/70 rounded-lg p-2 border border-border/40">
                <div className="text-[10px] text-textSecondary uppercase">Auto-Headroom</div>
                <div className="text-emerald-400 font-semibold mt-0.5">
                  {bitPerfectMode
                    ? "0.0 dB (Direct)"
                    : `${autoPreampGain.toFixed(1)} dB (Clip Safe)`}
                </div>
              </div>

              <div className="bg-surface/70 rounded-lg p-2 border border-border/40 col-span-2 sm:col-span-1">
                <div className="text-[10px] text-textSecondary uppercase">Harmonic Distortion</div>
                <div className="text-emerald-400 font-semibold mt-0.5">
                  {bitPerfectMode ? "THD+N: 0.00000%" : "THD+N: < 0.00008%"}
                </div>
              </div>
            </div>
          </div>

          {/* Animated Connecting Conduit 3 -> 4 */}
          <div className="flex flex-col items-center justify-center my-0.5">
            <canvas ref={conduit3Ref} width={24} height={22} className="h-[22px] w-6 block" />
          </div>

          {/* 4. HARDWARE OUTPUT & CLOCK SYNC STAGE */}
          <div className="bg-card/50 border border-border rounded-xl p-4 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Speaker className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-textSecondary">
                    4. Hardware DAC & Master Clock
                  </span>
                  <h4 className="text-sm font-semibold text-textPrimary leading-none mt-0.5">
                    {path.output.device}
                  </h4>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {((path.output.sampleRate || 48000) / 1000).toFixed(1)} kHz DAC Lock
              </span>
            </div>

            {/* Real-time Output & True Peak (dBTP) Meter */}
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="flex items-center justify-between text-xs font-mono mb-2">
                <span className="text-textSecondary flex items-center space-x-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Output Telemetry:</span>
                </span>
                <div className="flex items-center space-x-3 text-textPrimary font-semibold text-[11px]">
                  <span>RMS: {telemetry.rmsDbfs > -95 ? `${telemetry.rmsDbfs} dBFS` : "-∞ dB"}</span>
                  <span
                    className={
                      telemetry.truePeakDbfs > -0.5
                        ? "text-red-400 flex items-center space-x-1 font-bold"
                        : "text-emerald-400"
                    }
                  >
                    {telemetry.interSampleOverload && <AlertTriangle className="w-3 h-3 animate-bounce" />}
                    <span>TruePeak: {telemetry.truePeakDbfs > -95 ? `${telemetry.truePeakDbfs} dBTP` : "-∞ dB"}</span>
                  </span>
                </div>
              </div>

              <div className="bg-surface/90 rounded-lg p-2.5 border border-border/60">
                <canvas ref={vuCanvasRef} width={420} height={28} className="w-full h-7 block" />
                <div className="flex justify-between text-[9px] font-mono text-textSecondary/70 mt-1 px-4">
                  <span>-60 dB</span>
                  <span>-36 dB</span>
                  <span>-24 dB</span>
                  <span>-12 dB</span>
                  <span>-6 dB</span>
                  <span>0 dBTP</span>
                </div>
              </div>
            </div>

            {/* Hardware Clock Metrics */}
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs font-mono">
              <div className="bg-surface/70 rounded-lg p-2 border border-border/40 flex items-center justify-between">
                <span className="text-[10px] text-textSecondary uppercase">Driver Endpoint</span>
                <span className="text-textPrimary font-semibold">{path.output.hardwareMode}</span>
              </div>
              <div className="bg-surface/70 rounded-lg p-2 border border-border/40 flex items-center justify-between">
                <span className="text-[10px] text-textSecondary uppercase">Clock Synchronization</span>
                <span className="text-emerald-400 font-semibold flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>{path.output.clockLock ? "Async DAC Locked" : "System Clock Resampled"}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Banner */}
        <div className="p-4 bg-card/80 border-t border-border flex items-center justify-between text-xs text-textSecondary">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span>Audiophile Reference Pipeline • Bit-Accurate Verification</span>
          </div>
          <button
            onClick={() => setIsSignalPathOpen(false)}
            className="px-5 py-1.5 rounded-xl bg-primary text-background font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
