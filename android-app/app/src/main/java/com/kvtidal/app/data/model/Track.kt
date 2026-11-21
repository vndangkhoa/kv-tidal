package com.kvtidal.app.data.model

import com.google.gson.annotations.SerializedName

data class Track(
    val id: String = "",
    val title: String = "",
    val artist: String = "",
    val album: String = "",
    val duration: Int = 0,
    @SerializedName("cover_url") val coverUrl: String = "",
    val url: String = "",
    @SerializedName("stream_id") val streamId: String? = null,
    @SerializedName("file_path") val filePath: String? = null,
    val source: String = "tidal",
    val hires: Boolean = true,
    @SerializedName("bit_depth") val bitDepth: Int? = 24,
    @SerializedName("sample_rate") val sampleRate: Int? = 96000,
    val bitrate: Int? = null,
    val format: String? = "FLAC",
    @SerializedName("dr_score") val drScore: Int? = null,
    @SerializedName("is_dsd") val isDsd: Boolean = false,
    @SerializedName("like_count") val likeCount: Long? = null,
    val codec: String? = null
) {
    val isMaxQuality: Boolean
        get() = isDsd || (bitDepth ?: 0) > 16 || (sampleRate ?: 0) > 48000

    val qualityBadge: String
        get() = when {
            isDsd -> "DSD64"
            isMaxQuality -> {
                val bd = bitDepth ?: 24
                val srKhz = ((sampleRate ?: 96000) / 1000f).let {
                    if (it % 1f == 0f) it.toInt().toString() else String.format(java.util.Locale.US, "%.1f", it)
                }
                "MAX $bd/$srKhz"
            }
            (format?.equals("FLAC", ignoreCase = true) == true) || hires -> "FLAC"
            !format.isNullOrBlank() -> format.uppercase()
            else -> "HIGH"
        }

    val audioSpecLine: String
        get() = buildList {
            val fmt = (format?.takeIf { it.isNotBlank() } ?: codec?.takeIf { it.isNotBlank() } ?: "FLAC").uppercase()
            add(fmt)
            if (isDsd) {
                add("1-bit / 2.8MHz")
            } else {
                val bd = bitDepth ?: if (fmt == "FLAC") 16 else null
                val sr = sampleRate?.takeIf { it > 0 }
                if (bd != null && sr != null) {
                    val khz = if (sr % 1000 == 0) "${sr / 1000}kHz" else String.format(java.util.Locale.US, "%.1fkHz", sr / 1000f)
                    add("${bd}-bit / $khz")
                } else if (bitrate != null && bitrate > 0) {
                    add("$bitrate kbps")
                }
            }
            drScore?.takeIf { it > 0 }?.let { add("DR$it") }
            if (isMaxQuality) add("TIDAL MAX") else if (source.equals("local", ignoreCase = true)) add("NAS VAULT")
        }.joinToString(" • ")
}

data class AlbumHit(
    val id: String = "",
    val title: String = "",
    val artist: String = "",
    @SerializedName("cover_url") val coverUrl: String = "",
    val year: String = "",
    val trackCount: Int = 0,
    val isLocalLibrary: Boolean = false
)

data class PlaylistHit(
    val id: String = "",
    val title: String = "",
    val author: String = "",
    @SerializedName("cover_url") val coverUrl: String = "",
    @SerializedName("track_count") val trackCount: Int = 0
)

data class ArtistHit(
    val id: String = "",
    val name: String = "",
    @SerializedName("avatar") val avatar: String = "",
    @SerializedName("photo") val photo: String = "",
    @SerializedName("cover_url") val coverUrl: String = "",
    @SerializedName("subscribers") val subscribers: String = "",
    @SerializedName("followers") val followers: String = "",
    val category: String = "",
    @SerializedName("category_label") val categoryLabel: String = "",
    val bio: String = ""
) {
    val displayPhoto: String get() = coverUrl.ifEmpty { photo.ifEmpty { avatar } }
    val displayFollowers: String get() = followers.ifEmpty { subscribers.ifEmpty { categoryLabel.ifEmpty { "Hi-Res Artist" } } }
}

data class UniversalSearchResponse(
    val songs: List<Track> = emptyList(),
    val albums: List<AlbumHit> = emptyList(),
    val playlists: List<PlaylistHit> = emptyList(),
    val artists: List<ArtistHit> = emptyList()
)

data class LyricLine(
    val time: Double = 0.0,
    val text: String = ""
)

data class SyncedLyricsResponse(
    val synced: Boolean = false,
    val lyrics: List<LyricLine> = emptyList(),
    val source: String = ""
)

