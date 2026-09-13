/**
 * W3C Media Session API Utility
 * Powers OS-native "Now Playing" cards across:
 * - Android Notification Shade & Lock Screen Quick Settings
 * - iOS Lock Screen, Dynamic Island, and Control Center
 * - Apple Watch, Wear OS, and Bluetooth Car Dashboards
 */

import { PlayableTrack } from "@/types";

export interface MediaSessionActionCallbacks {
  onPlay: () => void;
  onPause: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onSeek?: (seconds: number) => void;
}

/**
 * Updates the native OS lock screen / notification metadata (artwork, title, artist, album).
 */
export function updateMediaSessionMetadata(track: PlayableTrack | null) {
  if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

  if (!track) {
    navigator.mediaSession.metadata = null;
    return;
  }

  // Fallback to app icon if track does not have a cover
  const rawCover = track.coverUrl || "/icon-512.png";
  let absoluteCoverUrl = rawCover;
  try {
    absoluteCoverUrl = new URL(rawCover, window.location.origin).href;
  } catch {
    absoluteCoverUrl = rawCover;
  }

  // iOS Safari requires absolute URLs and prefers common square resolutions
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title || "Unknown Title",
    artist: track.artist || "Unknown Artist",
    album: track.album || "TIDAL Master",
    artwork: [
      { src: absoluteCoverUrl, sizes: "96x96", type: "image/jpeg" },
      { src: absoluteCoverUrl, sizes: "128x128", type: "image/jpeg" },
      { src: absoluteCoverUrl, sizes: "192x192", type: "image/jpeg" },
      { src: absoluteCoverUrl, sizes: "256x256", type: "image/jpeg" },
      { src: absoluteCoverUrl, sizes: "384x384", type: "image/jpeg" },
      { src: absoluteCoverUrl, sizes: "512x512", type: "image/jpeg" },
    ],
  });
}

/**
 * Updates the OS media playback state ('playing' | 'paused' | 'none').
 */
export function updateMediaSessionPlaybackState(isPlaying: boolean) {
  if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  } catch (e) {
    console.debug("Failed to set mediaSession playbackState", e);
  }
}

/**
 * Synchronizes the timeline scrubber on lock screen & notifications.
 */
export function syncMediaPositionState(audio: HTMLAudioElement | null) {
  if (
    typeof window === "undefined" ||
    !("mediaSession" in navigator) ||
    !("setPositionState" in navigator.mediaSession) ||
    !audio
  ) {
    return;
  }

  const duration = audio.duration;
  const currentTime = audio.currentTime;

  if (
    Number.isFinite(duration) &&
    duration > 0 &&
    Number.isFinite(currentTime) &&
    currentTime >= 0
  ) {
    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(0, duration),
        playbackRate: audio.playbackRate || 1.0,
        position: Math.min(Math.max(0, currentTime), duration),
      });
    } catch {
      // Ignore transient position state sync errors
    }
  }
}

/**
 * Binds hardware/OS media actions to player handlers.
 */
export function registerMediaSessionActions(
  audio: HTMLAudioElement | null,
  callbacks: MediaSessionActionCallbacks
) {
  if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

  const actions: [MediaSessionAction, MediaSessionActionHandler | null][] = [
    [
      "play",
      () => {
        callbacks.onPlay();
        updateMediaSessionPlaybackState(true);
      },
    ],
    [
      "pause",
      () => {
        callbacks.onPause();
        updateMediaSessionPlaybackState(false);
      },
    ],
    ["previoustrack", callbacks.onPrevious || null],
    ["nexttrack", callbacks.onNext || null],
    [
      "seekbackward",
      (details) => {
        if (!audio) return;
        const skip = details.seekOffset || 10;
        const target = Math.max(0, audio.currentTime - skip);
        if (callbacks.onSeek) {
          callbacks.onSeek(target);
        } else {
          audio.currentTime = target;
        }
        syncMediaPositionState(audio);
      },
    ],
    [
      "seekforward",
      (details) => {
        if (!audio) return;
        const skip = details.seekOffset || 10;
        const dur = audio.duration || 0;
        const target = Math.min(dur, audio.currentTime + skip);
        if (callbacks.onSeek) {
          callbacks.onSeek(target);
        } else {
          audio.currentTime = target;
        }
        syncMediaPositionState(audio);
      },
    ],
    [
      "seekto",
      (details) => {
        if (!audio || details.seekTime === undefined) return;
        if (callbacks.onSeek) {
          callbacks.onSeek(details.seekTime);
        } else {
          audio.currentTime = details.seekTime;
        }
        syncMediaPositionState(audio);
      },
    ],
    [
      "stop",
      () => {
        callbacks.onPause();
        if (typeof window !== "undefined" && "mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "none";
        }
      },
    ],
  ];

  for (const [action, handler] of actions) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Handler not supported on this platform/browser
    }
  }
}
