package com.kvtidal.app.data.api

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.kvtidal.app.data.model.LiveSignalPathInfo
import com.kvtidal.app.data.model.Track
import okhttp3.Call
import okhttp3.ConnectionPool
import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.logging.HttpLoggingInterceptor
import org.json.JSONObject
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

object RetrofitClient {

    private const val TAG = "RetrofitClient"
    private const val PREFS_NAME = "kv_tidal_network_prefs"
    private const val KEY_BASE_URL = "base_url"
    private const val KEY_STREAM_QUALITY = "stream_quality_mode"
    const val DEFAULT_BASE_URL = "https://tidal.khoavo.myds.me"

    private var prefs: SharedPreferences? = null
    private var currentBaseUrl: String = DEFAULT_BASE_URL
    private var streamQualityMode: String = "HI_RES_LOSSLESS"

    private var apiInstance: KVTidalApi? = null
    private var mediaClientInstance: OkHttpClient? = null
    private var downloadClientInstance: OkHttpClient? = null

    val liveSignalHeaders = ConcurrentHashMap<String, LiveSignalPathInfo>()
    val sharedConnectionPool: ConnectionPool = ConnectionPool(8, 5, TimeUnit.MINUTES)

    private val cloudflareFallbackDns = object : Dns {
        override fun lookup(hostname: String): List<InetAddress> {
            return try {
                Dns.SYSTEM.lookup(hostname)
            } catch (systemErr: Exception) {
                val doh = lookupCloudflareDoH(hostname)
                if (doh.isNotEmpty()) doh else throw systemErr
            }
        }
    }

