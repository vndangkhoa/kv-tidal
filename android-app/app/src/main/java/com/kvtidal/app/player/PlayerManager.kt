package com.kvtidal.app.player

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.graphics.drawable.BitmapDrawable
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.util.Log
import android.widget.Toast
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import coil.imageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import com.kvtidal.app.KVTidalApp
import com.kvtidal.app.data.api.RetrofitClient
import com.kvtidal.app.data.download.OfflineDownloadManager
import com.kvtidal.app.data.model.LiveSignalPathInfo
import com.kvtidal.app.data.model.Track
import com.kvtidal.app.data.repository.MusicRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import kotlin.random.Random

object PlayerManager {

    private const val TAG = "PlayerManager"
    private const val PREFS_STATE = "kv_tidal_player_state"
    private const val KEY_LIKED_IDS = "liked_track_ids"
    private const val KEY_HISTORY_JSON = "history_tracks_json"

    private var exoPlayer: ExoPlayer? = null
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var prefetchJob: Job? = null
    private var currentStreamUrl: String = ""

    private val _currentTrack = MutableStateFlow<Track?>(null)
    val currentTrack: StateFlow<Track?> = _currentTrack

    private val _isPlaying = MutableStateFlow(false)
    val isPlaying: StateFlow<Boolean> = _isPlaying

    private val _currentCoverBitmap = MutableStateFlow<Bitmap?>(null)
    val currentCoverBitmap: StateFlow<Bitmap?> = _currentCoverBitmap

    private val _currentPosition = MutableStateFlow(0L)
    val currentPosition: StateFlow<Long> = _currentPosition

    private val _duration = MutableStateFlow(0L)
    val duration: StateFlow<Long> = _duration

    private val _queue = MutableStateFlow<List<Track>>(emptyList())
    val queue: StateFlow<List<Track>> = _queue

    private val _queueIndex = MutableStateFlow(0)
    val queueIndex: StateFlow<Int> = _queueIndex

    private val _isShuffle = MutableStateFlow(false)
    val isShuffle: StateFlow<Boolean> = _isShuffle

    private val _isRepeat = MutableStateFlow(false)
    val isRepeat: StateFlow<Boolean> = _isRepeat

    private val _waveformBars = MutableStateFlow<List<Float>>(emptyList())
    val waveformBars: StateFlow<List<Float>> = _waveformBars

    private val _likedTrackIds = MutableStateFlow<Set<String>>(emptySet())
    val likedTrackIds: StateFlow<Set<String>> = _likedTrackIds

    private val _recentlyPlayedHistory = MutableStateFlow<List<Track>>(emptyList())
    val recentlyPlayedHistory: StateFlow<List<Track>> = _recentlyPlayedHistory

    private val _liveSignalPath = MutableStateFlow<LiveSignalPathInfo?>(null)
    val liveSignalPath: StateFlow<LiveSignalPathInfo?> = _liveSignalPath

    private val _lastLoadLatencyMs = MutableStateFlow<Long?>(null)
    val lastLoadLatencyMs: StateFlow<Long?> = _lastLoadLatencyMs

    private val _lastLoadSource = MutableStateFlow<String?>(null)
    val lastLoadSource: StateFlow<String?> = _lastLoadSource

    @Volatile
    private var benchTapElapsedMs: Long = 0L

    val downloadedTracks: StateFlow<List<Track>> get() = OfflineDownloadManager.downloadedTracks
    val downloadedTrackIds: StateFlow<Set<String>> get() = OfflineDownloadManager.downloadedTrackIds
    val downloadProgress: StateFlow<Map<String, Float>> get() = OfflineDownloadManager.downloadProgress
    val totalDownloadBytes: StateFlow<Long> get() = OfflineDownloadManager.totalStorageBytes

    init {
        startProgressTracker()
    }

