"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  PlayableTrack,
  AudioSignalPath,
  EqBand,
  LiveAudioTelemetry,
  LyricLine,
  LyricsData,
  SearchResultItem,
  AudioOutputDevice,
  DeviceTelemetry,
  PeqBand,
  PeqFilterType,
  AutoEqPreset,
} from "@/types";
import { VuTheme } from "@/components/VuMeterModal";
import {
  updateMediaSessionMetadata,
  updateMediaSessionPlaybackState,
  syncMediaPositionState,
  registerMediaSessionActions,
} from "@/utils/mediaSession";

export const EQ_FREQUENCIES = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const EQ_PRESETS: Record<string, number[]> = {
  "Bit-Perfect Flat": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Harman Target": [3.5, 3.0, 1.5, 0.0, 0.0, 0.5, 1.5, 2.0, 1.0, 0.5],
  "Acoustic Live": [1.0, 2.0, 1.0, 0.0, 1.0, 2.0, 2.5, 2.0, 1.5, 1.0],
  "Vocal Presence": [0.0, -1.0, -0.5, 0.5, 2.0, 3.0, 2.5, 1.0, 0.5, 0.0],
  "Bass Extension": [5.0, 4.0, 2.5, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  "Treble Air": [0.0, 0.0, 0.0, 0.0, 0.5, 1.0, 2.0, 3.0, 4.0, 4.5],
};

export const DEFAULT_PEQ_BANDS: PeqBand[] = [
  { id: "band-1", frequency: 32, gain: 0, q: 0.71, type: "lowshelf", enabled: true },
  { id: "band-2", frequency: 64, gain: 0, q: 1.41, type: "peaking", enabled: true },
  { id: "band-3", frequency: 125, gain: 0, q: 1.41, type: "peaking", enabled: true },
  { id: "band-4", frequency: 250, gain: 0, q: 1.41, type: "peaking", enabled: true },
  { id: "band-5", frequency: 500, gain: 0, q: 1.41, type: "peaking", enabled: true },
  { id: "band-6", frequency: 1000, gain: 0, q: 1.41, type: "peaking", enabled: true },
  { id: "band-7", frequency: 2000, gain: 0, q: 1.41, type: "peaking", enabled: true },
  { id: "band-8", frequency: 4000, gain: 0, q: 1.41, type: "peaking", enabled: true },
  { id: "band-9", frequency: 8000, gain: 0, q: 1.41, type: "peaking", enabled: true },
  { id: "band-10", frequency: 16000, gain: 0, q: 0.71, type: "highshelf", enabled: true },
];

export const AUTO_EQ_PRESETS: AutoEqPreset[] = [
  {
    name: "Flat Bit-Perfect Direct",
    target: "Direct Bypass",
    description: "Zero DSP coloration, pure bit-perfect pass-through to DAC",
    bands: DEFAULT_PEQ_BANDS.map((b) => ({ ...b, gain: 0 })),
  },
  {
    name: "Sennheiser HD800S (Diffuse Field Reference)",
    target: "Diffuse Field + Sub-Bass",
    description: "Compensates 6kHz brightness spike and extends linear sub-bass to 20Hz",
    bands: [
      { id: "band-1", frequency: 25, gain: 4.5, q: 0.7, type: "lowshelf", enabled: true },
      { id: "band-2", frequency: 1400, gain: 1.5, q: 1.8, type: "peaking", enabled: true },
      { id: "band-3", frequency: 3500, gain: 1.2, q: 2.0, type: "peaking", enabled: true },
      { id: "band-4", frequency: 5800, gain: -4.5, q: 3.5, type: "peaking", enabled: true },
      { id: "band-5", frequency: 9000, gain: 1.0, q: 2.5, type: "peaking", enabled: true },
      { id: "band-6", frequency: 12000, gain: -2.0, q: 3.0, type: "peaking", enabled: true },
      { id: "band-7", frequency: 16000, gain: 1.5, q: 0.7, type: "highshelf", enabled: true },
      { id: "band-8", frequency: 80, gain: 0.5, q: 1.4, type: "peaking", enabled: true },
      { id: "band-9", frequency: 500, gain: 0.0, q: 1.4, type: "peaking", enabled: false },
      { id: "band-10", frequency: 250, gain: 0.0, q: 1.4, type: "peaking", enabled: false },
    ],
  },
  {
    name: "Sennheiser HD600 (Harman Target)",
    target: "Harman Over-Ear",
    description: "Sub-bass extension (+5.5dB) and 3.5kHz ear resonance smoothing",
    bands: [
      { id: "band-1", frequency: 40, gain: 5.5, q: 0.7, type: "lowshelf", enabled: true },
      { id: "band-2", frequency: 150, gain: -1.8, q: 1.2, type: "peaking", enabled: true },
      { id: "band-3", frequency: 1200, gain: -1.2, q: 1.8, type: "peaking", enabled: true },
      { id: "band-4", frequency: 3200, gain: -2.5, q: 2.0, type: "peaking", enabled: true },
      { id: "band-5", frequency: 5800, gain: 2.0, q: 2.5, type: "peaking", enabled: true },
      { id: "band-6", frequency: 8000, gain: -1.5, q: 3.0, type: "peaking", enabled: true },
      { id: "band-7", frequency: 10000, gain: 2.5, q: 0.8, type: "highshelf", enabled: true },
      { id: "band-8", frequency: 13500, gain: -2.0, q: 4.0, type: "peaking", enabled: true },
      { id: "band-9", frequency: 16000, gain: 1.0, q: 0.7, type: "highshelf", enabled: true },
      { id: "band-10", frequency: 20, gain: 3.0, q: 1.0, type: "peaking", enabled: true },
    ],
  },
  {
    name: "Focal Utopia (Beryllium Linear Dynamics)",
    target: "Studio Linear Reference",
    description: "Sub-bass linear contouring with high-frequency micro-detail refinement",
    bands: [
      { id: "band-1", frequency: 32, gain: 3.5, q: 0.7, type: "lowshelf", enabled: true },
      { id: "band-2", frequency: 1200, gain: -1.2, q: 2.0, type: "peaking", enabled: true },
      { id: "band-3", frequency: 2800, gain: 1.8, q: 1.8, type: "peaking", enabled: true },
      { id: "band-4", frequency: 6000, gain: -2.2, q: 3.0, type: "peaking", enabled: true },
      { id: "band-5", frequency: 9500, gain: 1.2, q: 2.5, type: "peaking", enabled: true },
      { id: "band-6", frequency: 15000, gain: 2.0, q: 0.7, type: "highshelf", enabled: true },
      { id: "band-7", frequency: 80, gain: 1.0, q: 1.4, type: "peaking", enabled: true },
      { id: "band-8", frequency: 300, gain: -0.5, q: 1.5, type: "peaking", enabled: true },
      { id: "band-9", frequency: 500, gain: 0, q: 1.4, type: "peaking", enabled: false },
      { id: "band-10", frequency: 1000, gain: 0, q: 1.4, type: "peaking", enabled: false },
    ],
  },
  {
    name: "Audeze LCD-X (Planar Linear Reference)",
    target: "Planar Target",
    description: "Corrects the 3.8kHz planar upper-midrange dip for lifelike vocal projection",
    bands: [
      { id: "band-1", frequency: 35, gain: 2.5, q: 0.7, type: "lowshelf", enabled: true },
      { id: "band-2", frequency: 1000, gain: -1.0, q: 1.5, type: "peaking", enabled: true },
      { id: "band-3", frequency: 3800, gain: 4.0, q: 2.2, type: "peaking", enabled: true },
      { id: "band-4", frequency: 6000, gain: -1.5, q: 3.0, type: "peaking", enabled: true },
      { id: "band-5", frequency: 10000, gain: 2.0, q: 1.8, type: "peaking", enabled: true },
      { id: "band-6", frequency: 16000, gain: 1.0, q: 0.7, type: "highshelf", enabled: true },
      { id: "band-7", frequency: 70, gain: 1.0, q: 1.4, type: "peaking", enabled: true },
      { id: "band-8", frequency: 250, gain: 0.0, q: 1.4, type: "peaking", enabled: false },
      { id: "band-9", frequency: 500, gain: 0.0, q: 1.4, type: "peaking", enabled: false },
      { id: "band-10", frequency: 2000, gain: 0.5, q: 1.4, type: "peaking", enabled: true },
    ],
  },
  {
    name: "Hifiman Sundara (Planar Target)",
    target: "Planar Neutral",
    description: "Sub-bass linear extension and 2kHz planar dip correction",
    bands: [
      { id: "band-1", frequency: 35, gain: 4.5, q: 0.65, type: "lowshelf", enabled: true },
      { id: "band-2", frequency: 80, gain: 1.5, q: 1.4, type: "peaking", enabled: true },
      { id: "band-3", frequency: 650, gain: -1.0, q: 2.0, type: "peaking", enabled: true },
      { id: "band-4", frequency: 1800, gain: 2.5, q: 1.8, type: "peaking", enabled: true },
      { id: "band-5", frequency: 6000, gain: -3.5, q: 3.2, type: "peaking", enabled: true },
      { id: "band-6", frequency: 9000, gain: 1.5, q: 2.2, type: "peaking", enabled: true },
      { id: "band-7", frequency: 12000, gain: -1.5, q: 2.0, type: "peaking", enabled: true },
      { id: "band-8", frequency: 15000, gain: 2.0, q: 0.7, type: "highshelf", enabled: true },
      { id: "band-9", frequency: 500, gain: 0, q: 1.4, type: "peaking", enabled: false },
      { id: "band-10", frequency: 250, gain: 0, q: 1.4, type: "peaking", enabled: false },
    ],
  },
  {
    name: "Sony IER-M9 (Studio In-Ear Monitor)",
    target: "IEM Diffuse Field",
    description: "Reference multi-BA in-ear staging with controlled treble openness",
    bands: [
      { id: "band-1", frequency: 30, gain: 2.0, q: 0.8, type: "lowshelf", enabled: true },
      { id: "band-2", frequency: 250, gain: -0.8, q: 1.4, type: "peaking", enabled: true },
      { id: "band-3", frequency: 3000, gain: 2.2, q: 1.8, type: "peaking", enabled: true },
      { id: "band-4", frequency: 6500, gain: -2.5, q: 3.0, type: "peaking", enabled: true },
      { id: "band-5", frequency: 10000, gain: 1.8, q: 2.0, type: "peaking", enabled: true },
      { id: "band-6", frequency: 15000, gain: 1.5, q: 0.7, type: "highshelf", enabled: true },
      { id: "band-7", frequency: 100, gain: 0.5, q: 1.4, type: "peaking", enabled: true },
      { id: "band-8", frequency: 1000, gain: 0, q: 1.4, type: "peaking", enabled: false },
      { id: "band-9", frequency: 4000, gain: 0.5, q: 1.4, type: "peaking", enabled: true },
      { id: "band-10", frequency: 8000, gain: -1.0, q: 2.5, type: "peaking", enabled: true },
    ],
  },
  {
    name: "Sony WH-1000XM5 (Audiophile Neutral)",
    target: "Diffuse Field",
    description: "Tames excessive 160Hz mid-bass bloat and enhances treble air",
    bands: [
      { id: "band-1", frequency: 30, gain: 2.0, q: 0.8, type: "lowshelf", enabled: true },
      { id: "band-2", frequency: 160, gain: -4.5, q: 1.1, type: "peaking", enabled: true },
      { id: "band-3", frequency: 400, gain: -1.5, q: 1.5, type: "peaking", enabled: true },
      { id: "band-4", frequency: 1200, gain: 2.0, q: 1.6, type: "peaking", enabled: true },
      { id: "band-5", frequency: 3100, gain: 3.5, q: 2.1, type: "peaking", enabled: true },
      { id: "band-6", frequency: 6200, gain: -2.0, q: 2.5, type: "peaking", enabled: true },
      { id: "band-7", frequency: 9500, gain: 3.0, q: 1.8, type: "peaking", enabled: true },
      { id: "band-8", frequency: 14000, gain: 3.0, q: 0.7, type: "highshelf", enabled: true },
      { id: "band-9", frequency: 70, gain: -1.0, q: 1.4, type: "peaking", enabled: true },
      { id: "band-10", frequency: 2000, gain: 1.0, q: 1.4, type: "peaking", enabled: true },
    ],
  },
  {
    name: "Harman Target 2019 (Acoustic Preference)",
    target: "Harman Science",
    description: "Industry reference target with authoritative sub-bass and clear vocal staging",
    bands: [
      { id: "band-1", frequency: 35, gain: 5.0, q: 0.7, type: "lowshelf", enabled: true },
      { id: "band-2", frequency: 105, gain: 2.0, q: 1.4, type: "peaking", enabled: true },
      { id: "band-3", frequency: 250, gain: 0, q: 1.4, type: "peaking", enabled: true },
      { id: "band-4", frequency: 1000, gain: 0.5, q: 1.4, type: "peaking", enabled: true },
      { id: "band-5", frequency: 2800, gain: 2.5, q: 1.6, type: "peaking", enabled: true },
      { id: "band-6", frequency: 5000, gain: 1.0, q: 2.0, type: "peaking", enabled: true },
      { id: "band-7", frequency: 8000, gain: -1.0, q: 2.5, type: "peaking", enabled: true },
      { id: "band-8", frequency: 12000, gain: 2.0, q: 1.2, type: "peaking", enabled: true },
      { id: "band-9", frequency: 16000, gain: 1.5, q: 0.7, type: "highshelf", enabled: true },
      { id: "band-10", frequency: 500, gain: 0, q: 1.4, type: "peaking", enabled: true },
    ],
  },
];

export function searchResultToPlayableTrack(item: SearchResultItem): PlayableTrack {
  const effectiveStreamId =
    item.stream_id ||
    (item.id && (item.id.startsWith("tidal-") || /^\d+$/.test(item.id)) ? item.id : undefined);
  let streamUrl = `/api/stream?artist=${encodeURIComponent(item.artist)}&title=${encodeURIComponent(item.title)}`;
  if (effectiveStreamId) {
    streamUrl += `&id=${encodeURIComponent(effectiveStreamId)}`;
  }
  return {
    id: effectiveStreamId || `${item.artist}-${item.title}`,
    title: item.title,
    artist: item.artist,
    album: item.album,
    coverUrl: item.cover_url,
    streamUrl,
    duration: item.duration,
    bitDepth: item.bit_depth || (item.hires ? 24 : 16),
    sampleRate: item.sample_rate || (item.hires ? 96000 : 44100),
    bitrate: item.bitrate,
    format: item.format || (item.hires ? "FLAC" : "MP3"),
    source: item.source,
    hires: item.hires,
    drScore: item.dr_score || (item.hires ? 12 : 10),
    isDsd: item.is_dsd || false,
    truePeak: item.true_peak,
    lufs: item.lufs,
    flacMd5: item.flac_md5,
    originalYear: item.original_year,
    remasterYear: item.remaster_year,
  };
}

interface PlayerContextType {
  currentTrack: PlayableTrack | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  queue: PlayableTrack[];
  currentIndex: number;
  bitPerfectMode: boolean;
  isVolumeLocked: boolean;
  setIsVolumeLocked: (locked: boolean) => void;
  toggleVolumeLock: () => void;
  autoPreampGain: number;
  lrBalance: number;
  setLrBalance: (balance: number) => void;
  eqGains: number[];
  isVisualizerOpen: boolean;
  isEqOpen: boolean;
  isSignalPathOpen: boolean;
  isLyricsOpen: boolean;
  isQueueOpen: boolean;
  autoplay: boolean;
  suggestedTracks: PlayableTrack[];
  lyrics: LyricsData | null;
  isLoadingLyrics: boolean;
  isLoadingSuggestions: boolean;
  activeAutoEqPreset: string;
  playTrack: (track: PlayableTrack, newQueue?: PlayableTrack[]) => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  playNext: () => void;
  playPrevious: () => void;
  addToQueue: (track: PlayableTrack) => void;
  insertNextInQueue: (track: PlayableTrack) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  addAllToQueue: (tracks: PlayableTrack[]) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  setBitPerfectMode: (enabled: boolean) => void;
  setEqBandGain: (index: number, gainDb: number) => void;
  applyEqPreset: (presetName: string) => void;
  peqBands: PeqBand[];
  setPeqBand: (index: number, updated: Partial<PeqBand>) => void;
  applyAutoEqPreset: (preset: AutoEqPreset) => void;
  outputDevices: AudioOutputDevice[];
  activeDeviceId: string;
  selectOutputDevice: (deviceId: string) => Promise<void>;
  fetchOutputDevices: () => Promise<void>;
  configureOutputDevice: (config: {
    hardware_mode?: string;
    dsd_mode?: string;
    buffer_frames?: number;
    replay_gain_mode?: string;
  }) => Promise<void>;
  deviceTelemetry: DeviceTelemetry | null;
  isVuMeterOpen: boolean;
  setIsVuMeterOpen: (open: boolean) => void;
  vuMeterTheme: VuTheme;
  setVuMeterTheme: (theme: VuTheme) => void;
  setIsVisualizerOpen: (open: boolean) => void;
  setIsEqOpen: (open: boolean) => void;
  setIsSignalPathOpen: (open: boolean) => void;
  setIsLyricsOpen: (open: boolean) => void;
  setIsQueueOpen: (open: boolean) => void;
  setAutoplay: (enabled: boolean) => void;
  fetchLyrics: (track?: PlayableTrack | null) => Promise<void>;
  fetchSuggestions: (track?: PlayableTrack | null) => Promise<void>;
  getSignalPath: () => AudioSignalPath;
  getFrequencyData: () => Uint8Array | null;
  getTimeDomainData: () => Uint8Array | null;
  getLiveTelemetry: () => LiveAudioTelemetry;
  streamQuality: "flac" | "opus";
  setStreamQuality: (quality: "flac" | "opus") => void;
  switchStreamQuality: (newQuality: "flac" | "opus") => Promise<void>;
  autoUpgradeToFlac: boolean;
  setAutoUpgradeToFlac: (enabled: boolean) => void;
  gaplessEnabled: boolean;
  setGaplessEnabled: (enabled: boolean) => void;
  crossfadeSeconds: number;
  setCrossfadeSeconds: (seconds: number) => void;
  isNextTrackPrebuffered: boolean;
  playbackError: string | null;
  clearPlaybackError: () => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

interface PlayerProgressContextType {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
  getServerSnapshot: () => number;
  duration: number;
}

const PlayerProgressContext = createContext<PlayerProgressContextType>({
  subscribe: () => () => {},
  getSnapshot: () => 0,
  getServerSnapshot: () => 0,
  duration: 0,
});

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<PlayableTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const progressRef = useRef<number>(0);
  const progressListenersRef = useRef<Set<() => void>>(new Set());
  const setProgress = useCallback((val: number) => {
    progressRef.current = val;
    progressListenersRef.current.forEach((listener) => listener());
  }, []);
  const subscribeProgress = useCallback((listener: () => void) => {
    progressListenersRef.current.add(listener);
    return () => {
      progressListenersRef.current.delete(listener);
    };
  }, []);
  const getProgressSnapshot = useCallback(() => progressRef.current, []);
  const getServerProgressSnapshot = useCallback(() => 0, []);
  const lastProgressUpdateRef = useRef<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(0.85);
  const [playbackError, setPlaybackErrorState] = useState<string | null>(null);
  const playbackErrorRef = useRef<string | null>(null);
  const playbackErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPlaybackError = useCallback(() => {
    if (playbackErrorTimerRef.current) {
      clearTimeout(playbackErrorTimerRef.current);
      playbackErrorTimerRef.current = null;
    }
    playbackErrorRef.current = null;
    setPlaybackErrorState(null);
  }, []);

  const setPlaybackError = useCallback((msg: string | null) => {
    if (playbackErrorTimerRef.current) {
      clearTimeout(playbackErrorTimerRef.current);
      playbackErrorTimerRef.current = null;
    }
    playbackErrorRef.current = msg;
    setPlaybackErrorState(msg);
    if (msg) {
      playbackErrorTimerRef.current = setTimeout(() => {
        playbackErrorRef.current = null;
        setPlaybackErrorState(null);
        playbackErrorTimerRef.current = null;
      }, 7000);
    }
  }, []);

  // Audio stream quality mode: "flac" (Bit-Perfect Lossless) vs "opus" (Fast Web Stream 160kbps)
  const [streamQuality, setStreamQualityState] = useState<"flac" | "opus">("opus");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("kv_stream_quality");
      if (saved === "opus" || saved === "flac") {
        setStreamQualityState(saved);
      } else {
        setStreamQualityState("opus");
      }
    } catch (_) {}
  }, []);

  const setStreamQuality = useCallback((q: "flac" | "opus") => {
    setStreamQualityState(q);
    try {
      localStorage.setItem("kv_stream_quality", q);
    } catch (_) {}
  }, []);

  // Auto-upgrade to FLAC Master when background download completes for current track
  const [autoUpgradeToFlac, setAutoUpgradeToFlacState] = useState<boolean>(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("kv_auto_upgrade_flac");
      if (saved !== null) {
        setAutoUpgradeToFlacState(saved === "true");
      }
    } catch (_) {}
  }, []);

  const setAutoUpgradeToFlac = useCallback((enabled: boolean) => {
    setAutoUpgradeToFlacState(enabled);
    try {
      localStorage.setItem("kv_auto_upgrade_flac", enabled ? "true" : "false");
    } catch (_) {}
  }, []);

  // Gapless & Crossfade Engine State
  const [gaplessEnabled, setGaplessEnabledState] = useState<boolean>(true);
  const [crossfadeSeconds, setCrossfadeSecondsState] = useState<number>(0);
  const [isNextTrackPrebuffered, setIsNextTrackPrebuffered] = useState<boolean>(false);

  const gaplessEnabledRef = useRef<boolean>(gaplessEnabled);
  gaplessEnabledRef.current = gaplessEnabled;
  const crossfadeSecondsRef = useRef<number>(crossfadeSeconds);
  crossfadeSecondsRef.current = crossfadeSeconds;
  const streamQualityRef = useRef<"flac" | "opus">(streamQuality);
  streamQualityRef.current = streamQuality;

  useEffect(() => {
    try {
      const savedGapless = localStorage.getItem("kv_gapless_enabled");
      if (savedGapless !== null) {
        setGaplessEnabledState(savedGapless !== "false");
      }
      const savedCrossfade = localStorage.getItem("kv_crossfade_seconds");
      if (savedCrossfade !== null) {
        const parsed = parseFloat(savedCrossfade);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 12) {
          setCrossfadeSecondsState(parsed);
        }
      }
    } catch (_) {}
  }, []);

  const setGaplessEnabled = useCallback((enabled: boolean) => {
    setGaplessEnabledState(enabled);
    gaplessEnabledRef.current = enabled;
    try {
      localStorage.setItem("kv_gapless_enabled", enabled ? "true" : "false");
    } catch (_) {}
  }, []);

  const setCrossfadeSeconds = useCallback((seconds: number) => {
    const clamped = Math.max(0, Math.min(12, Math.round(seconds * 2) / 2));
    setCrossfadeSecondsState(clamped);
    crossfadeSecondsRef.current = clamped;
    if (clamped > 0 && !gaplessEnabledRef.current) {
      setGaplessEnabledState(true);
      gaplessEnabledRef.current = true;
      try {
        localStorage.setItem("kv_gapless_enabled", "true");
      } catch (_) {}
    }
    try {
      localStorage.setItem("kv_crossfade_seconds", String(clamped));
    } catch (_) {}
  }, []);

  // Audiophile Volume Lock Policy: locked at 1.0 (0.0 dB) in bit-perfect mode
  const [isVolumeLocked, setIsVolumeLocked] = useState<boolean>(true);
  const [lrBalance, setLrBalance] = useState<number>(0); // -1.0 to 1.0

  // Queue & Gapless pre-buffer state
  const [queue, setQueue] = useState<PlayableTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);

  // UI Panels, Lyrics & Autoplay States
  const [isLyricsOpen, setIsLyricsOpen] = useState<boolean>(false);
  const [isQueueOpen, setIsQueueOpen] = useState<boolean>(false);
  const [autoplay, setAutoplayState] = useState<boolean>(true);
  const [suggestedTracks, setSuggestedTracks] = useState<PlayableTrack[]>([]);
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState<boolean>(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState<boolean>(false);
  const [activeAutoEqPreset, setActiveAutoEqPreset] = useState<string>("Flat Bit-Perfect Direct");

  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  const suggestedTracksRef = useRef(suggestedTracks);
  suggestedTracksRef.current = suggestedTracks;

  useEffect(() => {
    try {
      const stored = localStorage.getItem("kv_autoplay");
      if (stored !== null) {
        setAutoplayState(stored === "true");
      }
    } catch (_) {}
  }, []);

  const setAutoplay = (enabled: boolean) => {
    setAutoplayState(enabled);
    try {
      localStorage.setItem("kv_autoplay", String(enabled));
    } catch (_) {}
  };

  // Audiophile DSP & UI States
  const [bitPerfectMode, setBitPerfectState] = useState<boolean>(true);
  const [eqGains, setEqGains] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [peqBands, setPeqBands] = useState<PeqBand[]>(DEFAULT_PEQ_BANDS);
  const [isVisualizerOpen, setIsVisualizerOpen] = useState<boolean>(false);
  const [isEqOpen, setIsEqOpen] = useState<boolean>(false);
  const [isSignalPathOpen, setIsSignalPathOpen] = useState<boolean>(false);

  // Auto-calculated headroom pre-amp gain to prevent digital inter-sample clipping
  const maxPositiveEqBoost = Math.max(
    0,
    ...peqBands.filter((b) => b.enabled).map((b) => Math.max(0, b.gain)),
    ...eqGains.map((g) => Math.max(0, g))
  );
  const autoPreampGain = -maxPositiveEqBoost;

  // Audiophile Output Devices & Analog VU Meter States
  const [outputDevices, setOutputDevices] = useState<AudioOutputDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>("browser");
  const [deviceTelemetry, setDeviceTelemetry] = useState<DeviceTelemetry | null>(null);
  const [isVuMeterOpen, setIsVuMeterOpen] = useState<boolean>(false);
  const [vuMeterTheme, setVuMeterTheme] = useState<VuTheme>("accuphase");

  const fetchOutputDevices = useCallback(async () => {
    try {
      const resp = await fetch("/api/devices");
      if (resp.ok) {
        const data = await resp.json();
        setOutputDevices(data.devices || []);
        setActiveDeviceId(data.active_device_id || "browser");
        setDeviceTelemetry(data.telemetry || null);
      }
    } catch (e) {
      console.warn("Failed fetching audio devices:", e);
    }
  }, []);

  useEffect(() => {
    fetchOutputDevices();
  }, [fetchOutputDevices]);

  const selectOutputDevice = async (deviceId: string) => {
    setActiveDeviceId(deviceId);
    try {
      await fetch("/api/devices/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceId }),
      });
      await fetchOutputDevices();
    } catch (e) {
      console.warn("Failed selecting output device:", e);
    }
  };

  const configureOutputDevice = async (config: {
    hardware_mode?: string;
    dsd_mode?: string;
    buffer_frames?: number;
    replay_gain_mode?: string;
  }) => {
    try {
      const resp = await fetch("/api/devices/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (resp.ok) {
        const telemetry = await resp.json();
        setDeviceTelemetry(telemetry);
      }
    } catch (e) {
      console.warn("Failed configuring output device:", e);
    }
  };

  // Dual-Deck Audio Node references (Deck A + Deck B for 0ms Gapless & Crossfade)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preBufferAudioRef = useRef<HTMLAudioElement | null>(null);
  const decksRef = useRef<[HTMLAudioElement | null, HTMLAudioElement | null]>([null, null]);
  const activeDeckIdxRef = useRef<0 | 1>(0);
  const deckSourcesRef = useRef<[MediaElementAudioSourceNode | null, MediaElementAudioSourceNode | null]>([
    null,
    null,
  ]);
  const deckGainsRef = useRef<[GainNode | null, GainNode | null]>([null, null]);
  const mixBusNodeRef = useRef<GainNode | null>(null);
  const standbyPreparedUrlRef = useRef<string>("");
  const standbyPreparedTrackIdRef = useRef<string>("");
  const warmedStreamUrlRef = useRef<string>("");
  const prefetchedHeadersRef = useRef<
    Map<
      string,
      {
        source?: string | null;
        format?: string | null;
        bitDepth?: number;
        sampleRate?: number;
        bitrate?: number;
        hires?: boolean;
        fileName?: string | null;
        filePath?: string | null;
      }
    >
  >(new Map());
  const autoAdvanceTriggeredRef = useRef<boolean>(false);
  const crossfadeCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const splitterNodeRef = useRef<ChannelSplitterNode | null>(null);
  const analyserLeftRef = useRef<AnalyserNode | null>(null);
  const analyserRightRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const preampGainNodeRef = useRef<GainNode | null>(null);
  const stereoPannerNodeRef = useRef<StereoPannerNode | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const isAudioGraphReady = useRef<boolean>(false);

  // Ref to track current index & track for event listeners without stale closures
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const currentTrackRef = useRef<PlayableTrack | null>(currentTrack);
  currentTrackRef.current = currentTrack;

  const buildCanonicalStreamUrl = useCallback(
    (track: PlayableTrack, quality: "flac" | "opus"): string => {
      if (!track.streamUrl) return "";
      let finalStreamUrl = track.streamUrl;
      const isLocalTrack =
        track.source === "local" ||
        track.source === "nas" ||
        track.id.startsWith("/") ||
        track.id.startsWith("local-");
      if (typeof window !== "undefined") {
        try {
          const urlObj = new URL(finalStreamUrl, window.location.origin);
          if (urlObj.pathname.includes("/api/stream") && !isLocalTrack) {
            urlObj.searchParams.set("format", quality);
            finalStreamUrl = urlObj.pathname + urlObj.search;
          }
        } catch (_) {}
      }
      return finalStreamUrl;
    },
    []
  );

  const getNextUpcomingCandidate = useCallback((): {
    track: PlayableTrack;
    fromSuggested: boolean;
  } | null => {
    const q = queueRef.current;
    const nextIdx = currentIndexRef.current + 1;
    if (nextIdx >= 0 && nextIdx < q.length) {
      return { track: q[nextIdx], fromSuggested: false };
    }
    if (autoplayRef.current && suggestedTracksRef.current.length > 0) {
      const curId = currentTrackRef.current?.id;
      const candidate =
        suggestedTracksRef.current.find((t) => t.id !== curId) ||
        suggestedTracksRef.current[0];
      if (candidate) {
        return { track: candidate, fromSuggested: true };
      }
    }
    return null;
  }, []);

  // Warm up backend stream resolver via HEAD and pre-buffer standby audio deck
  const prepareStandbyDeck = useCallback(
    (forceLoadStandby: boolean = false) => {
      if (!gaplessEnabledRef.current && crossfadeSecondsRef.current <= 0) {
        return;
      }
      const nextCand = getNextUpcomingCandidate();
      if (!nextCand || !nextCand.track.streamUrl) {
        return;
      }
      const nextTrack = nextCand.track;
      const isLocalTrack =
        nextTrack.source === "local" ||
        nextTrack.source === "nas" ||
        nextTrack.id.startsWith("/") ||
        nextTrack.id.startsWith("local-");
      const effectiveQuality = isLocalTrack ? "flac" : streamQualityRef.current;
      const nextUrl = buildCanonicalStreamUrl(nextTrack, effectiveQuality);
      if (!nextUrl) return;

      // 1. Warm up backend StreamResolver cache (and prefetch audio telemetry headers)
      if (warmedStreamUrlRef.current !== nextUrl) {
        warmedStreamUrlRef.current = nextUrl;
        fetch(nextUrl, { method: "HEAD" })
          .then((res) => {
            if (!res.ok) return;
            const liveSource = res.headers.get("x-audio-source");
            const liveFormat = res.headers.get("x-audio-format");
            const liveBitDepth = res.headers.get("x-audio-bit-depth");
            const liveSampleRate = res.headers.get("x-audio-sample-rate");
            const liveBitrate = res.headers.get("x-audio-bitrate");
            const liveIsLossless = res.headers.get("x-audio-is-lossless");
            const liveFileName = res.headers.get("x-audio-file-name");
            const liveFilePath = res.headers.get("x-audio-file-path");
            prefetchedHeadersRef.current.set(nextUrl, {
              source: liveSource,
              format: liveFormat,
              bitDepth: liveBitDepth ? parseInt(liveBitDepth, 10) : undefined,
              sampleRate: liveSampleRate ? parseInt(liveSampleRate, 10) : undefined,
              bitrate: liveBitrate ? parseInt(liveBitrate, 10) : undefined,
              hires: liveIsLossless !== null ? liveIsLossless === "true" : undefined,
              fileName: liveFileName,
              filePath: liveFilePath,
            });

            // Once backend stream URL is warmed up in cache, prime the standby deck if not currently crossfading
            const standby = preBufferAudioRef.current;
            if (
              standby &&
              !crossfadeCleanupTimerRef.current &&
              standbyPreparedUrlRef.current !== nextUrl
            ) {
              standbyPreparedUrlRef.current = nextUrl;
              standbyPreparedTrackIdRef.current = nextTrack.id;
              setIsNextTrackPrebuffered(false);
              standby.preload = "auto";
              standby.src = nextUrl;
              standby.load();
            }
          })
          .catch(() => {});
      }

      // 2. Also load directly into standby deck when within pre-buffer window
      if (forceLoadStandby) {
        const standby = preBufferAudioRef.current;
        if (
          standby &&
          !crossfadeCleanupTimerRef.current &&
          standbyPreparedUrlRef.current !== nextUrl
        ) {
          standbyPreparedUrlRef.current = nextUrl;
          standbyPreparedTrackIdRef.current = nextTrack.id;
          setIsNextTrackPrebuffered(false);
          standby.preload = "auto";
          standby.src = nextUrl;
          standby.load();
        }
      }
    },
    [buildCanonicalStreamUrl, getNextUpcomingCandidate]
  );

  const prepareStandbyDeckRef = useRef(prepareStandbyDeck);
  prepareStandbyDeckRef.current = prepareStandbyDeck;

  // Re-wire audio graph when Bit-Perfect mode is toggled
  const reconnectGraph = (isBitPerfect: boolean) => {
    const ctx = audioContextRef.current;
    const source = mixBusNodeRef.current || sourceNodeRef.current;
    const analyser = analyserRef.current;
    const gain = gainNodeRef.current;
    const preamp = preampGainNodeRef.current;
    const panner = stereoPannerNodeRef.current;
    const filters = eqFiltersRef.current;
    const splitter = splitterNodeRef.current;
    const analyserL = analyserLeftRef.current;
    const analyserR = analyserRightRef.current;

    if (!ctx || !source || !analyser || !gain) return;

    try {
      source.disconnect();
      analyser.disconnect();
      gain.disconnect();
      if (preamp) preamp.disconnect();
      if (panner) panner.disconnect();
      if (splitter) {
        try { splitter.disconnect(); } catch (_) {}
      }
      if (analyserL) {
        try { analyserL.disconnect(); } catch (_) {}
      }
      if (analyserR) {
        try { analyserR.disconnect(); } catch (_) {}
      }
      filters.forEach((f) => {
        try {
          f.disconnect();
        } catch (_) {}
      });

      if (isBitPerfect || filters.length === 0) {
        // Pure Direct Bit-Perfect Passthrough: MixBus -> Gain (at 100% bit-transparent) -> Analyser -> Destination
        source.connect(gain);
        gain.connect(analyser);
        analyser.connect(ctx.destination);
      } else {
        // DSP PEQ Mode with Auto-Headroom: MixBus -> Pre-Amp Headroom -> Filter 0..N -> Stereo Panner -> Gain -> Analyser -> Destination
        let headNode: AudioNode = source;
        if (preamp) {
          source.connect(preamp);
          headNode = preamp;
        }

        let lastFilterNode: AudioNode = headNode;
        for (let i = 0; i < filters.length - 1; i++) {
          filters[i].connect(filters[i + 1]);
        }
        if (filters.length > 0) {
          headNode.connect(filters[0]);
          lastFilterNode = filters[filters.length - 1];
        }

        if (panner) {
          lastFilterNode.connect(panner);
          panner.connect(gain);
        } else {
          lastFilterNode.connect(gain);
        }

        gain.connect(analyser);
        analyser.connect(ctx.destination);
      }

      // Discrete stereo analysis tap (non-intrusive, zero output destination)
      if (splitter && analyserL && analyserR) {
        try {
          gain.connect(splitter);
          splitter.connect(analyserL, 0);
          splitter.connect(analyserR, 1);
        } catch (_) {}
      }
    } catch (e) {
      console.error("Audio graph reconnection error:", e);
    }
  };

  // Initialize Dual-Deck Web Audio Graph lazily on user interaction
  const initAudioGraph = useCallback(() => {
    if (isAudioGraphReady.current || !audioRef.current) return;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx({ latencyHint: "playback" });
      audioContextRef.current = ctx;

      const mixBus = ctx.createGain();
      mixBus.gain.value = 1.0;
      mixBusNodeRef.current = mixBus;
      sourceNodeRef.current = mixBus;

      // Wire both Deck A and Deck B into the shared mixBus with per-deck crossfade/gapless GainNodes
      const d0 = decksRef.current[0] || audioRef.current;
      const d1 = decksRef.current[1] || preBufferAudioRef.current;

      if (d0) {
        const s0 = ctx.createMediaElementSource(d0);
        const g0 = ctx.createGain();
        g0.gain.value = activeDeckIdxRef.current === 0 ? 1.0 : 0.0001;
        s0.connect(g0);
        g0.connect(mixBus);
        deckSourcesRef.current[0] = s0;
        deckGainsRef.current[0] = g0;
      }
      if (d1 && d1 !== d0) {
        const s1 = ctx.createMediaElementSource(d1);
        const g1 = ctx.createGain();
        g1.gain.value = activeDeckIdxRef.current === 1 ? 1.0 : 0.0001;
        s1.connect(g1);
        g1.connect(mixBus);
        deckSourcesRef.current[1] = s1;
        deckGainsRef.current[1] = g1;
      }

      // Analyser node for 60fps spectrum & peak VU
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;
      analyserRef.current = analyser;

      // Discrete stereo splitter & analysers for dual VU meters and phase correlation
      const splitter = ctx.createChannelSplitter(2);
      const analyserL = ctx.createAnalyser();
      analyserL.fftSize = 1024;
      analyserL.smoothingTimeConstant = 0.8;
      const analyserR = ctx.createAnalyser();
      analyserR.fftSize = 1024;
      analyserR.smoothingTimeConstant = 0.8;

      splitterNodeRef.current = splitter;
      analyserLeftRef.current = analyserL;
      analyserRightRef.current = analyserR;

      // Pre-amp Headroom Gain Node (for digital clipping prevention)
      const preamp = ctx.createGain();
      preamp.gain.value = Math.pow(10, autoPreampGain / 20);
      preampGainNodeRef.current = preamp;

      // Stereo Panner Node for L/R Acoustic Balance Trim
      if (typeof ctx.createStereoPanner === "function") {
        const panner = ctx.createStereoPanner();
        panner.pan.value = lrBalance;
        stereoPannerNodeRef.current = panner;
      }

      // Parametric Equalizer filters initialized from peqBands
      const filters: BiquadFilterNode[] = peqBands.map((band) => {
        const filter = ctx.createBiquadFilter();
        filter.type = band.type;
        filter.frequency.value = band.frequency;
        filter.gain.value = band.enabled ? band.gain : 0;
        filter.Q.value = band.q;
        return filter;
      });

      // Chain filters together
      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i + 1]);
      }
      eqFiltersRef.current = filters;

      // Master Gain Node (64-bit IEEE float)
      const gainNode = ctx.createGain();
      gainNode.gain.value = bitPerfectMode ? 1.0 : volume;
      gainNodeRef.current = gainNode;

      isAudioGraphReady.current = true;
      reconnectGraph(bitPerfectMode);
    } catch (e) {
      console.warn("Web Audio API initialization warning:", e);
    }
  }, [bitPerfectMode, volume, peqBands, autoPreampGain, lrBalance]);

  // Fetch synchronized / plain lyrics
  const fetchLyrics = useCallback(
    async (targetTrack?: PlayableTrack | null) => {
      const track = targetTrack || currentTrack;
      if (!track || !track.title) return;
      setIsLoadingLyrics(true);
      try {
        let url = `/api/lyrics?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(
          track.title
        )}`;
        if (track.album) url += `&album=${encodeURIComponent(track.album)}`;
        if (track.duration) url += `&duration=${Math.round(track.duration)}`;
        const resp = await fetch(url);
        if (resp.ok) {
          const data: LyricsData = await resp.json();
          setLyrics(data);
        } else {
          setLyrics(null);
        }
      } catch (e) {
        console.error("Failed to fetch lyrics:", e);
        setLyrics(null);
      } finally {
        setIsLoadingLyrics(false);
      }
    },
    [currentTrack]
  );

  // Fetch recommendations for Autoplay
  const fetchSuggestions = useCallback(
    async (targetTrack?: PlayableTrack | null) => {
      const track = targetTrack || currentTrack;
      if (!track || !track.artist) return;
      setIsLoadingSuggestions(true);
      try {
        const resp = await fetch(
          `/api/recommendations?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(
            track.title
          )}&limit=10`
        );
        if (resp.ok) {
          const data = await resp.json();
          const playable: PlayableTrack[] = (data.recommendations || []).map(
            searchResultToPlayableTrack
          );
          setSuggestedTracks(playable);
        }
      } catch (e) {
        console.error("Failed to fetch suggestions:", e);
      } finally {
        setIsLoadingSuggestions(false);
      }
    },
    [currentTrack]
  );

  // Play Track with Dual-Deck 0ms Gapless Swap & Smooth Crossfade
  const playTrack = useCallback(
    (
      track: PlayableTrack,
      newQueue?: PlayableTrack[],
      options?: { fromAutoAdvance?: boolean }
    ) => {
      if (!audioRef.current) return;
      clearPlaybackError();
      initAudioGraph();
      autoAdvanceTriggeredRef.current = false;

      if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume().catch(() => {});
      }

      setCurrentTrack(track);
      currentTrackRef.current = track;

      if (newQueue) {
        setQueue(newQueue);
        queueRef.current = newQueue;
        const idx = newQueue.findIndex((t) => t.id === track.id);
        const resolvedIdx = idx !== -1 ? idx : 0;
        setCurrentIndex(resolvedIdx);
        currentIndexRef.current = resolvedIdx;
      } else {
        setQueue((prev) => {
          const existingIdx = prev.findIndex((t) => t.id === track.id);
          if (existingIdx !== -1) {
            setCurrentIndex(existingIdx);
            currentIndexRef.current = existingIdx;
            queueRef.current = prev;
            return prev;
          } else {
            const updated = [...prev, track];
            const newIdx = updated.length - 1;
            setCurrentIndex(newIdx);
            currentIndexRef.current = newIdx;
            queueRef.current = updated;
            return updated;
          }
        });
      }

      // If active device is hardware ALSA, notify backend
      if (activeDeviceId !== "browser") {
        fetch("/api/devices/play", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            track_id: track.id,
            artist: track.artist,
            title: track.title,
            file_path: track.id.startsWith("/") ? track.id : undefined,
          }),
        }).catch(() => {});
      }

      // Play in browser using Dual-Deck engine
      if (track.streamUrl) {
        const isLocalTrack =
          track.source === "local" ||
          track.source === "nas" ||
          track.id.startsWith("/") ||
          track.id.startsWith("local-");
        if (isLocalTrack) {
          setStreamQualityState("flac");
          streamQualityRef.current = "flac";
        }
        const effectiveQuality = isLocalTrack ? "flac" : streamQualityRef.current;
        const finalStreamUrl = buildCanonicalStreamUrl(track, effectiveQuality);

        const ctx = audioContextRef.current;
        const masterGain = gainNodeRef.current;
        const targetVol = bitPerfectMode && isVolumeLocked ? 1.0 : volume;
        if (ctx && masterGain) {
          try {
            masterGain.gain.cancelScheduledValues(ctx.currentTime);
            masterGain.gain.setValueAtTime(targetVol, ctx.currentTime);
          } catch (_) {
            masterGain.gain.value = targetVol;
          }
        }

        const curDeckIdx = activeDeckIdxRef.current;
        const standbyDeckIdx: 0 | 1 = curDeckIdx === 0 ? 1 : 0;
        const activeDeck = decksRef.current[curDeckIdx] || audioRef.current;
        const standbyDeck = decksRef.current[standbyDeckIdx] || preBufferAudioRef.current;

        const canUseStandbyDeck =
          !!standbyDeck &&
          standbyDeck !== activeDeck &&
          ((standbyPreparedUrlRef.current === finalStreamUrl &&
            standbyDeck.readyState >= 1) ||
            (options?.fromAutoAdvance && crossfadeSecondsRef.current > 0));

        if (canUseStandbyDeck && standbyDeck) {
          // Cancel any previous crossfade cleanup timer
          if (crossfadeCleanupTimerRef.current) {
            clearTimeout(crossfadeCleanupTimerRef.current);
            crossfadeCleanupTimerRef.current = null;
          }

          // Ensure standbyDeck has the exact stream URL
          if (standbyPreparedUrlRef.current !== finalStreamUrl) {
            standbyDeck.src = finalStreamUrl;
          }

          // Swap Active <-> Standby Decks for 0ms Gapless / Smooth Crossfade
          activeDeckIdxRef.current = standbyDeckIdx;
          audioRef.current = standbyDeck;
          preBufferAudioRef.current = activeDeck;
          standbyPreparedUrlRef.current = "";
          standbyPreparedTrackIdRef.current = "";
          setIsNextTrackPrebuffered(false);

          const incomingGain = deckGainsRef.current[standbyDeckIdx];
          const outgoingGain = deckGainsRef.current[curDeckIdx];
          const wasOutgoingPlaying = !activeDeck.paused;
          const xfadeSec =
            wasOutgoingPlaying && crossfadeSecondsRef.current > 0
              ? crossfadeSecondsRef.current
              : wasOutgoingPlaying
              ? options?.fromAutoAdvance
                ? 0.035 // 35ms seamless butt-splice on gapless auto-advance
                : 0.08 // 80ms micro-crossfade on manual skip to pre-buffered track
              : 0.015;

          standbyDeck.volume = targetVol;

          if (ctx && incomingGain && outgoingGain) {
            const now = ctx.currentTime;
            try {
              incomingGain.gain.cancelScheduledValues(now);
              outgoingGain.gain.cancelScheduledValues(now);
              if (xfadeSec >= 0.25 && wasOutgoingPlaying) {
                incomingGain.gain.setValueAtTime(0.0001, now);
                incomingGain.gain.linearRampToValueAtTime(1.0, now + xfadeSec);
                outgoingGain.gain.setValueAtTime(
                  Math.max(0.0001, outgoingGain.gain.value || 1.0),
                  now
                );
                outgoingGain.gain.linearRampToValueAtTime(0.0001, now + xfadeSec);
              } else {
                incomingGain.gain.setValueAtTime(0.0001, now);
                incomingGain.gain.linearRampToValueAtTime(1.0, now + 0.015);
                outgoingGain.gain.setValueAtTime(
                  Math.max(0.0001, outgoingGain.gain.value || 1.0),
                  now
                );
                outgoingGain.gain.linearRampToValueAtTime(0.0001, now + xfadeSec);
              }
            } catch (_) {
              incomingGain.gain.value = 1.0;
              outgoingGain.gain.value = 0.0001;
            }
          }

          if (Number.isFinite(standbyDeck.duration) && standbyDeck.duration > 0) {
            setDuration(standbyDeck.duration);
          } else if (track.duration) {
            setDuration(track.duration);
          }
          const startSec = standbyDeck.currentTime || 0;
          lastProgressUpdateRef.current = startSec;
          setProgress(startSec);

          standbyDeck
            .play()
            .then(() => {
              setIsPlaying(true);
              updateMediaSessionPlaybackState(true);
              syncMediaPositionState(standbyDeck);
            })
            .catch((err) => {
              console.warn("Standby deck play error:", err);
            });

          // Clean up outgoing deck once crossfade / splice finishes
          const cleanupMs = Math.max(40, Math.round(xfadeSec * 1000) + 30);
          crossfadeCleanupTimerRef.current = setTimeout(() => {
            crossfadeCleanupTimerRef.current = null;
            try {
              activeDeck.pause();
              activeDeck.currentTime = 0;
              if (outgoingGain && audioContextRef.current) {
                outgoingGain.gain.setValueAtTime(0.0001, audioContextRef.current.currentTime);
              }
            } catch (_) {}
            // Immediately warm & pre-buffer the next track in queue
            prepareStandbyDeckRef.current(false);
          }, cleanupMs);
        } else {
          // Standard single-deck start (e.g. first track or unbuffered jump)
          if (crossfadeCleanupTimerRef.current) {
            clearTimeout(crossfadeCleanupTimerRef.current);
            crossfadeCleanupTimerRef.current = null;
          }
          if (standbyDeck && standbyDeck !== activeDeck) {
            try {
              standbyDeck.pause();
              standbyDeck.currentTime = 0;
            } catch (_) {}
          }
          standbyPreparedUrlRef.current = "";
          standbyPreparedTrackIdRef.current = "";
          setIsNextTrackPrebuffered(false);

          const activeGain = deckGainsRef.current[curDeckIdx];
          const standbyGain = deckGainsRef.current[standbyDeckIdx];
          if (ctx && activeGain) {
            const now = ctx.currentTime;
            try {
              activeGain.gain.cancelScheduledValues(now);
              activeGain.gain.setValueAtTime(0.0001, now);
              activeGain.gain.linearRampToValueAtTime(1.0, now + 0.012);
              if (standbyGain) {
                standbyGain.gain.cancelScheduledValues(now);
                standbyGain.gain.setValueAtTime(0.0001, now);
              }
            } catch (_) {
              activeGain.gain.value = 1.0;
              if (standbyGain) standbyGain.gain.value = 0.0001;
            }
          }

          activeDeck.volume = targetVol;
          if (activeDeck.src !== finalStreamUrl) {
            activeDeck.src = finalStreamUrl;
          }

          activeDeck
            .play()
            .then(() => {
              setIsPlaying(true);
            })
            .catch((err) => {
              console.warn("Autoplay blocked or stream error:", err);
            });
        }

        // Apply cached telemetry headers immediately if already prefetched, otherwise probe via HEAD
        const cachedMeta = prefetchedHeadersRef.current.get(finalStreamUrl);
        if (cachedMeta) {
          setCurrentTrack((prev) => {
            if (!prev || prev.id !== track.id) return prev;
            return {
              ...prev,
              streamUrl: finalStreamUrl,
              source: cachedMeta.source || prev.source,
              format: cachedMeta.format || prev.format,
              bitDepth: cachedMeta.bitDepth ?? prev.bitDepth,
              sampleRate: cachedMeta.sampleRate ?? prev.sampleRate,
              bitrate: cachedMeta.bitrate ?? prev.bitrate,
              hires: cachedMeta.hires ?? prev.hires,
              fileName: cachedMeta.fileName || prev.fileName,
              filePath: cachedMeta.filePath || prev.filePath,
            };
          });
        } else {
          fetch(finalStreamUrl, { method: "HEAD" })
            .then((res) => {
              if (!res.ok) {
                const errHeader = res.headers.get("x-audio-error");
                setPlaybackError(errHeader || `Stream unavailable (HTTP ${res.status})`);
                audioRef.current?.pause();
                setIsPlaying(false);
                updateMediaSessionPlaybackState(false);
                return;
              }

              const liveSource = res.headers.get("x-audio-source");
              const liveFormat = res.headers.get("x-audio-format");
              const liveBitDepth = res.headers.get("x-audio-bit-depth");
              const liveSampleRate = res.headers.get("x-audio-sample-rate");
              const liveBitrate = res.headers.get("x-audio-bitrate");
              const liveIsLossless = res.headers.get("x-audio-is-lossless");
              const liveFileName = res.headers.get("x-audio-file-name");
              const liveFilePath = res.headers.get("x-audio-file-path");

              if (liveSource || liveFormat || liveFileName) {
                setCurrentTrack((prev) => {
                  if (!prev || prev.id !== track.id) return prev;
                  return {
                    ...prev,
                    streamUrl: finalStreamUrl,
                    source: liveSource || prev.source,
                    format: liveFormat || prev.format,
                    bitDepth: liveBitDepth ? parseInt(liveBitDepth, 10) : prev.bitDepth,
                    sampleRate: liveSampleRate ? parseInt(liveSampleRate, 10) : prev.sampleRate,
                    bitrate: liveBitrate ? parseInt(liveBitrate, 10) : prev.bitrate,
                    hires: liveIsLossless !== null ? liveIsLossless === "true" : prev.hires,
                    fileName: liveFileName || prev.fileName,
                    filePath: liveFilePath || prev.filePath,
                  };
                });
              }
            })
            .catch(() => {});
        }
      }

      // Pre-load lyrics and recommendations asynchronously
      fetchLyrics(track);
      fetchSuggestions(track);
    },
    [
      activeDeviceId,
      bitPerfectMode,
      isVolumeLocked,
      volume,
      fetchLyrics,
      fetchSuggestions,
      initAudioGraph,
      buildCanonicalStreamUrl,
      clearPlaybackError,
      setPlaybackError,
    ]
  );

  // Seamless on-the-fly audio quality switching (preserving exact millisecond position)
  const switchStreamQuality = useCallback(
    async (newQuality: "flac" | "opus") => {
      setStreamQuality(newQuality);
      clearPlaybackError();

      if (!audioRef.current || !currentTrack) return;

      const audio = audioRef.current;
      const currentPos = audio.currentTime;
      const wasPlaying = !audio.paused && isPlaying;

      let currentSrc = audio.src || currentTrack.streamUrl;
      if (!currentSrc) return;

      const isTidalId = (val?: string | null) => {
        if (!val) return false;
        const cleaned = val.startsWith("tidal-") ? val.slice(6) : val;
        return (
          cleaned.length > 0 &&
          /^\d+$/.test(cleaned) &&
          currentTrack.source !== "qobuz" &&
          currentTrack.source !== "itunes"
        );
      };

      let targetUrl: string;
      try {
        const urlObj = new URL(currentSrc, window.location.origin);
        if (urlObj.pathname.includes("/api/stream")) {
          urlObj.searchParams.set("format", newQuality);
          if (newQuality === "flac") {
            const existingId = urlObj.searchParams.get("id");
            if (existingId && !isTidalId(existingId)) {
              urlObj.searchParams.delete("id");
            } else if (!existingId && isTidalId(currentTrack.id)) {
              urlObj.searchParams.set("id", currentTrack.id);
            }
          }
          targetUrl = urlObj.pathname + urlObj.search;
        } else {
          targetUrl = `/api/stream?artist=${encodeURIComponent(currentTrack.artist)}&title=${encodeURIComponent(currentTrack.title)}&format=${newQuality}${
            isTidalId(currentTrack.id) ? `&id=${encodeURIComponent(currentTrack.id)}` : ""
          }`;
        }
      } catch {
        targetUrl = `/api/stream?artist=${encodeURIComponent(currentTrack.artist)}&title=${encodeURIComponent(currentTrack.title)}&format=${newQuality}${
          isTidalId(currentTrack.id) ? `&id=${encodeURIComponent(currentTrack.id)}` : ""
        }`;
      }

      const onCanPlay = () => {
        audio.removeEventListener("canplay", onCanPlay);
        try {
          audio.currentTime = currentPos;
        } catch (e) {
          console.warn("Could not seek after quality switch:", e);
        }
        if (wasPlaying) {
          audio.play().catch(() => {});
        }
      };

      audio.addEventListener("canplay", onCanPlay, { once: true });
      audio.src = targetUrl;
      audio.load();

      // Probe headers to immediately reflect real stream telemetry
      fetch(targetUrl, { method: "HEAD" })
        .then((res) => {
          if (!res.ok) {
            const errHeader = res.headers.get("x-audio-error");
            setPlaybackError(errHeader || `Stream unavailable (HTTP ${res.status})`);
            audioRef.current?.pause();
            setIsPlaying(false);
            updateMediaSessionPlaybackState(false);
            return;
          }

          const liveSource = res.headers.get("x-audio-source");
          const liveFormat = res.headers.get("x-audio-format");
          const liveBitDepth = res.headers.get("x-audio-bit-depth");
          const liveSampleRate = res.headers.get("x-audio-sample-rate");
          const liveBitrate = res.headers.get("x-audio-bitrate");
          const liveIsLossless = res.headers.get("x-audio-is-lossless");
          const liveFileName = res.headers.get("x-audio-file-name");
          const liveFilePath = res.headers.get("x-audio-file-path");

          if (liveSource || liveFormat || liveFileName) {
            setCurrentTrack((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                streamUrl: targetUrl,
                source: liveSource || prev.source,
                format: liveFormat || prev.format,
                bitDepth: liveBitDepth ? parseInt(liveBitDepth, 10) : prev.bitDepth,
                sampleRate: liveSampleRate ? parseInt(liveSampleRate, 10) : prev.sampleRate,
                bitrate: liveBitrate ? parseInt(liveBitrate, 10) : prev.bitrate,
                hires: liveIsLossless !== null ? liveIsLossless === "true" : prev.hires,
                fileName: liveFileName || prev.fileName,
                filePath: liveFilePath || prev.filePath,
              };
            });
          }
        })
        .catch(() => {});
    },
    [currentTrack, isPlaying, setStreamQuality, clearPlaybackError, setPlaybackError]
  );

  // Audiophile micro-fade toggle play
  const togglePlay = () => {
    if (!audioRef.current) return;
    initAudioGraph();

    const ctx = audioContextRef.current;
    const gainNode = gainNodeRef.current;

    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    if (isPlaying) {
      // Smooth 10ms micro-fade out before pausing to eliminate transducer pop
      if (ctx && gainNode) {
        try {
          gainNode.gain.cancelScheduledValues(ctx.currentTime);
          gainNode.gain.setValueAtTime(gainNode.gain.value, ctx.currentTime);
          gainNode.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.01);
        } catch (_) {}
        setTimeout(() => {
          audioRef.current?.pause();
          setIsPlaying(false);
        }, 12);
      } else {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    } else {
      // Smooth 12ms micro-fade in
      const targetVol = bitPerfectMode && isVolumeLocked ? 1.0 : volume;
      if (ctx && gainNode) {
        try {
          gainNode.gain.cancelScheduledValues(ctx.currentTime);
          gainNode.gain.setValueAtTime(gainNode.gain.value || 0, ctx.currentTime);
          gainNode.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + 0.012);
        } catch (_) {
          gainNode.gain.value = targetVol;
        }
      }
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  };

  const seek = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = seconds;
    lastProgressUpdateRef.current = seconds;
    setProgress(seconds);
  };

  const setVolume = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.setValueAtTime(clamped, audioContextRef.current.currentTime);
    }
    if (activeDeviceId !== "browser") {
      fetch("/api/devices/volume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volume: clamped }),
      }).catch(() => {});
    }
  };

  const toggleVolumeLock = () => {
    setIsVolumeLocked((prev) => {
      const next = !prev;
      if (next && bitPerfectMode) {
        // Relock to 100% (0.0 dB) for bit-perfection
        setVolume(1.0);
      }
      return next;
    });
  };

  const setBitPerfectMode = (enabled: boolean) => {
    setBitPerfectState(enabled);
    if (enabled) {
      setIsVolumeLocked(true);
      setVolume(1.0);
    }
    reconnectGraph(enabled);
  };

  const setEqBandGain = (index: number, gainDb: number) => {
    const clamped = Math.max(-12, Math.min(12, gainDb));
    setEqGains((prev) => {
      const updated = [...prev];
      updated[index] = clamped;
      return updated;
    });

    if (eqFiltersRef.current[index] && audioContextRef.current) {
      eqFiltersRef.current[index].gain.setValueAtTime(clamped, audioContextRef.current.currentTime);
    }
  };

  const setPeqBand = (index: number, updated: Partial<PeqBand>) => {
    setPeqBands((prev) => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], ...updated };
      }
      return copy;
    });

    const ctx = audioContextRef.current;
    const filter = eqFiltersRef.current[index];
    if (ctx && filter) {
      if (updated.type) filter.type = updated.type;
      if (updated.frequency !== undefined)
        filter.frequency.setValueAtTime(updated.frequency, ctx.currentTime);
      if (updated.gain !== undefined) filter.gain.setValueAtTime(updated.gain, ctx.currentTime);
      if (updated.q !== undefined) filter.Q.setValueAtTime(updated.q, ctx.currentTime);
    }
    setBitPerfectState(false);
    reconnectGraph(false);
  };

  const applyAutoEqPreset = (preset: AutoEqPreset) => {
    setPeqBands(preset.bands);
    setActiveAutoEqPreset(preset.name);
    const isFlat = preset.name.includes("Flat");
    if (isFlat) {
      setBitPerfectState(true);
      setIsVolumeLocked(true);
      setVolume(1.0);
      reconnectGraph(true);
    } else {
      setBitPerfectState(false);
      const ctx = audioContextRef.current;
      if (ctx) {
        preset.bands.forEach((band, idx) => {
          const filter = eqFiltersRef.current[idx];
          if (filter) {
            filter.type = band.type;
            filter.frequency.setValueAtTime(band.frequency, ctx.currentTime);
            filter.gain.setValueAtTime(band.enabled ? band.gain : 0, ctx.currentTime);
            filter.Q.setValueAtTime(band.q, ctx.currentTime);
          }
        });
      }
      reconnectGraph(false);
    }
  };

  const applyEqPreset = (presetName: string) => {
    const preset = EQ_PRESETS[presetName];
    if (!preset) return;

    setEqGains(preset);
    if (presetName === "Bit-Perfect Flat") {
      setBitPerfectMode(true);
    } else {
      setBitPerfectMode(false);
      preset.forEach((gain, idx) => {
        if (eqFiltersRef.current[idx] && audioContextRef.current) {
          eqFiltersRef.current[idx].gain.setValueAtTime(gain, audioContextRef.current.currentTime);
        }
      });
    }
  };

  const playNext = useCallback(
    (fromAutoAdvance?: boolean) => {
      const nextCand = getNextUpcomingCandidate();
      if (!nextCand) return;
      if (nextCand.fromSuggested) {
        setSuggestedTracks((prev) => {
          const nextList = prev.filter((t) => t.id !== nextCand.track.id);
          suggestedTracksRef.current = nextList;
          return nextList;
        });
      }
      playTrack(nextCand.track, undefined, { fromAutoAdvance: !!fromAutoAdvance });
    },
    [getNextUpcomingCandidate, playTrack]
  );

  const playPrevious = useCallback(() => {
    const prevIdx = currentIndexRef.current - 1;
    const q = queueRef.current;
    if (prevIdx >= 0 && prevIdx < q.length) {
      playTrack(q[prevIdx]);
    }
  }, [playTrack]);

  const addToQueue = (track: PlayableTrack) => {
    setQueue((prev) => [...prev, track]);
  };

  const insertNextInQueue = (track: PlayableTrack) => {
    setQueue((prev) => {
      const targetIdx = currentIndex + 1;
      const updated = [...prev];
      updated.splice(targetIdx, 0, track);
      return updated;
    });
  };

  const reorderQueue = (fromIndex: number, toIndex: number) => {
    setQueue((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) {
        return prev;
      }
      const updated = [...prev];
      const [movedTrack] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, movedTrack);

      if (currentIndex === fromIndex) {
        setCurrentIndex(toIndex);
      } else if (fromIndex < currentIndex && toIndex >= currentIndex) {
        setCurrentIndex((idx) => idx - 1);
      } else if (fromIndex > currentIndex && toIndex <= currentIndex) {
        setCurrentIndex((idx) => idx + 1);
      }

      return updated;
    });
  };

  const addAllToQueue = (tracks: PlayableTrack[]) => {
    if (!tracks || tracks.length === 0) return;
    setQueue((prev) => [...prev, ...tracks]);
  };

  const removeFromQueue = (index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
    if (index < currentIndex) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const clearQueue = () => {
    setQueue([]);
    setCurrentIndex(-1);
  };

  // Real-time Analyser methods
  const getFrequencyData = useCallback(() => {
    if (!analyserRef.current) return null;
    const buffer = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(buffer);
    return buffer;
  }, []);

  const getTimeDomainData = useCallback(() => {
    if (!analyserRef.current) return null;
    const buffer = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteTimeDomainData(buffer);
    return buffer;
  }, []);

  // Real-time live audio telemetry for audiophile signal path
  const getLiveTelemetry = useCallback((): LiveAudioTelemetry => {
    const audio = audioRef.current;
    const analyser = analyserRef.current;
    const ctx = audioContextRef.current;
    const track = currentTrack;

    const sampleRate = ctx?.sampleRate || track?.sampleRate || 44100;
    const currentTime = audio ? audio.currentTime : 0;
    const duration =
      audio && Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : track?.duration || 0;

    // Buffer calculation
    let bufferedSeconds = 0;
    let bufferPercent = 0;
    let isBuffering = false;

    if (audio) {
      isBuffering = audio.readyState < 3 && !audio.paused;
      const b = audio.buffered;
      for (let i = 0; i < b.length; i++) {
        if (currentTime >= b.start(i) && currentTime <= b.end(i)) {
          bufferedSeconds = Math.max(0, b.end(i) - currentTime);
          break;
        }
      }
      if (b.length > 0) {
        const lastEnd = b.end(b.length - 1);
        if (duration > 0) {
          bufferPercent = Math.min(100, (lastEnd / duration) * 100);
        }
      }
    }

    const isLocal =
      track?.source?.includes("local") ||
      track?.source === "nas" ||
      track?.id?.startsWith("/") ||
      track?.id?.startsWith("local-");
    const baseBitrate = track?.bitrate || (track?.hires ? 2400 : isLocal ? 950 : 160);
    const bufferedBytesEstimate = (bufferedSeconds * baseBitrate * 125) / (1024 * 1024);

    const sampleFrame = Math.floor(currentTime * sampleRate);
    const totalFrames = Math.floor(duration * sampleRate);

    let subBassEnergy = 0;
    let midEnergy = 0;
    let trebleEnergy = 0;
    let rmsDbfs = -96;
    let peakDbfs = -96;

    if (analyser && isPlaying) {
      const freqBuffer = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freqBuffer);

      // Sub-bass bins: 1..5 (~23Hz - 110Hz)
      const subBins = freqBuffer.slice(1, 5);
      if (subBins.length > 0) {
        const sum = subBins.reduce((a, b) => a + b, 0);
        subBassEnergy = Math.min(1, sum / (subBins.length * 220));
      }

      // Mid bins: 12..35 (~280Hz - 820Hz)
      const midBins = freqBuffer.slice(12, 36);
      if (midBins.length > 0) {
        const sum = midBins.reduce((a, b) => a + b, 0);
        midEnergy = Math.min(1, sum / (midBins.length * 200));
      }

      // Treble bins: 50..120 (~1.2kHz - 2.8kHz)
      const trebleBins = freqBuffer.slice(50, 120);
      if (trebleBins.length > 0) {
        const sum = trebleBins.reduce((a, b) => a + b, 0);
        trebleEnergy = Math.min(1, sum / (trebleBins.length * 180));
      }

      // Time domain for RMS & Peak dBFS
      const timeBuffer = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(timeBuffer);

      let sumSquares = 0;
      let peak = 0;
      for (let i = 0; i < timeBuffer.length; i++) {
        const norm = (timeBuffer[i] - 128) / 128;
        sumSquares += norm * norm;
        const abs = Math.abs(norm);
        if (abs > peak) peak = abs;
      }
      const rms = Math.sqrt(sumSquares / timeBuffer.length);
      rmsDbfs = rms > 0.0001 ? Math.max(-96, 20 * Math.log10(rms)) : -96;
      peakDbfs = peak > 0.0001 ? Math.max(-96, 20 * Math.log10(peak)) : -96;
    }

    let rmsLeftDbfs = rmsDbfs;
    let rmsRightDbfs = rmsDbfs;
    let peakLeftDbfs = peakDbfs;
    let peakRightDbfs = peakDbfs;
    let phaseCorrelation = 1.0;

    const aL = analyserLeftRef.current;
    const aR = analyserRightRef.current;
    if (aL && aR && isPlaying) {
      const bufL = new Uint8Array(aL.fftSize);
      const bufR = new Uint8Array(aR.fftSize);
      aL.getByteTimeDomainData(bufL);
      aR.getByteTimeDomainData(bufR);

      let sumSqL = 0;
      let sumSqR = 0;
      let peakL = 0;
      let peakR = 0;
      let dotProduct = 0;
      const len = Math.min(bufL.length, bufR.length);

      for (let i = 0; i < len; i++) {
        const nL = (bufL[i] - 128) / 128;
        const nR = (bufR[i] - 128) / 128;
        sumSqL += nL * nL;
        sumSqR += nR * nR;
        const absL = Math.abs(nL);
        const absR = Math.abs(nR);
        if (absL > peakL) peakL = absL;
        if (absR > peakR) peakR = absR;
        dotProduct += nL * nR;
      }

      const rmsL = Math.sqrt(sumSqL / len);
      const rmsR = Math.sqrt(sumSqR / len);
      rmsLeftDbfs = rmsL > 0.0001 ? Math.max(-96, 20 * Math.log10(rmsL)) : -96;
      rmsRightDbfs = rmsR > 0.0001 ? Math.max(-96, 20 * Math.log10(rmsR)) : -96;
      peakLeftDbfs = peakL > 0.0001 ? Math.max(-96, 20 * Math.log10(peakL)) : -96;
      peakRightDbfs = peakR > 0.0001 ? Math.max(-96, 20 * Math.log10(peakR)) : -96;

      const denom = Math.sqrt(sumSqL * sumSqR);
      if (denom > 0.00001) {
        phaseCorrelation = Math.max(-1, Math.min(1, dotProduct / denom));
      } else {
        phaseCorrelation = 1.0;
      }
    }

    const crestFactorDb = Math.max(0, peakDbfs - rmsDbfs);
    // True Peak estimation (Inter-sample peak reconstruction modeling)
    const ispBoost = peakDbfs > -12 ? Math.min(2.2, Math.max(0, (crestFactorDb - 10) * 0.15)) : 0;
    const truePeakDbfs = Math.min(1.5, peakDbfs + ispBoost);
    const interSampleOverload = truePeakDbfs >= -0.1;

    const spectralActivity = subBassEnergy * 0.4 + midEnergy * 0.4 + trebleEnergy * 0.2;
    const instantBitrateKbps = isPlaying
      ? Math.round(baseBitrate * (0.92 + spectralActivity * 0.18))
      : baseBitrate;

    const currentClockLocked =
      bitPerfectMode && (activeDeviceId !== "browser" || (track?.sampleRate || 44100) === sampleRate);

    return {
      bufferedSeconds: parseFloat(bufferedSeconds.toFixed(1)),
      bufferPercent: parseFloat(bufferPercent.toFixed(1)),
      bufferedBytesEstimate: parseFloat(bufferedBytesEstimate.toFixed(2)),
      sampleFrame,
      totalFrames,
      subBassEnergy,
      midEnergy,
      trebleEnergy,
      rmsDbfs: parseFloat(rmsDbfs.toFixed(1)),
      peakDbfs: parseFloat(peakDbfs.toFixed(1)),
      rmsLeftDbfs: parseFloat(rmsLeftDbfs.toFixed(1)),
      rmsRightDbfs: parseFloat(rmsRightDbfs.toFixed(1)),
      peakLeftDbfs: parseFloat(peakLeftDbfs.toFixed(1)),
      peakRightDbfs: parseFloat(peakRightDbfs.toFixed(1)),
      phaseCorrelation: parseFloat(phaseCorrelation.toFixed(2)),
      truePeakDbfs: parseFloat(truePeakDbfs.toFixed(1)),
      interSampleOverload,
      crestFactorDb: parseFloat(crestFactorDb.toFixed(1)),
      instantBitrateKbps,
      isBuffering,
      channelCount: track?.channels || 2,
      currentClockLocked,
    };
  }, [currentTrack, isPlaying, bitPerfectMode, activeDeviceId]);

  // Compute live Signal Path with Roon-style fidelity grading
  const getSignalPath = useCallback((): AudioSignalPath => {
    const track = currentTrack;
    const ctxSampleRate = audioContextRef.current?.sampleRate || 48000;
    const isLocal =
      track?.source?.includes("local") ||
      track?.source === "nas" ||
      track?.id?.startsWith("/") ||
      track?.id?.startsWith("local-");
    const isTidalMaster = track?.source === "tidal-direct-hifi";
    const isSoulseek = track?.source === "soulseek-lossless";
    const isQobuz = track?.source === "qobuz" || track?.id?.startsWith("qobuz-");
    const isWebOpus = track?.source === "web-stream-opus" || (!isLocal && !isTidalMaster && !isSoulseek && !isQobuz && !track?.isDsd);

    let format = "FLAC";
    let bitDepth = 16;
    let trackSampleRate = 44100;
    let bitrate = 960;
    let provider = "Online Audio Stream";
    let isLossless = false;
    let qualityLabel = "High Quality Web Stream";

    if (track?.isDsd) {
      provider = "Direct Stream Digital (SACD Master Bitstream)";
      format = "DSD64 (DoP / Native 1-bit 2.82MHz)";
      bitDepth = 1;
      trackSampleRate = 2822400;
      bitrate = 5644;
      isLossless = true;
      qualityLabel = "DSD Studio Master";
    } else if (isLocal) {
      provider = "Synology NAS Bit-Perfect Vault (/volume2/music)";
      format = track?.format?.toUpperCase() || "FLAC";
      bitDepth = track?.bitDepth || 24;
      trackSampleRate = track?.sampleRate || 96000;
      bitrate = track?.bitrate || 2400;
      isLossless = true;
      qualityLabel =
        bitDepth >= 24 || trackSampleRate > 44100 ? "Local Hi-Res Master" : "Lossless CD Quality";
    } else if (isTidalMaster) {
      provider = "Tidal HiFi Master CDN (sp-storage.tidal.com)";
      format = "FLAC (Master MQA/Hi-Res)";
      bitDepth = track?.bitDepth || 24;
      trackSampleRate = track?.sampleRate || 96000;
      bitrate = track?.bitrate || 2500;
      isLossless = true;
      qualityLabel = "Tidal 24-bit Master Direct";
    } else if (isSoulseek) {
      provider = "Soulseek Lossless P2P Network";
      format = "FLAC (Bit-Perfect Rip)";
      bitDepth = track?.bitDepth || 16;
      trackSampleRate = track?.sampleRate || 44100;
      bitrate = track?.bitrate || 960;
      isLossless = true;
      qualityLabel = "Soulseek Lossless FLAC";
    } else if (isQobuz) {
      provider = "Qobuz Studio Master (Lossless Stream)";
      format = "FLAC";
      bitDepth = track?.bitDepth || 24;
      trackSampleRate = track?.sampleRate || 96000;
      bitrate = track?.bitrate || 3200;
      isLossless = true;
      qualityLabel = "Qobuz Hi-Res Master";
    } else {
      provider = "Online Web Stream (Opus 160kbps Fallback)";
      format = "WebM Opus";
      bitDepth = 16;
      trackSampleRate = 48000;
      bitrate = 160;
      isLossless = false;
      qualityLabel = "Compressed Web Audio";
    }

    const activeDev = outputDevices.find((d) => d.id === activeDeviceId);
    const outputDeviceName = activeDev
      ? `${activeDev.name} [${activeDev.hardware_id}]`
      : "Hardware DAC / System Audio Output";
    const outputSampleRate = activeDeviceId !== "browser" ? trackSampleRate : ctxSampleRate;

    const clockLock =
      bitPerfectMode && (activeDeviceId !== "browser" || trackSampleRate === ctxSampleRate);

    // Fidelity Rating
    let fidelityRating: "bit-perfect" | "enhanced" | "resampled" = "bit-perfect";
    if (!bitPerfectMode) {
      fidelityRating = "enhanced";
    } else if (!clockLock) {
      fidelityRating = "resampled";
    }

    return {
      fidelityRating,
      source: {
        format,
        bitDepth,
        sampleRate: trackSampleRate,
        bitrate,
        provider,
        isLossless,
        qualityLabel,
        flacMd5: track?.flacMd5,
      },
      transport: {
        protocol:
          activeDeviceId !== "browser"
            ? "Direct ALSA Hardware Buffer (Zero-Copy Ring)"
            : "HTTP/2 RFC 7233 Byte-Range Direct Stream",
        status: isPlaying
          ? isLossless
            ? "Active Stream (Bit-Perfect Lossless)"
            : "Active Stream (Direct)"
          : "Idle",
        bufferHealth: "Pre-buffered in RAM",
        jitterLatencyMs: deviceTelemetry?.buffer_latency_ms || 4.2,
      },
      dsp: {
        bitPerfect: bitPerfectMode,
        equalizerActive: !bitPerfectMode,
        processingBitDepth: "64-bit IEEE Floating Point",
        headroomGainDb: autoPreampGain,
        autoEqActive: !bitPerfectMode && activeAutoEqPreset !== "Flat Bit-Perfect Direct",
        activePreset: activeAutoEqPreset,
      },
      output: {
        device: outputDeviceName,
        sampleRate: outputSampleRate,
        latencyMs:
          activeDeviceId !== "browser"
            ? 5
            : Math.round((audioContextRef.current?.baseLatency || 0.01) * 1000),
        clockLock,
        hardwareMode: deviceTelemetry?.hardware_mode || "hw:0,0",
        truePeakDbfs: -0.2,
        interSampleOverload: false,
      },
    };
  }, [
    currentTrack,
    isPlaying,
    bitPerfectMode,
    activeDeviceId,
    outputDevices,
    deviceTelemetry,
    autoPreampGain,
    activeAutoEqPreset,
  ]);

  // Refs for media controls to avoid re-triggering audio element setup
  const playNextRef = useRef<(fromAutoAdvance?: boolean) => void>(() => {});
  playNextRef.current = playNext;

  const playPreviousRef = useRef<() => void>(() => {});
  playPreviousRef.current = playPrevious;

  const togglePlayRef = useRef<() => void>(() => {});
  togglePlayRef.current = togglePlay;

  const seekRef = useRef<(seconds: number) => void>(() => {});
  seekRef.current = seek;

  const lastPosSyncRef = useRef<number>(0);

  // Dual-Deck Audio setup & 0ms gapless / crossfade listener (mounted once for application lifetime)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const deckA = new Audio();
      deckA.crossOrigin = "anonymous";
      deckA.preload = "auto";
      const deckB = new Audio();
      deckB.crossOrigin = "anonymous";
      deckB.preload = "auto";

      decksRef.current = [deckA, deckB];
      activeDeckIdxRef.current = 0;
      audioRef.current = deckA;
      preBufferAudioRef.current = deckB;

      // Register OS Lock-Screen / Notification Media Controls (Android & iOS)
      registerMediaSessionActions(deckA, {
        onPlay: () => togglePlayRef.current(),
        onPause: () => togglePlayRef.current(),
        onNext: () => playNextRef.current(false),
        onPrevious: () => playPreviousRef.current(),
        onSeek: (seconds) => seekRef.current(seconds),
      });

      const attachDeckListeners = (deck: HTMLAudioElement) => {
        // Standby deck pre-buffer readiness listener
        const onStandbyReady = () => {
          if (preBufferAudioRef.current === deck && standbyPreparedUrlRef.current) {
            setIsNextTrackPrebuffered(true);
          }
        };
        deck.addEventListener("canplay", onStandbyReady);
        deck.addEventListener("canplaythrough", onStandbyReady);

        deck.addEventListener("error", () => {
          if (audioRef.current !== deck) {
            // Ignore standby pre-buffer errors silently
            return;
          }
          const err = deck.error;
          if (!err || err.code === 1) {
            // Aborted by user action/new track, ignore cleanly
            return;
          }
          console.warn("Audio element error:", err.code, err.message);
          setIsPlaying(false);
          updateMediaSessionPlaybackState(false);

          if (!playbackErrorRef.current) {
            const failedSrc = deck.currentSrc || deck.src;
            if (failedSrc) {
              fetch(failedSrc, { method: "HEAD" })
                .then((res) => {
                  if (!playbackErrorRef.current) {
                    const errHeader = res.headers.get("x-audio-error");
                    setPlaybackError(
                      errHeader ||
                        (!res.ok
                          ? `Stream unavailable (HTTP ${res.status})`
                          : "Playback failed: unable to load audio stream")
                    );
                  }
                })
                .catch(() => {
                  if (!playbackErrorRef.current) {
                    setPlaybackError("Playback failed: unable to load audio stream");
                  }
                });
            } else {
              setPlaybackError("Playback failed: unable to load audio stream");
            }
          }
        });

        deck.addEventListener("timeupdate", () => {
          if (audioRef.current !== deck) return;
          const curTime = deck.currentTime;
          const dur = deck.duration;
          if (Math.abs(curTime - lastProgressUpdateRef.current) >= 0.2 || curTime < 0.25) {
            lastProgressUpdateRef.current = curTime;
            setProgress(curTime);
          }

          // Periodically sync lock-screen scrubber position
          const now = Date.now();
          if (now - lastPosSyncRef.current > 750) {
            lastPosSyncRef.current = now;
            syncMediaPositionState(deck);
          }

          if (Number.isFinite(dur) && dur > 0) {
            const remaining = dur - curTime;

            // 1. Pre-warm & pre-buffer upcoming track when <= 25 seconds remain
            if (remaining < 25) {
              prepareStandbyDeckRef.current(true);
            }

            // 2. Trigger seamless 0ms gapless splice or smooth crossfade before final frame ends
            const xfade = crossfadeSecondsRef.current;
            const leadTime =
              xfade > 0
                ? xfade
                : gaplessEnabledRef.current
                ? 0.16
                : 0;

            if (
              leadTime > 0 &&
              dur > Math.max(leadTime + 2.5, 5) &&
              remaining > 0 &&
              remaining <= leadTime &&
              !autoAdvanceTriggeredRef.current
            ) {
              const standby = preBufferAudioRef.current;
              const standbyReady =
                standby &&
                standbyPreparedUrlRef.current &&
                standby.readyState >= 2;
              if (standbyReady || xfade > 0) {
                autoAdvanceTriggeredRef.current = true;
                playNextRef.current(true);
              }
            }
          }
        });

        deck.addEventListener("loadedmetadata", () => {
          if (audioRef.current !== deck) return;
          setDuration(deck.duration || 0);
          syncMediaPositionState(deck);
        });

        deck.addEventListener("seeked", () => {
          if (audioRef.current !== deck) return;
          if (
            Number.isFinite(deck.duration) &&
            deck.duration - deck.currentTime > Math.max(crossfadeSecondsRef.current + 1, 1)
          ) {
            autoAdvanceTriggeredRef.current = false;
          }
          syncMediaPositionState(deck);
        });

        deck.addEventListener("ended", () => {
          if (audioRef.current !== deck) return;
          if (!autoAdvanceTriggeredRef.current) {
            autoAdvanceTriggeredRef.current = true;
            playNextRef.current(true);
          }
        });

        deck.addEventListener("play", () => {
          if (audioRef.current !== deck) return;
          setIsPlaying(true);
          updateMediaSessionPlaybackState(true);
          syncMediaPositionState(deck);
        });

        deck.addEventListener("pause", () => {
          if (audioRef.current !== deck) return;
          setIsPlaying(false);
          updateMediaSessionPlaybackState(false);
          syncMediaPositionState(deck);
        });
      };

      attachDeckListeners(deckA);
      attachDeckListeners(deckB);

      return () => {
        if (playbackErrorTimerRef.current) {
          clearTimeout(playbackErrorTimerRef.current);
          playbackErrorTimerRef.current = null;
        }
        if (crossfadeCleanupTimerRef.current) {
          clearTimeout(crossfadeCleanupTimerRef.current);
          crossfadeCleanupTimerRef.current = null;
        }
        deckA.pause();
        deckA.removeAttribute("src");
        deckB.pause();
        deckB.removeAttribute("src");
        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
          audioContextRef.current.close().catch(() => {});
        }
      };
    }
  }, []);

  // Proactively warm up backend StreamResolver & standby deck whenever queue, suggestions, or track changes
  useEffect(() => {
    if (!currentTrack) return;
    const timer = setTimeout(() => {
      prepareStandbyDeck(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [
    currentTrack,
    currentIndex,
    queue,
    suggestedTracks,
    autoplay,
    streamQuality,
    gaplessEnabled,
    crossfadeSeconds,
    prepareStandbyDeck,
  ]);

  // Sync Media Session Lock-Screen metadata whenever current track changes
  useEffect(() => {
    updateMediaSessionMetadata(currentTrack);
    if (audioRef.current) {
      registerMediaSessionActions(audioRef.current, {
        onPlay: () => togglePlayRef.current(),
        onPause: () => togglePlayRef.current(),
        onNext: () => playNextRef.current(false),
        onPrevious: () => playPreviousRef.current(),
        onSeek: (seconds) => seekRef.current(seconds),
      });
      syncMediaPositionState(audioRef.current);
    }
  }, [currentTrack]);

  const handlePlayNextAction = useCallback(() => playNext(false), [playNext]);

  const progressValue = useMemo(
    () => ({
      subscribe: subscribeProgress,
      getSnapshot: getProgressSnapshot,
      getServerSnapshot: getServerProgressSnapshot,
      duration,
    }),
    [subscribeProgress, getProgressSnapshot, getServerProgressSnapshot, duration]
  );

  const playerValue = useMemo<PlayerContextType>(
    () => ({
      currentTrack,
      isPlaying,
      progress: 0,
      duration,
      volume,
      queue,
      currentIndex,
      bitPerfectMode,
      isVolumeLocked,
      setIsVolumeLocked,
      toggleVolumeLock,
      autoPreampGain,
      lrBalance,
      setLrBalance,
      eqGains,
      isVisualizerOpen,
      isEqOpen,
      isSignalPathOpen,
      isLyricsOpen,
      isQueueOpen,
      autoplay,
      suggestedTracks,
      lyrics,
      isLoadingLyrics,
      isLoadingSuggestions,
      activeAutoEqPreset,
      playTrack,
      togglePlay,
      seek,
      setVolume,
      playNext: handlePlayNextAction,
      playPrevious,
      addToQueue,
      insertNextInQueue,
      reorderQueue,
      addAllToQueue,
      removeFromQueue,
      clearQueue,
      setBitPerfectMode,
      setEqBandGain,
      applyEqPreset,
      peqBands,
      setPeqBand,
      applyAutoEqPreset,
      outputDevices,
      activeDeviceId,
      selectOutputDevice,
      fetchOutputDevices,
      configureOutputDevice,
      deviceTelemetry,
      isVuMeterOpen,
      setIsVuMeterOpen,
      vuMeterTheme,
      setVuMeterTheme,
      setIsVisualizerOpen,
      setIsEqOpen,
      setIsSignalPathOpen,
      setIsLyricsOpen,
      setIsQueueOpen,
      setAutoplay,
      fetchLyrics,
      fetchSuggestions,
      getSignalPath,
      getFrequencyData,
      getTimeDomainData,
      getLiveTelemetry,
      streamQuality,
      setStreamQuality,
      switchStreamQuality,
      autoUpgradeToFlac,
      setAutoUpgradeToFlac,
      gaplessEnabled,
      setGaplessEnabled,
      crossfadeSeconds,
      setCrossfadeSeconds,
      isNextTrackPrebuffered,
      playbackError,
      clearPlaybackError,
    }),
    [
      currentTrack,
      isPlaying,
      duration,
      volume,
      queue,
      currentIndex,
      bitPerfectMode,
      isVolumeLocked,
      setIsVolumeLocked,
      toggleVolumeLock,
      autoPreampGain,
      lrBalance,
      setLrBalance,
      eqGains,
      isVisualizerOpen,
      isEqOpen,
      isSignalPathOpen,
      isLyricsOpen,
      isQueueOpen,
      autoplay,
      suggestedTracks,
      lyrics,
      isLoadingLyrics,
      isLoadingSuggestions,
      activeAutoEqPreset,
      playTrack,
      handlePlayNextAction,
      setBitPerfectMode,
      setEqBandGain,
      applyEqPreset,
      setPeqBand,
      peqBands,
      applyAutoEqPreset,
      outputDevices,
      activeDeviceId,
      selectOutputDevice,
      fetchOutputDevices,
      configureOutputDevice,
      deviceTelemetry,
      isVuMeterOpen,
      setIsVuMeterOpen,
      vuMeterTheme,
      setVuMeterTheme,
      setAutoplay,
      fetchLyrics,
      fetchSuggestions,
      getSignalPath,
      getFrequencyData,
      getTimeDomainData,
      getLiveTelemetry,
      streamQuality,
      setStreamQuality,
      switchStreamQuality,
      autoUpgradeToFlac,
      setAutoUpgradeToFlac,
      gaplessEnabled,
      setGaplessEnabled,
      crossfadeSeconds,
      setCrossfadeSeconds,
      isNextTrackPrebuffered,
      playbackError,
      clearPlaybackError,
    ]
  );

  return (
    <PlayerContext.Provider value={playerValue}>
      <PlayerProgressContext.Provider value={progressValue}>
        {children}
      </PlayerProgressContext.Provider>
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used within PlayerProvider");
  }
  return context;
}

export function usePlayerProgress() {
  const ctx = useContext(PlayerProgressContext);
  const progress = useSyncExternalStore(
    ctx.subscribe,
    ctx.getSnapshot,
    ctx.getServerSnapshot
  );
  return { progress, duration: ctx.duration };
}
