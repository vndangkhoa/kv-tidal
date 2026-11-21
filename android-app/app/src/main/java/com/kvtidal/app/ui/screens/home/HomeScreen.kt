package com.kvtidal.app.ui.screens.home

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.kvtidal.app.data.api.RetrofitClient
import com.kvtidal.app.data.model.AlbumHit
import com.kvtidal.app.data.model.ArtistHit
import com.kvtidal.app.data.model.TidalLibrarySummaryResponse
import com.kvtidal.app.data.model.Track
import com.kvtidal.app.data.model.User
import com.kvtidal.app.data.repository.AuthRepository
import com.kvtidal.app.data.repository.MusicRepository
import com.kvtidal.app.player.PlayerManager
import com.kvtidal.app.ui.adaptive.LocalWindowState
import com.kvtidal.app.ui.adaptive.MaxContentWidthDp
import com.kvtidal.app.ui.components.KvTidalBrandMark
import com.kvtidal.app.ui.components.QualityBadgePill
import com.kvtidal.app.ui.components.TrackCardSquare
import com.kvtidal.app.ui.components.TrackListItem
import com.kvtidal.app.ui.components.YtmIcons
import com.kvtidal.app.ui.theme.*
import kotlinx.coroutines.async
import kotlinx.coroutines.launch

private data class HomeFilterChip(
    val id: String,
    val label: String,
    val query: String? = null
)

