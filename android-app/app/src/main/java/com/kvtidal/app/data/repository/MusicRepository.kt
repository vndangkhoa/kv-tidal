package com.kvtidal.app.data.repository

import android.content.Context
import android.content.SharedPreferences
import com.kvtidal.app.KVTidalApp
import com.kvtidal.app.data.api.RetrofitClient
import com.kvtidal.app.data.model.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

class MusicRepository(
    context: Context = KVTidalApp.instance
) {

    private val appContext = context.applicationContext
    private val prefs: SharedPreferences by lazy {
        appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    private val api get() = RetrofitClient.getApi()

    private val chartsMemCache = ConcurrentHashMap<String, List<Track>>()
    private val albumsMemCache = ConcurrentHashMap<String, List<AlbumHit>>()
    private val artistsMemCache = ConcurrentHashMap<String, List<ArtistHit>>()
    @Volatile
    private var cachedLibrarySummary: TidalLibrarySummaryResponse? = null
    @Volatile
    private var cachedLibraryTracks: List<Track> = emptyList()

    fun getCachedCharts(country: String = "VN", chartType: String = "trending"): List<Track> {
        val region = normalizeRegion(country)
        val key = "charts_${region}_${chartType.lowercase()}"
        chartsMemCache[key]?.let { if (it.isNotEmpty()) return it }
        val loaded = readTracksFromPrefs(key)
        if (loaded.isNotEmpty()) chartsMemCache[key] = loaded
        return loaded
    }

    fun getCachedTrendingAlbums(country: String = "VN"): List<AlbumHit> {
        val region = normalizeRegion(country)
        val key = "albums_$region"
        albumsMemCache[key]?.let { if (it.isNotEmpty()) return it }
        val loaded = readAlbumsFromPrefs(key)
        if (loaded.isNotEmpty()) albumsMemCache[key] = loaded
        return loaded
    }

    fun getCachedArtists(region: String = "vn"): List<ArtistHit> {
        val key = "artists_${region.lowercase()}"
        artistsMemCache[key]?.let { if (it.isNotEmpty()) return it }
        val loaded = readArtistsFromPrefs(key)
        if (loaded.isNotEmpty()) artistsMemCache[key] = loaded
        return loaded
    }

    fun getCachedLibrarySummary(): TidalLibrarySummaryResponse? = cachedLibrarySummary

    fun getCachedLibraryTrackList(): List<Track> = cachedLibraryTracks

    private fun normalizeRegion(country: String): String {
        return when (country.lowercase()) {
            "vn", "vietnam" -> "vn"
            else -> "global"
        }
    }

    private fun mapSearchItemToTrack(item: TidalSearchItem): Track {
        val resolvedCover = RetrofitClient.resolveCoverUrl(item.coverUrl)
        val resolvedFormat = item.format?.takeIf { it.isNotBlank() } ?: if (item.hires) "FLAC" else "AAC"
        val resolvedBitDepth = item.bitDepth ?: if (resolvedFormat.equals("FLAC", ignoreCase = true)) {
            if (item.hires) 24 else 16
        } else 16
        val resolvedSampleRate = item.sampleRate?.toInt() ?: if (item.hires) 96000 else 44100
        return Track(
            id = item.id.ifBlank { "${item.artist}-${item.title}".hashCode().toString() },
            title = item.title,
            artist = item.artist,
            album = item.album,
            duration = item.duration,
            coverUrl = resolvedCover,
            url = item.previewUrl?.let { RetrofitClient.resolveCoverUrl(it) }.orEmpty(),
            streamId = item.streamId,
            source = item.source,
            hires = item.hires,
            bitDepth = resolvedBitDepth,
            sampleRate = resolvedSampleRate,
            bitrate = item.bitrate,
            format = resolvedFormat.uppercase(),
            drScore = item.drScore,
            codec = resolvedFormat.uppercase()
        )
    }

    private fun mapTrendingTrackToTrack(t: TidalTrendingTrack): Track {
        return Track(
            id = "trending-${t.region}-${t.id}",
            title = t.title,
            artist = t.artist,
            album = t.album,
            duration = 210,
            coverUrl = RetrofitClient.resolveCoverUrl(t.coverUrl),
            url = "",
            streamId = null,
            source = "tidal",
            hires = true,
            bitDepth = 24,
            sampleRate = 96000,
            bitrate = 2500,
            format = "FLAC",
            drScore = 12,
            codec = "FLAC"
        )
    }

    private fun mapLibraryTrackToTrack(lt: TidalLibraryTrack): Track {
        return Track(
            id = "local-${lt.id}",
            title = lt.title,
            artist = lt.artist,
            album = lt.album,
            duration = lt.duration,
            coverUrl = RetrofitClient.resolveCoverUrl("/rest/getCoverArt.view?id=cover-${lt.id}"),
            url = "",
            streamId = lt.id,
            filePath = lt.filePath,
            source = "local",
            hires = lt.hires,
            bitDepth = lt.bitDepth ?: if (lt.isDsd) 1 else 16,
            sampleRate = lt.sampleRate ?: if (lt.isDsd) 2822400 else 44100,
            bitrate = lt.bitrate,
            format = lt.format.uppercase(),
            drScore = lt.drScore,
            isDsd = lt.isDsd,
            codec = lt.format.uppercase()
        )
    }

    suspend fun getTrending(region: String = "vn"): Result<Pair<List<Track>, List<AlbumHit>>> = withContext(Dispatchers.IO) {
        val norm = normalizeRegion(region)
        val cacheKeyTracks = "charts_${norm}_trending"
        val cacheKeyAlbums = "albums_$norm"
        try {
            val response = api.getTrending(norm)
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                val rawTracks = body.tracks.ifEmpty {
                    if (norm == "vn") body.vietnam else body.global
                }
                val rawAlbums = body.albums.ifEmpty {
                    if (norm == "vn") body.vietnamAlbums else body.globalAlbums
                }
                val tracks = rawTracks.map(::mapTrendingTrackToTrack)
                val albums = rawAlbums.map { a ->
                    AlbumHit(
                        id = "trending-album-${a.id}",
                        title = a.title,
                        artist = a.artist,
                        coverUrl = RetrofitClient.resolveCoverUrl(a.coverUrl),
                        year = a.releaseDate.orEmpty(),
                        trackCount = a.trackCount ?: 0,
                        isLocalLibrary = false
                    )
                }
                if (tracks.isNotEmpty()) {
                    chartsMemCache[cacheKeyTracks] = tracks
                    writeTracksToPrefs(cacheKeyTracks, tracks)
                }
                if (albums.isNotEmpty()) {
                    albumsMemCache[cacheKeyAlbums] = albums
                    writeAlbumsToPrefs(cacheKeyAlbums, albums)
                }
                return@withContext Result.success(tracks to albums)
            }
            val cachedT = getCachedCharts(norm)
            val cachedA = getCachedTrendingAlbums(norm)
            if (cachedT.isNotEmpty() || cachedA.isNotEmpty()) {
                Result.success(cachedT to cachedA)
            } else {
                Result.failure(Exception("Trending failed: ${response.message()}"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val cachedT = getCachedCharts(norm)
            val cachedA = getCachedTrendingAlbums(norm)
            if (cachedT.isNotEmpty() || cachedA.isNotEmpty()) {
                Result.success(cachedT to cachedA)
            } else {
                Result.failure(e)
            }
        }
    }

    suspend fun getCharts(country: String = "VN", chartType: String = "trending"): Result<List<Track>> {
        val res = getTrending(country)
        return res.map { it.first }
    }

    suspend fun getNewReleases(country: String = "VN"): Result<List<AlbumHit>> {
        val res = getTrending(country)
        return res.map { it.second }
    }

    suspend fun getArtists(region: String = "vn"): Result<List<ArtistHit>> = withContext(Dispatchers.IO) {
        val cleanRegion = region.lowercase()
        val cacheKey = "artists_$cleanRegion"
        try {
            val response = api.getPopularArtists()
            if (response.isSuccessful && response.body() != null) {
                val allArtists = response.body()!!.artists.map { a ->
                    ArtistHit(
                        id = a.id,
                        name = a.name,
                        coverUrl = RetrofitClient.resolveCoverUrl(a.coverUrl),
                        followers = if (a.monthlyStreams.isNotBlank()) "${a.monthlyStreams} • ${a.categoryLabel}" else a.categoryLabel,
                        category = a.category,
                        categoryLabel = a.categoryLabel,
                        bio = a.bio
                    )
                }
                val filtered = when (cleanRegion) {
                    "vn", "vpop" -> allArtists.filter { it.category.equals("vpop", ignoreCase = true) }
                    "global" -> allArtists.filter { it.category.equals("global", ignoreCase = true) }
                    "audiophile" -> allArtists.filter { it.category.equals("audiophile", ignoreCase = true) }
                    else -> allArtists
                }.ifEmpty { allArtists }

                if (filtered.isNotEmpty()) {
                    artistsMemCache[cacheKey] = filtered
                    writeArtistsToPrefs(cacheKey, filtered)
                }
                Result.success(filtered)
            } else {
                val cached = getCachedArtists(cleanRegion)
                if (cached.isNotEmpty()) Result.success(cached)
                else Result.failure(Exception("Artists failed: ${response.message()}"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val cached = getCachedArtists(cleanRegion)
            if (cached.isNotEmpty()) Result.success(cached)
            else Result.failure(e)
        }
    }

    suspend fun getArtistTopTracks(id: String?, artist: String, limit: Int = 20): Result<List<Track>> = withContext(Dispatchers.IO) {
        try {
            val response = api.getArtistTopTracks(
                id = id?.takeIf { it.isNotBlank() },
                artist = artist.takeIf { it.isNotBlank() },
                limit = limit
            )
            if (response.isSuccessful && response.body() != null) {
                val mapped = response.body()!!.tracks.map(::mapSearchItemToTrack)
                if (mapped.isNotEmpty()) {
                    return@withContext Result.success(mapped)
                }
            }
            search(artist)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            search(artist)
        }
    }

    suspend fun search(query: String, source: String? = null): Result<List<Track>> = withContext(Dispatchers.IO) {
        try {
            val response = api.search(query, source)
            if (response.isSuccessful && response.body() != null) {
                val tracks = response.body()!!.results.map(::mapSearchItemToTrack)
                Result.success(tracks)
            } else {
                Result.failure(Exception("Search failed: ${response.message()}"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun universalSearch(query: String): Result<UniversalSearchResponse> = withContext(Dispatchers.IO) {
        try {
            val clean = query.trim()
            val tracksRes = search(clean)
            val songs = tracksRes.getOrDefault(emptyList())

            val artistMatches = getArtists("all").getOrDefault(emptyList())
                .filter { it.name.contains(clean, ignoreCase = true) }
                .take(10)

            val summary = cachedLibrarySummary ?: getLibrarySummary().getOrNull()
            val localAlbums = summary?.albums.orEmpty()
                .filter { it.name.contains(clean, ignoreCase = true) || it.artist.contains(clean, ignoreCase = true) }
                .take(15)
                .map { alb ->
                    AlbumHit(
                        id = "local-album-${alb.id}",
                        title = alb.name,
                        artist = alb.artist,
                        coverUrl = RetrofitClient.resolveCoverUrl("/rest/getCoverArt.view?id=album-${alb.id}"),
                        year = alb.year?.toString().orEmpty(),
                        trackCount = alb.trackCount,
                        isLocalLibrary = true
                    )
                }

            val songAlbums = songs
                .filter { it.album.isNotBlank() }
                .distinctBy { "${it.album.lowercase()}|${it.artist.lowercase()}" }
                .take(10)
                .map { tr ->
                    AlbumHit(
                        id = "search-album-${tr.album}",
                        title = tr.album,
                        artist = tr.artist,
                        coverUrl = tr.coverUrl,
                        year = "",
                        trackCount = 0,
                        isLocalLibrary = tr.source.equals("local", ignoreCase = true)
                    )
                }

            val mergedAlbums = (localAlbums + songAlbums)
                .distinctBy { "${it.title.lowercase()}|${it.artist.lowercase()}" }

            Result.success(
                UniversalSearchResponse(
                    songs = songs,
                    albums = mergedAlbums,
                    playlists = emptyList(),
                    artists = artistMatches
                )
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getPreSearchTrending(): Result<TidalPreSearchResponse> = withContext(Dispatchers.IO) {
        try {
            val res = api.getSearchTrending()
            if (res.isSuccessful && res.body() != null) {
                Result.success(res.body()!!)
            } else {
                Result.failure(Exception("Pre-search trending failed"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getRecommendations(
        trackId: String,
        artist: String = "",
        title: String = ""
    ): Result<List<Track>> = withContext(Dispatchers.IO) {
        try {
            val cleanArtist = artist.ifBlank { "Top Hits" }
            val response = api.getRecommendations(
                artist = cleanArtist,
                title = title.ifBlank { null },
                limit = 15
            )
            if (response.isSuccessful && response.body() != null) {
                val tracks = response.body()!!.recommendations
                    .map(::mapSearchItemToTrack)
                    .filter { it.id != trackId }
                if (tracks.isNotEmpty()) {
                    return@withContext Result.success(tracks)
                }
            }
            search(cleanArtist)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            search(artist.ifBlank { "Hi-Res FLAC" })
        }
    }

    suspend fun getLyrics(trackId: String, title: String, artist: String): Result<SyncedLyricsResponse> = withContext(Dispatchers.IO) {
        try {
            val response = api.getLyrics(title = title, artist = artist)
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                val lines = when {
                    body.lines.isNotEmpty() -> body.lines
                    !body.plain.isNullOrBlank() -> body.plain.lines()
                        .map { it.trim() }
                        .filter { it.isNotEmpty() }
                        .map { LyricLine(time = 0.0, text = it) }
                    else -> emptyList()
                }
                Result.success(
                    SyncedLyricsResponse(
                        synced = body.synced && lines.any { it.time > 0.0 },
                        lyrics = lines,
                        source = body.source
                    )
                )
            } else {
                Result.failure(Exception("Lyrics failed"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getLibrarySummary(forceRefresh: Boolean = false): Result<TidalLibrarySummaryResponse> = withContext(Dispatchers.IO) {
        if (!forceRefresh) {
            cachedLibrarySummary?.let { return@withContext Result.success(it) }
        }
        try {
            val res = api.getLibrarySummary()
            if (res.isSuccessful && res.body() != null) {
                val body = res.body()!!
                cachedLibrarySummary = body
                Result.success(body)
            } else {
                Result.failure(Exception("Library failed: ${res.message()}"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getLibraryTracks(forceRefresh: Boolean = false): Result<List<Track>> = withContext(Dispatchers.IO) {
        if (!forceRefresh && cachedLibraryTracks.isNotEmpty()) {
            return@withContext Result.success(cachedLibraryTracks)
        }
        try {
            val res = api.getLibraryTracks()
            if (res.isSuccessful && res.body() != null) {
                val mapped = res.body()!!.tracks.map(::mapLibraryTrackToTrack)
                cachedLibraryTracks = mapped
                Result.success(mapped)
            } else {
                Result.failure(Exception("Library tracks failed: ${res.message()}"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getAlbumDetails(albumId: String, fallbackTitle: String, fallbackArtist: String, fallbackCover: String): Result<List<Track>> = withContext(Dispatchers.IO) {
        try {
            when {
                albumId.startsWith("local-album-") -> {
                    val rawId = albumId.removePrefix("local-album-")
                    val res = api.getLibraryAlbum(rawId)
                    if (res.isSuccessful && res.body() != null) {
                        val tracks = res.body()!!.tracks.map(::mapLibraryTrackToTrack)
                        if (tracks.isNotEmpty()) return@withContext Result.success(tracks)
                    }
                }
                albumId.startsWith("trending-album-") -> {
                    val rawId = albumId.removePrefix("trending-album-")
                    val res = api.getTrendingAlbum(rawId)
                    if (res.isSuccessful && res.body() != null) {
                        val tracks = res.body()!!.tracks
                            .filter { !it.trackName.isNullOrBlank() }
                            .map { item ->
                                Track(
                                    id = "itunes-${item.trackId}",
                                    title = item.trackName.orEmpty(),
                                    artist = item.artistName?.ifBlank { fallbackArtist } ?: fallbackArtist,
                                    album = item.collectionName?.ifBlank { fallbackTitle } ?: fallbackTitle,
                                    duration = ((item.trackTimeMillis ?: 0L) / 1000L).toInt(),
                                    coverUrl = fallbackCover.ifBlank {
                                        item.artworkUrl100?.replace("100x100", "600x600").orEmpty()
                                    },
                                    source = "tidal",
                                    hires = true,
                                    bitDepth = 24,
                                    sampleRate = 96000,
                                    format = "FLAC"
                                )
                            }
                        if (tracks.isNotEmpty()) return@withContext Result.success(tracks)
                    }
                }
            }
            search("$fallbackArtist $fallbackTitle".trim())
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            search("$fallbackArtist $fallbackTitle".trim())
        }
    }

    suspend fun triggerLibraryScan(): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val res = api.triggerLibraryScan()
            if (res.isSuccessful) {
                cachedLibrarySummary = null
                cachedLibraryTracks = emptyList()
                Result.success(true)
            } else {
                Result.failure(Exception("Scan failed: ${res.code()}"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun queueServerDownload(track: Track): Result<String> = withContext(Dispatchers.IO) {
        try {
            val req = TidalDownloadRequest(
                title = track.title,
                artist = track.artist,
                album = track.album,
                duration = track.duration.takeIf { it > 0 },
                coverUrl = track.coverUrl.takeIf { it.isNotBlank() },
                streamUrl = track.url.takeIf { it.isNotBlank() },
                trackId = track.streamId ?: track.id,
                source = track.source
            )
            val res = api.queueDownload(req)
            if (res.isSuccessful && res.body() != null) {
                Result.success(res.body()!!.jobId ?: "queued")
            } else {
                Result.failure(Exception("Download queue error: HTTP ${res.code()}"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getSettings(): Result<TidalSettingsResponse> = withContext(Dispatchers.IO) {
        try {
            val res = api.getSettings()
            if (res.isSuccessful && res.body() != null) {
                Result.success(res.body()!!)
            } else {
                Result.failure(Exception("Settings failed: ${res.code()}"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateSettings(token: String? = null, quality: String? = null): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val res = api.updateSettings(
                TidalUpdateSettingsRequest(
                    tidalAccessToken = token?.takeIf { it.isNotBlank() },
                    tidalQuality = quality?.takeIf { it.isNotBlank() }
                )
            )
            if (res.isSuccessful) Result.success(true)
            else Result.failure(Exception("Update settings failed: ${res.code()}"))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun testTidalToken(token: String? = null): Result<TidalTestResponse> = withContext(Dispatchers.IO) {
        try {
            val body = if (!token.isNullOrBlank()) mapOf("token" to token.trim()) else emptyMap()
            val res = api.testTidalToken(body)
            if (res.isSuccessful && res.body() != null) {
                Result.success(res.body()!!)
            } else {
                Result.failure(Exception("Test failed: HTTP ${res.code()}"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun testSoulseek(): Result<TidalTestResponse> = withContext(Dispatchers.IO) {
        try {
            val res = api.testSoulseek()
            if (res.isSuccessful && res.body() != null) {
                Result.success(res.body()!!)
            } else {
                Result.failure(Exception("Soulseek test failed: HTTP ${res.code()}"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun writeTracksToPrefs(key: String, tracks: List<Track>) {
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
                        put("source", t.source)
                        put("hires", t.hires)
                        t.bitDepth?.let { put("bit_depth", it) }
                        t.sampleRate?.let { put("sample_rate", it) }
                        t.format?.let { put("format", it) }
                    }
                )
            }
            prefs.edit().putString(key, arr.toString()).apply()
        }
    }

    private fun readTracksFromPrefs(key: String): List<Track> {
        return runCatching {
            val raw = prefs.getString(key, null) ?: return emptyList()
            val arr = JSONArray(raw)
            val list = ArrayList<Track>(arr.length())
            for (i in 0 until arr.length()) {
                val obj = arr.optJSONObject(i) ?: continue
                val id = obj.optString("id")
                if (id.isBlank()) continue
                list.add(
                    Track(
                        id = id,
                        title = obj.optString("title"),
                        artist = obj.optString("artist"),
                        album = obj.optString("album"),
                        duration = obj.optInt("duration", 0),
                        coverUrl = obj.optString("cover_url"),
                        url = obj.optString("url"),
                        source = obj.optString("source", "tidal"),
                        hires = obj.optBoolean("hires", true),
                        bitDepth = if (obj.has("bit_depth")) obj.optInt("bit_depth") else 24,
                        sampleRate = if (obj.has("sample_rate")) obj.optInt("sample_rate") else 96000,
                        format = obj.optString("format", "FLAC")
                    )
                )
            }
            list
        }.getOrDefault(emptyList())
    }

    private fun writeAlbumsToPrefs(key: String, albums: List<AlbumHit>) {
        runCatching {
            val arr = JSONArray()
            albums.take(30).forEach { a ->
                arr.put(
                    JSONObject().apply {
                        put("id", a.id)
                        put("title", a.title)
                        put("artist", a.artist)
                        put("cover_url", a.coverUrl)
                        put("year", a.year)
                        put("track_count", a.trackCount)
                        put("local", a.isLocalLibrary)
                    }
                )
            }
            prefs.edit().putString(key, arr.toString()).apply()
        }
    }

    private fun readAlbumsFromPrefs(key: String): List<AlbumHit> {
        return runCatching {
            val raw = prefs.getString(key, null) ?: return emptyList()
            val arr = JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    val obj = arr.optJSONObject(i) ?: continue
                    val id = obj.optString("id")
                    if (id.isBlank()) continue
                    add(
                        AlbumHit(
                            id = id,
                            title = obj.optString("title"),
                            artist = obj.optString("artist"),
                            coverUrl = obj.optString("cover_url"),
                            year = obj.optString("year"),
                            trackCount = obj.optInt("track_count", 0),
                            isLocalLibrary = obj.optBoolean("local", false)
                        )
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    private fun writeArtistsToPrefs(key: String, artists: List<ArtistHit>) {
        runCatching {
            val arr = JSONArray()
            artists.take(30).forEach { a ->
                arr.put(
                    JSONObject().apply {
                        put("id", a.id)
                        put("name", a.name)
                        put("cover_url", a.displayPhoto)
                        put("followers", a.displayFollowers)
                        put("category", a.category)
                        put("category_label", a.categoryLabel)
                        put("bio", a.bio)
                    }
                )
            }
            prefs.edit().putString(key, arr.toString()).apply()
        }
    }

    private fun readArtistsFromPrefs(key: String): List<ArtistHit> {
        return runCatching {
            val raw = prefs.getString(key, null) ?: return emptyList()
            val arr = JSONArray(raw)
            val list = ArrayList<ArtistHit>(arr.length())
            for (i in 0 until arr.length()) {
                val obj = arr.optJSONObject(i) ?: continue
                val name = obj.optString("name")
                if (name.isBlank()) continue
                list.add(
                    ArtistHit(
                        id = obj.optString("id"),
                        name = name,
                        coverUrl = obj.optString("cover_url"),
                        followers = obj.optString("followers"),
                        category = obj.optString("category"),
                        categoryLabel = obj.optString("category_label"),
                        bio = obj.optString("bio")
                    )
                )
            }
            list
        }.getOrDefault(emptyList())
    }

    companion object {
        private const val PREFS_NAME = "kv_tidal_api_cache"
    }
}