data class User(
    val id: String = "",
    val name: String = "",
    val email: String = "",
    @SerializedName("avatar_color") val avatarColor: String = "#06B6D4",
    @SerializedName("created_at") val createdAt: Long = 0L,
    val liked: List<Track> = emptyList(),
    val history: List<Track> = emptyList()
)

// --- KV Tidal Backend DTOs ---

data class TidalSearchItem(
    val id: String = "",
    val title: String = "",
    val artist: String = "",
    val album: String = "",
    @SerializedName("cover_url") val coverUrl: String? = null,
    @SerializedName("preview_url") val previewUrl: String? = null,
    val duration: Int = 0,
    val source: String = "tidal",
    val hires: Boolean = false,
    @SerializedName("stream_id") val streamId: String? = null,
    @SerializedName("bit_depth") val bitDepth: Int? = null,
    @SerializedName("sample_rate") val sampleRate: Float? = null,
    val bitrate: Int? = null,
    val format: String? = null,
    @SerializedName("dr_score") val drScore: Int? = null
)

data class TidalSearchResponse(
    val results: List<TidalSearchItem> = emptyList()
)

data class TidalTrendingArtistItem(
    val name: String = "",
    @SerializedName("track_count") val trackCount: Int = 0,
    @SerializedName("cover_url") val coverUrl: String = ""
)

data class TidalPreSearchResponse(
    @SerializedName("trending_keywords") val trendingKeywords: List<String> = emptyList(),
    @SerializedName("top_artists") val topArtists: List<TidalTrendingArtistItem> = emptyList(),
    @SerializedName("quick_picks") val quickPicks: List<TidalSearchItem> = emptyList(),
    val genres: List<String> = emptyList()
)

data class TidalTrendingTrack(
    val id: String = "",
    val rank: Int = 0,
    val title: String = "",
    val artist: String = "",
    val album: String = "",
    @SerializedName("cover_url") val coverUrl: String = "",
    @SerializedName("preview_url") val previewUrl: String? = null,
    val region: String = "vn"
)

data class TidalTrendingAlbum(
    val id: String = "",
    val rank: Int = 0,
    val title: String = "",
    val artist: String = "",
    @SerializedName("cover_url") val coverUrl: String = "",
    @SerializedName("release_date") val releaseDate: String? = null,
    @SerializedName("track_count") val trackCount: Int? = null,
    val region: String = "vn"
)

data class TidalTrendingResponse(
    val tracks: List<TidalTrendingTrack> = emptyList(),
    val albums: List<TidalTrendingAlbum> = emptyList(),
    val vietnam: List<TidalTrendingTrack> = emptyList(),
    val global: List<TidalTrendingTrack> = emptyList(),
    @SerializedName("vietnam_albums") val vietnamAlbums: List<TidalTrendingAlbum> = emptyList(),
    @SerializedName("global_albums") val globalAlbums: List<TidalTrendingAlbum> = emptyList(),
    @SerializedName("last_updated") val lastUpdated: Long? = null
)

data class TidalPopularArtist(
    val id: String = "",
    val name: String = "",
    val category: String = "",
    @SerializedName("category_label") val categoryLabel: String = "",
    @SerializedName("cover_url") val coverUrl: String = "",
    @SerializedName("track_count") val trackCount: Int = 0,
    @SerializedName("monthly_streams") val monthlyStreams: String = "",
    val bio: String = ""
)

data class TidalPopularArtistsResponse(
    val artists: List<TidalPopularArtist> = emptyList(),
    val count: Int = 0
)

data class TidalArtistTopTracksResponse(
    val tracks: List<TidalSearchItem> = emptyList(),
    val count: Int = 0
)

data class TidalRecommendationsResponse(
    val recommendations: List<TidalSearchItem> = emptyList()
)

data class TidalLibraryTrack(
    val id: String = "",
    val title: String = "",
    val artist: String = "",
    val album: String = "",
    @SerializedName("track_number") val trackNumber: Int = 0,
    val duration: Int = 0,
    val year: Int? = null,
    @SerializedName("file_path") val filePath: String = "",
    val format: String = "flac",
    @SerializedName("bit_depth") val bitDepth: Int? = null,
    @SerializedName("sample_rate") val sampleRate: Int? = null,
    val bitrate: Int? = null,
    val channels: Int? = null,
    val hires: Boolean = false,
    @SerializedName("dr_score") val drScore: Int? = null,
    @SerializedName("is_dsd") val isDsd: Boolean = false
)

data class TidalLibraryTracksResponse(
    val tracks: List<TidalLibraryTrack> = emptyList()
)

