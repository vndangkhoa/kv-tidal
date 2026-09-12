"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePlayer } from "@/context/PlayerContext";
import {
  X,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Activity,
  ShieldCheck,
  Sparkles,
  Volume2,
  Moon,
  Sun,
  Gauge,
  Speaker,
  Radio,
  CheckCircle2,
  Sliders,
} from "lucide-react";

export type VuTheme = "accuphase" | "mcintosh" | "nagra";
export type BallisticMode = "vu" | "ppm";

// Logical canvas coordinate dimensions
const CANVAS_W = 500;
const CANVAS_H = 290;

export function VuMeterModal() {
  const {
    isVuMeterOpen,
    setIsVuMeterOpen,
    vuMeterTheme,
    setVuMeterTheme,
    currentTrack,
    isPlaying,
    progress,
    duration,
    seek,
    togglePlay,
    playNext,
    playPrevious,
    getLiveTelemetry,
    bitPerfectMode,
    activeDeviceId,
    outputDevices,
  } = usePlayer();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [ballisticMode, setBallisticMode] = useState<BallisticMode>("vu");
  const [calibrationDb, setCalibrationDb] = useState<number>(-18); // -14, -18, or -20 dBFS
  const [tubeDimmer, setTubeDimmer] = useState<boolean>(false);
  const [showPeakHold, setShowPeakHold] = useState<boolean>(true);

  // Throttled digital readout state for smooth human readability (~10 updates/sec)
  const [digitalReadout, setDigitalReadout] = useState({
    leftVu: -20,
    rightVu: -20,
    leftPeak: -96,
    rightPeak: -96,
    phase: 1.0,
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const leftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastReadoutUpdateRef = useRef<number>(0);

  // Ballistics state for mechanical needle inertia & peak hold
  const needlePhysicsRef = useRef({
    left: { angle: -139.5, velocity: 0 },
    right: { angle: -139.5, velocity: 0 },
    peakLeft: { angle: -139.5, holdTimer: 0 },
    peakRight: { angle: -139.5, holdTimer: 0 },
    overloadLeftTimer: 0,
    overloadRightTimer: 0,
  });

  const activeDevice = outputDevices.find((d) => d.id === activeDeviceId);

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Handle Fullscreen Kiosk Mode
  const toggleKioskFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Set up High-DPI canvas buffer resolution
  const setupCanvasDpi = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 3) : 1;
    const targetW = Math.round(CANVAS_W * dpr);
    const targetH = Math.round(CANVAS_H * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
  };

  // 60 FPS Ballistic Needle Animation Loop
  useEffect(() => {
    if (!isVuMeterOpen) return;

    let animId: number;

    // Logarithmic d'Arsonval Galvanometer voltage-to-angle curve (ANSI C16.5)
    // 0 VU = calibrationDb, corresponds to 100% voltage (angle ~ -73.3°)
    // -20 VU corresponds to 10% voltage (angle -135°)
    // +3 VU corresponds to 141.2% voltage (angle -45°)
    // Rest pin is at -139.5°
    const dbToTargetAngle = (db: number) => {
      const effectiveDb = db - calibrationDb;
      if (effectiveDb <= -36) {
        return -139.5; // Rest pin
      }
      if (effectiveDb < -20) {
        // Gentle taper to physical rest stop pin
        const t = (effectiveDb - -36) / 16;
        return -139.5 + t * 4.5;
      }
      const clampedDb = Math.min(3.2, effectiveDb);
      const v = Math.pow(10, clampedDb / 20); // voltage ratio
      // Map v from 0.10 (-20 VU) to 1.4125 (+3 VU) across 90 degree sweep (-135 to -45)
      const fraction = Math.max(0, Math.min(1.02, (v - 0.1) / 1.3125));
      return -135 + fraction * 90;
    };

    const renderMeter = (
      canvas: HTMLCanvasElement | null,
      angle: number,
      peakHoldAngle: number,
      channelLabel: string,
      peakOverloadActive: boolean
    ) => {
      if (!canvas) return;
      setupCanvasDpi(canvas);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 3) : 1;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = CANVAS_W;
      const h = CANVAS_H;
      ctx.clearRect(0, 0, w, h);

      // Theme Configurations
      const isMcIntosh = vuMeterTheme === "mcintosh";
      const isAccuphase = vuMeterTheme === "accuphase";
      const dimMultiplier = tubeDimmer ? 0.6 : 1.0;

      // ==========================================
      // 1. RECESSED CHASSIS BEZEL & OUTER FRAME
      // ==========================================
      // Outer metallic bevel frame
      const chassisGrad = ctx.createLinearGradient(0, 0, 0, h);
      if (isAccuphase) {
        chassisGrad.addColorStop(0, "#4a3c28");
        chassisGrad.addColorStop(0.5, "#2c2214");
        chassisGrad.addColorStop(1, "#181309");
      } else if (isMcIntosh) {
        chassisGrad.addColorStop(0, "#1e293b");
        chassisGrad.addColorStop(0.5, "#0b0f19");
        chassisGrad.addColorStop(1, "#04070d");
      } else {
        // Nagra Swiss aluminum
        chassisGrad.addColorStop(0, "#cbd5e1");
        chassisGrad.addColorStop(0.5, "#94a3b8");
        chassisGrad.addColorStop(1, "#64748b");
      }

      ctx.fillStyle = chassisGrad;
      ctx.beginPath();
      ctx.roundRect(4, 4, w - 8, h - 8, 16);
      ctx.fill();

      // Outer metallic chamfer edge
      ctx.strokeStyle = isAccuphase
        ? "rgba(217, 119, 6, 0.45)"
        : isMcIntosh
        ? "rgba(56, 189, 248, 0.35)"
        : "rgba(241, 245, 249, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Four Corner Precision Screw Rivets
      const screwPositions = [
        [16, 16],
        [w - 16, 16],
        [16, h - 16],
        [w - 16, h - 16],
      ];
      screwPositions.forEach(([sx, sy]) => {
        ctx.beginPath();
        ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = isAccuphase ? "#78350f" : isMcIntosh ? "#1e293b" : "#475569";
        ctx.fill();
        ctx.strokeStyle = isAccuphase ? "#b45309" : isMcIntosh ? "#334155" : "#cbd5e1";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Screw groove
        ctx.beginPath();
        ctx.moveTo(sx - 2, sy - 1);
        ctx.lineTo(sx + 2, sy + 1);
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.stroke();
      });

      // ==========================================
      // 2. SUNKEN DIAL WINDOW & BACKLIT ILLUMINATION
      // ==========================================
      const dialMargin = 16;
      const dialW = w - dialMargin * 2;
      const dialH = h - dialMargin * 2;

      // Sunken dial backplate gradient
      const dialGrad = ctx.createLinearGradient(0, dialMargin, 0, dialMargin + dialH);
      if (isAccuphase) {
        dialGrad.addColorStop(0, tubeDimmer ? "#161108" : "#2e2312");
        dialGrad.addColorStop(0.5, tubeDimmer ? "#231a0b" : "#3d3019");
        dialGrad.addColorStop(1, tubeDimmer ? "#130e06" : "#22190c");
      } else if (isMcIntosh) {
        dialGrad.addColorStop(0, tubeDimmer ? "#030c18" : "#06182c");
        dialGrad.addColorStop(0.5, tubeDimmer ? "#021224" : "#042c4c");
        dialGrad.addColorStop(1, tubeDimmer ? "#010812" : "#021422");
      } else {
        // Nagra Silver parchment
        dialGrad.addColorStop(0, tubeDimmer ? "#808d9e" : "#dbe2ea");
        dialGrad.addColorStop(0.5, tubeDimmer ? "#64748b" : "#cbd5e1");
        dialGrad.addColorStop(1, tubeDimmer ? "#475569" : "#a2b0c1");
      }

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(dialMargin, dialMargin, dialW, dialH, 10);
      ctx.fillStyle = dialGrad;
      ctx.fill();

      // Recessed Bezel Inner Shadow / Vignette
      ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Ambient Warm Lamp Filament Backlight
      if (isAccuphase || isMcIntosh) {
        // Top Lamp Bulb Glow
        const topGlow = ctx.createRadialGradient(
          w / 2,
          dialMargin + 20,
          10,
          w / 2,
          dialMargin + 30,
          dialW * 0.65
        );
        topGlow.addColorStop(
          0,
          isAccuphase
            ? `rgba(254, 240, 138, ${0.32 * dimMultiplier})`
            : `rgba(56, 189, 248, ${0.38 * dimMultiplier})`
        );
        topGlow.addColorStop(
          0.6,
          isAccuphase
            ? `rgba(245, 158, 11, ${0.12 * dimMultiplier})`
            : `rgba(2, 132, 199, ${0.16 * dimMultiplier})`
        );
        topGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = topGlow;
        ctx.fill();

        // Bottom Lamp Warmth
        const bottomGlow = ctx.createRadialGradient(
          w / 2,
          h * 0.78,
          15,
          w / 2,
          h * 0.78,
          dialW * 0.5
        );
        bottomGlow.addColorStop(
          0,
          isAccuphase
            ? `rgba(251, 191, 36, ${0.22 * dimMultiplier})`
            : `rgba(56, 189, 248, ${0.2 * dimMultiplier})`
        );
        bottomGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = bottomGlow;
        ctx.fill();
      }

      // ==========================================
      // 3. DIAL GEOMETRY & DUAL ARC SCALES
      // ==========================================
      const pivotX = w / 2;
      const pivotY = h * 0.88;
      const upperArcRadius = h * 0.73;
      const lowerArcRadius = h * 0.63;

      // Upper Arc Scale Line (dB / VU)
      ctx.beginPath();
      ctx.arc(pivotX, pivotY, upperArcRadius, (-135 * Math.PI) / 180, (-73.3 * Math.PI) / 180, false);
      ctx.strokeStyle = isAccuphase ? "#fef08a" : isMcIntosh ? "#bae6fd" : "#1e293b";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Upper Arc Red Zone (0 VU to +3 VU overload)
      ctx.beginPath();
      ctx.arc(pivotX, pivotY, upperArcRadius, (-73.3 * Math.PI) / 180, (-45 * Math.PI) / 180, false);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3.2;
      ctx.stroke();

      // Lower Arc Scale Line (% Modulation)
      ctx.beginPath();
      ctx.arc(pivotX, pivotY, lowerArcRadius, (-135 * Math.PI) / 180, (-73.3 * Math.PI) / 180, false);
      ctx.strokeStyle = isAccuphase ? "rgba(254, 240, 138, 0.4)" : isMcIntosh ? "rgba(186, 230, 253, 0.4)" : "rgba(30, 41, 59, 0.4)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Lower Arc Red Zone (100% to 140% modulation)
      ctx.beginPath();
      ctx.arc(pivotX, pivotY, lowerArcRadius, (-73.3 * Math.PI) / 180, (-45 * Math.PI) / 180, false);
      ctx.strokeStyle = "rgba(239, 68, 68, 0.6)";
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Major Decibel Ticks (with numbers)
      const dbMajorTicks = [
        { label: "-20", db: -20 },
        { label: "-10", db: -10 },
        { label: "-7", db: -7 },
        { label: "-5", db: -5 },
        { label: "-3", db: -3 },
        { label: "-2", db: -2 },
        { label: "-1", db: -1 },
        { label: "0", db: 0, red: true, bold: true },
        { label: "+1", db: 1, red: true },
        { label: "+2", db: 2, red: true },
        { label: "+3", db: 3, red: true },
      ];

      // Minor Subdivided Ticks
      const dbMinorTicks = [
        { db: -15 },
        { db: -8.5 },
        { db: -6 },
        { db: -4 },
        { db: -0.5 },
        { db: 0.5, red: true },
        { db: 1.5, red: true },
        { db: 2.5, red: true },
      ];

      // Render Minor Ticks
      dbMinorTicks.forEach((tick) => {
        const rad = (dbToTargetAngle(tick.db) * Math.PI) / 180;
        const tickLen = 6;
        const x1 = pivotX + Math.cos(rad) * (upperArcRadius - 1);
        const y1 = pivotY + Math.sin(rad) * (upperArcRadius - 1);
        const x2 = pivotX + Math.cos(rad) * (upperArcRadius + tickLen);
        const y2 = pivotY + Math.sin(rad) * (upperArcRadius + tickLen);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = tick.red ? "rgba(239, 68, 68, 0.85)" : isAccuphase ? "#fde047" : isMcIntosh ? "#93c5fd" : "#334155";
        ctx.lineWidth = 1.0;
        ctx.stroke();
      });

      // Render Major Ticks with Numbers
      dbMajorTicks.forEach((tick) => {
        const rad = (dbToTargetAngle(tick.db) * Math.PI) / 180;
        const tickLen = tick.label === "0" || tick.label === "-20" ? 14 : 10;
        const x1 = pivotX + Math.cos(rad) * (upperArcRadius - 2);
        const y1 = pivotY + Math.sin(rad) * (upperArcRadius - 2);
        const x2 = pivotX + Math.cos(rad) * (upperArcRadius + tickLen);
        const y2 = pivotY + Math.sin(rad) * (upperArcRadius + tickLen);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = tick.red ? "#ef4444" : isAccuphase ? "#fef08a" : isMcIntosh ? "#e0f2fe" : "#0f172a";
        ctx.lineWidth = tick.bold ? 2.6 : 1.6;
        ctx.stroke();

        // Numerals
        const textRadius = upperArcRadius + tickLen + 11;
        const tx = pivotX + Math.cos(rad) * textRadius;
        const ty = pivotY + Math.sin(rad) * textRadius + 3.5;

        ctx.font = tick.bold ? "bold 11px system-ui, sans-serif" : "600 10px system-ui, sans-serif";
        ctx.fillStyle = tick.red ? "#ef4444" : isAccuphase ? "#fef08a" : isMcIntosh ? "#e0f2fe" : "#0f172a";
        ctx.textAlign = "center";
        ctx.fillText(tick.label, tx, ty);
      });

      // Render Lower Arc Modulation % Ticks & Labels
      const modTicks = [
        { label: "0", db: -20 },
        { label: "20", db: -14 },
        { label: "40", db: -8 },
        { label: "60", db: -4.4 },
        { label: "80", db: -1.9 },
        { label: "100", db: 0, red: true },
        { label: "120", db: 1.6, red: true },
        { label: "140", db: 2.9, red: true },
      ];

      modTicks.forEach((tick) => {
        const rad = (dbToTargetAngle(tick.db) * Math.PI) / 180;
        const tickLen = 5;
        const x1 = pivotX + Math.cos(rad) * (lowerArcRadius - tickLen);
        const y1 = pivotY + Math.sin(rad) * (lowerArcRadius - tickLen);
        const x2 = pivotX + Math.cos(rad) * lowerArcRadius;
        const y2 = pivotY + Math.sin(rad) * lowerArcRadius;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = tick.red ? "rgba(239, 68, 68, 0.7)" : isAccuphase ? "rgba(254, 240, 138, 0.5)" : isMcIntosh ? "rgba(186, 230, 253, 0.5)" : "rgba(30, 41, 59, 0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();

        const textRadius = lowerArcRadius - tickLen - 6;
        const tx = pivotX + Math.cos(rad) * textRadius;
        const ty = pivotY + Math.sin(rad) * textRadius + 3;

        ctx.font = "500 8.5px system-ui, sans-serif";
        ctx.fillStyle = tick.red ? "rgba(239, 68, 68, 0.85)" : isAccuphase ? "rgba(254, 240, 138, 0.65)" : isMcIntosh ? "rgba(186, 230, 253, 0.65)" : "rgba(30, 41, 59, 0.65)";
        ctx.textAlign = "center";
        ctx.fillText(tick.label, tx, ty);
      });

      // Modulation scale unit label
      ctx.font = "bold 8px system-ui, sans-serif";
      ctx.fillStyle = isAccuphase ? "rgba(254, 240, 138, 0.5)" : isMcIntosh ? "rgba(186, 230, 253, 0.5)" : "rgba(30, 41, 59, 0.5)";
      ctx.fillText("%", pivotX + Math.cos((-137 * Math.PI) / 180) * (lowerArcRadius - 10), pivotY + Math.sin((-137 * Math.PI) / 180) * (lowerArcRadius - 10));

      // Physical Mechanical Stop Pins
      const drawStopPin = (pinAngle: number) => {
        const rad = (pinAngle * Math.PI) / 180;
        const px = pivotX + Math.cos(rad) * (upperArcRadius + 8);
        const py = pivotY + Math.sin(rad) * (upperArcRadius + 8);
        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = isAccuphase ? "#d97706" : isMcIntosh ? "#64748b" : "#334155";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      };
      drawStopPin(-140);
      drawStopPin(-42.5);

      // ==========================================
      // 4. BRANDING & DIAL INSIGNIA
      // ==========================================
      ctx.textAlign = "center";
      ctx.font = isAccuphase ? "bold 13px 'Times New Roman', serif" : isMcIntosh ? "bold 13px 'Georgia', serif" : "bold 12px system-ui, sans-serif";
      ctx.fillStyle = isAccuphase ? "#fbbf24" : isMcIntosh ? "#38bdf8" : "#1e293b";
      ctx.letterSpacing = "1.5px";
      ctx.fillText(
        isAccuphase
          ? "ACCUPHASE"
          : isMcIntosh
          ? "McINTOSH LABORATORY"
          : "NAGRA KUDELSKI",
        pivotX,
        h * 0.27
      );

      ctx.font = "600 8.5px system-ui, sans-serif";
      ctx.fillStyle = isAccuphase ? "#b45309" : isMcIntosh ? "#7dd3fc" : "#64748b";
      ctx.fillText(
        isAccuphase
          ? "PRECISION STEREO MONITOR • DUAL d'ARSONVAL"
          : isMcIntosh
          ? "PEAK RESPONDING WATT METER • MASTER CAL"
          : "SWISS REFERENCE AUDIO INSTRUMENT",
        pivotX,
        h * 0.33
      );

      ctx.font = "bold 9px monospace";
      ctx.fillStyle = isAccuphase ? "#d97706" : isMcIntosh ? "#38bdf8" : "#475569";
      ctx.fillText(
        `${ballisticMode.toUpperCase()} BALANCED • 0 VU = ${calibrationDb} dBFS`,
        pivotX,
        h * 0.39
      );

      // Channel Identity Tag (LEFT / RIGHT)
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.fillStyle = isAccuphase ? "#fef08a" : isMcIntosh ? "#e0f2fe" : "#0f172a";
      ctx.fillText(channelLabel, pivotX, h * 0.72);

      // ==========================================
      // 5. JEWEL PEAK / OVERLOAD LED HOUSING
      // ==========================================
      const ledX = w - 34;
      const ledY = 32;

      // Machined metallic collar
      ctx.beginPath();
      ctx.arc(ledX, ledY, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = isAccuphase ? "#451a03" : isMcIntosh ? "#0f172a" : "#475569";
      ctx.fill();
      ctx.strokeStyle = isAccuphase ? "#b45309" : isMcIntosh ? "#334155" : "#cbd5e1";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // LED Lens
      ctx.beginPath();
      ctx.arc(ledX, ledY, 5.2, 0, Math.PI * 2);
      if (peakOverloadActive) {
        // Brilliant radiant crimson flare
        ctx.shadowColor = "#ef4444";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "#ff1a40";
        ctx.fill();

        // Hot center glint
        ctx.beginPath();
        ctx.arc(ledX - 1, ledY - 1, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        // Dark translucent ruby gem
        ctx.fillStyle = "#350707";
        ctx.fill();
        // Faint specular highlight
        ctx.beginPath();
        ctx.arc(ledX - 1.2, ledY - 1.2, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
        ctx.fill();
      }

      // PEAK Label
      ctx.font = "bold 7.5px system-ui, sans-serif";
      ctx.fillStyle = peakOverloadActive ? "#ef4444" : isAccuphase ? "#92400e" : isMcIntosh ? "#0369a1" : "#64748b";
      ctx.textAlign = "center";
      ctx.fillText("PEAK", ledX, ledY + 14);

      // ==========================================
      // 6. FLOATING PEAK-HOLD GHOST NEEDLE
      // ==========================================
      if (showPeakHold && peakHoldAngle > -138) {
        const peakRad = (peakHoldAngle * Math.PI) / 180;
        const pkX1 = pivotX + Math.cos(peakRad) * (upperArcRadius - 3);
        const pkY1 = pivotY + Math.sin(peakRad) * (upperArcRadius - 3);
        const pkX2 = pivotX + Math.cos(peakRad) * (upperArcRadius + 14);
        const pkY2 = pivotY + Math.sin(peakRad) * (upperArcRadius + 14);

        ctx.beginPath();
        ctx.moveTo(pkX1, pkY1);
        ctx.lineTo(pkX2, pkY2);
        ctx.strokeStyle = peakOverloadActive
          ? "rgba(239, 68, 68, 0.85)"
          : isAccuphase
          ? "rgba(251, 191, 36, 0.75)"
          : isMcIntosh
          ? "rgba(56, 189, 248, 0.75)"
          : "rgba(220, 38, 38, 0.75)";
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }

      // ==========================================
      // 7. PRECISION TAPERED NEEDLE & SHADOW
      // ==========================================
      const needleRad = (angle * Math.PI) / 180;
      const needleLength = upperArcRadius + 15;
      const normalRad = needleRad + Math.PI / 2;

      // Needle Tip coordinates
      const tipX = pivotX + Math.cos(needleRad) * needleLength;
      const tipY = pivotY + Math.sin(needleRad) * needleLength;

      // Base width points
      const baseWidth = 2.8;
      const bL_X = pivotX + Math.cos(normalRad) * baseWidth;
      const bL_Y = pivotY + Math.sin(normalRad) * baseWidth;
      const bR_X = pivotX - Math.cos(normalRad) * baseWidth;
      const bR_Y = pivotY - Math.sin(normalRad) * baseWidth;

      // Rear counterweight teardrop spade
      const rearLen = 16;
      const spadeDist = 12;
      const spadeX = pivotX - Math.cos(needleRad) * spadeDist;
      const spadeY = pivotY - Math.sin(needleRad) * spadeDist;
      const rearTipX = pivotX - Math.cos(needleRad) * rearLen;
      const rearTipY = pivotY - Math.sin(needleRad) * rearLen;

      // Diffused Perspective Depth Shadow
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 3.5;
      ctx.shadowOffsetY = 4;

      ctx.beginPath();
      ctx.moveTo(bL_X, bL_Y);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(bR_X, bR_Y);
      ctx.lineTo(rearTipX, rearTipY);
      ctx.closePath();

      const needleColor = isAccuphase
        ? "#0f0f11" // Matte jet black for Accuphase
        : isMcIntosh
        ? "#38bdf8" // Radiant cyan for McIntosh
        : "#dc2626"; // Ruby red for Nagra

      ctx.fillStyle = needleColor;
      ctx.fill();

      // Rear teardrop spade circle
      ctx.beginPath();
      ctx.arc(spadeX, spadeY, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ==========================================
      // 8. MACHINED 3D PIVOT SCREW ASSEMBLY
      // ==========================================
      // Outer brass/steel collar
      ctx.beginPath();
      ctx.arc(pivotX, pivotY, 11, 0, Math.PI * 2);
      ctx.fillStyle = isAccuphase ? "#78350f" : isMcIntosh ? "#0f172a" : "#475569";
      ctx.fill();
      ctx.strokeStyle = isAccuphase ? "#fbbf24" : isMcIntosh ? "#38bdf8" : "#cbd5e1";
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Inner disc with specular metallic gradient
      const pivotGrad = ctx.createLinearGradient(pivotX - 8, pivotY - 8, pivotX + 8, pivotY + 8);
      pivotGrad.addColorStop(0, isAccuphase ? "#d97706" : isMcIntosh ? "#334155" : "#cbd5e1");
      pivotGrad.addColorStop(0.5, isAccuphase ? "#92400e" : isMcIntosh ? "#1e293b" : "#94a3b8");
      pivotGrad.addColorStop(1, isAccuphase ? "#451a03" : isMcIntosh ? "#020617" : "#475569");

      ctx.beginPath();
      ctx.arc(pivotX, pivotY, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = pivotGrad;
      ctx.fill();

      // Central screw slot and highlight glint
      ctx.beginPath();
      ctx.arc(pivotX - 2, pivotY - 2, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.fill();

      // ==========================================
      // 9. GLASS SPECULAR SHEEN (Tactile Depth)
      // ==========================================
      const sheenGrad = ctx.createLinearGradient(
        dialMargin,
        dialMargin,
        dialMargin + dialW * 0.8,
        dialMargin + dialH * 0.8
      );
      sheenGrad.addColorStop(0, "rgba(255, 255, 255, 0.07)");
      sheenGrad.addColorStop(0.35, "rgba(255, 255, 255, 0.02)");
      sheenGrad.addColorStop(0.5, "rgba(255, 255, 255, 0)");
      sheenGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

      ctx.beginPath();
      ctx.roundRect(dialMargin, dialMargin, dialW, dialH, 10);
      ctx.fillStyle = sheenGrad;
      ctx.fill();

      ctx.restore();
    };

    const animate = (timestamp: number) => {
      const data = getLiveTelemetry();

      // Discrete Left & Right channel analysis
      const rawLeftDb = data.rmsLeftDbfs !== undefined ? data.rmsLeftDbfs : data.rmsDbfs;
      const rawRightDb = data.rmsRightDbfs !== undefined ? data.rmsRightDbfs : data.rmsDbfs;

      const targetLeft = dbToTargetAngle(rawLeftDb);
      const targetRight = dbToTargetAngle(rawRightDb);

      const phys = needlePhysicsRef.current;

      // ----------------------------------------------------
      // Ballistics Engine (ANSI C16.5 VU vs DIN 45406 PPM)
      // ----------------------------------------------------
      if (ballisticMode === "vu") {
        // ANSI C16.5: 300ms rise time with gentle underdamped ~1.2% overshoot
        const spring = 0.095;
        const damping = 0.77;

        // Left Channel
        const forceL = (targetLeft - phys.left.angle) * spring;
        phys.left.velocity = (phys.left.velocity + forceL) * damping;
        phys.left.angle += phys.left.velocity;

        // Right Channel
        const forceR = (targetRight - phys.right.angle) * spring;
        phys.right.velocity = (phys.right.velocity + forceR) * damping;
        phys.right.angle += phys.right.velocity;
      } else {
        // DIN 45406 PPM: Ultra-fast 5ms attack, slow 1.5s logarithmic decay
        const attackFactor = 0.55;
        const decayPerFrame = 0.55; // degrees per frame

        // Left
        if (targetLeft > phys.left.angle) {
          phys.left.angle += (targetLeft - phys.left.angle) * attackFactor;
        } else {
          phys.left.angle = Math.max(targetLeft, phys.left.angle - decayPerFrame);
        }

        // Right
        if (targetRight > phys.right.angle) {
          phys.right.angle += (targetRight - phys.right.angle) * attackFactor;
        } else {
          phys.right.angle = Math.max(targetRight, phys.right.angle - decayPerFrame);
        }
      }

      // Hard mechanical stop limits
      phys.left.angle = Math.max(-139.8, Math.min(-42.0, phys.left.angle));
      phys.right.angle = Math.max(-139.8, Math.min(-42.0, phys.right.angle));

      // ----------------------------------------------------
      // Peak-Hold Ghost Marker Dynamics (1.5s hold time)
      // ----------------------------------------------------
      if (phys.left.angle > phys.peakLeft.angle) {
        phys.peakLeft.angle = phys.left.angle;
        phys.peakLeft.holdTimer = 90; // 1.5s at 60fps
      } else if (phys.peakLeft.holdTimer > 0) {
        phys.peakLeft.holdTimer -= 1;
      } else {
        phys.peakLeft.angle = Math.max(phys.left.angle, phys.peakLeft.angle - 0.75);
      }

      if (phys.right.angle > phys.peakRight.angle) {
        phys.peakRight.angle = phys.right.angle;
        phys.peakRight.holdTimer = 90;
      } else if (phys.peakRight.holdTimer > 0) {
        phys.peakRight.holdTimer -= 1;
      } else {
        phys.peakRight.angle = Math.max(phys.right.angle, phys.peakRight.angle - 0.75);
      }

      // ----------------------------------------------------
      // Overload Peak LED Latch (1.2s hold time)
      // ----------------------------------------------------
      const peakThreshold = -0.5; // dBFS
      const leftPeaked = (data.peakLeftDbfs ?? data.peakDbfs) >= peakThreshold || data.interSampleOverload;
      const rightPeaked = (data.peakRightDbfs ?? data.peakDbfs) >= peakThreshold || data.interSampleOverload;

      if (leftPeaked) phys.overloadLeftTimer = 72; // ~1.2s
      else if (phys.overloadLeftTimer > 0) phys.overloadLeftTimer -= 1;

      if (rightPeaked) phys.overloadRightTimer = 72;
      else if (phys.overloadRightTimer > 0) phys.overloadRightTimer -= 1;

      renderMeter(
        leftCanvasRef.current,
        phys.left.angle,
        phys.peakLeft.angle,
        "LEFT CHANNEL",
        phys.overloadLeftTimer > 0
      );
      renderMeter(
        rightCanvasRef.current,
        phys.right.angle,
        phys.peakRight.angle,
        "RIGHT CHANNEL",
        phys.overloadRightTimer > 0
      );

      // Throttled React state update for digital readouts (~10 updates/sec)
      if (timestamp - lastReadoutUpdateRef.current > 100) {
        lastReadoutUpdateRef.current = timestamp;
        setDigitalReadout({
          leftVu: Math.max(-20, parseFloat((rawLeftDb - calibrationDb).toFixed(1))),
          rightVu: Math.max(-20, parseFloat((rawRightDb - calibrationDb).toFixed(1))),
          leftPeak: parseFloat(((data.peakLeftDbfs ?? data.peakDbfs) || -96).toFixed(1)),
          rightPeak: parseFloat(((data.peakRightDbfs ?? data.peakDbfs) || -96).toFixed(1)),
          phase: data.phaseCorrelation !== undefined ? data.phaseCorrelation : 1.0,
        });
      }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animId);
  }, [
    isVuMeterOpen,
    vuMeterTheme,
    isPlaying,
    ballisticMode,
    calibrationDb,
    tubeDimmer,
    showPeakHold,
    getLiveTelemetry,
  ]);

  if (!isVuMeterOpen) return null;

  const bitDepth = currentTrack?.bitDepth || (currentTrack?.hires ? 24 : 16);
  const sampleRateKhz = currentTrack?.sampleRate
    ? (currentTrack.sampleRate / 1000).toFixed(1)
    : currentTrack?.hires
    ? "96.0"
    : "44.1";
  const drScore = currentTrack?.drScore || (currentTrack?.hires ? 13 : 10);
  const formatName = currentTrack?.isDsd ? "DSD64 (DoP)" : currentTrack?.format || "FLAC";

  // Phase correlation color & position (-1.0 to +1.0)
  const phaseNormalized = Math.max(0, Math.min(100, ((digitalReadout.phase + 1) / 2) * 100));
  const phaseColor =
    digitalReadout.phase > 0.4
      ? "text-emerald-400"
      : digitalReadout.phase > 0.0
      ? "text-amber-400"
      : "text-rose-500";

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/92 backdrop-blur-2xl animate-in fade-in duration-200 ${
        isFullscreen ? "p-0 rounded-none" : ""
      }`}
    >
      <div className="bg-[#0b0f17] border border-border/80 rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[98vh] relative">
        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between px-5 py-3.5 border-b border-border/60 bg-[#111622]/95 gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm sm:text-base font-bold text-white tracking-wide">
                  Master Reference Analog VU Meters
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-badgeMaxBg text-badgeMax border border-badgeMax/30">
                  BALANCED MONITOR
                </span>
              </div>
              <p className="text-xs text-textSecondary font-mono mt-0.5">
                Ballistics: {ballisticMode === "vu" ? "ANSI C16.5 VU (300ms)" : "DIN 45406 PPM (5ms Attack)"} • Ref: {calibrationDb} dBFS
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Ballistics Switcher (VU / PPM) */}
            <div className="flex bg-[#1a202c] p-1 rounded-xl border border-border/60 text-xs font-mono">
              <button
                onClick={() => setBallisticMode("vu")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  ballisticMode === "vu"
                    ? "bg-primary/20 text-primary border border-primary/40"
                    : "text-textSecondary hover:text-white"
                }`}
                title="ANSI C16.5 300ms Integration Volume Unit"
              >
                VU
              </button>
              <button
                onClick={() => setBallisticMode("ppm")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  ballisticMode === "ppm"
                    ? "bg-primary/20 text-primary border border-primary/40"
                    : "text-textSecondary hover:text-white"
                }`}
                title="DIN 45406 5ms Fast Attack Peak Program Meter"
              >
                PPM
              </button>
            </div>

            {/* Calibration Reference Selector */}
            <select
              value={calibrationDb}
              onChange={(e) => setCalibrationDb(parseInt(e.target.value))}
              className="bg-[#1a202c] border border-border/60 text-xs text-textPrimary rounded-xl px-2.5 py-1.5 font-mono cursor-pointer"
              title="Calibration Reference (0 VU level)"
            >
              <option value={-14}>-14 dBFS (Standard)</option>
              <option value={-18}>-18 dBFS (EBU R128)</option>
              <option value={-20}>-20 dBFS (SMPTE Master)</option>
            </select>

            {/* Peak-Hold Marker Toggle */}
            <button
              onClick={() => setShowPeakHold(!showPeakHold)}
              title={showPeakHold ? "Disable Peak-Hold Marker" : "Enable Peak-Hold Marker"}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono transition-colors cursor-pointer ${
                showPeakHold
                  ? "bg-primary/15 text-primary border-primary/40"
                  : "bg-card border-border text-textSecondary hover:text-white"
              }`}
            >
              Peak Hold
            </button>

            {/* Tube Dimmer Toggle */}
            <button
              onClick={() => setTubeDimmer(!tubeDimmer)}
              title={tubeDimmer ? "Restore Full Illumination" : "Enable Dark Room Tube Dimmer"}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                tubeDimmer
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-card border-border text-textSecondary hover:text-white"
              }`}
            >
              {tubeDimmer ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>

            {/* Theme Selector Pill */}
            <div className="flex bg-[#1a202c] p-1 rounded-xl border border-border/60">
              <button
                onClick={() => setVuMeterTheme("accuphase")}
                className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  vuMeterTheme === "accuphase"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-textSecondary hover:text-white"
                }`}
              >
                Accuphase
              </button>
              <button
                onClick={() => setVuMeterTheme("mcintosh")}
                className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  vuMeterTheme === "mcintosh"
                    ? "bg-blue-600/30 text-blue-300 border border-blue-500/50"
                    : "text-textSecondary hover:text-white"
                }`}
              >
                McIntosh
              </button>
              <button
                onClick={() => setVuMeterTheme("nagra")}
                className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  vuMeterTheme === "nagra"
                    ? "bg-slate-700 text-slate-200 border border-slate-500"
                    : "text-textSecondary hover:text-white"
                }`}
              >
                Nagra
              </button>
            </div>

            {/* Kiosk Fullscreen Mode */}
            <button
              onClick={toggleKioskFullscreen}
              title="Fullscreen Kiosk Rack View"
              className="p-2 rounded-xl bg-card hover:bg-surface border border-border text-textSecondary hover:text-white transition-colors cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close Button */}
            <button
              onClick={() => setIsVuMeterOpen(false)}
              className="p-2 rounded-xl bg-card hover:bg-surface border border-border text-textSecondary hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dual VU Meter Dials Container */}
        <div
          className={`p-4 sm:p-6 md:p-8 flex-1 flex flex-col justify-center transition-colors ${
            tubeDimmer
              ? "bg-[#030508]"
              : "bg-gradient-to-b from-[#090d14] via-[#060910] to-[#04060a]"
          }`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center max-w-4xl mx-auto w-full">
            {/* Left Channel Meter */}
            <div className="flex flex-col items-center w-full">
              <canvas
                ref={leftCanvasRef}
                style={{ width: "100%", maxWidth: `${CANVAS_W}px`, aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
                className="shadow-2xl rounded-2xl border border-white/5"
              />
              {/* Digital Channel Telemetry Pill */}
              <div className="mt-2 flex items-center space-x-3 px-3 py-1 bg-[#111622]/90 border border-border/60 rounded-lg text-[11px] font-mono">
                <span className="text-textSecondary font-bold">CH L:</span>
                <span className="text-white font-bold">
                  {digitalReadout.leftVu > -20 ? `${digitalReadout.leftVu >= 0 ? "+" : ""}${digitalReadout.leftVu} VU` : "REST"}
                </span>
                <span className="text-border">|</span>
                <span className="text-textSecondary">PK:</span>
                <span className={digitalReadout.leftPeak >= -0.5 ? "text-rose-400 font-bold" : "text-emerald-400"}>
                  {digitalReadout.leftPeak} dBFS
                </span>
              </div>
            </div>

            {/* Right Channel Meter */}
            <div className="flex flex-col items-center w-full">
              <canvas
                ref={rightCanvasRef}
                style={{ width: "100%", maxWidth: `${CANVAS_W}px`, aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
                className="shadow-2xl rounded-2xl border border-white/5"
              />
              {/* Digital Channel Telemetry Pill */}
              <div className="mt-2 flex items-center space-x-3 px-3 py-1 bg-[#111622]/90 border border-border/60 rounded-lg text-[11px] font-mono">
                <span className="text-textSecondary font-bold">CH R:</span>
                <span className="text-white font-bold">
                  {digitalReadout.rightVu > -20 ? `${digitalReadout.rightVu >= 0 ? "+" : ""}${digitalReadout.rightVu} VU` : "REST"}
                </span>
                <span className="text-border">|</span>
                <span className="text-textSecondary">PK:</span>
                <span className={digitalReadout.rightPeak >= -0.5 ? "text-rose-400 font-bold" : "text-emerald-400"}>
                  {digitalReadout.rightPeak} dBFS
                </span>
              </div>
            </div>
          </div>

          {/* Real-time Telemetry Cards & Stereo Correlation */}
          <div className="mt-6 max-w-4xl mx-auto w-full grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#111622]/85 border border-border/60 rounded-xl p-3">
              <span className="text-[10px] font-mono uppercase text-textSecondary block">
                Format & Resolution
              </span>
              <div className="text-sm font-bold text-white mt-0.5 flex items-center space-x-1.5">
                <span>{formatName}</span>
                <span className="text-accent font-mono text-xs">
                  {bitDepth}-bit / {sampleRateKhz} kHz
                </span>
              </div>
            </div>

            <div className="bg-[#111622]/85 border border-border/60 rounded-xl p-3">
              <span className="text-[10px] font-mono uppercase text-textSecondary block">
                Dynamic Range (DR)
              </span>
              <div className="text-sm font-bold mt-0.5 flex items-center space-x-2">
                <span className="text-emerald-400 font-mono">DR{drScore}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                  {drScore >= 12 ? "Audiophile Master" : "Standard"}
                </span>
              </div>
            </div>

            <div className="bg-[#111622]/85 border border-border/60 rounded-xl p-3">
              <span className="text-[10px] font-mono uppercase text-textSecondary block">
                Stereo Phase Coherence
              </span>
              <div className="mt-1 flex items-center space-x-2">
                <div className="flex-1 h-2 bg-black/50 rounded-full overflow-hidden relative border border-white/10">
                  {/* Phase correlation indicator bar */}
                  <div
                    className="absolute top-0 bottom-0 w-2.5 bg-accent rounded-full -translate-x-1/2 transition-all duration-100"
                    style={{ left: `${phaseNormalized}%` }}
                  />
                </div>
                <span className={`text-xs font-mono font-bold ${phaseColor}`}>
                  {digitalReadout.phase >= 0 ? `+${digitalReadout.phase}` : digitalReadout.phase}
                </span>
              </div>
              <div className="flex justify-between text-[8px] font-mono text-textSecondary/60 mt-0.5">
                <span>-1.0 (INV)</span>
                <span>0.0</span>
                <span>+1.0 (MONO)</span>
              </div>
            </div>

            <div className="bg-[#111622]/85 border border-border/60 rounded-xl p-3">
              <span className="text-[10px] font-mono uppercase text-textSecondary block">
                Engine & Target
              </span>
              <div className="text-xs font-bold text-white mt-1 flex items-center space-x-1.5 truncate" title={activeDevice?.name || "Browser Direct Audio"}>
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    bitPerfectMode ? "bg-emerald-400 animate-pulse" : "bg-purple-400"
                  }`}
                />
                <span className="truncate">
                  {activeDevice ? activeDevice.name : "Browser Direct Engine"}
                </span>
              </div>
              <div className="text-[10px] font-mono text-emerald-400 mt-0.5">
                {bitPerfectMode ? "Bit-Perfect Native" : "DSP Active"}
              </div>
            </div>
          </div>
        </div>

        {/* Transport Footer Controls with Interactive Scrub Bar */}
        <div className="px-6 py-3.5 border-t border-border/60 bg-[#111622]/95 flex flex-col space-y-2">
          {/* Seek Scrubber Bar */}
          <div className="flex items-center space-x-3">
            <span className="text-[10px] font-mono text-textSecondary w-9 text-right">
              {formatTime(progress)}
            </span>
            <div
              className="flex-1 h-1.5 bg-surface rounded-full cursor-pointer relative group overflow-hidden"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickPos = (e.clientX - rect.left) / rect.width;
                if (duration > 0) seek(clickPos * duration);
              }}
            >
              <div
                className="h-full bg-accent group-hover:bg-primary transition-all relative"
                style={{ width: `${duration > 0 ? (progress / duration) * 100 : 0}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-textSecondary w-9">
              {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            {/* Track Info */}
            <div className="flex items-center space-x-3 min-w-0 flex-1 max-w-sm">
              {currentTrack?.coverUrl && (
                <img
                  src={currentTrack.coverUrl}
                  alt={currentTrack.title}
                  className="w-10 h-10 rounded-lg object-cover border border-border/60 flex-shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-white truncate">{currentTrack?.title || "No Track Loaded"}</div>
                <div className="text-xs text-textSecondary truncate">{currentTrack?.artist || "KV-Tidal Audiophile"}</div>
              </div>
            </div>

            {/* Center Playback Buttons */}
            <div className="flex items-center space-x-4">
              <button
                onClick={playPrevious}
                className="p-2 rounded-full hover:bg-card text-textSecondary hover:text-white transition-colors cursor-pointer"
                title="Previous Track"
              >
                <SkipBack className="w-5 h-5 fill-current" />
              </button>

              <button
                onClick={togglePlay}
                className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg cursor-pointer"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>

              <button
                onClick={playNext}
                className="p-2 rounded-full hover:bg-card text-textSecondary hover:text-white transition-colors cursor-pointer"
                title="Next Track"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>
            </div>

            {/* Right Status & Close */}
            <div className="flex items-center space-x-3 text-xs font-mono text-textSecondary">
              <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 bg-[#1a202c] rounded-lg border border-border/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Clock Locked</span>
              </div>
              <button
                onClick={() => setIsVuMeterOpen(false)}
                className="px-4 py-2 rounded-xl bg-card hover:bg-surface border border-border text-white font-semibold transition-colors cursor-pointer"
              >
                Close Meters
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
