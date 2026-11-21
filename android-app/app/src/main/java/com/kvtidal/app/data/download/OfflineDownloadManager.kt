package com.kvtidal.app.data.download

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.MediaStore
import android.util.Log
import android.widget.Toast
import com.kvtidal.app.data.api.RetrofitClient
import com.kvtidal.app.data.model.Track
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.concurrent.ConcurrentHashMap

data class OfflineDownloadEntry(
    val track: Track,
    val localFilePath: String,
    val publicUri: String,
    val publicDisplayPath: String,
    val fileSizeBytes: Long,
    val downloadedAtMs: Long
)

/**
 * Downloads full audio tracks (FLAC / Hi-Res / M4A) to both private offline storage
 * and the phone's public `Music/KV Tidal/` folder.
 */
object OfflineDownloadManager {

    private const val TAG = "OfflineDownload"
    private const val PREFS_NAME = "kv_tidal_offline_downloads"
    private const val KEY_ENTRIES = "downloaded_entries_json"
    private const val MIN_VALID_BYTES = 4096L

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val batchSemaphore = Semaphore(2)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val activeJobs = ConcurrentHashMap<String, Job>()

    private var appContext: Context? = null
    private val lock = Any()
    private val entriesMap = LinkedHashMap<String, OfflineDownloadEntry>()

    private val _downloadedTracks = MutableStateFlow<List<Track>>(emptyList())
    val downloadedTracks: StateFlow<List<Track>> = _downloadedTracks

    private val _downloadedTrackIds = MutableStateFlow<Set<String>>(emptySet())
    val downloadedTrackIds: StateFlow<Set<String>> = _downloadedTrackIds

    private val _downloadProgress = MutableStateFlow<Map<String, Float>>(emptyMap())
    val downloadProgress: StateFlow<Map<String, Float>> = _downloadProgress

    private val _totalStorageBytes = MutableStateFlow(0L)
    val totalStorageBytes: StateFlow<Long> = _totalStorageBytes

    @Synchronized
    fun init(context: Context) {
        if (appContext != null) return
        val ctx = context.applicationContext
        appContext = ctx
        loadFromPrefs(ctx)
    }

