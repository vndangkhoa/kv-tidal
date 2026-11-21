package com.kvtidal.app.ui.screens.library

import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.kvtidal.app.data.api.RetrofitClient
import com.kvtidal.app.data.model.AlbumHit
import com.kvtidal.app.data.model.ArtistHit
import com.kvtidal.app.data.model.TidalLibrarySummaryResponse
import com.kvtidal.app.data.model.Track
import com.kvtidal.app.data.repository.AuthRepository
import com.kvtidal.app.data.repository.MusicRepository
import com.kvtidal.app.player.PlayerManager
import com.kvtidal.app.ui.adaptive.LocalWindowState
import com.kvtidal.app.ui.adaptive.MaxContentWidthDp
import com.kvtidal.app.ui.components.QualityBadgePill
import com.kvtidal.app.ui.components.TrackListItem
import com.kvtidal.app.ui.components.YtmIcons
import com.kvtidal.app.ui.theme.*
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

data class LocalPlaylistRecord(
    val id: String,
    val name: String,
    val trackIds: List<String> = emptyList(),
    val createdAt: Long = System.currentTimeMillis()
)

private enum class LibraryFilter(val label: String) {
    ALL("All"),
    PLAYLISTS("Playlists"),
    NAS_VAULT("NAS Vault"),
    SONGS("Songs"),
    ALBUMS("Albums"),
    ARTISTS("Artists"),
    DOWNLOADS("Downloads")
}

