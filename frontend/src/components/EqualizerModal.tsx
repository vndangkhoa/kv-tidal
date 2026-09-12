"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePlayer, AUTO_EQ_PRESETS, DEFAULT_PEQ_BANDS } from "@/context/PlayerContext";
import { PeqBand, PeqFilterType, AutoEqPreset } from "@/types";
import {
  X,
  Sliders,
  RotateCcw,
  ShieldCheck,
  Headphones,
  Sparkles,
  Layers,
  CheckCircle2,
  Activity,
  Search,
  Volume2,
} from "lucide-react";

export function EqualizerModal() {
  const {
    isEqOpen,
    setIsEqOpen,
    bitPerfectMode,
    setBitPerfectMode,
    peqBands,
    setPeqBand,
    applyAutoEqPreset,
    autoPreampGain,
    lrBalance,
    setLrBalance,
    activeAutoEqPreset,
  } = usePlayer();

  const [selectedBandIdx, setSelectedBandIdx] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<"visual" | "sliders">("visual");
  const [selectedPresetName, setSelectedPresetName] = useState<string>(
    activeAutoEqPreset || "Flat Bit-Perfect Direct"
  );
  const [presetSearch, setPresetSearch] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Compute combined frequency response curve across 20Hz - 20kHz
  useEffect(() => {
    if (!isEqOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // 1. Draw Grid Background
    ctx.fillStyle = "#0c1017";
    ctx.fillRect(0, 0, width, height);

    const minFreq = 20;
    const maxFreq = 20000;
    const minDb = -15;
    const maxDb = 15;

    const freqToX = (f: number) => {
      const logMin = Math.log10(minFreq);
      const logMax = Math.log10(maxFreq);
      const logF = Math.log10(Math.max(minFreq, Math.min(maxFreq, f)));
      return ((logF - logMin) / (logMax - logMin)) * width;
    };

    const dbToY = (db: number) => {
      const clamped = Math.max(minDb, Math.min(maxDb, db));
      return height - ((clamped - minDb) / (maxDb - minDb)) * height;
    };

    // Frequency Vertical Lines
    const gridFreqs = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.lineWidth = 1;
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";

    gridFreqs.forEach((f) => {
      const x = freqToX(f);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
      ctx.fillText(label, x + 3, height - 6);
    });

    // dB Horizontal Lines
    const gridDbs = [-12, -6, 0, 6, 12];
    gridDbs.forEach((db) => {
      const y = dbToY(db);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.strokeStyle = db === 0 ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = db === 0 ? 1.5 : 1;
      ctx.stroke();

      ctx.fillText(`${db > 0 ? `+${db}` : db} dB`, 6, y - 3);
    });

    // 2. Compute Frequency Response Curve
    const numPoints = 300;
    const curvePoints: { x: number; y: number }[] = [];

    for (let i = 0; i <= numPoints; i++) {
      const logMin = Math.log10(minFreq);
      const logMax = Math.log10(maxFreq);
      const f = Math.pow(10, logMin + (i / numPoints) * (logMax - logMin));

      let totalGainDb = 0;

      if (!bitPerfectMode) {
        peqBands.forEach((band) => {
          if (!band.enabled || band.gain === 0) return;
          const f0 = band.frequency;
          const G = band.gain;
          const Q = band.q || 1.41;

          if (band.type === "peaking") {
            const ratio = f / f0 - f0 / f;
            totalGainDb += G / (1 + Q * Q * ratio * ratio);
          } else if (band.type === "lowshelf") {
            const ratio = f / f0;
            totalGainDb += G / (1 + Math.pow(ratio, 2));
          } else if (band.type === "highshelf") {
            const ratio = f / f0;
            totalGainDb += (G * Math.pow(ratio, 2)) / (1 + Math.pow(ratio, 2));
          } else if (band.type === "lowpass") {
            if (f > f0) {
              totalGainDb -= 12 * Math.log2(f / f0);
            }
          } else if (band.type === "highpass") {
            if (f < f0) {
              totalGainDb -= 12 * Math.log2(f0 / f);
            }
          } else if (band.type === "notch") {
            const ratio = f / f0 - f0 / f;
            totalGainDb -= 18 / (1 + Q * Q * ratio * ratio);
          }
        });
      }

      curvePoints.push({ x: freqToX(f), y: dbToY(totalGainDb) });
    }

    // Draw Spline
    if (curvePoints.length > 0) {
      // Glow background under curve
      ctx.beginPath();
      ctx.moveTo(curvePoints[0].x, dbToY(0));
      curvePoints.forEach((pt) => ctx.lineTo(pt.x, pt.y));
      ctx.lineTo(curvePoints[curvePoints.length - 1].x, dbToY(0));
      ctx.closePath();
      const areaGrad = ctx.createLinearGradient(0, 0, 0, height);
      areaGrad.addColorStop(
        0,
        bitPerfectMode ? "rgba(16, 185, 129, 0.08)" : "rgba(168, 85, 247, 0.15)"
      );
      areaGrad.addColorStop(
        1,
        bitPerfectMode ? "rgba(16, 185, 129, 0.0)" : "rgba(168, 85, 247, 0.0)"
      );
      ctx.fillStyle = areaGrad;
      ctx.fill();

      // Main curve stroke
      ctx.beginPath();
      ctx.moveTo(curvePoints[0].x, curvePoints[0].y);
      for (let i = 1; i < curvePoints.length; i++) {
        ctx.lineTo(curvePoints[i].x, curvePoints[i].y);
      }
      ctx.strokeStyle = bitPerfectMode ? "#10b981" : "#a855f7";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = bitPerfectMode ? "#10b981" : "#a855f7";
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Draw Handles for each band on canvas
    if (!bitPerfectMode) {
      peqBands.forEach((band, idx) => {
        if (!band.enabled) return;
        const x = freqToX(band.frequency);
        const y = dbToY(band.gain);

        ctx.beginPath();
        ctx.arc(x, y, idx === selectedBandIdx ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = idx === selectedBandIdx ? "#ffffff" : "#c084fc";
        ctx.shadowColor = "#a855f7";
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = "#a855f7";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "9px 'JetBrains Mono', monospace";
        ctx.fillText(`${idx + 1}`, x - 2.5, y - 8);
      });
    }
  }, [isEqOpen, bitPerfectMode, peqBands, selectedBandIdx]);

  if (!isEqOpen) return null;

  const currentBand = peqBands[selectedBandIdx] || peqBands[0];

  const handleSelectPreset = (preset: AutoEqPreset) => {
    setSelectedPresetName(preset.name);
    applyAutoEqPreset(preset);
  };

  const filteredPresets = AUTO_EQ_PRESETS.filter(
    (p) =>
      p.name.toLowerCase().includes(presetSearch.toLowerCase()) ||
      p.description.toLowerCase().includes(presetSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/70">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-textPrimary">Parametric Equalizer</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  AUTO-EQ 2.0
                </span>
              </div>
              <p className="text-xs text-textSecondary">
                64-bit IEEE float parametric biquad DSP with auto-headroom protection
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsEqOpen(false)}
            className="text-textSecondary hover:text-textPrimary p-2 rounded-xl hover:bg-border/40 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {/* Top Bar: Mode Switcher & Auto-Headroom Protection Badge */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card/40 border border-border p-3.5 rounded-xl">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setBitPerfectMode(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  bitPerfectMode
                    ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20"
                    : "bg-surface border border-border text-textSecondary hover:text-white"
                }`}
              >
                Bit-Perfect Direct Bypass
              </button>
              <button
                onClick={() => setBitPerfectMode(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  !bitPerfectMode
                    ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                    : "bg-surface border border-border text-textSecondary hover:text-white"
                }`}
              >
                DSP Equalizer Engaged
              </button>
            </div>

            {/* Auto-Headroom Indicator */}
            <div className="flex items-center space-x-2 text-xs font-mono">
              <span className="text-textSecondary flex items-center space-x-1">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Auto-Headroom:</span>
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                {bitPerfectMode ? "0.0 dB (Direct)" : `${autoPreampGain.toFixed(1)} dB`}
              </span>
            </div>
          </div>

          {/* AutoEq Headphone Presets Section */}
          <div className="space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-textSecondary flex items-center space-x-1.5">
                <Headphones className="w-3.5 h-3.5 text-primary" />
                <span>Reference Headphone Calibration Profiles</span>
              </span>
              <div className="relative max-w-xs w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-textSecondary absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter headphones..."
                  value={presetSearch}
                  onChange={(e) => setPresetSearch(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1 text-xs bg-card border border-border rounded-lg text-white placeholder-textSecondary/60 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {filteredPresets.map((preset) => {
                const isSelected = selectedPresetName === preset.name;
                return (
                  <button
                    key={preset.name}
                    onClick={() => handleSelectPreset(preset)}
                    className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-purple-900/30 border-purple-500 text-white shadow-md shadow-purple-500/10"
                        : "bg-card/40 hover:bg-card border-border text-textSecondary hover:text-white"
                    }`}
                  >
                    <div className="text-xs font-bold truncate">{preset.name}</div>
                    <div className="text-[10px] text-textSecondary/80 truncate mt-0.5">
                      {preset.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bode Plot Frequency Response Canvas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-textSecondary font-mono">
              <span>Total System Frequency Response (20 Hz - 20 kHz)</span>
              <span className="text-purple-400 font-semibold">
                {bitPerfectMode ? "0.0 dB Flat (Bit-Perfect Direct)" : "Parametric Curve Active"}
              </span>
            </div>

            <div className="rounded-2xl overflow-hidden border border-border/80 shadow-inner">
              <canvas
                ref={canvasRef}
                width={850}
                height={200}
                className="w-full h-44 object-cover"
              />
            </div>
          </div>

          {/* L/R Acoustic Balance & Band Selector Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setActiveTab("visual")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === "visual"
                    ? "bg-purple-600 text-white"
                    : "bg-card border border-border text-textSecondary hover:text-white"
                }`}
              >
                Parametric Inspector
              </button>
              <button
                onClick={() => setActiveTab("sliders")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === "sliders"
                    ? "bg-purple-600 text-white"
                    : "bg-card border border-border text-textSecondary hover:text-white"
                }`}
              >
                10-Band Sliders
              </button>
            </div>

            {/* Acoustic Stereo Balance Slider */}
            <div className="flex items-center space-x-2 text-xs font-mono">
              <span className="text-textSecondary flex items-center space-x-1">
                <Volume2 className="w-3.5 h-3.5 text-primary" />
                <span>L/R Balance:</span>
              </span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.05}
                value={lrBalance}
                onChange={(e) => setLrBalance(parseFloat(e.target.value))}
                className="w-24 h-1 bg-border rounded-full appearance-none cursor-pointer accent-purple-500"
                title={`Stereo balance: ${lrBalance < 0 ? `Left ${(lrBalance * -100).toFixed(0)}%` : lrBalance > 0 ? `Right ${(lrBalance * 100).toFixed(0)}%` : "Center 0dB"}`}
              />
              <span className="w-12 text-right text-textPrimary font-semibold">
                {lrBalance === 0 ? "Center" : lrBalance < 0 ? `L${Math.abs(Math.round(lrBalance * 10))}` : `R${Math.round(lrBalance * 10)}`}
              </span>
            </div>
          </div>

          {/* Interactive Band Editors */}
          {activeTab === "visual" ? (
            <div
              className={`p-5 rounded-2xl bg-card/60 border border-border space-y-4 transition-opacity ${
                bitPerfectMode ? "opacity-40 pointer-events-none" : "opacity-100"
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-white">Select Filter Band:</span>
                  <div className="flex space-x-1">
                    {peqBands.map((band, idx) => (
                      <button
                        key={band.id}
                        onClick={() => setSelectedBandIdx(idx)}
                        className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                          idx === selectedBandIdx
                            ? "bg-purple-500 text-white shadow-md shadow-purple-500/30"
                            : band.enabled
                            ? "bg-surface hover:bg-card text-textSecondary hover:text-white border border-border"
                            : "bg-card/30 text-textSecondary/40 border border-border/40"
                        }`}
                      >
                        {idx + 1}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <label className="text-xs text-textSecondary flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentBand.enabled}
                      onChange={(e) => setPeqBand(selectedBandIdx, { enabled: e.target.checked })}
                      className="rounded text-purple-500 focus:ring-0 cursor-pointer"
                    />
                    <span className="font-bold text-white">Enable Band</span>
                  </label>
                </div>
              </div>

              {/* Band Parameter Sliders */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {/* Filter Type */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-mono text-textSecondary uppercase">
                    Filter Type
                  </span>
                  <select
                    value={currentBand.type}
                    onChange={(e) =>
                      setPeqBand(selectedBandIdx, { type: e.target.value as PeqFilterType })
                    }
                    className="w-full bg-surface border border-border text-white text-xs rounded-xl p-2 font-medium cursor-pointer"
                  >
                    <option value="peaking">Peaking (Bell)</option>
                    <option value="lowshelf">Low Shelf</option>
                    <option value="highshelf">High Shelf</option>
                    <option value="lowpass">Low Pass (High Cut)</option>
                    <option value="highpass">High Pass (Low Cut)</option>
                    <option value="notch">Notch Filter</option>
                  </select>
                </div>

                {/* Frequency */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-textSecondary uppercase">Frequency</span>
                    <span className="text-primary font-bold">
                      {Math.round(currentBand.frequency)} Hz
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={20000}
                    step={10}
                    value={currentBand.frequency}
                    onChange={(e) =>
                      setPeqBand(selectedBandIdx, { frequency: parseFloat(e.target.value) })
                    }
                    className="w-full accent-primary cursor-pointer"
                  />
                </div>

                {/* Gain */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-textSecondary uppercase">Gain</span>
                    <span className="text-purple-400 font-bold">
                      {currentBand.gain > 0
                        ? `+${currentBand.gain.toFixed(1)}`
                        : currentBand.gain.toFixed(1)}{" "}
                      dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={0.5}
                    value={currentBand.gain}
                    onChange={(e) =>
                      setPeqBand(selectedBandIdx, { gain: parseFloat(e.target.value) })
                    }
                    className="w-full accent-purple-400 cursor-pointer"
                  />
                </div>

                {/* Q Factor */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-textSecondary uppercase">Q Factor</span>
                    <span className="text-accent font-bold">{currentBand.q.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={10.0}
                    step={0.1}
                    value={currentBand.q}
                    onChange={(e) =>
                      setPeqBand(selectedBandIdx, { q: parseFloat(e.target.value) })
                    }
                    className="w-full accent-accent cursor-pointer"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* 10-Band Vertical Sliders Grid */
            <div
              className={`p-6 rounded-2xl bg-card/40 border border-border transition-opacity ${
                bitPerfectMode ? "opacity-35 pointer-events-none" : "opacity-100"
              }`}
            >
              <div className="flex items-end justify-between h-48 gap-2 sm:gap-4 px-2">
                {peqBands.map((band, idx) => (
                  <div
                    key={band.id}
                    className="flex flex-col items-center flex-1 h-full justify-between"
                  >
                    <span className="text-[10px] font-mono text-purple-400 font-bold">
                      {band.gain > 0 ? `+${band.gain.toFixed(1)}` : band.gain.toFixed(1)}
                    </span>

                    {/* Vertical Slider */}
                    <div className="relative flex items-center justify-center flex-1 my-2 w-full">
                      <input
                        type="range"
                        min={-12}
                        max={12}
                        step={0.5}
                        value={band.gain}
                        onChange={(e) => setPeqBand(idx, { gain: parseFloat(e.target.value) })}
                        className="h-32 w-1 accent-purple-400 appearance-none bg-border rounded-full cursor-pointer [writing-mode:vertical-lr] [direction:rtl]"
                      />
                    </div>

                    <span className="text-[10px] font-mono text-textSecondary font-medium">
                      {band.frequency >= 1000 ? `${band.frequency / 1000}k` : band.frequency}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center text-[10px] text-textSecondary font-mono mt-4 pt-2 border-t border-border/50 px-1">
                <span>-12 dB Cut</span>
                <span>0 dB Flat</span>
                <span>+12 dB Boost</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-card/70 border-t border-border flex items-center justify-between">
          <button
            onClick={() => handleSelectPreset(AUTO_EQ_PRESETS[0])}
            className="flex items-center space-x-1.5 px-4 py-2 text-xs text-textSecondary hover:text-textPrimary bg-surface border border-border rounded-xl transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Bit-Perfect Flat</span>
          </button>

          <button
            onClick={() => setIsEqOpen(false)}
            className="px-6 py-2.5 rounded-xl bg-primary text-black text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer shadow-lg shadow-primary/20"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}
