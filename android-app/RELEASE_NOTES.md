## KV Tidal Android v1.0.1

- **Bluetooth Hi-Res FLAC Fix**:
  - Excluded `TYPE_BLUETOOTH_SCO` (mono HFP voice profile) from music output routing and prioritized Bluetooth A2DP / LE Audio stereo transport.
  - Added route-aware `DefaultAudioSink` PCM switching: uses clean 16-bit integer PCM with `-1.4 dB` true-peak headroom (`0.85f`), disabled Android Spatializer (`SPATIALIZATION_BEHAVIOR_NEVER`), and enlarged Hi-Res FLAC playback buffers when listening over Bluetooth headsets.
  - Preserved Bit-Perfect 32-bit Float PCM (`0.0 dBFS` unity gain) for wired USB DAC, 4.4mm Balanced, 3.5mm PO, Line-Out (`LO`), and `S/PDIF` outputs, with seamless `PlaybackService` `MediaSession` rebinding on output switches.
- **In-App Update Support**:
  - Bumped app version to `1.0.1` (`versionCode = 3`) and added direct `kvtidal-version.json` update discovery alongside GitHub and Forgejo Releases.
