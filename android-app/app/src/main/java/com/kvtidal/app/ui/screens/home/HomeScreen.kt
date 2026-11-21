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
import com.kvtidal.app.player.AudioOutputManager
import com.kvtidal.app.player.PlayerManager
import com.kvtidal.app.ui.adaptive.LocalWindowState
import com.kvtidal.app.ui.adaptive.MaxContentWidthDp
import com.kvtidal.app.ui.components.KvTidalBrandMark
import com.kvtidal.app.ui.components.OutputDeviceSheet
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
    HomeFilterChip("top_charts", "Top Charts"),
    HomeFilterChip("vpop", "V-Pop"),
    HomeFilterChip("global", "Global Top"),
    HomeFilterChip("hires", "Hi-Res MAX", "24bit flac master"),
    HomeFilterChip("dsd", "DSD Vault", "DSD audiophile master"),
    HomeFilterChip("dr12", "DR12+ Master", "audiophile acoustic master"),
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
    val selectedTerminal by AudioOutputManager.selectedTerminal.collectAsState()
    val bitPerfectEnabled by AudioOutputManager.bitPerfectEnabled.collectAsState()

    var selectedChip by remember { mutableStateOf("all") }
    var chartCountry by remember { mutableStateOf("VN") }
    var artistFilter by remember { mutableStateOf("all") }

    var vnCharts by remember { mutableStateOf(musicRepo.getCachedCharts("VN")) }
    var globalCharts by remember { mutableStateOf(musicRepo.getCachedCharts("GLOBAL")) }
    var vnAlbums by remember { mutableStateOf(musicRepo.getCachedTrendingAlbums("VN")) }
    var globalAlbums by remember { mutableStateOf(musicRepo.getCachedTrendingAlbums("GLOBAL")) }
    var allArtists by remember {
        mutableStateOf(
            musicRepo.getCachedArtists("all").ifEmpty { musicRepo.getCachedArtists("vn") }
        )
    }
    var nasTracks by remember { mutableStateOf(musicRepo.getCachedLibraryTrackList()) }

    val chipTrackCache = remember { mutableStateMapOf<String, List<Track>>() }
    var isLoading by remember { mutableStateOf(vnCharts.isEmpty() && globalCharts.isEmpty()) }
    var isCategoryLoading by remember { mutableStateOf(false) }
    var isChartLoading by remember { mutableStateOf(false) }
    var showOutputSheet by remember { mutableStateOf(false) }

    val mainListState = rememberLazyListState()
    val carouselState = rememberLazyListState()
    val artistRowState = rememberLazyListState()

    LaunchedEffect(Unit) {
        AudioOutputManager.init(context)
        val summaryDeferred = async { authRepo.refreshServerStatus() }
        val vnDeferred = async { musicRepo.getTrending("vn") }
        val globalDeferred = async { musicRepo.getTrending("global") }
        val artistsDeferred = async { musicRepo.getArtists("all") }
        val nasDeferred = async { musicRepo.getLibraryTracks(false) }

        summaryDeferred.await()
        vnDeferred.await().onSuccess { (tracks, albums) ->
            if (tracks.isNotEmpty()) vnCharts = tracks
            if (albums.isNotEmpty()) vnAlbums = albums
        }
        globalDeferred.await().onSuccess { (tracks, albums) ->
            if (tracks.isNotEmpty()) globalCharts = tracks
            if (albums.isNotEmpty()) globalAlbums = albums
        }
        artistsDeferred.await().onSuccess { allArtists = it }
        nasDeferred.await().onSuccess { nasTracks = it }

        // Ensure cached charts loaded cleanly even if single /api/trending populated both shards
        if (vnCharts.isEmpty()) vnCharts = musicRepo.getCachedCharts("VN")
        if (globalCharts.isEmpty()) globalCharts = musicRepo.getCachedCharts("GLOBAL")
        if (vnAlbums.isEmpty()) vnAlbums = musicRepo.getCachedTrendingAlbums("VN")
        if (globalAlbums.isEmpty()) globalAlbums = musicRepo.getCachedTrendingAlbums("GLOBAL")
        isLoading = false
    }

    val summary = librarySummary
    val trendingAlbums = remember(selectedChip, vnAlbums, globalAlbums) {
        when (selectedChip) {
            "vpop" -> vnAlbums.ifEmpty { globalAlbums }
            "global" -> globalAlbums.ifEmpty { vnAlbums }
            else -> (vnAlbums + globalAlbums).distinctBy { "${it.title.lowercase()}|${it.artist.lowercase()}" }
        }
    }

    val hasNasBanner = summary != null && summary.totalTracks > 0
    val hasAlbumsSection = trendingAlbums.isNotEmpty()
    val hasRecentSection = recentlyPlayed.isNotEmpty()

    val quickPicks = remember(selectedChip, chipTrackCache.toMap(), vnCharts, globalCharts, nasTracks) {
        when (selectedChip) {
            "all", "top_charts" -> (nasTracks.filter { it.isMaxQuality }.take(6) + vnCharts + globalCharts)
                .distinctBy { it.id }
                .take(16)
            "vpop" -> vnCharts.ifEmpty { chipTrackCache["vpop"].orEmpty() }.take(16)
            "global" -> globalCharts.ifEmpty { chipTrackCache["global"].orEmpty() }.take(16)
            "nas" -> nasTracks.take(16)
            "dsd" -> {
                val localDsd = nasTracks.filter { it.isDsd || (it.format?.contains("DSD", true) == true) }
                (localDsd + chipTrackCache["dsd"].orEmpty()).distinctBy { it.id }.take(16)
            }
            "dr12" -> {
                val cached = chipTrackCache["dr12"].orEmpty()
                val localDr12 = nasTracks.filter { (it.drScore ?: 0) >= 12 }
                (localDr12.take(6) + vnCharts + globalCharts + cached).distinctBy { it.id }.take(16)
            }
            else -> {
                val cached = chipTrackCache[selectedChip].orEmpty()
                cached.ifEmpty {
                    (nasTracks.filter { it.hires }.take(6) + vnCharts + globalCharts)
                        .distinctBy { it.id }
                        .take(16)
                }
            }
        }
    }

    val activeChartTracks = remember(chartCountry, vnCharts, globalCharts, nasTracks) {
        when (chartCountry) {
            "VN" -> vnCharts
            "GLOBAL" -> globalCharts
            "AUDIOPHILE" -> (nasTracks.filter { it.isMaxQuality || it.isDsd }.take(10) + globalCharts + vnCharts)
                .distinctBy { it.id }
                .take(25)
            "DR12" -> (nasTracks.filter { (it.drScore ?: 0) >= 12 }.take(12) + vnCharts + globalCharts)
                .distinctBy { it.id }
                .take(25)
            else -> vnCharts
        }
    }

    val filteredArtists = remember(allArtists, artistFilter) {
        when (artistFilter) {
            "vietnam" -> allArtists.filter {
                it.category.equals("vpop", true) ||
                    it.category.contains("vietnam", true) ||
                    it.categoryLabel.contains("V-Pop", true)
            }
            "global" -> allArtists.filter {
                it.category.equals("global", true) ||
                    it.categoryLabel.contains("Global", true)
            }
            "audiophile" -> allArtists.filter {
                it.category.equals("audiophile", true) ||
                    it.category.contains("instrumental", true) ||
                    it.category.contains("jazz", true)
            }
            else -> allArtists
        }.ifEmpty { allArtists }
    }

    // Compute exact LazyColumn index of the "Top charts" header item for chip/anchor scrolling
    val hasArtistsSection = filteredArtists.isNotEmpty()
    val topChartsItemIndex = 3 +
        (if (hasNasBanner) 1 else 0) +
        (if (hasAlbumsSection) 1 else 0) +
        (if (hasRecentSection) 1 else 0) +
        (if (hasArtistsSection) 1 else 0)

    fun refreshChartTab(code: String) {
        chartCountry = code
        scope.launch {
            isChartLoading = true
            when (code) {
                "VN" -> musicRepo.getCharts("VN", "trending").onSuccess { if (it.isNotEmpty()) vnCharts = it }
                "GLOBAL" -> musicRepo.getCharts("GLOBAL", "trending").onSuccess { if (it.isNotEmpty()) globalCharts = it }
                else -> {
                    if (nasTracks.isEmpty()) {
                        musicRepo.getLibraryTracks(true).onSuccess { nasTracks = it }
                    }
                    if (vnCharts.isEmpty() || globalCharts.isEmpty()) {
                        musicRepo.getTrending("vn").onSuccess { (t, a) ->
                            if (t.isNotEmpty()) vnCharts = t
                            if (a.isNotEmpty()) vnAlbums = a
                        }
                        musicRepo.getTrending("global").onSuccess { (t, a) ->
                            if (t.isNotEmpty()) globalCharts = t
                            if (a.isNotEmpty()) globalAlbums = a
                        }
                    }
                }
            }
            isChartLoading = false
        }
    }

    fun selectCategoryChip(chip: HomeFilterChip) {
        val nextId = if (selectedChip == chip.id && chip.id != "all") "all" else chip.id
        selectedChip = nextId
        scope.launch {
            carouselState.animateScrollToItem(0)
            when (nextId) {
                "top_charts" -> {
                    if (activeChartTracks.isEmpty()) refreshChartTab(chartCountry)
                    mainListState.animateScrollToItem(topChartsItemIndex)
                }
                "vpop" -> {
                    chartCountry = "VN"
                    artistFilter = "vietnam"
                    if (vnCharts.isEmpty()) {
                        isCategoryLoading = true
                        musicRepo.getTrending("vn").onSuccess { (t, a) ->
                            if (t.isNotEmpty()) vnCharts = t
                            if (a.isNotEmpty()) vnAlbums = a
                        }
                        isCategoryLoading = false
                    }
                }
                "global" -> {
                    chartCountry = "GLOBAL"
                    artistFilter = "global"
                    if (globalCharts.isEmpty()) {
                        isCategoryLoading = true
                        musicRepo.getTrending("global").onSuccess { (t, a) ->
                            if (t.isNotEmpty()) globalCharts = t
                            if (a.isNotEmpty()) globalAlbums = a
                        }
                        isCategoryLoading = false
                    }
                }
                "audiophile" -> {
                    chartCountry = "AUDIOPHILE"
                    artistFilter = "audiophile"
                    if (!chipTrackCache.containsKey("audiophile")) {
                        isCategoryLoading = true
                        musicRepo.search("audiophile vocal lossless").onSuccess { results ->
                            if (results.isNotEmpty()) chipTrackCache["audiophile"] = results
                        }
                        isCategoryLoading = false
                    }
                }
                "dr12" -> {
                    chartCountry = "DR12"
                    if (!chipTrackCache.containsKey("dr12")) {
                        isCategoryLoading = true
                        musicRepo.search("audiophile acoustic master").onSuccess { results ->
                            if (results.isNotEmpty()) chipTrackCache["dr12"] = results
                        }
                        isCategoryLoading = false
                    }
                }
                "nas" -> {
                    if (nasTracks.isEmpty()) {
                        isCategoryLoading = true
                        musicRepo.getLibraryTracks(true).onSuccess { nasTracks = it }
                        isCategoryLoading = false
                    }
                }
                "all" -> {
                    artistFilter = "all"
                }
                else -> {
                    val targetChip = HOME_FILTER_CHIPS.find { it.id == nextId }
                    val q = targetChip?.query
                    if (q != null && !chipTrackCache.containsKey(nextId)) {
                        isCategoryLoading = true
                        musicRepo.search(q).onSuccess { results ->
                            if (results.isNotEmpty()) chipTrackCache[nextId] = results
                        }
                        isCategoryLoading = false
                    }
                }
            }
        }
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
                state = mainListState,
                modifier = Modifier
                    .fillMaxSize()
                    .widthIn(max = MaxContentWidthDp.dp),
                contentPadding = PaddingValues(bottom = bottomPadding + 28.dp)
            ) {
                // Index 0: Top Header Bar
                item {
                    KvTidalHomeToolbar(
                        currentUser = currentUser,
                        isServerOnline = isServerOnline,
                        latencyMs = serverLatencyMs,
                        outputBadge = selectedTerminal.shortBadge,
                        bitPerfectEnabled = bitPerfectEnabled,
                        onCastClick = { showOutputSheet = true },
                        onSearchClick = onNavigateToSearch,
                        onSettingsClick = onNavigateToSettings,
                        horizontalGutter = horizontalGutter
                    )
                }

                // Index 1: Mood & Quality Filter Chips Row
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
                                    .clickable { selectCategoryChip(chip) }
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

                    if (isCategoryLoading) {
                        LinearProgressIndicator(
                            color = TidalCyan,
                            trackColor = TidalCard,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = horizontalGutter)
                                .height(2.dp)
                        )
                    }
                }

                // Index 2: Quick Picks 4-row snap carousel
                item {
                    val activeLabel = HOME_FILTER_CHIPS.find { it.id == selectedChip }?.label ?: "Quick picks"
                    SectionHeader(
                        eyebrow = if (selectedChip == "all") "START HI-RES RADIO" else "${activeLabel.uppercase()} • STUDIO SELECTION",
                        title = if (selectedChip == "all" || selectedChip == "top_charts") "Quick picks" else "$activeLabel mixes",
                        actionText = if (quickPicks.isNotEmpty()) "Play all" else null,
                        onActionClick = {
                            quickPicks.firstOrNull()?.let { first -> onTrackPlay(first, quickPicks) }
                        },
                        horizontalPadding = horizontalGutter,
                        modifier = Modifier.padding(top = 12.dp, bottom = 10.dp)
                    )

                    if ((isLoading || isCategoryLoading) && quickPicks.isEmpty()) {
                        HomeLoadingPlaceholder(horizontalPadding = horizontalGutter)
                    } else if (quickPicks.isNotEmpty()) {
                        val pages = remember(quickPicks) { quickPicks.chunked(4) }
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
                                            queue = quickPicks,
                                            contentPadding = PaddingValues(horizontal = 4.dp, vertical = 6.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // Optional Index 3: NAS Lossless Vault Live Banner
                if (hasNasBanner && summary != null) {
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

                // Optional Hi-Res Albums & Trending Releases Horizontal Carousel
                if (hasAlbumsSection) {
                    item {
                        SectionHeader(
                            eyebrow = "LOSSLESS MASTER CATALOG",
                            title = if (selectedChip == "global") "Global top albums" else "Trending albums & releases",
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

                // Optional Listen Again / Recently Played Square Cards
                if (hasRecentSection) {
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

                        val cardWidth = if (windowState.isWide) 168.dp else 146.dp
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = horizontalGutter),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            items(recentlyPlayed.take(15), key = { "recent_${it.id}" }) { track ->
                                TrackCardSquare(
                                    track = track,
                                    onClick = { onTrackPlay(track, recentlyPlayed) },
                                    modifier = Modifier.width(cardWidth)
                                )
                            }
                        }
                    }
                }

                // Optional Recommended Artists Circular Row with Category Tabs
                if (hasArtistsSection) {
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
                                        .clickable {
                                            artistFilter = key
                                            scope.launch { artistRowState.animateScrollToItem(0) }
                                        }
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
                            state = artistRowState,
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

                // Top Charts Section (Anchored at `topChartsItemIndex`)
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(
                                start = horizontalGutter,
                                end = horizontalGutter,
                                top = 26.dp,
                                bottom = 8.dp
                            ),
                        verticalAlignment = Alignment.Bottom,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "LIVE RANKINGS",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.2.sp,
                                color = TidalCyanAccent
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = when (chartCountry) {
                                    "GLOBAL" -> "Global Top 50"
                                    "AUDIOPHILE" -> "Audiophile MAX Chart"
                                    "DR12" -> "DR12+ Dynamic Chart"
                                    else -> "Vietnam Top 50"
                                },
                                fontSize = 21.sp,
                                fontWeight = FontWeight.Bold,
                                color = TidalPureWhite,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }

                        if (activeChartTracks.isNotEmpty()) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Surface(
                                    shape = CircleShape,
                                    color = TidalWhite08,
                                    border = BorderStroke(0.8.dp, TidalWhite20),
                                    modifier = Modifier
                                        .clip(CircleShape)
                                        .clickable {
                                            val shuffled = activeChartTracks.shuffled()
                                            shuffled.firstOrNull()?.let { onTrackPlay(it, shuffled) }
                                        }
                                ) {
                                    Text(
                                        text = "Shuffle",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = TidalWhite,
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp)
                                    )
                                }

                                Surface(
                                    shape = CircleShape,
                                    color = TidalCyan,
                                    modifier = Modifier
                                        .clip(CircleShape)
                                        .clickable {
                                            activeChartTracks.firstOrNull()?.let { first ->
                                                onTrackPlay(first, activeChartTracks)
                                            }
                                        }
                                ) {
                                    Text(
                                        text = "Play chart",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = TidalPureBlack,
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp)
                                    )
                                }
                            }
                        }
                    }

                    LazyRow(
                        contentPadding = PaddingValues(horizontal = horizontalGutter, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        val chartTabs = listOf(
                            "VN" to "Vietnam Top",
                            "GLOBAL" to "Global Top",
                            "AUDIOPHILE" to "Audiophile MAX",
                            "DR12" to "DR12+ Master"
                        )
                        items(chartTabs) { (code, label) ->
                            val active = chartCountry == code
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = if (active) TidalPureWhite else TidalCard,
                                border = BorderStroke(0.8.dp, if (active) TidalPureWhite else TidalWhite15),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .clickable { refreshChartTab(code) }
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

                    if (isChartLoading) {
                        LinearProgressIndicator(
                            color = TidalCyan,
                            trackColor = TidalCard,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = horizontalGutter, vertical = 6.dp)
                                .height(2.dp)
                        )
                    } else {
                        Spacer(modifier = Modifier.height(6.dp))
                    }
                }

                val chartDisplay = activeChartTracks.take(25)
                if (chartDisplay.isEmpty()) {
                    item {
                        if (isLoading || isChartLoading) {
                            HomeLoadingPlaceholder(horizontalPadding = horizontalGutter)
                        } else {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = TidalCard,
                                border = BorderStroke(0.8.dp, TidalWhite15),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = horizontalGutter, vertical = 8.dp)
                            ) {
                                Row(
                                    modifier = Modifier.padding(16.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        text = "Charts unavailable right now",
                                        fontSize = 13.sp,
                                        color = TidalGrey04,
                                        modifier = Modifier.weight(1f)
                                    )
                                    TextButton(onClick = { refreshChartTab(chartCountry) }) {
                                        Text("Retry", color = TidalCyan, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }
                } else if (windowState.chartGridColumns == 2 && chartDisplay.size > 1) {
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
                                        queue = chartDisplay,
                                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 8.dp)
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
                                queue = chartDisplay,
                                contentPadding = PaddingValues(horizontal = 4.dp, vertical = 8.dp)
                            )
                        }
                    }
                }
            }
        }
    }

    if (showOutputSheet) {
        OutputDeviceSheet(
            musicRepo = musicRepo,
            onDismiss = { showOutputSheet = false }
        )
    }
}