private val HOME_FILTER_CHIPS = listOf(
    HomeFilterChip("all", "All"),
    HomeFilterChip("hires", "Hi-Res MAX", "24bit flac master"),
    HomeFilterChip("vpop", "V-Pop"),
    HomeFilterChip("nas", "NAS Vault"),
    HomeFilterChip("audiophile", "Audiophile", "audiophile vocal lossless"),
    HomeFilterChip("jazz", "Jazz & Acoustic", "jazz acoustic audiophile"),
    HomeFilterChip("energize", "Energize", "electronic synthwave lossless"),
    HomeFilterChip("relax", "Relax", "ambient piano chill"),
    HomeFilterChip("workout", "Workout", "rock hiphop upbeat")
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun HomeScreen(
    musicRepo: MusicRepository,
    authRepo: AuthRepository,
    onNavigateToSearch: () -> Unit,
    onNavigateToLibrary: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onTrackPlay: (Track, List<Track>) -> Unit,
    onArtistClick: (ArtistHit) -> Unit,
    onAlbumClick: (AlbumHit) -> Unit,
    bottomPadding: androidx.compose.ui.unit.Dp = 0.dp
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val windowState = LocalWindowState.current

    val currentUser by authRepo.currentUser.collectAsState()
    val isServerOnline by authRepo.isServerOnline.collectAsState()
    val serverLatencyMs by authRepo.serverLatencyMs.collectAsState()
    val librarySummary by authRepo.librarySummary.collectAsState()
    val recentlyPlayed by PlayerManager.recentlyPlayedHistory.collectAsState()
    val likedIds by PlayerManager.likedTrackIds.collectAsState()

    var selectedChip by remember { mutableStateOf("all") }
    var chartCountry by remember { mutableStateOf("VN") }
    var artistFilter by remember { mutableStateOf("all") }

    var quickPicks by remember { mutableStateOf<List<Track>>(emptyList()) }
    var vnCharts by remember { mutableStateOf(musicRepo.getCachedCharts("VN")) }
    var globalCharts by remember { mutableStateOf(musicRepo.getCachedCharts("GLOBAL")) }
    var trendingAlbums by remember { mutableStateOf(musicRepo.getCachedTrendingAlbums("VN")) }
    var allArtists by remember { mutableStateOf(musicRepo.getCachedArtists("vn")) }
    var nasTracks by remember { mutableStateOf(musicRepo.getCachedLibraryTrackList()) }

    var isLoading by remember { mutableStateOf(vnCharts.isEmpty()) }
    var showCastDialog by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val summaryDeferred = async { authRepo.refreshServerStatus() }
        val vnDeferred = async { musicRepo.getCharts("VN", "trending") }
        val globalDeferred = async { musicRepo.getCharts("GLOBAL", "trending") }
        val albumsDeferred = async { musicRepo.getNewReleases("VN") }
        val artistsDeferred = async { musicRepo.getArtists("all") }
        val nasDeferred = async { musicRepo.getLibraryTracks(false) }

        summaryDeferred.await()
        vnDeferred.await().onSuccess { vnCharts = it }
        globalDeferred.await().onSuccess { globalCharts = it }
        albumsDeferred.await().onSuccess { trendingAlbums = it }
        artistsDeferred.await().onSuccess { allArtists = it }
        nasDeferred.await().onSuccess { nasTracks = it }

        if (quickPicks.isEmpty()) {
            quickPicks = (nasTracks.filter { it.isMaxQuality }.take(6) + vnCharts + globalCharts)
                .distinctBy { it.id }
                .take(16)
        }
        isLoading = false
    }

    LaunchedEffect(selectedChip) {
        val chip = HOME_FILTER_CHIPS.find { it.id == selectedChip } ?: return@LaunchedEffect
        when (chip.id) {
            "all" -> {
                val combined = (nasTracks.filter { it.isMaxQuality }.take(6) + vnCharts + globalCharts)
                    .distinctBy { it.id }
                    .take(16)
                if (combined.isNotEmpty()) quickPicks = combined
            }
            "vpop" -> {
                chartCountry = "VN"
                if (vnCharts.isNotEmpty()) quickPicks = vnCharts.take(16)
                else musicRepo.getCharts("VN").onSuccess { quickPicks = it.take(16) }
            }
            "nas" -> {
                if (nasTracks.isNotEmpty()) {
                    quickPicks = nasTracks.take(16)
                } else {
                    musicRepo.getLibraryTracks(true).onSuccess {
                        nasTracks = it
                        quickPicks = it.take(16)
                    }
                }
            }
            else -> {
                chip.query?.let { q ->
                    musicRepo.search(q).onSuccess { results ->
                        if (results.isNotEmpty()) quickPicks = results.take(16)
                    }
                }
            }
        }
    }

    val activeChartTracks = remember(chartCountry, vnCharts, globalCharts, nasTracks) {
        when (chartCountry) {
            "VN" -> vnCharts
            "GLOBAL" -> globalCharts
            "AUDIOPHILE" -> (nasTracks.filter { it.hires } + globalCharts + vnCharts)
                .distinctBy { it.id }
                .take(20)
            else -> vnCharts
        }
    }

    val filteredArtists = remember(allArtists, artistFilter) {
        when (artistFilter) {
            "vietnam" -> allArtists.filter { it.category.contains("vietnam", true) || it.categoryLabel.contains("V-Pop", true) }
            "global" -> allArtists.filter { it.category.contains("global", true) || it.categoryLabel.contains("Global", true) }
            "audiophile" -> allArtists.filter {
                it.category.contains("audiophile", true) ||
                    it.category.contains("instrumental", true) ||
                    it.category.contains("jazz", true)
            }
            else -> allArtists
        }.ifEmpty { allArtists }
    }

    val horizontalGutter = if (windowState.isWide) 24.dp else 16.dp

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(TidalPureBlack)
    ) {
        // Subtle TIDAL Electric Cyan / Abyssal atmospheric wash at the top
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(290.dp)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            TidalCyanAccent.copy(alpha = 0.22f),
                            Color(0xFF062129).copy(alpha = 0.35f),
                            TidalPureBlack
                        )
                    )
                )
        )

        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.TopCenter
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .widthIn(max = MaxContentWidthDp.dp),
                contentPadding = PaddingValues(bottom = bottomPadding + 28.dp)
            ) {
                // Top Header Bar
                item {
                    KvTidalHomeToolbar(
                        currentUser = currentUser,
                        isServerOnline = isServerOnline,
                        latencyMs = serverLatencyMs,
                        onCastClick = { showCastDialog = true },
                        onSearchClick = onNavigateToSearch,
                        onSettingsClick = onNavigateToSettings,
                        horizontalGutter = horizontalGutter
                    )
                }

                // Mood & Quality Filter Chips Row
                item {
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = horizontalGutter, vertical = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(HOME_FILTER_CHIPS, key = { it.id }) { chip ->
                            val selected = selectedChip == chip.id
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = if (selected) TidalPureWhite else TidalWhite10,
                                border = if (!selected) BorderStroke(0.8.dp, TidalWhite15) else null,
                                modifier = Modifier
                                    .height(34.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .clickable { selectedChip = chip.id }
                            ) {
                                Box(
                                    contentAlignment = Alignment.Center,
                                    modifier = Modifier.padding(horizontal = 14.dp)
                                ) {
                                    Text(
                                        text = chip.label,
                                        fontSize = 13.sp,
                                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                        color = if (selected) TidalPureBlack else TidalWhite
                                    )
                                }
                            }
                        }
                    }
                }

                // Quick Picks 4-row snap carousel (KV-Music signature section)
                item {
                    SectionHeader(
                        eyebrow = "START HI-RES RADIO",
                        title = "Quick picks",
                        actionText = if (quickPicks.isNotEmpty()) "Play all" else null,
                        onActionClick = {
                            quickPicks.firstOrNull()?.let { first -> onTrackPlay(first, quickPicks) }
                        },
                        horizontalPadding = horizontalGutter,
                        modifier = Modifier.padding(top = 12.dp, bottom = 10.dp)
                    )

                    if (isLoading && quickPicks.isEmpty()) {
                        HomeLoadingPlaceholder(horizontalPadding = horizontalGutter)
                    } else if (quickPicks.isNotEmpty()) {
                        val pages = remember(quickPicks) { quickPicks.chunked(4) }
                        val carouselState = rememberLazyListState()
                        val flingBehavior = rememberSnapFlingBehavior(lazyListState = carouselState)
                        val columnWidth = when {
                            windowState.widthDp >= 1000 -> 430.dp
                            windowState.isWide -> 370.dp
                            else -> 322.dp
                        }

                        LazyRow(
                            state = carouselState,
                            flingBehavior = flingBehavior,
                            contentPadding = PaddingValues(horizontal = horizontalGutter),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            items(pages) { pageTracks ->
                                Column(
                                    modifier = Modifier.width(columnWidth),
                                    verticalArrangement = Arrangement.spacedBy(2.dp)
                                ) {
                                    pageTracks.forEach { track ->
                                        TrackListItem(
                                            track = track,
                                            isLiked = likedIds.contains(track.id),
                                            onTrackClick = { onTrackPlay(track, quickPicks) },
                                            queue = quickPicks
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // NAS Lossless Vault Live Banner (if server returned local tracks)
                val summary = librarySummary
                if (summary != null && summary.totalTracks > 0) {
                    item {
                        NasVaultBannerCard(
                            summary = summary,
                            onClick = onNavigateToLibrary,
                            modifier = Modifier.padding(
                                horizontal = horizontalGutter,
                                vertical = 14.dp
                            )
                        )
                    }
                }

                // Hi-Res Albums & Trending Releases Horizontal Carousel
                if (trendingAlbums.isNotEmpty()) {
                    item {
                        SectionHeader(
                            eyebrow = "LOSSLESS MASTER CATALOG",
                            title = "Trending albums & releases",
                            actionText = "Explore",
                            onActionClick = onNavigateToSearch,
                            horizontalPadding = horizontalGutter,
                            modifier = Modifier.padding(top = 18.dp, bottom = 10.dp)
                        )

                        val cardWidth = if (windowState.isWide) 176.dp else 150.dp
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = horizontalGutter),
                            horizontalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            items(trendingAlbums, key = { "${it.id}_${it.title}" }) { album ->
                                HomeAlbumCard(
                                    album = album,
                                    width = cardWidth,
                                    onClick = { onAlbumClick(album) }
                                )
                            }
                        }
                    }
                }

                // Listen Again / Recently Played Square Cards
                if (recentlyPlayed.isNotEmpty()) {
                    item {
                        SectionHeader(
                            eyebrow = "RECENT SESSION",
                            title = "Listen again",
                            actionText = "${recentlyPlayed.size} tracks",
                            onActionClick = {
                                recentlyPlayed.firstOrNull()?.let { onTrackPlay(it, recentlyPlayed) }
                            },
                            horizontalPadding = horizontalGutter,
                            modifier = Modifier.padding(top = 22.dp, bottom = 10.dp)
                        )

                        LazyRow(
                            contentPadding = PaddingValues(horizontal = horizontalGutter),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            items(recentlyPlayed.take(15), key = { "recent_${it.id}" }) { track ->
                                TrackCardSquare(
                                    track = track,
                                    onClick = { onTrackPlay(track, recentlyPlayed) },
                                    modifier = Modifier.width(if (windowState.isWide) 168.dp else 146.dp)
                                )
                            }
                        }
                    }
                }

                // Recommended Artists Circular Row with Category Tabs
                if (filteredArtists.isNotEmpty()) {
                    item {
                        SectionHeader(
                            eyebrow = "FEATURED ROSTER",
                            title = "Recommended artists",
                            horizontalPadding = horizontalGutter,
                            modifier = Modifier.padding(top = 24.dp, bottom = 6.dp)
                        )

                        LazyRow(
                            contentPadding = PaddingValues(horizontal = horizontalGutter, vertical = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            val tabs = listOf(
                                "all" to "All",
                                "vietnam" to "V-Pop",
                                "global" to "Global",
                                "audiophile" to "Audiophile & Jazz"
                            )
                            items(tabs) { (key, label) ->
                                val active = artistFilter == key
                                Surface(
                                    shape = CircleShape,
                                    color = if (active) TidalCyanDim else TidalWhite08,
                                    border = BorderStroke(
                                        1.dp,
                                        if (active) TidalCyanAccent else TidalWhite15
                                    ),
                                    modifier = Modifier
                                        .clip(CircleShape)
                                        .clickable { artistFilter = key }
                                ) {
                                    Text(
                                        text = label,
                                        fontSize = 12.sp,
                                        fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                                        color = if (active) TidalCyan else TidalGrey04,
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp)
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        val avatarSize = if (windowState.isWide) 138.dp else 118.dp
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = horizontalGutter),
                            horizontalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            items(filteredArtists, key = { "${it.id}_${it.name}" }) { artist ->
                                HomeArtistCircle(
                                    artist = artist,
                                    avatarSize = avatarSize,
                                    onClick = { onArtistClick(artist) }
                                )
                            }
                        }
                    }
                }

                // Top Charts Section with Country/Source Pills & 2-Column Tablet Adaptation
                item {
                    SectionHeader(
                        eyebrow = "LIVE RANKINGS",
                        title = "Top charts",
                        actionText = if (activeChartTracks.isNotEmpty()) "Play chart" else null,
                        onActionClick = {
                            activeChartTracks.firstOrNull()?.let { first ->
                                onTrackPlay(first, activeChartTracks)
                            }
                        },
                        horizontalPadding = horizontalGutter,
                        modifier = Modifier.padding(top = 26.dp, bottom = 8.dp)
                    )

                    Row(
                        modifier = Modifier.padding(horizontal = horizontalGutter, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf("VN" to "Vietnam Top", "GLOBAL" to "Global Top", "AUDIOPHILE" to "Audiophile MAX").forEach { (code, label) ->
                            val active = chartCountry == code
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = if (active) TidalPureWhite else TidalCard,
                                border = BorderStroke(0.8.dp, if (active) TidalPureWhite else TidalWhite15),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .clickable { chartCountry = code }
                            ) {
                                Text(
                                    text = label,
                                    fontSize = 12.sp,
                                    fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                                    color = if (active) TidalPureBlack else TidalGrey04,
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(6.dp))
                }

                val chartDisplay = activeChartTracks.take(20)
                if (windowState.chartGridColumns == 2 && chartDisplay.size > 1) {
                    val pairedRows = chartDisplay.chunked(2)
                    itemsIndexed(pairedRows) { rowIndex, pair ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = horizontalGutter),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            pair.forEachIndexed { colIndex, track ->
                                val rank = rowIndex * 2 + colIndex + 1
                                Box(modifier = Modifier.weight(1f)) {
                                    TrackListItem(
                                        track = track,
                                        rankNumber = rank,
                                        isLiked = likedIds.contains(track.id),
                                        onTrackClick = { onTrackPlay(track, chartDisplay) },
                                        queue = chartDisplay
                                    )
                                }
                            }
                            if (pair.size == 1) {
                                Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                    }
                } else {
                    itemsIndexed(chartDisplay, key = { idx, t -> "chart_${chartCountry}_${idx}_${t.id}" }) { idx, track ->
                        Box(modifier = Modifier.padding(horizontal = horizontalGutter)) {
                            TrackListItem(
                                track = track,
                                rankNumber = idx + 1,
                                isLiked = likedIds.contains(track.id),
                                onTrackClick = { onTrackPlay(track, chartDisplay) },
                                queue = chartDisplay
                            )
                        }
                    }
                }
            }
        }
    }

    if (showCastDialog) {
        AlertDialog(
            onDismissRequest = { showCastDialog = false },
            containerColor = TidalGrey13,
            titleContentColor = TidalPureWhite,
            textContentColor = TidalGrey04,
            title = {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(YtmIcons.Cast24, contentDescription = null, tint = TidalCyan)
                    Text("Audio Output & Devices", fontWeight = FontWeight.Bold)
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = TidalCyanDim,
                        border = BorderStroke(1.dp, TidalCyanAccent)
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Text(
                                text = "This Device (Active • ExoPlayer)",
                                fontWeight = FontWeight.Bold,
                                color = TidalPureWhite,
                                fontSize = 14.sp
                            )
                            Text(
                                text = "Mode: ${RetrofitClient.getStreamQualityMode()} • Bit-Perfect FLAC / OPUS Engine",
                                color = TidalCyan,
                                fontSize = 12.sp
                            )
                        }
                    }

                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = TidalCard,
                        border = BorderStroke(1.dp, TidalWhite15)
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Text(
                                text = "Synology NAS OpenSubsonic Node",
                                fontWeight = FontWeight.SemiBold,
                                color = TidalPureWhite,
                                fontSize = 14.sp
                            )
                            Text(
                                text = "${RetrofitClient.getBaseUrl()} • ${if (isServerOnline) "Online (${serverLatencyMs ?: 0}ms)" else "Check Settings"}",
                                color = TidalGrey05,
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showCastDialog = false }) {
                    Text("Close", color = TidalCyan)
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showCastDialog = false
                        onNavigateToSettings()
                    }
                ) {
                    Text("Audio Settings", color = TidalWhite)
                }
            }
        )
    }
}

@Composable
private fun KvTidalHomeToolbar(
    currentUser: User?,
    isServerOnline: Boolean,
    latencyMs: Long?,
    onCastClick: () -> Unit,
    onSearchClick: () -> Unit,
    onSettingsClick: () -> Unit,
    horizontalGutter: androidx.compose.ui.unit.Dp
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = horizontalGutter, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.weight(1f)
        ) {
            KvTidalBrandMark(modifier = Modifier.size(30.dp))
            Column {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = "KV Tidal",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = TidalPureWhite,
                        letterSpacing = (-0.4).sp
                    )
                    QualityBadgePill(text = "MAX", isMax = true)
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                    modifier = Modifier.clickable { onSettingsClick() }
                ) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(if (isServerOnline) TidalEmerald else TidalRedError)
                    )
                    Text(
                        text = if (isServerOnline) {
                            "NAS Vault • ${latencyMs ?: 12}ms"
                        } else {
                            "Server Offline • Tap to configure"
                        },
                        fontSize = 11.sp,
                        color = TidalGrey05,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            IconButton(onClick = onCastClick) {
                Icon(
                    imageVector = YtmIcons.Cast24,
                    contentDescription = "Output Devices",
                    tint = TidalWhite,
                    modifier = Modifier.size(22.dp)
                )
            }
            IconButton(onClick = onSearchClick) {
                Icon(
                    imageVector = YtmIcons.SearchOutline,
                    contentDescription = "Search",
                    tint = TidalWhite,
                    modifier = Modifier.size(22.dp)
                )
            }
            Spacer(modifier = Modifier.width(4.dp))
            val initial = currentUser?.name?.firstOrNull()?.uppercaseChar()?.toString() ?: "T"
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(TidalCyanDim)
                    .border(1.2.dp, TidalCyanAccent, CircleShape)
                    .clickable { onSettingsClick() },
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = initial,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = TidalCyan
                )
            }
        }
    }
}

