package com.kvtidal.app.data.api

import com.kvtidal.app.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface KVTidalApi {

    @GET("/api/trending")
    suspend fun getTrending(
        @Query("region") region: String = "vn"
    ): Response<TidalTrendingResponse>

    @GET("/api/trending/album")
    suspend fun getTrendingAlbum(
        @Query("id") id: String
    ): Response<TidalTrendingAlbumLookupResponse>

    @GET("/api/artists/popular")
    suspend fun getPopularArtists(): Response<TidalPopularArtistsResponse>

    @GET("/api/artists/toptracks")
    suspend fun getArtistTopTracks(
        @Query("id") id: String? = null,
        @Query("artist") artist: String? = null,
        @Query("limit") limit: Int = 20
    ): Response<TidalArtistTopTracksResponse>

    @GET("/api/search")
    suspend fun search(
        @Query("q") query: String,
        @Query("source") source: String? = null
    ): Response<TidalSearchResponse>

    @GET("/api/search/trending")
    suspend fun getSearchTrending(): Response<TidalPreSearchResponse>

    @GET("/api/recommendations")
    suspend fun getRecommendations(
        @Query("artist") artist: String,
        @Query("title") title: String? = null,
        @Query("limit") limit: Int = 15
    ): Response<TidalRecommendationsResponse>

    @GET("/api/lyrics")
    suspend fun getLyrics(
        @Query("title") title: String,
        @Query("artist") artist: String,
        @Query("album") album: String? = null
    ): Response<TidalLyricsResponse>

    @GET("/api/library")
    suspend fun getLibrarySummary(): Response<TidalLibrarySummaryResponse>

    @GET("/api/library/tracks")
    suspend fun getLibraryTracks(): Response<TidalLibraryTracksResponse>

    @GET("/api/library/album")
    suspend fun getLibraryAlbum(
        @Query("id") id: String
    ): Response<TidalAlbumDetailsResponse>

    @POST("/api/library/scan")
    suspend fun triggerLibraryScan(): Response<Map<String, Any>>

    @POST("/api/download")
    suspend fun queueDownload(
        @Body payload: TidalDownloadRequest
    ): Response<TidalDownloadResponse>

    @GET("/api/settings")
    suspend fun getSettings(): Response<TidalSettingsResponse>

    @POST("/api/settings")
    suspend fun updateSettings(
        @Body payload: TidalUpdateSettingsRequest
    ): Response<Map<String, Any>>

    @POST("/api/settings/test-tidal")
    suspend fun testTidalToken(
        @Body payload: Map<String, String> = emptyMap()
    ): Response<TidalTestResponse>

    @POST("/api/settings/test-soulseek")
    suspend fun testSoulseek(): Response<TidalTestResponse>
}