@Composable
private fun KvTidalHomeToolbar(
    currentUser: User?,
    isServerOnline: Boolean,
    latencyMs: Long?,
    outputBadge: String,
    bitPerfectEnabled: Boolean,
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
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Surface(
                shape = CircleShape,
                color = if (bitPerfectEnabled) TidalEmeraldDim else TidalCyanDim,
                border = BorderStroke(
                    0.8.dp,
                    if (bitPerfectEnabled) TidalEmerald.copy(alpha = 0.55f) else TidalCyanAccent.copy(alpha = 0.55f)
                ),
                modifier = Modifier
                    .clip(CircleShape)
                    .clickable { onCastClick() }
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    Icon(
                        imageVector = YtmIcons.Headset24,
                        contentDescription = "Output Device",
                        tint = if (bitPerfectEnabled) TidalEmerald else TidalCyan,
                        modifier = Modifier.size(15.dp)
                    )
                    Text(
                        text = outputBadge,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (bitPerfectEnabled) TidalEmerald else TidalCyan,
                        maxLines = 1
                    )
                }
            }
            IconButton(onClick = onSearchClick) {
                Icon(
                    imageVector = YtmIcons.SearchOutline,
                    contentDescription = "Search",
                    tint = TidalWhite,
                    modifier = Modifier.size(22.dp)
                )
            }
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
