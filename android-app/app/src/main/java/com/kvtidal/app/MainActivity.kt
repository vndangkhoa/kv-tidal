package com.kvtidal.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.kvtidal.app.data.model.AlbumHit
import com.kvtidal.app.data.model.ArtistHit
import com.kvtidal.app.data.model.Track
import com.kvtidal.app.player.PlayerManager
import com.kvtidal.app.ui.adaptive.LocalWindowState
import com.kvtidal.app.ui.adaptive.ProvideWidthClass
import com.kvtidal.app.ui.components.BottomNavBar
import com.kvtidal.app.ui.components.MiniPlayer
import com.kvtidal.app.ui.components.NavScreen
import com.kvtidal.app.ui.components.TidalNavigationRail
import com.kvtidal.app.ui.screens.detail.DetailScreen
import com.kvtidal.app.ui.screens.home.HomeScreen
import com.kvtidal.app.ui.screens.library.LibraryScreen
import com.kvtidal.app.ui.screens.player.FullPlayerScreen
import com.kvtidal.app.ui.screens.search.SearchScreen
import com.kvtidal.app.ui.screens.settings.SettingsScreen
import com.kvtidal.app.ui.theme.KVTidalTheme
import com.kvtidal.app.ui.theme.TidalPureBlack
import com.kvtidal.app.ui.theme.TidalSurface

private data class ActiveDetailData(
    val id: String,
    val title: String,
    val coverUrl: String,
    val subtitle: String,
    val type: String,
    val initialTracks: List<Track> = emptyList()
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        PlayerManager.getExoPlayer(this)

        setContent {
            KVTidalTheme {
                ProvideWidthClass {
                    KVTidalRootScreen()
                }
            }
        }
    }
}