    private fun lookupCloudflareDoH(hostname: String): List<InetAddress> {
        return try {
            val encoded = URLEncoder.encode(hostname, "UTF-8")
            val conn = (URL("https://1.1.1.1/dns-query?name=$encoded&type=A").openConnection() as HttpURLConnection).apply {
                setRequestProperty("Accept", "application/dns-json")
                connectTimeout = 2500
                readTimeout = 2500
            }
            conn.inputStream.bufferedReader().use { reader ->
                val json = JSONObject(reader.readText())
                val answers = json.optJSONArray("Answer") ?: return emptyList()
                val result = ArrayList<InetAddress>()
                for (i in 0 until answers.length()) {
                    val item = answers.optJSONObject(i) ?: continue
                    if (item.optInt("type") == 1) {
                        val ip = item.optString("data").trim()
                        if (ip.isNotEmpty()) {
                            runCatching { InetAddress.getByName(ip) }.getOrNull()?.let { result.add(it) }
                        }
                    }
                }
                result
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    @Synchronized
    fun init(context: Context) {
        if (prefs != null) return
        val p = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs = p
        val savedUrl = p.getString(KEY_BASE_URL, null)?.trim().orEmpty()
        if (savedUrl.isNotBlank()) {
            currentBaseUrl = normalizeServerUrl(savedUrl)
        }
        streamQualityMode = p.getString(KEY_STREAM_QUALITY, "HI_RES_LOSSLESS")?.trim().orEmpty()
            .ifBlank { "HI_RES_LOSSLESS" }
        apiInstance = null
        mediaClientInstance = null
        downloadClientInstance = null
    }

    private fun normalizeServerUrl(raw: String): String {
        var formatted = raw.trim()
        if (formatted.isBlank()) return DEFAULT_BASE_URL
        if (!formatted.startsWith("http://") && !formatted.startsWith("https://")) {
            val isLan = formatted.startsWith("192.168.") ||
                formatted.startsWith("10.") ||
                formatted.startsWith("172.") ||
                formatted.startsWith("127.0.0.1") ||
                formatted.startsWith("localhost") ||
                formatted.contains(":")
            formatted = if (isLan) "http://$formatted" else "https://$formatted"
        }
        return formatted.trimEnd('/')
    }

    fun getBaseUrl(): String = currentBaseUrl

    @Synchronized
    fun setBaseUrl(newUrl: String) {
        val formatted = normalizeServerUrl(newUrl)
        prefs?.edit()?.putString(KEY_BASE_URL, formatted)?.apply()
        if (currentBaseUrl != formatted || apiInstance == null) {
            currentBaseUrl = formatted
            apiInstance = createApi(formatted)
            mediaClientInstance = null
            downloadClientInstance = null
        }
    }

    fun getStreamQualityMode(): String = streamQualityMode

    @Synchronized
    fun setStreamQualityMode(mode: String) {
        val normalized = when (mode.uppercase()) {
            "OPUS", "LOSSLESS", "HI_RES_LOSSLESS" -> mode.uppercase()
            else -> "HI_RES_LOSSLESS"
        }
        streamQualityMode = normalized
        prefs?.edit()?.putString(KEY_STREAM_QUALITY, normalized)?.apply()
    }

    fun resolveCoverUrl(raw: String?): String {
        val trimmed = raw?.trim().orEmpty()
        if (trimmed.isEmpty()) return ""
        return when {
            trimmed.startsWith("http://") || trimmed.startsWith("https://") -> trimmed
            trimmed.startsWith("/") -> "$currentBaseUrl$trimmed"
            else -> "$currentBaseUrl/$trimmed"
        }
    }

    fun buildStreamUrl(track: Track, forceLossless: Boolean = false): String {
        val rawUrl = track.url.trim()
        if ((rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) && rawUrl.contains("/api/stream")) {
            return rawUrl
        }
        val params = mutableListOf<String>()
        val sid = track.streamId?.takeIf { it.isNotBlank() }
        val cleanId = sid ?: track.id.removePrefix("local-").removePrefix("tidal-").removePrefix("qobuz-")
        if (cleanId.isNotBlank() && !cleanId.startsWith("trending-") && !cleanId.startsWith("apple-")) {
            params.add("id=${URLEncoder.encode(cleanId, "UTF-8")}")
        }
        track.filePath?.takeIf { it.isNotBlank() }?.let {
            params.add("path=${URLEncoder.encode(it, "UTF-8")}")
        }
        if (track.artist.isNotBlank()) {
            params.add("artist=${URLEncoder.encode(track.artist, "UTF-8")}")
        }
        if (track.title.isNotBlank()) {
            params.add("title=${URLEncoder.encode(track.title, "UTF-8")}")
        }
        if (!forceLossless && streamQualityMode == "OPUS") {
            params.add("format=opus")
        }
        return "$currentBaseUrl/api/stream?${params.joinToString("&")}"
    }

    fun prewarmConnection() {
        try {
            val req = Request.Builder()
                .url("$currentBaseUrl/api/search/trending")
                .build()
            getMediaOkHttpClient().newCall(req).execute().use { resp ->
                Log.d(TAG, "Prewarmed HTTP/2 socket to $currentBaseUrl (HTTP ${resp.code})")
            }
        } catch (e: Exception) {
            Log.d(TAG, "Prewarm skipped: ${e.message}")
        }
    }

    val mediaCallFactory: Call.Factory = Call.Factory { request ->
        getMediaOkHttpClient().newCall(request)
    }

    private fun parseAudioHeaders(url: String, headers: okhttp3.Headers): LiveSignalPathInfo? {
        val fmt = headers["x-audio-format"] ?: return null
        val source = headers["x-audio-source"] ?: "stream"
        val bitDepth = headers["x-audio-bit-depth"]?.toIntOrNull()
        val sampleRate = headers["x-audio-sample-rate"]?.toDoubleOrNull()?.toInt()
        val bitrate = headers["x-audio-bitrate"]?.toIntOrNull()
        val drScore = headers["x-audio-dr-score"]?.toIntOrNull()
        val isLossless = headers["x-audio-is-lossless"]?.equals("true", ignoreCase = true)
            ?: (fmt.contains("FLAC", ignoreCase = true) || fmt.contains("DSD", ignoreCase = true))
        val isDsd = headers["x-audio-is-dsd"]?.equals("true", ignoreCase = true) ?: false
        val fileName = headers["x-audio-file-name"]
        val info = LiveSignalPathInfo(
            format = fmt.uppercase(),
            source = source,
            bitDepth = bitDepth,
            sampleRate = sampleRate,
            bitrate = bitrate,
            drScore = drScore,
            isLossless = isLossless,
            isDsd = isDsd,
            fileName = fileName
        )
        liveSignalHeaders[url] = info
        return info
    }

    fun getCapturedSignalInfo(streamUrl: String): LiveSignalPathInfo? = liveSignalHeaders[streamUrl]

    private fun buildMediaClient(readTimeoutSec: Long, writeTimeoutSec: Long): OkHttpClient {
        return OkHttpClient.Builder()
            .connectionPool(sharedConnectionPool)
            .dns(cloudflareFallbackDns)
            .followRedirects(true)
            .followSslRedirects(true)
            .retryOnConnectionFailure(true)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(readTimeoutSec, TimeUnit.SECONDS)
            .writeTimeout(writeTimeoutSec, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val req = chain.request()
                val updated = req.newBuilder()
                    .header("User-Agent", "KVTidal-Android/1.0.0")
                    .build()
                val resp = chain.proceed(updated)
                if (resp.isSuccessful) {
                    parseAudioHeaders(updated.url.toString(), resp.headers)
                }
                resp
            }
            .build()
    }

    @Synchronized
    fun getMediaOkHttpClient(): OkHttpClient {
        mediaClientInstance?.let { return it }
        return buildMediaClient(readTimeoutSec = 45, writeTimeoutSec = 30)
            .also { mediaClientInstance = it }
    }

    @Synchronized
    fun getDownloadOkHttpClient(): OkHttpClient {
        downloadClientInstance?.let { return it }
        return buildMediaClient(readTimeoutSec = 180, writeTimeoutSec = 60)
            .also { downloadClientInstance = it }
    }

    @Synchronized
    fun getApi(): KVTidalApi {
        if (apiInstance == null) {
            apiInstance = createApi(currentBaseUrl)
        }
        return apiInstance!!
    }

    private fun createApi(baseUrl: String): KVTidalApi {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.NONE
        }

        val okHttpClient = OkHttpClient.Builder()
            .connectionPool(sharedConnectionPool)
            .dns(cloudflareFallbackDns)
            .addInterceptor(logging)
            .retryOnConnectionFailure(true)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()

        val retrofit = Retrofit.Builder()
            .baseUrl("$baseUrl/")
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        return retrofit.create(KVTidalApi::class.java)
    }
}