    fun loadPersistedState(context: Context) {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_STATE, Context.MODE_PRIVATE)
        val liked = prefs.getStringSet(KEY_LIKED_IDS, emptySet()).orEmpty()
        if (liked.isNotEmpty()) {
            _likedTrackIds.value = liked.toSet()
        }
        val historyJson = prefs.getString(KEY_HISTORY_JSON, null)
        if (!historyJson.isNullOrBlank()) {
            runCatching {
                val arr = JSONArray(historyJson)
                val list = ArrayList<Track>(arr.length())
                for (i in 0 until arr.length()) {
                    val o = arr.optJSONObject(i) ?: continue
                    val id = o.optString("id")
                    if (id.isBlank()) continue
                    list.add(
                        Track(
                            id = id,
                            title = o.optString("title"),
                            artist = o.optString("artist"),
                            album = o.optString("album"),
                            duration = o.optInt("duration", 0),
                            coverUrl = o.optString("cover_url"),
                            url = o.optString("url"),
                            streamId = o.optString("stream_id").ifBlank { null },
                            source = o.optString("source", "tidal"),
                            hires = o.optBoolean("hires", true),
                            bitDepth = if (o.has("bit_depth")) o.optInt("bit_depth") else 24,
                            sampleRate = if (o.has("sample_rate")) o.optInt("sample_rate") else 96000,
                            format = o.optString("format", "FLAC")
                        )
                    )
                }
                if (list.isNotEmpty()) _recentlyPlayedHistory.value = list
            }
        }
    }

    private fun persistLiked(ids: Set<String>) {
        runCatching {
            KVTidalApp.instance.getSharedPreferences(PREFS_STATE, Context.MODE_PRIVATE)
                .edit()
                .putStringSet(KEY_LIKED_IDS, ids)
                .apply()
        }
    }

    private fun persistHistory(tracks: List<Track>) {
        runCatching {
            val arr = JSONArray()
            tracks.take(40).forEach { t ->
                arr.put(
                    JSONObject().apply {
                        put("id", t.id)
                        put("title", t.title)
                        put("artist", t.artist)
                        put("album", t.album)
                        put("duration", t.duration)
                        put("cover_url", t.coverUrl)
                        put("url", t.url)
                        t.streamId?.let { put("stream_id", it) }
                        put("source", t.source)
                        put("hires", t.hires)
                        t.bitDepth?.let { put("bit_depth", it) }
                        t.sampleRate?.let { put("sample_rate", it) }
                        t.format?.let { put("format", it) }
                    }
                )
            }
            KVTidalApp.instance.getSharedPreferences(PREFS_STATE, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_HISTORY_JSON, arr.toString())
                .apply()
        }
    }

    @OptIn(UnstableApi::class)
    fun getExoPlayer(context: Context): ExoPlayer {
        if (exoPlayer == null) {
            val appCtx = context.applicationContext
            OfflineDownloadManager.init(appCtx)
            loadPersistedState(appCtx)

            val audioAttributes = AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build()

            val dataSourceFactory = AudioCacheManager.buildPlaybackDataSourceFactory(appCtx)
            val mediaSourceFactory = DefaultMediaSourceFactory(appCtx)
                .setDataSourceFactory(dataSourceFactory)

            val loadControl = DefaultLoadControl.Builder()
                .setBufferDurationsMs(15_000, 60_000, 250, 750)
                .build()

            exoPlayer = ExoPlayer.Builder(appCtx)
                .setLoadControl(loadControl)
                .setMediaSourceFactory(mediaSourceFactory)
                .setAudioAttributes(audioAttributes, true)
                .setHandleAudioBecomingNoisy(true)
                .setWakeMode(C.WAKE_MODE_NETWORK)
                .build().apply {
                    addListener(object : Player.Listener {
                        override fun onIsPlayingChanged(playing: Boolean) {
                            _isPlaying.value = playing
                        }

                        override fun onPlaybackStateChanged(state: Int) {
                            if (state == Player.STATE_READY) {
                                _duration.value = duration.coerceAtLeast(0L)
                                if (benchTapElapsedMs > 0L) {
                                    _lastLoadLatencyMs.value =
                                        (SystemClock.elapsedRealtime() - benchTapElapsedMs).coerceAtLeast(0L)
                                }
                                refreshCapturedSignalPath()
                            } else if (state == Player.STATE_ENDED) {
                                playNext()
                            }
                        }

                        override fun onPlayerError(error: PlaybackException) {
                            val track = _currentTrack.value ?: return
                            Log.w(TAG, "Playback error on ${track.id}: ${error.message}")
                            AudioCacheManager.evictTrack(appCtx, track.id)
                        }
                    })
                }
        }
        return exoPlayer!!
    }

    private fun refreshCapturedSignalPath() {
        val captured = RetrofitClient.getCapturedSignalInfo(currentStreamUrl)
        if (captured != null) {
            _liveSignalPath.value = captured
            _lastLoadSource.value = captured.source
            val cur = _currentTrack.value
            if (cur != null) {
                _currentTrack.value = cur.copy(
                    format = captured.format,
                    bitDepth = captured.bitDepth ?: cur.bitDepth,
                    sampleRate = captured.sampleRate ?: cur.sampleRate,
                    bitrate = captured.bitrate ?: cur.bitrate,
                    drScore = captured.drScore ?: cur.drScore,
                    isDsd = captured.isDsd,
                    hires = captured.isLossless && ((captured.bitDepth ?: 0) > 16 || (captured.sampleRate ?: 0) > 48000 || captured.isDsd),
                    source = captured.source
                )
            }
        }
    }

    fun playTrack(track: Track, newQueue: List<Track> = listOf(track)) {
        val appCtx = KVTidalApp.instance
        getExoPlayer(appCtx)

        benchTapElapsedMs = SystemClock.elapsedRealtime()
        _lastLoadLatencyMs.value = null

        _currentTrack.value = track
        _queue.value = newQueue
        _queueIndex.value = newQueue.indexOfFirst { it.id == track.id }.coerceAtLeast(0)

        val currentHistory = _recentlyPlayedHistory.value.toMutableList()
        currentHistory.removeAll { it.id == track.id }
        currentHistory.add(0, track)
        val trimmedHistory = currentHistory.take(40)
        _recentlyPlayedHistory.value = trimmedHistory
        persistHistory(trimmedHistory)

        generateWaveform(track.id)

        val offlineFile = OfflineDownloadManager.getOfflineFile(track.id)
        if (offlineFile != null) {
            currentStreamUrl = Uri.fromFile(offlineFile).toString()
            _lastLoadSource.value = "OFFLINE_LOSSLESS"
            _liveSignalPath.value = LiveSignalPathInfo(
                format = track.format ?: "FLAC",
                source = "offline-device",
                bitDepth = track.bitDepth,
                sampleRate = track.sampleRate,
                bitrate = track.bitrate,
                drScore = track.drScore,
                isLossless = true,
                isDsd = track.isDsd
            )
            startMediaItem(track, currentStreamUrl, cacheKey = null)
            prefetchUpcoming(newQueue, _queueIndex.value)
            return
        }

        val streamUrl = RetrofitClient.buildStreamUrl(track)
        currentStreamUrl = streamUrl
        AudioCacheManager.prioritizeTrack(track.id)
        val headCached = AudioCacheManager.isHeadCached(appCtx, track.id)
        _lastLoadSource.value = if (headCached) "SIMPLE_CACHE_HIT" else track.source.uppercase()
        _liveSignalPath.value = RetrofitClient.getCapturedSignalInfo(streamUrl) ?: LiveSignalPathInfo(
            format = track.format ?: "FLAC",
            source = track.source,
            bitDepth = track.bitDepth,
            sampleRate = track.sampleRate,
            bitrate = track.bitrate,
            drScore = track.drScore,
            isLossless = track.hires || (track.format?.equals("FLAC", ignoreCase = true) == true),
            isDsd = track.isDsd
        )

        startMediaItem(
            track = track,
            streamUrl = streamUrl,
            cacheKey = AudioCacheManager.trackCacheKey(track.id)
        )
        prefetchUpcoming(newQueue, _queueIndex.value)
    }

    private fun prefetchUpcoming(queue: List<Track>, currentIndex: Int) {
        val nextTracks = ((currentIndex + 1)..(currentIndex + 2))
            .mapNotNull { idx -> queue.getOrNull(idx) }
        if (nextTracks.isEmpty()) return

        prefetchJob?.cancel()
        prefetchJob = scope.launch(Dispatchers.IO) {
            delay(300)
            if (!isActive) return@launch
            AudioCacheManager.preloadTracks(KVTidalApp.instance, nextTracks, maxCount = 2)
        }
    }

    private fun startMediaItem(
        track: Track,
        streamUrl: String,
        cacheKey: String?
    ) {
        val player = exoPlayer ?: getExoPlayer(KVTidalApp.instance)

        val itemBuilder = MediaItem.Builder()
            .setUri(Uri.parse(streamUrl))
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(track.title)
                    .setArtist(track.artist)
                    .setAlbumTitle(track.album.ifBlank { track.artist })
                    .setArtworkUri(Uri.parse(track.coverUrl))
                    .setIsPlayable(true)
                    .build()
            )
        if (!cacheKey.isNullOrBlank()) {
            itemBuilder.setCustomCacheKey(cacheKey)
        }

        player.setMediaItem(itemBuilder.build())
        player.prepare()
        player.playWhenReady = true
        _isPlaying.value = true

        try {
            val context = KVTidalApp.instance
            val serviceIntent = Intent(context, PlaybackService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        scope.launch(Dispatchers.IO) {
            try {
                val context = KVTidalApp.instance
                val request = ImageRequest.Builder(context)
                    .data(track.coverUrl)
                    .allowHardware(false)
                    .build()
                val result = (context.imageLoader.execute(request) as? SuccessResult)?.drawable
                val bitmap = (result as? BitmapDrawable)?.bitmap
                if (bitmap != null) {
                    withContext(Dispatchers.Main) {
                        if (_currentTrack.value?.id == track.id) {
                            _currentCoverBitmap.value = bitmap
                        }
                    }
                }
            } catch (_: Exception) {
            }
        }
    }

    fun togglePlayPause() {
        val player = exoPlayer ?: return
        if (player.isPlaying) player.pause() else player.play()
    }

    fun seekTo(positionMs: Long) {
        exoPlayer?.seekTo(positionMs)
        _currentPosition.value = positionMs
    }

    fun playNext() {
        val q = _queue.value
        if (q.isEmpty()) return
        val nextIdx = if (_isShuffle.value && q.size > 1) {
            Random.nextInt(q.size)
        } else {
            val candidate = _queueIndex.value + 1
            if (candidate >= q.size) {
                if (_isRepeat.value) 0 else return
            } else {
                candidate
            }
        }
        playTrack(q[nextIdx], q)
    }

    fun playPrevious() {
        val q = _queue.value
        if (q.isEmpty()) return
        val prevIdx = (_queueIndex.value - 1).coerceAtLeast(0)
        playTrack(q[prevIdx], q)
    }

    fun toggleDownload(context: Context, track: Track) {
        OfflineDownloadManager.toggleDownload(context, track)
    }

    fun downloadTracks(context: Context, tracks: List<Track>) {
        OfflineDownloadManager.downloadTracks(context, tracks)
    }

    fun queueToNas(context: Context, track: Track, musicRepo: MusicRepository) {
        scope.launch {
            Toast.makeText(context, "Queuing '${track.title}' to NAS Vault...", Toast.LENGTH_SHORT).show()
            val res = musicRepo.queueServerDownload(track)
            if (res.isSuccess) {
                Toast.makeText(context, "Queued on NAS (${track.title})", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(
                    context,
                    "NAS queue failed: ${res.exceptionOrNull()?.message ?: "error"}",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    fun isTrackDownloaded(trackId: String): Boolean = OfflineDownloadManager.isDownloaded(trackId)

    fun toggleLike(trackId: String) {
        val current = _likedTrackIds.value.toMutableSet()
        if (current.contains(trackId)) current.remove(trackId) else current.add(trackId)
        _likedTrackIds.value = current
        persistLiked(current)
    }

    fun isTrackLiked(trackId: String): Boolean = _likedTrackIds.value.contains(trackId)

    fun clearAllUserData() {
        _likedTrackIds.value = emptySet()
        _recentlyPlayedHistory.value = emptyList()
        _currentTrack.value = null
        _queue.value = emptyList()
        _queueIndex.value = 0
        _isPlaying.value = false
        persistLiked(emptySet())
        persistHistory(emptyList())
        try {
            exoPlayer?.stop()
            exoPlayer?.clearMediaItems()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun toggleShuffle() {
        _isShuffle.value = !_isShuffle.value
    }

    fun toggleRepeat() {
        _isRepeat.value = !_isRepeat.value
    }

    private fun generateWaveform(seedStr: String) {
        val seed = seedStr.hashCode().toLong()
        val random = Random(seed)
        val barCount = 70
        val bars = ArrayList<Float>(barCount)
        for (i in 0 until barCount) {
            val norm = (i.toFloat() / barCount)
            val envelope = (Math.sin(norm * Math.PI) * 0.4 + 0.6).toFloat()
            val amp = (random.nextFloat() * 0.7f + 0.3f) * envelope
            bars.add(amp.coerceIn(0.12f, 1.0f))
        }
        _waveformBars.value = bars
    }

    private fun startProgressTracker() {
        scope.launch {
            while (isActive) {
                exoPlayer?.let { player ->
                    if (player.isPlaying) {
                        _currentPosition.value = player.currentPosition
                        _duration.value = player.duration.coerceAtLeast(0L)
                    }
                }
                delay(200)
            }
        }
    }
}