@Composable
private fun KVTidalRootScreen() {
    val app = KVTidalApp.instance
    val musicRepo = app.musicRepository
    val authRepo = app.authRepository
    val windowState = LocalWindowState.current

    var currentRoute by remember { mutableStateOf(NavScreen.Home.route) }
    var activeDetail by remember { mutableStateOf<ActiveDetailData?>(null) }
    var showFullPlayer by remember { mutableStateOf(false) }

    val currentTrack by PlayerManager.currentTrack.collectAsState()
    val isPlaying by PlayerManager.isPlaying.collectAsState()
    val positionMs by PlayerManager.currentPosition.collectAsState()
    val durationMs by PlayerManager.duration.collectAsState()

    val safeDuration = durationMs
        .coerceAtLeast((currentTrack?.duration ?: 0) * 1000L)
        .coerceAtLeast(1L)
    val progressFraction = (positionMs.toFloat() / safeDuration.toFloat()).coerceIn(0f, 1f)

    val playTrackAction: (Track, List<Track>) -> Unit = { track, queue ->
        PlayerManager.playTrack(track, queue.ifEmpty { listOf(track) })
    }

    val openArtistDetail: (ArtistHit) -> Unit = { artist ->
        activeDetail = ActiveDetailData(
            id = artist.id,
            title = artist.name,
            coverUrl = artist.displayPhoto,
            subtitle = artist.displayFollowers,
            type = "artist"
        )
    }

    val openAlbumDetail: (AlbumHit) -> Unit = { album ->
        activeDetail = ActiveDetailData(
            id = album.id,
            title = album.title,
            coverUrl = album.coverUrl,
            subtitle = buildString {
                append(album.artist)
                if (album.year.isNotBlank()) append(" • ${album.year}")
            },
            type = if (album.isLocalLibrary) "nas_album" else "album"
        )
    }

    val navigateToTab: (String) -> Unit = { route ->
        activeDetail = null
        currentRoute = route
    }

    BackHandler(enabled = showFullPlayer || activeDetail != null || currentRoute != NavScreen.Home.route) {
        when {
            showFullPlayer -> showFullPlayer = false
            activeDetail != null -> activeDetail = null
            currentRoute != NavScreen.Home.route -> currentRoute = NavScreen.Home.route
        }
    }

    // Reserve scrollable bottom clearance for docked MiniPlayer (and BottomNavBar on compact phones)
    val navBarClearance = if (windowState.useNavigationRail) {
        WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    } else {
        56.dp + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    }
    val miniPlayerClearance = if (currentTrack != null) {
        if (windowState.isWide) 70.dp else 64.dp
    } else {
        0.dp
    }
    val totalBottomInset = navBarClearance + miniPlayerClearance

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(TidalPureBlack)
    ) {
        Row(modifier = Modifier.fillMaxSize()) {
            // Left NavigationRail for Foldables & Tablets (>= 600dp)
            if (windowState.useNavigationRail) {
                TidalNavigationRail(
                    currentRoute = currentRoute,
                    onNavigate = navigateToTab
                )
            }

            // Main Content Stage + Docked Chrome
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
            ) {
                when (currentRoute) {
                    NavScreen.Home.route -> {
                        HomeScreen(
                            musicRepo = musicRepo,
                            authRepo = authRepo,
                            onNavigateToSearch = { navigateToTab(NavScreen.Search.route) },
                            onNavigateToLibrary = { navigateToTab(NavScreen.Library.route) },
                            onNavigateToSettings = { navigateToTab(NavScreen.Settings.route) },
                            onTrackPlay = playTrackAction,
                            onArtistClick = openArtistDetail,
                            onAlbumClick = openAlbumDetail,
                            bottomPadding = totalBottomInset
                        )
                    }

                    NavScreen.Search.route -> {
                        SearchScreen(
                            musicRepo = musicRepo,
                            onBack = { navigateToTab(NavScreen.Home.route) },
                            onTrackPlay = playTrackAction,
                            onArtistClick = openArtistDetail,
                            onAlbumClick = openAlbumDetail,
                            bottomPadding = totalBottomInset
                        )
                    }

                    NavScreen.Library.route -> {
                        LibraryScreen(
                            musicRepo = musicRepo,
                            authRepo = authRepo,
                            onNavigateToSearch = { navigateToTab(NavScreen.Search.route) },
                            onNavigateToSettings = { navigateToTab(NavScreen.Settings.route) },
                            onTrackPlay = playTrackAction,
                            onArtistClick = openArtistDetail,
                            onAlbumClick = openAlbumDetail,
                            onOpenPlaylist = { id, title, subtitle, cover, tracks ->
                                activeDetail = ActiveDetailData(
                                    id = id,
                                    title = title,
                                    coverUrl = cover,
                                    subtitle = subtitle,
                                    type = "playlist",
                                    initialTracks = tracks
                                )
                            },
                            bottomPadding = totalBottomInset
                        )
                    }

                    NavScreen.Settings.route -> {
                        SettingsScreen(
                            musicRepo = musicRepo,
                            authRepo = authRepo,
                            onBack = { navigateToTab(NavScreen.Home.route) },
                            bottomPadding = totalBottomInset
                        )
                    }
                }

                // Detail Overlay inside main content pane (preserves NavigationRail on foldables/tablets)
                val detail = activeDetail
                if (detail != null) {
                    DetailScreen(
                        musicRepo = musicRepo,
                        id = detail.id,
                        title = detail.title,
                        coverUrl = detail.coverUrl,
                        subtitle = detail.subtitle,
                        type = detail.type,
                        initialTracks = detail.initialTracks,
                        onBack = { activeDetail = null },
                        onTrackPlay = playTrackAction,
                        bottomPadding = totalBottomInset
                    )
                }

                // Bottom Chrome Stack: MiniPlayer + BottomNavBar (compact phone)
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                ) {
                    MiniPlayer(
                        track = currentTrack,
                        isPlaying = isPlaying,
                        progressFraction = progressFraction,
                        onTogglePlay = { PlayerManager.togglePlayPause() },
                        onSkipNext = { PlayerManager.playNext() },
                        onClickExpand = { showFullPlayer = true },
                        modifier = if (windowState.useNavigationRail) {
                            Modifier.navigationBarsPadding()
                        } else {
                            Modifier
                        }
                    )

                    if (!windowState.useNavigationRail) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(TidalSurface)
                                .navigationBarsPadding()
                        ) {
                            BottomNavBar(
                                currentRoute = currentRoute,
                                onNavigate = navigateToTab
                            )
                        }
                    }
                }
            }
        }

        // Full-bleed Studio Player Overlay (supports Phone / Foldable Tabletop / Foldable Book / Tablet)
        AnimatedVisibility(
            visible = showFullPlayer && currentTrack != null,
            enter = slideInVertically(
                initialOffsetY = { it },
                animationSpec = tween(durationMillis = 280)
            ) + fadeIn(animationSpec = tween(220)),
            exit = slideOutVertically(
                targetOffsetY = { it },
                animationSpec = tween(durationMillis = 240)
            ) + fadeOut(animationSpec = tween(180))
        ) {
            FullPlayerScreen(
                musicRepo = musicRepo,
                onDismiss = { showFullPlayer = false }
            )
        }
    }
}