    private fun loadFromPrefs(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_ENTRIES, null) ?: return
        var dirty = false
        synchronized(lock) {
            entriesMap.clear()
            runCatching {
                val arr = JSONArray(raw)
                for (i in 0 until arr.length()) {
                    val obj = arr.optJSONObject(i) ?: continue
                    val id = obj.optString("id").trim()
                    val localPath = obj.optString("local_path").trim()
                    if (id.isEmpty() || localPath.isEmpty()) {
                        dirty = true
                        continue
                    }
                    val file = File(localPath)
                    if (!file.exists() || file.length() < MIN_VALID_BYTES) {
                        dirty = true
                        continue
                    }
                    val track = Track(
                        id = id,
                        title = obj.optString("title"),
                        artist = obj.optString("artist"),
                        album = obj.optString("album"),
                        duration = obj.optInt("duration", 0),
                        coverUrl = obj.optString("cover_url"),
                        url = obj.optString("url"),
                        streamId = obj.optString("stream_id").ifBlank { null },
                        source = obj.optString("source", "tidal"),
                        hires = obj.optBoolean("hires", true),
                        bitDepth = if (obj.has("bit_depth")) obj.optInt("bit_depth") else 24,
                        sampleRate = if (obj.has("sample_rate")) obj.optInt("sample_rate") else 96000,
                        format = obj.optString("format", "FLAC")
                    )
                    entriesMap[id] = OfflineDownloadEntry(
                        track = track,
                        localFilePath = localPath,
                        publicUri = obj.optString("public_uri"),
                        publicDisplayPath = obj.optString("public_display_path"),
                        fileSizeBytes = file.length(),
                        downloadedAtMs = obj.optLong("downloaded_at", 0L)
                    )
                }
            }
            if (dirty) persistLocked(context)
            publishFlowsLocked()
        }
    }

    private fun persistLocked(context: Context) {
        val arr = JSONArray()
        for (entry in entriesMap.values) {
            val t = entry.track
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
                    put("local_path", entry.localFilePath)
                    put("public_uri", entry.publicUri)
                    put("public_display_path", entry.publicDisplayPath)
                    put("file_size_bytes", entry.fileSizeBytes)
                    put("downloaded_at", entry.downloadedAtMs)
                }
            )
        }
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_ENTRIES, arr.toString())
            .apply()
    }

    private fun publishFlowsLocked() {
        val ordered = entriesMap.values.sortedByDescending { it.downloadedAtMs }
        _downloadedTracks.value = ordered.map { it.track }
        _downloadedTrackIds.value = ordered.map { it.track.id }.toSet()
        _totalStorageBytes.value = ordered.sumOf { it.fileSizeBytes }
    }

    fun isDownloaded(trackId: String): Boolean {
        val cleanId = trackId.trim()
        if (cleanId.isEmpty()) return false
        return getOfflineFile(cleanId) != null
    }

    fun isDownloading(trackId: String): Boolean = activeJobs.containsKey(trackId.trim())

    fun getOfflineFile(trackId: String): File? {
        val cleanId = trackId.trim()
        if (cleanId.isEmpty()) return null
        val path = synchronized(lock) { entriesMap[cleanId]?.localFilePath } ?: return null
        val file = File(path)
        return if (file.exists() && file.length() >= MIN_VALID_BYTES) file else null
    }

    fun toggleDownload(context: Context, track: Track) {
        val ctx = context.applicationContext
        init(ctx)
        val cleanId = track.id.trim()
        if (cleanId.isEmpty()) return

        if (isDownloading(cleanId)) {
            activeJobs.remove(cleanId)?.cancel()
            updateProgress(cleanId, null)
            showToast(ctx, "Cancelled download for '${track.title}'")
            return
        }

        if (isDownloaded(cleanId)) {
            removeDownload(ctx, cleanId)
            showToast(ctx, "Removed '${track.title}' from saved downloads")
        } else {
            downloadTrack(ctx, track)
        }
    }

    fun downloadTracks(context: Context, tracks: List<Track>) {
        val ctx = context.applicationContext
        init(ctx)
        val pending = tracks
            .asSequence()
            .filter { it.id.isNotBlank() && !isDownloaded(it.id) && !isDownloading(it.id) }
            .distinctBy { it.id }
            .toList()

        if (pending.isEmpty()) {
            showToast(ctx, "All tracks are already saved to Music/KV Tidal")
            return
        }

        showToast(ctx, "Saving ${pending.size} track(s) to Music/KV Tidal...")
        pending.forEach { track ->
            startDownloadJob(ctx, track, useSemaphore = true, showSuccessToast = false)
        }
    }

    fun downloadTrack(
        context: Context,
        track: Track,
        onComplete: ((Result<String>) -> Unit)? = null
    ) {
        val ctx = context.applicationContext
        init(ctx)
        val cleanId = track.id.trim()
        if (cleanId.isEmpty()) {
            onComplete?.invoke(Result.failure(IllegalArgumentException("Blank track id")))
            return
        }
        val existingFile = getOfflineFile(cleanId)
        if (existingFile != null) {
            onComplete?.invoke(Result.success(existingFile.absolutePath))
            return
        }
        if (isDownloading(cleanId)) return

        showToast(ctx, "Downloading '${track.title}'...")
        startDownloadJob(ctx, track, useSemaphore = false, showSuccessToast = true, onComplete = onComplete)
    }

    private fun startDownloadJob(
        context: Context,
        track: Track,
        useSemaphore: Boolean,
        showSuccessToast: Boolean,
        onComplete: ((Result<String>) -> Unit)? = null
    ) {
        val cleanId = track.id.trim()
        val job = scope.launch {
            try {
                val entry = if (useSemaphore) {
                    batchSemaphore.withPermit { executeDownload(context, track) }
                } else {
                    executeDownload(context, track)
                }
                if (showSuccessToast) {
                    showToast(context, "Saved to ${entry.publicDisplayPath}")
                }
                onComplete?.invoke(Result.success(entry.publicDisplayPath))
            } catch (ce: CancellationException) {
                throw ce
            } catch (e: Exception) {
                Log.e(TAG, "Download failed for $cleanId: ${e.message}", e)
                showToast(context, "Download failed: ${e.message ?: "Network error"}")
                onComplete?.invoke(Result.failure(e))
            } finally {
                updateProgress(cleanId, null)
                activeJobs.remove(cleanId)
            }
        }
        val prev = activeJobs.putIfAbsent(cleanId, job)
        if (prev != null) job.cancel()
    }

    private fun executeDownload(context: Context, track: Track): OfflineDownloadEntry {
        val cleanId = track.id.trim()
        val startMs = SystemClock.elapsedRealtime()
        updateProgress(cleanId, 0.01f)

        val streamUrl = RetrofitClient.buildStreamUrl(track, forceLossless = true)
        val client = RetrofitClient.getDownloadOkHttpClient()

        val req = Request.Builder().url(streamUrl).build()
        client.newCall(req).execute().use { response ->
            if (!response.isSuccessful) {
                throw IllegalStateException("HTTP ${response.code} for $streamUrl")
            }
            val body = response.body ?: throw IllegalStateException("Empty response body")

            val contentType = response.header("Content-Type")?.lowercase().orEmpty()
            val hdrFormat = response.header("x-audio-format")?.lowercase().orEmpty()
            val (ext, mimeType) = when {
                contentType.contains("flac") || hdrFormat.contains("flac") -> "flac" to "audio/flac"
                contentType.contains("webm") || contentType.contains("opus") -> "webm" to "audio/webm"
                contentType.contains("mpeg") || contentType.contains("mp3") -> "mp3" to "audio/mpeg"
                else -> "m4a" to "audio/mp4"
            }

            val offlineDir = File(context.getExternalFilesDir(Environment.DIRECTORY_MUSIC), "offline").apply {
                if (!exists()) mkdirs()
            }
            val safeFileStem = cleanId.replace(Regex("[^A-Za-z0-9_-]"), "_").ifBlank { "track" }
            val partFile = File(offlineDir, "${safeFileStem}.${ext}.part")
            val finalFile = File(offlineDir, "${safeFileStem}.${ext}")

            val totalBytes = body.contentLength()
            var written = 0L
            var lastReportMs = 0L

            body.byteStream().use { input ->
                FileOutputStream(partFile).use { output ->
                    val buf = ByteArray(32 * 1024)
                    while (true) {
                        val read = input.read(buf)
                        if (read == -1) break
                        output.write(buf, 0, read)
                        written += read
                        val now = SystemClock.elapsedRealtime()
                        if (now - lastReportMs >= 100L) {
                            lastReportMs = now
                            val fraction = if (totalBytes > 0L) {
                                (written.toFloat() / totalBytes.toFloat()).coerceIn(0.02f, 0.96f)
                            } else {
                                0.5f
                            }
                            updateProgress(cleanId, fraction)
                        }
                    }
                    output.fd.sync()
                }
            }

            if (!partFile.exists() || partFile.length() < MIN_VALID_BYTES) {
                partFile.delete()
                throw IllegalStateException("Downloaded audio too small ($written bytes)")
            }

            if (finalFile.exists()) finalFile.delete()
            if (!partFile.renameTo(finalFile)) {
                partFile.copyTo(finalFile, overwrite = true)
                partFile.delete()
            }

            updateProgress(cleanId, 0.98f)
            val (publicUri, displayPath) = exportToPublicMusic(
                context = context,
                sourceFile = finalFile,
                track = track,
                ext = ext,
                mimeType = mimeType
            )

            val entry = OfflineDownloadEntry(
                track = track.copy(id = cleanId, format = ext.uppercase()),
                localFilePath = finalFile.absolutePath,
                publicUri = publicUri,
                publicDisplayPath = displayPath,
                fileSizeBytes = finalFile.length(),
                downloadedAtMs = System.currentTimeMillis()
            )

            synchronized(lock) {
                entriesMap[cleanId] = entry
                persistLocked(context)
                publishFlowsLocked()
            }

            val elapsedMs = SystemClock.elapsedRealtime() - startMs
            Log.i(TAG, "Saved $cleanId (${entry.fileSizeBytes} bytes) -> $displayPath in ${elapsedMs}ms")
            return entry
        }
    }

    private fun exportToPublicMusic(
        context: Context,
        sourceFile: File,
        track: Track,
        ext: String,
        mimeType: String
    ): Pair<String, String> {
        val cleanTitle = track.title.replace(Regex("[\\\\/:*?\"<>|]+"), " ").replace(Regex("\\s+"), " ").trim()
        val cleanArtist = track.artist.replace(Regex("[\\\\/:*?\"<>|]+"), " ").replace(Regex("\\s+"), " ").trim()
        val stem = when {
            cleanTitle.isNotEmpty() && cleanArtist.isNotEmpty() -> "$cleanTitle - $cleanArtist"
            cleanTitle.isNotEmpty() -> cleanTitle
            else -> track.id.replace(Regex("[^A-Za-z0-9_-]"), "_")
        }.take(96)
        val fileName = "$stem.$ext"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                val resolver = context.contentResolver
                val values = ContentValues().apply {
                    put(MediaStore.Audio.Media.DISPLAY_NAME, fileName)
                    put(MediaStore.Audio.Media.TITLE, track.title.ifBlank { stem })
                    put(MediaStore.Audio.Media.ARTIST, track.artist.ifBlank { "Unknown Artist" })
                    if (track.album.isNotBlank()) {
                        put(MediaStore.Audio.Media.ALBUM, track.album)
                    }
                    put(MediaStore.Audio.Media.MIME_TYPE, mimeType)
                    put(MediaStore.Audio.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MUSIC}/KV Tidal")
                    put(MediaStore.Audio.Media.IS_PENDING, 1)
                }
                val itemUri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values)
                if (itemUri != null) {
                    try {
                        resolver.openOutputStream(itemUri)?.use { out ->
                            FileInputStream(sourceFile).use { input ->
                                input.copyTo(out, 32 * 1024)
                            }
                            out.flush()
                        } ?: throw IllegalStateException("Could not open MediaStore output stream")

                        val publishValues = ContentValues().apply {
                            put(MediaStore.Audio.Media.IS_PENDING, 0)
                        }
                        resolver.update(itemUri, publishValues, null, null)
                        return itemUri.toString() to "${Environment.DIRECTORY_MUSIC}/KV Tidal/$fileName"
                    } catch (writeErr: Exception) {
                        runCatching { resolver.delete(itemUri, null, null) }
                        throw writeErr
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "MediaStore export failed, keeping app offline file: ${e.message}")
            }
        } else {
            runCatching {
                @Suppress("DEPRECATION")
                val publicDir = File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC),
                    "KV Tidal"
                )
                if (publicDir.exists() || publicDir.mkdirs()) {
                    val destFile = File(publicDir, fileName)
                    sourceFile.copyTo(destFile, overwrite = true)
                    MediaScannerConnection.scanFile(
                        context,
                        arrayOf(destFile.absolutePath),
                        arrayOf(mimeType),
                        null
                    )
                    return destFile.absolutePath to "${Environment.DIRECTORY_MUSIC}/KV Tidal/$fileName"
                }
            }
        }

        return "" to "App Offline Storage"
    }

    fun removeDownload(context: Context, trackId: String) {
        val cleanId = trackId.trim()
        if (cleanId.isEmpty()) return
        activeJobs.remove(cleanId)?.cancel()
        updateProgress(cleanId, null)

        val removed = synchronized(lock) {
            val entry = entriesMap.remove(cleanId)
            persistLocked(context)
            publishFlowsLocked()
            entry
        }

        if (removed != null) {
            scope.launch {
                runCatching { File(removed.localFilePath).delete() }
                if (removed.publicUri.startsWith("content://")) {
                    runCatching {
                        context.contentResolver.delete(Uri.parse(removed.publicUri), null, null)
                    }
                } else if (removed.publicUri.isNotBlank()) {
                    runCatching { File(removed.publicUri).delete() }
                }
            }
        }
    }

    private fun updateProgress(trackId: String, progress: Float?) {
        val next = _downloadProgress.value.toMutableMap()
        if (progress == null) next.remove(trackId) else next[trackId] = progress
        _downloadProgress.value = next
    }

    private fun showToast(context: Context, message: String) {
        mainHandler.post {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        }
    }
}