@Composable
fun LibraryScreen(
    musicRepo: MusicRepository,
    authRepo: AuthRepository,
    onNavigateToSearch: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onTrackPlay: (Track, List<Track>) -> Unit,
    onArtistClick: (ArtistHit) -> Unit,
    onAlbumClick: (AlbumHit) -> Unit,
    onOpenPlaylist: (id: String, title: String, subtitle: String, coverUrl: String, tracks: List<Track>) -> Unit,
    bottomPadding: Dp = 0.dp
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val windowState = LocalWindowState.current

    val librarySummary by authRepo.librarySummary.collectAsState()
    val isServerOnline by authRepo.isServerOnline.collectAsState()
    val likedIds by PlayerManager.likedTrackIds.collectAsState()
    val recentlyPlayed by PlayerManager.recentlyPlayedHistory.collectAsState()
    val downloadedTracks by PlayerManager.downloadedTracks.collectAsState()
    val totalDownloadBytes by PlayerManager.totalDownloadBytes.collectAsState()

    var selectedFilter by remember { mutableStateOf(LibraryFilter.ALL) }
    var nasTracks by remember { mutableStateOf(musicRepo.getCachedLibraryTrackList()) }
    var isScanningNas by remember { mutableStateOf(false) }

    var localPlaylists by remember { mutableStateOf(loadLocalPlaylists(context)) }
    var showCreatePlaylistDialog by remember { mutableStateOf(false) }
    var newPlaylistName by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        authRepo.refreshServerStatus()
        musicRepo.getLibraryTracks(forceRefresh = nasTracks.isEmpty()).onSuccess {
            nasTracks = it
        }
    }

    val allKnownTracks = remember(recentlyPlayed, downloadedTracks, nasTracks) {
        (recentlyPlayed + downloadedTracks + nasTracks +
            musicRepo.getCachedCharts("VN") + musicRepo.getCachedCharts("GLOBAL"))
            .distinctBy { it.id }
    }

    val likedTracks = remember(likedIds, allKnownTracks) {
        allKnownTracks.filter { likedIds.contains(it.id) }
    }

    val nasAlbums = remember(librarySummary) {
        librarySummary?.albums.orEmpty().map { alb ->
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
    }

    val nasArtists = remember(librarySummary) {
        librarySummary?.artists.orEmpty().map { art ->
            ArtistHit(
                id = art.id,
                name = art.name,
                coverUrl = RetrofitClient.resolveCoverUrl("/rest/getCoverArt.view?id=artist-${art.id}"),
                subscribers = "${art.albumCount} albums • ${art.trackCount} tracks",
                category = "nas_vault"
            )
        }
    }

    val horizontalGutter = if (windowState.isWide) 24.dp else 16.dp

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(TidalPureBlack)
            .statusBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Header Row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = MaxContentWidthDp.dp)
                .padding(horizontal = horizontalGutter, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Library",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = TidalPureWhite
                )
                Text(
                    text = "NAS Lossless Vault & Offline Hi-Res",
                    fontSize = 12.sp,
                    color = TidalCyanAccent
                )
            }
            IconButton(onClick = { showCreatePlaylistDialog = true }) {
                Icon(
                    imageVector = YtmIcons.Add24,
                    contentDescription = "New playlist",
                    tint = TidalPureWhite,
                    modifier = Modifier.size(22.dp)
                )
            }
            IconButton(onClick = onNavigateToSearch) {
                Icon(
                    imageVector = YtmIcons.SearchOutline,
                    contentDescription = "Search library",
                    tint = TidalPureWhite,
                    modifier = Modifier.size(22.dp)
                )
            }
            IconButton(onClick = onNavigateToSettings) {
                Icon(
                    imageVector = YtmIcons.SettingsGear24,
                    contentDescription = "Settings",
                    tint = TidalGrey04,
                    modifier = Modifier.size(21.dp)
                )
            }
        }

        // Category Chips Row
        LazyRow(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = MaxContentWidthDp.dp),
            contentPadding = PaddingValues(horizontal = horizontalGutter, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(LibraryFilter.entries) { filter ->
                val active = selectedFilter == filter
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = if (active) TidalPureWhite else TidalWhite10,
                    border = if (!active) BorderStroke(0.8.dp, TidalWhite15) else null,
                    modifier = Modifier
                        .height(34.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .clickable { selectedFilter = filter }
                ) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier.padding(horizontal = 14.dp)
                    ) {
                        Text(
                            text = filter.label,
                            fontSize = 13.sp,
                            fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                            color = if (active) TidalPureBlack else TidalWhite
                        )
                    }
                }
            }
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .widthIn(max = MaxContentWidthDp.dp),
            contentPadding = PaddingValues(bottom = bottomPadding + 28.dp)
        ) {
            // Live Synology NAS Lossless Vault Card
            if (selectedFilter == LibraryFilter.ALL || selectedFilter == LibraryFilter.NAS_VAULT) {
                item {
                    NasLibraryStatusCard(
                        summary = librarySummary,
                        isOnline = isServerOnline,
                        isScanning = isScanningNas,
                        onRescanClick = {
                            if (isScanningNas) return@NasLibraryStatusCard
                            scope.launch {
                                isScanningNas = true
                                val res = musicRepo.triggerLibraryScan()
                                if (res.isSuccess) {
                                    authRepo.refreshServerStatus()
                                    musicRepo.getLibraryTracks(forceRefresh = true).onSuccess {
                                        nasTracks = it
                                    }
                                    Toast.makeText(
                                        context,
                                        "NAS Vault rescan complete",
                                        Toast.LENGTH_SHORT
                                    ).show()
                                } else {
                                    Toast.makeText(
                                        context,
                                        "Rescan failed: ${res.exceptionOrNull()?.message ?: "offline"}",
                                        Toast.LENGTH_SHORT
                                    ).show()
                                }
                                isScanningNas = false
                            }
                        },
                        modifier = Modifier.padding(
                            horizontal = horizontalGutter,
                            vertical = 10.dp
                        )
                    )
                }
            }

            // Playlists Section (Liked Music + Downloads auto-collection + Custom Playlists)
            if (selectedFilter == LibraryFilter.ALL || selectedFilter == LibraryFilter.PLAYLISTS) {
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(
                                start = horizontalGutter,
                                end = horizontalGutter,
                                top = 12.dp,
                                bottom = 8.dp
                            ),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Playlists & Collections",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = TidalPureWhite
                        )
                        Text(
                            text = "+ New playlist",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TidalCyanAccent,
                            modifier = Modifier.clickable { showCreatePlaylistDialog = true }
                        )
                    }

                    // Liked Music Auto-Playlist Row
                    CollectionRowCard(
                        title = "Liked Music",
                        subtitle = "${likedTracks.size} lossless favorites",
                        badgeText = "AUTO",
                        isMaxBadge = true,
                        gradientColors = listOf(Color(0xFF0E7490), Color(0xFF164E63)),
                        icon = YtmIcons.ThumbUpFilled,
                        onClick = {
                            onOpenPlaylist(
                                "liked-music",
                                "Liked Music",
                                "Your saved KV Tidal favorites (${likedTracks.size} tracks)",
                                likedTracks.firstOrNull()?.coverUrl.orEmpty(),
                                likedTracks
                            )
                        },
                        modifier = Modifier.padding(horizontal = horizontalGutter, vertical = 4.dp)
                    )

                    // Downloads Auto-Collection Row
                    CollectionRowCard(
                        title = "Downloaded Audio",
                        subtitle = "${downloadedTracks.size} tracks • ${formatMb(totalDownloadBytes)} in Music/KV Tidal",
                        badgeText = "OFFLINE",
                        isMaxBadge = false,
                        gradientColors = listOf(Color(0xFF065F46), Color(0xFF064E3B)),
                        icon = YtmIcons.Downloaded24,
                        onClick = {
                            onOpenPlaylist(
                                "offline-downloads",
                                "Downloaded Hi-Res",
                                "Saved offline in Music/KV Tidal (${downloadedTracks.size} tracks)",
                                downloadedTracks.firstOrNull()?.coverUrl.orEmpty(),
                                downloadedTracks
                            )
                        },
                        modifier = Modifier.padding(horizontal = horizontalGutter, vertical = 4.dp)
                    )

                    // User-created local playlists
                    localPlaylists.forEach { pl ->
                        val resolvedTracks = remember(pl.trackIds, allKnownTracks) {
                            pl.trackIds.mapNotNull { id -> allKnownTracks.find { it.id == id } }
                        }
                        CollectionRowCard(
                            title = pl.name,
                            subtitle = "${resolvedTracks.size} tracks • Local Playlist",
                            badgeText = "LIST",
                            isMaxBadge = false,
                            gradientColors = listOf(Color(0xFF1E293B), Color(0xFF0F172A)),
                            icon = YtmIcons.PlaylistAdd24,
                            onClick = {
                                onOpenPlaylist(
                                    pl.id,
                                    pl.name,
                                    "Custom Playlist • ${resolvedTracks.size} tracks",
                                    resolvedTracks.firstOrNull()?.coverUrl.orEmpty(),
                                    resolvedTracks
                                )
                            },
                            modifier = Modifier.padding(horizontal = horizontalGutter, vertical = 4.dp)
                        )
                    }
                }
            }

            // Offline Downloads Tab / Section
            if (selectedFilter == LibraryFilter.DOWNLOADS || (selectedFilter == LibraryFilter.ALL && downloadedTracks.isNotEmpty())) {
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(
                                start = horizontalGutter,
                                end = horizontalGutter,
                                top = 20.dp,
                                bottom = 6.dp
                            ),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "Offline in Music/KV Tidal",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = TidalPureWhite
                            )
                            Text(
                                text = "${downloadedTracks.size} files • ${formatMb(totalDownloadBytes)}",
                                fontSize = 12.sp,
                                color = TidalEmerald
                            )
                        }
                        if (downloadedTracks.isNotEmpty()) {
                            Text(
                                text = "Play offline",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = TidalCyan,
                                modifier = Modifier.clickable {
                                    onTrackPlay(downloadedTracks.first(), downloadedTracks)
                                }
                            )
                        }
                    }
                }

                if (downloadedTracks.isEmpty()) {
                    item {
                        EmptyLibraryNotice(
                            title = "No offline tracks yet",
                            subtitle = "Tap Download inside any track menu or player to store lossless FLAC/M4A files in Music/KV Tidal.",
                            modifier = Modifier.padding(horizontal = horizontalGutter, vertical = 12.dp)
                        )
                    }
                } else {
                    LibraryAdaptiveTrackItems(
                        tracks = downloadedTracks,
                        columns = windowState.libraryGridColumns,
                        likedIds = likedIds,
                        horizontalGutter = horizontalGutter,
                        keyPrefix = "dl",
                        onTrackClick = { t -> onTrackPlay(t, downloadedTracks) }
                    )
                }
            }

            // NAS Vault Albums Grid/Carousel
            if ((selectedFilter == LibraryFilter.ALL || selectedFilter == LibraryFilter.ALBUMS || selectedFilter == LibraryFilter.NAS_VAULT) && nasAlbums.isNotEmpty()) {
                item {
                    Text(
                        text = "NAS Vault Albums (${nasAlbums.size})",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = TidalPureWhite,
                        modifier = Modifier.padding(
                            start = horizontalGutter,
                            end = horizontalGutter,
                            top = 20.dp,
                            bottom = 10.dp
                        )
                    )
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = horizontalGutter),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(nasAlbums, key = { "nas_alb_${it.id}" }) { album ->
                            val size = if (windowState.isWide) 156.dp else 136.dp
                            Column(
                                modifier = Modifier
                                    .width(size)
                                    .clip(RoundedCornerShape(8.dp))
                                    .clickable { onAlbumClick(album) }
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(size)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(TidalCard)
                                ) {
                                    AsyncImage(
                                        model = RetrofitClient.resolveCoverUrl(album.coverUrl),
                                        contentDescription = album.title,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize()
                                    )
                                    Box(
                                        modifier = Modifier
                                            .align(Alignment.TopEnd)
                                            .padding(6.dp)
                                    ) {
                                        QualityBadgePill(text = "FLAC", isMax = false)
                                    }
                                }
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(
                                    text = album.title,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = TidalPureWhite,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = album.artist,
                                    fontSize = 11.sp,
                                    color = TidalGrey05,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }
            }

            // NAS Vault Artists Section
            if ((selectedFilter == LibraryFilter.ALL || selectedFilter == LibraryFilter.ARTISTS || selectedFilter == LibraryFilter.NAS_VAULT) && nasArtists.isNotEmpty()) {
                item {
                    Text(
                        text = "NAS Vault Artists (${nasArtists.size})",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = TidalPureWhite,
                        modifier = Modifier.padding(
                            start = horizontalGutter,
                            end = horizontalGutter,
                            top = 20.dp,
                            bottom = 10.dp
                        )
                    )
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = horizontalGutter),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(nasArtists, key = { "nas_art_${it.id}_${it.name}" }) { artist ->
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = TidalCard,
                                border = BorderStroke(0.8.dp, TidalWhite15),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(12.dp))
                                    .clickable { onArtistClick(artist) }
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(36.dp)
                                            .clip(CircleShape)
                                            .background(TidalCyanDim),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = YtmIcons.PersonAudio24,
                                            contentDescription = null,
                                            tint = TidalCyan,
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                    Column {
                                        Text(
                                            text = artist.name,
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = TidalPureWhite
                                        )
                                        Text(
                                            text = artist.displayFollowers,
                                            fontSize = 11.sp,
                                            color = TidalGrey05
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Songs / NAS Vault Tracks Section
            if (selectedFilter == LibraryFilter.ALL || selectedFilter == LibraryFilter.SONGS || selectedFilter == LibraryFilter.NAS_VAULT) {
                val trackSource = when (selectedFilter) {
                    LibraryFilter.NAS_VAULT -> nasTracks
                    LibraryFilter.SONGS -> (likedTracks + recentlyPlayed + nasTracks).distinctBy { it.id }
                    else -> nasTracks
                }

                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(
                                start = horizontalGutter,
                                end = horizontalGutter,
                                top = 22.dp,
                                bottom = 6.dp
                            ),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = if (selectedFilter == LibraryFilter.SONGS) {
                                "Saved & NAS Songs (${trackSource.size})"
                            } else {
                                "NAS Vault Tracks (${trackSource.size})"
                            },
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = TidalPureWhite
                        )
                        if (trackSource.isNotEmpty()) {
                            Text(
                                text = "Play all",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = TidalCyan,
                                modifier = Modifier.clickable {
                                    onTrackPlay(trackSource.first(), trackSource)
                                }
                            )
                        }
                    }
                }

                if (trackSource.isEmpty()) {
                    item {
                        EmptyLibraryNotice(
                            title = if (isServerOnline) "NAS Vault is empty" else "Waiting for NAS connection",
                            subtitle = "Save Hi-Res tracks from Search or trigger a NAS Vault rescan above.",
                            modifier = Modifier.padding(horizontal = horizontalGutter, vertical = 12.dp)
                        )
                    }
                } else {
                    LibraryAdaptiveTrackItems(
                        tracks = trackSource.take(80),
                        columns = windowState.libraryGridColumns,
                        likedIds = likedIds,
                        horizontalGutter = horizontalGutter,
                        keyPrefix = "nas",
                        onTrackClick = { t -> onTrackPlay(t, trackSource) }
                    )
                }
            }
        }
    }

    if (showCreatePlaylistDialog) {
        AlertDialog(
            onDismissRequest = { showCreatePlaylistDialog = false },
            containerColor = TidalGrey13,
            titleContentColor = TidalPureWhite,
            title = { Text("Create Local Playlist", fontWeight = FontWeight.Bold) },
            text = {
                OutlinedTextField(
                    value = newPlaylistName,
                    onValueChange = { newPlaylistName = it },
                    placeholder = { Text("e.g., Late Night 24-Bit Jazz", color = TidalGrey06) },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = TidalCyan,
                        unfocusedBorderColor = TidalWhite20,
                        focusedTextColor = TidalPureWhite,
                        unfocusedTextColor = TidalPureWhite,
                        cursorColor = TidalCyan
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val trimmed = newPlaylistName.trim()
                        if (trimmed.isNotEmpty()) {
                            val updated = saveNewLocalPlaylist(context, trimmed)
                            localPlaylists = updated
                            newPlaylistName = ""
                            showCreatePlaylistDialog = false
                            Toast.makeText(context, "Created '$trimmed'", Toast.LENGTH_SHORT).show()
                        }
                    }
                ) {
                    Text("Create", color = TidalCyan, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showCreatePlaylistDialog = false }) {
                    Text("Cancel", color = TidalGrey04)
                }
            }
        )
    }
}