@Composable
private fun SectionHeader(
    eyebrow: String? = null,
    title: String,
    actionText: String? = null,
    onActionClick: (() -> Unit)? = null,
    horizontalPadding: androidx.compose.ui.unit.Dp,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = horizontalPadding),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column(modifier = Modifier.weight(1f)) {
            if (!eyebrow.isNullOrBlank()) {
                Text(
                    text = eyebrow,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.2.sp,
                    color = TidalCyanAccent
                )
                Spacer(modifier = Modifier.height(2.dp))
            }
            Text(
                text = title,
                fontSize = 21.sp,
                fontWeight = FontWeight.Bold,
                color = TidalPureWhite,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        if (actionText != null && onActionClick != null) {
            Surface(
                shape = CircleShape,
                color = TidalWhite08,
                border = BorderStroke(0.8.dp, TidalWhite20),
                modifier = Modifier
                    .clip(CircleShape)
                    .clickable { onActionClick() }
            ) {
                Text(
                    text = actionText,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TidalWhite,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp)
                )
            }
        }
    }
}

@Composable
private fun NasVaultBannerCard(
    summary: TidalLibrarySummaryResponse,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .clickable { onClick() },
        shape = RoundedCornerShape(14.dp),
        color = TidalGrey13,
        border = BorderStroke(1.dp, TidalCyanAccent.copy(alpha = 0.35f))
    ) {
        Row(
            modifier = Modifier
                .background(
                    Brush.horizontalGradient(
                        listOf(
                            TidalCyanAccent.copy(alpha = 0.14f),
                            TidalGrey13
                        )
                    )
                )
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(TidalCyanDim),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = YtmIcons.Album24,
                    contentDescription = null,
                    tint = TidalCyan,
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
                        text = "Synology NAS Lossless Vault",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = TidalPureWhite
                    )
                    QualityBadgePill(text = "${summary.totalHires} HI-RES", isMax = true)
                }
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "${summary.totalTracks} tracks • ${summary.totalAlbums} albums • ${summary.totalArtists} artists",
                    fontSize = 12.sp,
                    color = TidalGrey05
                )
            }
            Icon(
                imageVector = YtmIcons.ChevronRight24,
                contentDescription = "Open NAS Vault",
                tint = TidalCyan,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

@Composable
private fun HomeAlbumCard(
    album: AlbumHit,
    width: androidx.compose.ui.unit.Dp,
    onClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .width(width)
            .clip(RoundedCornerShape(10.dp))
            .clickable { onClick() }
    ) {
        Box(
            modifier = Modifier
                .size(width)
                .clip(RoundedCornerShape(10.dp))
                .background(TidalCard)
                .border(0.6.dp, TidalWhite15, RoundedCornerShape(10.dp))
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
                    .padding(8.dp)
            ) {
                QualityBadgePill(
                    text = if (album.isLocalLibrary) "FLAC" else "MAX",
                    isMax = !album.isLocalLibrary
                )
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = album.title,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = TidalPureWhite,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            text = buildString {
                append(album.artist.ifBlank { "Various Artists" })
                if (album.year.isNotBlank()) append(" • ${album.year}")
            },
            fontSize = 12.sp,
            color = TidalGrey05,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun HomeArtistCircle(
    artist: ArtistHit,
    avatarSize: androidx.compose.ui.unit.Dp,
    onClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .width(avatarSize)
            .clickable { onClick() },
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(avatarSize)
                .clip(CircleShape)
                .background(TidalCard)
                .border(1.dp, TidalCyanAccent.copy(alpha = 0.45f), CircleShape)
        ) {
            AsyncImage(
                model = RetrofitClient.resolveCoverUrl(artist.displayPhoto),
                contentDescription = artist.name,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = artist.name,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = TidalPureWhite,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            text = artist.displayFollowers,
            fontSize = 11.sp,
            color = TidalGrey05,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun HomeLoadingPlaceholder(horizontalPadding: androidx.compose.ui.unit.Dp) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = horizontalPadding),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        repeat(4) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Box(
                    modifier = Modifier
                        .size(52.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(TidalCard)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(
                        modifier = Modifier
                            .width(180.dp)
                            .height(14.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(TidalCard)
                    )
                    Box(
                        modifier = Modifier
                            .width(120.dp)
                            .height(11.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(TidalSurface)
                    )
                }
            }
        }
    }
}