data class TidalLibraryAlbum(
    val id: String = "",
    val name: String = "",
    val artist: String = "",
    val year: Int? = null,
    @SerializedName("track_count") val trackCount: Int = 0,
    @SerializedName("cover_path") val coverPath: String? = null,
    @SerializedName("dr_score") val drScore: Int? = null,
    @SerializedName("size_bytes") val sizeBytes: Long? = null,
    val hires: Boolean = false
)

data class TidalLibraryArtist(
    val id: String = "",
    val name: String = "",
    @SerializedName("album_count") val albumCount: Int = 0,
    @SerializedName("track_count") val trackCount: Int = 0
)

data class TidalLibrarySummaryResponse(
    @SerializedName("total_tracks") val totalTracks: Int = 0,
    @SerializedName("total_hires") val totalHires: Int = 0,
    @SerializedName("total_albums") val totalAlbums: Int = 0,
    @SerializedName("total_artists") val totalArtists: Int = 0,
    val artists: List<TidalLibraryArtist> = emptyList(),
    val albums: List<TidalLibraryAlbum> = emptyList(),
    val port: Int = 26784,
    @SerializedName("subsonic_user") val subsonicUser: String = "admin",
    @SerializedName("download_dir") val downloadDir: String = ""
)

data class TidalAlbumDetailsResponse(
    val album: TidalLibraryAlbum? = null,
    val tracks: List<TidalLibraryTrack> = emptyList()
)

data class TidalItunesTrackItem(
    val trackId: Long = 0L,
    val trackName: String? = null,
    val artistName: String? = null,
    val collectionName: String? = null,
    val artworkUrl100: String? = null,
    val previewUrl: String? = null,
    val trackTimeMillis: Long? = null,
    val trackNumber: Int? = null
)

data class TidalTrendingAlbumLookupResponse(
    val tracks: List<TidalItunesTrackItem> = emptyList()
)

data class TidalLyricsResponse(
    val synced: Boolean = false,
    val lines: List<LyricLine> = emptyList(),
    val plain: String? = null,
    val instrumental: Boolean = false,
    val source: String = "none"
)

data class TidalSettingsResponse(
    @SerializedName("tidal_has_token") val tidalHasToken: Boolean = false,
    @SerializedName("tidal_token_masked") val tidalTokenMasked: String? = null,
    @SerializedName("tidal_quality") val tidalQuality: String = "HI_RES_LOSSLESS",
    @SerializedName("soulseek_enabled") val soulseekEnabled: Boolean = true,
    @SerializedName("soulseek_url") val soulseekUrl: String = "",
    @SerializedName("soulseek_has_api_key") val soulseekHasApiKey: Boolean = false,
    @SerializedName("soulseek_username") val soulseekUsername: String? = null,
    @SerializedName("soulseek_has_password") val soulseekHasPassword: Boolean = false,
    @SerializedName("youtube_has_cookies") val youtubeHasCookies: Boolean = false,
    @SerializedName("ytdlp_available") val ytdlpAvailable: Boolean = true,
    @SerializedName("subsonic_user") val subsonicUser: String = "admin",
    val port: Int = 26784,
    @SerializedName("download_dir") val downloadDir: String = "",
    @SerializedName("nas_passcode_enabled") val nasPasscodeEnabled: Boolean = true,
    @SerializedName("nas_passcode_is_default") val nasPasscodeIsDefault: Boolean = false
)

data class TidalUpdateSettingsRequest(
    @SerializedName("tidal_access_token") val tidalAccessToken: String? = null,
    @SerializedName("tidal_quality") val tidalQuality: String? = null
)

data class TidalTestResponse(
    val success: Boolean = false,
    val message: String = "",
    val version: String? = null
)

data class TidalDownloadRequest(
    val title: String,
    val artist: String,
    val album: String = "",
    @SerializedName("track_number") val trackNumber: Int? = null,
    val duration: Int? = null,
    @SerializedName("cover_url") val coverUrl: String? = null,
    @SerializedName("stream_url") val streamUrl: String? = null,
    @SerializedName("track_id") val trackId: String? = null,
    val source: String? = null
)

data class TidalDownloadResponse(
    val status: String = "",
    @SerializedName("job_id") val jobId: String? = null,
    val message: String? = null
)

data class LiveSignalPathInfo(
    val format: String = "FLAC",
    val source: String = "stream",
    val bitDepth: Int? = null,
    val sampleRate: Int? = null,
    val bitrate: Int? = null,
    val drScore: Int? = null,
    val isLossless: Boolean = true,
    val isDsd: Boolean = false,
    val fileName: String? = null
)