@Composable
private fun NasLibraryStatusCard(
    summary: TidalLibrarySummaryResponse?,
    isOnline: Boolean,
    isScanning: Boolean,
    onRescanClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = TidalGrey13,
        border = BorderStroke(1.dp, TidalCyanAccent.copy(alpha = 0.35f))
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(if (isOnline) TidalEmerald else TidalRedError)
                    )
                    Text(
                        text = "Synology NAS Vault",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = TidalPureWhite
                    )
                    if (summary != null && summary.totalHires > 0) {
                        QualityBadgePill(text = "${summary.totalHires} MAX", isMax = true)
                    }
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = if (summary != null) {
                        "${summary.totalTracks} tracks • ${summary.totalAlbums} albums • ${summary.totalArtists} artists"
                    } else {
                        "Connect to your Synology NAS server to browse lossless FLAC & DSD files"
                    },
                    fontSize = 12.sp,
                    color = TidalGrey05
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = TidalCyanDim,
                border = BorderStroke(1.dp, TidalCyanAccent.copy(alpha = 0.6f)),
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .clickable { onRescanClick() }
            ) {
                Box(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    if (isScanning) {
                        CircularProgressIndicator(
                            color = TidalCyan,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(16.dp)
                        )
                    } else {
                        Text(
                            text = "Rescan",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = TidalCyan
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CollectionRowCard(
    title: String,
    subtitle: String,
    badgeText: String,
    isMaxBadge: Boolean,
    gradientColors: List<Color>,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable { onClick() },
        shape = RoundedCornerShape(12.dp),
        color = TidalCard,
        border = BorderStroke(0.6.dp, TidalWhite15)
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(50.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Brush.linearGradient(gradientColors)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = TidalPureWhite,
                    modifier = Modifier.size(24.dp)
                )
            }
            Spacer(modifier = Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = title,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = TidalPureWhite,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    QualityBadgePill(text = badgeText, isMax = isMaxBadge)
                }
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = subtitle,
                    fontSize = 12.sp,
                    color = TidalGrey05,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Icon(
                imageVector = YtmIcons.ChevronRight24,
                contentDescription = null,
                tint = TidalGrey06,
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

@Composable
private fun EmptyLibraryNotice(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = TidalCard,
        border = BorderStroke(0.6.dp, TidalWhite10)
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Text(
                text = title,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = TidalPureWhite
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = subtitle,
                fontSize = 12.sp,
                color = TidalGrey05
            )
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.LibraryAdaptiveTrackItems(
    tracks: List<Track>,
    columns: Int,
    likedIds: Set<String>,
    horizontalGutter: Dp,
    keyPrefix: String,
    onTrackClick: (Track) -> Unit
) {
    if (columns <= 1) {
        items(tracks.size, key = { idx -> "${keyPrefix}_${idx}_${tracks[idx].id}" }) { idx ->
            val track = tracks[idx]
            Box(modifier = Modifier.padding(horizontal = (horizontalGutter - 16.dp).coerceAtLeast(0.dp))) {
                TrackListItem(
                    track = track,
                    isLiked = likedIds.contains(track.id),
                    onTrackClick = { onTrackClick(track) },
                    queue = tracks
                )
            }
        }
    } else {
        val pairs = tracks.chunked(2)
        items(pairs.size, key = { r -> "${keyPrefix}_row_${r}_${pairs[r].first().id}" }) { rowIdx ->
            val pair = pairs[rowIdx]
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = (horizontalGutter - 16.dp).coerceAtLeast(0.dp)),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                pair.forEach { track ->
                    Box(modifier = Modifier.weight(1f)) {
                        TrackListItem(
                            track = track,
                            isLiked = likedIds.contains(track.id),
                            onTrackClick = { onTrackClick(track) },
                            queue = tracks
                        )
                    }
                }
                if (pair.size == 1) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

private fun formatMb(bytes: Long): String {
    if (bytes <= 0L) return "0.0 MB"
    val mb = bytes / (1024.0 * 1024.0)
    return String.format(Locale.US, "%.1f MB", mb)
}

private const val PREFS_PLAYLISTS = "kv_tidal_playlists"

fun loadLocalPlaylists(context: Context): List<LocalPlaylistRecord> {
    val prefs = context.getSharedPreferences(PREFS_PLAYLISTS, Context.MODE_PRIVATE)
    val raw = prefs.getString("playlists_json", null) ?: return emptyList()
    return runCatching {
        val arr = JSONArray(raw)
        List(arr.length()) { idx ->
            val obj = arr.getJSONObject(idx)
            val idsArr = obj.optJSONArray("trackIds") ?: JSONArray()
            LocalPlaylistRecord(
                id = obj.optString("id", "pl_$idx"),
                name = obj.optString("name", "Playlist"),
                trackIds = List(idsArr.length()) { i -> idsArr.optString(i) }.filter { it.isNotBlank() },
                createdAt = obj.optLong("createdAt", 0L)
            )
        }
    }.getOrDefault(emptyList())
}

private fun persistLocalPlaylists(context: Context, list: List<LocalPlaylistRecord>) {
    val arr = JSONArray()
    list.forEach { pl ->
        arr.put(
            JSONObject().apply {
                put("id", pl.id)
                put("name", pl.name)
                put("trackIds", JSONArray(pl.trackIds))
                put("createdAt", pl.createdAt)
            }
        )
    }
    context.getSharedPreferences(PREFS_PLAYLISTS, Context.MODE_PRIVATE)
        .edit()
        .putString("playlists_json", arr.toString())
        .apply()
}

fun saveNewLocalPlaylist(context: Context, name: String): List<LocalPlaylistRecord> {
    val existing = loadLocalPlaylists(context).toMutableList()
    val record = LocalPlaylistRecord(
        id = "pl_${System.currentTimeMillis()}",
        name = name
    )
    existing.add(0, record)
    persistLocalPlaylists(context, existing)
    return existing
}

fun addTrackToLocalPlaylist(context: Context, playlistId: String, trackId: String) {
    val list = loadLocalPlaylists(context).map { pl ->
        if (pl.id == playlistId && !pl.trackIds.contains(trackId)) {
            pl.copy(trackIds = pl.trackIds + trackId)
        } else {
            pl
        }
    }
    persistLocalPlaylists(context, list)
}
