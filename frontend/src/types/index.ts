export interface TrendingTrack {
  id: string;
  rank: number;
  title: string;
  artist: string;
  album: string;
  cover_url: string;
  preview_url: string | null;
  region: string;
}

export interface TrendingAlbum {
  id: string;
  rank: number;
  title: string;
  artist: string;
  cover_url: string;
  release_date?: string;
  track_count?: number;
  region: string;
}

export interface PlayableTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  streamUrl?: string;
  duration?: number;
  bitDepth?: number;
  sampleRate?: number;
  bitrate?: number;
  format?: string;
  source?: string;
  channels?: number;
  hires?: boolean;
  drScore?: number;
  isDsd?: boolean;
  truePeak?: number;
  lufs?: number;
  flacMd5?: string;
  compressionLevel?: number;
  originalYear?: number;
  remasterYear?: number;
  bookletUrl?: string;
}

export interface SearchResultItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover_url?: string;
  preview_url?: string;
  duration: number;
  source: string;
  hires: boolean;
  stream_id?: string;
  bit_depth?: number;
  sample_rate?: number;
  bitrate?: number;
  format?: string;
  dr_score?: number;
  is_dsd?: boolean;
  true_peak?: number;
  lufs?: number;
  flac_md5?: string;
  original_year?: number;
  remaster_year?: number;
}

export interface SearchSuggestion {
  type: "artist" | "track" | "query";
  text: string;
  subtext?: string;
  cover_url?: string;
}

export interface TrendingArtist {
  name: string;
  track_count: number;
  cover_url: string;
}

export interface PopularArtistItem {
  id: string;
  name: string;
  category: "vpop" | "global" | "audiophile";
  category_label: string;
  cover_url: string;
  track_count: number;
  monthly_streams: string;
  bio: string;
}

export interface PreSearchTrendingData {
  trending_keywords: string[];
  top_artists: TrendingArtist[];
  quick_picks: SearchResultItem[];
  genres: string[];
}

export interface RecentSearchItem {
  query: string;
  timestamp: number;
}

export interface LibraryTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  track_number: number;
  duration: number;
  year?: number;
  file_path: string;
  format: string;
  bit_depth?: number;
  sample_rate?: number;
  bitrate?: number;
  channels?: number;
  hires?: boolean;
  dr_score?: number;
  is_dsd?: boolean;
}

export interface LibraryAlbum {
  id: string;
  name: string;
  artist: string;
  year?: number;
  track_count: number;
  cover_path?: string;
  dr_score?: number;
  size_bytes?: number;
  hires?: boolean;
}

export interface LibraryArtist {
  id: string;
  name: string;
  album_count: number;
  track_count: number;
}

export interface MappedFolder {
  name: string;
  path: string;
  is_download_target: boolean;
  watch_changes: boolean;
}

export interface DiskUsage {
  total_bytes: number;
  free_bytes: number;
  used_percent: number;
}

export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size_bytes: number;
  format?: string;
  bit_depth?: number;
  sample_rate?: number;
  hires?: boolean;
  channels?: number;
  dr_score?: number;
  flac_md5?: string;
  replaygain_track_gain?: string;
  track_number?: number;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  modified_at?: number;
  cover_url?: string;
}

export type SignalFidelityRating = "bit-perfect" | "enhanced" | "resampled";

export interface AudioSignalPath {
  fidelityRating: SignalFidelityRating;
  source: {
    format: string;
    bitDepth?: number;
    sampleRate?: number;
    bitrate?: number;
    provider: string;
    isLossless?: boolean;
    qualityLabel?: string;
    flacMd5?: string;
  };
  transport: {
    protocol: string;
    status: string;
    bufferHealth: string;
    jitterLatencyMs: number;
  };
  dsp: {
    bitPerfect: boolean;
    equalizerActive: boolean;
    processingBitDepth: string;
    headroomGainDb: number;
    autoEqActive?: boolean;
    activePreset?: string;
  };
  output: {
    device: string;
    sampleRate: number;
    latencyMs: number;
    clockLock: boolean;
    hardwareMode: string;
    truePeakDbfs: number;
    interSampleOverload: boolean;
  };
}

export interface EqBand {
  frequency: number;
  gain: number;
}

export type PeqFilterType = "peaking" | "lowshelf" | "highshelf" | "lowpass" | "highpass" | "notch";

export interface PeqBand {
  id: string;
  frequency: number;
  gain: number;
  q: number;
  type: PeqFilterType;
  enabled: boolean;
}

export interface AutoEqPreset {
  name: string;
  target: string;
  description: string;
  bands: PeqBand[];
}

export interface AudioOutputDevice {
  id: string;
  name: string;
  hardware_id: string;
  device_type: string;
  is_bit_perfect: boolean;
  is_active: boolean;
  max_sample_rate: number;
  supported_formats: string[];
  category?: "browser" | "usb_dac" | "analog" | "digital" | "hdmi" | string;
  description?: string;
}

export interface DeviceTelemetry {
  active_device_id: string;
  active_device_name: string;
  is_exclusive_bit_perfect: boolean;
  sample_rate: number;
  bit_depth: number;
  dsd_mode?: string;
  master_volume: number;
  clock_lock: boolean;
  buffer_latency_ms: number;
  hardware_mode?: "hw" | "plughw" | "dmix";
  buffer_frames?: number;
  replay_gain_mode?: "off" | "album" | "track";
}

export interface LiveAudioTelemetry {
  bufferedSeconds: number;
  bufferPercent: number;
  bufferedBytesEstimate: number; // in MB
  sampleFrame: number;
  totalFrames: number;
  subBassEnergy: number; // 0.0 - 1.0 (20-80 Hz)
  midEnergy: number;     // 0.0 - 1.0 (300-1000 Hz)
  trebleEnergy: number;  // 0.0 - 1.0 (2k-8k Hz)
  rmsDbfs: number;       // -96 to 0 dBFS
  peakDbfs: number;      // -96 to 0 dBFS
  truePeakDbfs: number;  // Inter-sample estimated true-peak
  interSampleOverload: boolean;
  crestFactorDb: number;
  instantBitrateKbps: number;
  isBuffering: boolean;
  channelCount: number;
  currentClockLocked: boolean;
  rmsLeftDbfs?: number;
  rmsRightDbfs?: number;
  peakLeftDbfs?: number;
  peakRightDbfs?: number;
  phaseCorrelation?: number; // -1 to +1
}

export interface LyricLine {
  time: number; // in seconds
  text: string;
}

export interface LyricsData {
  synced: boolean;
  lines: LyricLine[];
  plain?: string | null;
  instrumental?: boolean;
  source?: string;
}

export type DownloadStage =
  | "queued"
  | "resolving"
  | "downloading_audio"
  | "tagging_and_writing"
  | "indexing_library"
  | "completed"
  | "failed"
  | "paused";

export interface DownloadJob {
  id: string;
  title: string;
  artist: string;
  album: string;
  track_number?: number;
  year?: number;
  duration?: number;
  cover_url?: string;
  stream_url?: string;
  track_id?: string;
  source?: string;
  slskd_username?: string;
  slskd_id?: string;
  stage: DownloadStage;
  progress_percent: number;
  downloaded_bytes: number;
  total_bytes?: number;
  speed_kbps?: number;
  eta_seconds?: number;
  error?: string;
  saved_path?: string;
  created_at: number;
  updated_at: number;
}

