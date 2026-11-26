package com.kvtidal.app.ui.screens.player

import android.content.Intent
import android.widget.Toast
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.kvtidal.app.data.api.RetrofitClient
import com.kvtidal.app.data.model.LiveSignalPathInfo
import com.kvtidal.app.data.model.SyncedLyricsResponse
import com.kvtidal.app.data.model.Track
import com.kvtidal.app.data.repository.MusicRepository
import com.kvtidal.app.player.AudioOutputManager
import com.kvtidal.app.player.GainStage
import com.kvtidal.app.player.OutputTerminal
import com.kvtidal.app.player.PlayerManager
import com.kvtidal.app.ui.adaptive.LocalWindowState
import com.kvtidal.app.ui.components.OutputDeviceSheet
import com.kvtidal.app.ui.components.QualityBadgePill
import com.kvtidal.app.ui.components.TrackListItem
import com.kvtidal.app.ui.components.YtmIcons
import com.kvtidal.app.ui.screens.library.addTrackToLocalPlaylist
import com.kvtidal.app.ui.screens.library.loadLocalPlaylists
import com.kvtidal.app.ui.screens.library.saveNewLocalPlaylist
import com.kvtidal.app.ui.theme.*
import kotlinx.coroutines.launch
import java.util.Locale
import kotlin.math.sin

private enum class PlayerInspectorTab(val label: String) {
    UP_NEXT("UP NEXT"),
    LYRICS("LYRICS"),
    RELATED("RELATED"),
    SIGNAL_PATH("SIGNAL")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FullPlayerScreen(
    musicRepo: MusicRepository,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val windowState = LocalWindowState.current

    val currentTrack by PlayerManager.currentTrack.collectAsState()
    val isPlaying by PlayerManager.isPlaying.collectAsState()
    val isBuffering by PlayerManager.isBuffering.collectAsState()
    val positionMs by PlayerManager.currentPosition.collectAsState()
    val durationMs by PlayerManager.duration.collectAsState()
    val queue by PlayerManager.queue.collectAsState()
    val queueIndex by PlayerManager.queueIndex.collectAsState()
    val isShuffle by PlayerManager.isShuffle.collectAsState()
    val isRepeat by PlayerManager.isRepeat.collectAsState()
    val waveformBars by PlayerManager.waveformBars.collectAsState()
    val likedIds by PlayerManager.likedTrackIds.collectAsState()
    val downloadedIds by PlayerManager.downloadedTrackIds.collectAsState()
    val downloadProgress by PlayerManager.downloadProgress.collectAsState()
    val liveSignalPath by PlayerManager.liveSignalPath.collectAsState()
    val lastLoadLatencyMs by PlayerManager.lastLoadLatencyMs.collectAsState()
    val lastLoadSource by PlayerManager.lastLoadSource.collectAsState()
    val selectedTerminal by AudioOutputManager.selectedTerminal.collectAsState()
    val bitPerfectEnabled by AudioOutputManager.bitPerfectEnabled.collectAsState()
    val selectedGain by AudioOutputManager.selectedGain.collectAsState()
    val activeHardwareSummary by AudioOutputManager.activeHardwareSummary.collectAsState()

    val track = currentTrack ?: return

    var isSpectrumMode by remember { mutableStateOf(false) }
    var activeTab by remember { mutableStateOf(PlayerInspectorTab.UP_NEXT) }
    var showCompactInspectorSheet by remember { mutableStateOf(false) }
    var showSignalPathSheet by remember { mutableStateOf(false) }
    var showOutputSheet by remember { mutableStateOf(false) }
    var showPlaylistPicker by remember { mutableStateOf(false) }

    var lyricsData by remember(track.id) { mutableStateOf<SyncedLyricsResponse?>(null) }
    var isLoadingLyrics by remember(track.id) { mutableStateOf(false) }
    var relatedTracks by remember(track.id) { mutableStateOf<List<Track>>(emptyList()) }
    var isLoadingRelated by remember(track.id) { mutableStateOf(false) }

    var localPlaylists by remember { mutableStateOf(loadLocalPlaylists(context)) }
    var quickPlaylistName by remember { mutableStateOf("") }

    LaunchedEffect(track.id) {
        isLoadingLyrics = true
        musicRepo.getLyrics(track.id, track.title, track.artist).onSuccess {
            lyricsData = it
        }
        isLoadingLyrics = false

        isLoadingRelated = true
        musicRepo.getRecommendations(track.id, track.artist, track.title).onSuccess {
            relatedTracks = it
        }
        isLoadingRelated = false
    }

    val safeDuration = durationMs.coerceAtLeast(track.duration * 1000L).coerceAtLeast(1L)
    var sliderDragFraction by remember(track.id) { mutableStateOf<Float?>(null) }
    val progressFraction = sliderDragFraction
        ?: (positionMs.toFloat() / safeDuration.toFloat()).coerceIn(0f, 1f)

    val isLiked = likedIds.contains(track.id)
    val isDownloaded = downloadedIds.contains(track.id)
    val dlProg = downloadProgress[track.id]

    val signalPillText = remember(track, liveSignalPath) {
        val sp = liveSignalPath
        val fmt = (sp?.format ?: track.format ?: "FLAC").uppercase()
        val bd = sp?.bitDepth ?: track.bitDepth
        val sr = sp?.sampleRate ?: track.sampleRate
        val khz = sr?.let {
            if (it % 1000 == 0) "${it / 1000}kHz"
            else String.format(Locale.US, "%.1fkHz", it / 1000f)
        }
        buildString {
            append(if (track.isMaxQuality || sp?.isDsd == true) "MAX" else "LOSSLESS")
            if (bd != null && khz != null) {
                append(" • ${bd}-BIT/$khz $fmt")
            } else {
                append(" • $fmt")
            }
        }
    }

    fun startRadioSeed() {
        scope.launch {
            Toast.makeText(context, "Building Hi-Res radio for '${track.title}'...", Toast.LENGTH_SHORT).show()
            musicRepo.getRecommendations(track.id, track.artist, track.title)
                .onSuccess { recs ->
                    relatedTracks = recs
                    if (recs.isNotEmpty()) {
                        val radioQueue = (listOf(track) + recs).distinctBy { it.id }
                        PlayerManager.playTrack(radioQueue.first(), radioQueue)
                        Toast.makeText(context, "Radio queued (${radioQueue.size} tracks)", Toast.LENGTH_SHORT).show()
                    }
                }
        }
    }

    val coverModel = remember(track.coverUrl) { RetrofitClient.resolveCoverUrl(track.coverUrl) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(TidalPureBlack)
    ) {
        // Atmospheric blurred album artwork wash
        if (coverModel.isNotBlank()) {
            AsyncImage(
                model = coverModel,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxSize()
                    .blur(64.dp)
            )
        }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(
                            Color(0xD8040B0F),
                            Color(0xE805080B),
                            Color(0xFA000000)
                        )
                    )
                )
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
        ) {
            // Top Bar (shared across all layouts)
            PlayerTopBar(
                isSpectrumMode = isSpectrumMode,
                signalPillText = signalPillText,
                isMaxSignal = track.isMaxQuality || (liveSignalPath?.isDsd == true),
                onToggleMode = { isSpectrumMode = it },
                onSignalPillClick = { showSignalPathSheet = true },
                onDismiss = onDismiss
            )

            when {
                // 1) FOLDABLE TABLETOP FLEX POSTURE (split at physical horizontal hinge)
                windowState.isTabletop -> {
                    val topPaneHeight = (windowState.hingeTopDp - 56f).coerceAtLeast(180f).dp
                    val hingeGap = windowState.hingeHeightDp.coerceAtLeast(12f).dp

                    // Upper screen pane above the physical hinge
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(topPaneHeight)
                            .padding(horizontal = 24.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(24.dp)
                    ) {
                        ArtworkOrSpectrumStage(
                            coverUrl = coverModel,
                            title = track.title,
                            isSpectrumMode = isSpectrumMode,
                            isPlaying = isPlaying,
                            progressFraction = progressFraction,
                            waveformBars = waveformBars,
                            modifier = Modifier
                                .fillMaxHeight()
                                .aspectRatio(1f)
                        )
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.Center
                        ) {
                            QualityBadgePill(text = track.qualityBadge, isMax = track.isMaxQuality)
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = track.title,
                                fontSize = 22.sp,
                                fontWeight = FontWeight.Bold,
                                color = TidalPureWhite,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = track.artist,
                                fontSize = 15.sp,
                                color = TidalGrey04,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = track.audioSpecLine,
                                fontSize = 12.sp,
                                color = TidalCyanAccent,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(hingeGap))

                    // Lower screen pane below the physical hinge
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
                            .padding(horizontal = 24.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(20.dp)
                    ) {
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight(),
                            verticalArrangement = Arrangement.SpaceEvenly
                        ) {
                            PlayerSeekSection(
                                progressFraction = progressFraction,
                                displayPosMs = if (sliderDragFraction != null) {
                                    (sliderDragFraction!! * safeDuration).toLong()
                                } else positionMs,
                                durationMs = safeDuration,
                                latencyMs = lastLoadLatencyMs,
                                sourceTag = lastLoadSource,
                                onScrub = { sliderDragFraction = it },
                                onCommit = { frac ->
                                    PlayerManager.seekTo((frac * safeDuration).toLong())
                                    sliderDragFraction = null
                                }
                            )
                            PlayerTransportRow(
                                isPlaying = isPlaying,
                                isBuffering = isBuffering,
                                isShuffle = isShuffle,
                                isRepeat = isRepeat,
                                playButtonSize = 62.dp,
                                onShuffle = { PlayerManager.toggleShuffle() },
                                onPrevious = { PlayerManager.playPrevious() },
                                onTogglePlay = { PlayerManager.togglePlayPause() },
                                onNext = { PlayerManager.playNext() },
                                onRepeat = { PlayerManager.toggleRepeat() }
                            )
                            PlayerActionsCarousel(
                                track = track,
                                outputBadge = selectedTerminal.shortBadge,
                                isLiked = isLiked,
                                isDownloaded = isDownloaded,
                                downloadProgress = dlProg,
                                onOutputClick = { showOutputSheet = true },
                                onLike = { PlayerManager.toggleLike(track.id) },
                                onDislike = {
                                    Toast.makeText(context, "Skipped track", Toast.LENGTH_SHORT).show()
                                    PlayerManager.playNext()
                                },
                                onLyrics = { activeTab = PlayerInspectorTab.LYRICS },
                                onSave = {
                                    localPlaylists = loadLocalPlaylists(context)
                                    showPlaylistPicker = true
                                },
                                onDownload = { PlayerManager.toggleDownload(context, track) },
                                onNasVault = { PlayerManager.queueToNas(context, track, musicRepo) },
                                onRadio = { startRadioSeed() },
                                onShare = { shareTrackIntent(context, track) }
                            )
                        }

                        PlayerInspectorPanel(
                            activeTab = activeTab,
                            onSelectTab = { activeTab = it },
                            track = track,
                            queue = queue,
                            queueIndex = queueIndex,
                            likedIds = likedIds,
                            lyricsData = lyricsData,
                            isLoadingLyrics = isLoadingLyrics,
                            positionMs = positionMs,
                            relatedTracks = relatedTracks,
                            isLoadingRelated = isLoadingRelated,
                            liveSignalPath = liveSignalPath,
                            latencyMs = lastLoadLatencyMs,
                            selectedTerminal = selectedTerminal,
                            selectedGain = selectedGain,
                            bitPerfectEnabled = bitPerfectEnabled,
                            activeHardwareSummary = activeHardwareSummary,
                            onOpenOutputSheet = { showOutputSheet = true },
                            onSeekToMs = { PlayerManager.seekTo(it) },
                            onSelectQueueTrack = { t -> PlayerManager.playTrack(t, queue) },
                            onSelectRelatedTrack = { t ->
                                val nextQueue = (listOf(t) + relatedTracks).distinctBy { it.id }
                                PlayerManager.playTrack(t, nextQueue)
                            },
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight()
                        )
                    }
                }

                // 2) WIDE FOLDABLE / BOOK POSTURE / TABLET 2-PANE STUDIO SPLIT
                windowState.isTwoPanePlayer -> {
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
                            .padding(horizontal = 24.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(24.dp)
                    ) {
                        Column(
                            modifier = Modifier
                                .weight(0.47f)
                                .fillMaxHeight()
                                .verticalScroll(rememberScrollState()),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.SpaceBetween
                        ) {
                            Box(
                                modifier = Modifier
                                    .weight(1f, fill = false)
                                    .fillMaxWidth()
                                    .heightIn(min = 160.dp, max = 360.dp)
                                    .padding(vertical = 8.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                ArtworkOrSpectrumStage(
                                    coverUrl = coverModel,
                                    title = track.title,
                                    isSpectrumMode = isSpectrumMode,
                                    isPlaying = isPlaying,
                                    progressFraction = progressFraction,
                                    waveformBars = waveformBars,
                                    modifier = Modifier
                                        .fillMaxHeight()
                                        .widthIn(max = 360.dp)
                                        .aspectRatio(1f)
                                )
                            }

                            TrackMetaSection(
                                track = track,
                                modifier = Modifier.fillMaxWidth()
                            )

                            Spacer(modifier = Modifier.height(10.dp))

                            PlayerActionsCarousel(
                                track = track,
                                outputBadge = selectedTerminal.shortBadge,
                                isLiked = isLiked,
                                isDownloaded = isDownloaded,
                                downloadProgress = dlProg,
                                onOutputClick = { showOutputSheet = true },
                                onLike = { PlayerManager.toggleLike(track.id) },
                                onDislike = {
                                    Toast.makeText(context, "Skipped track", Toast.LENGTH_SHORT).show()
                                    PlayerManager.playNext()
                                },
                                onLyrics = { activeTab = PlayerInspectorTab.LYRICS },
                                onSave = {
                                    localPlaylists = loadLocalPlaylists(context)
                                    showPlaylistPicker = true
                                },
                                onDownload = { PlayerManager.toggleDownload(context, track) },
                                onNasVault = { PlayerManager.queueToNas(context, track, musicRepo) },
                                onRadio = { startRadioSeed() },
                                onShare = { shareTrackIntent(context, track) }
                            )

                            Spacer(modifier = Modifier.height(8.dp))

                            PlayerSeekSection(
                                progressFraction = progressFraction,
                                displayPosMs = if (sliderDragFraction != null) {
                                    (sliderDragFraction!! * safeDuration).toLong()
                                } else positionMs,
                                durationMs = safeDuration,
                                latencyMs = lastLoadLatencyMs,
                                sourceTag = lastLoadSource,
                                onScrub = { sliderDragFraction = it },
                                onCommit = { frac ->
                                    PlayerManager.seekTo((frac * safeDuration).toLong())
                                    sliderDragFraction = null
                                }
                            )

                            PlayerTransportRow(
                                isPlaying = isPlaying,
                                isBuffering = isBuffering,
                                isShuffle = isShuffle,
                                isRepeat = isRepeat,
                                playButtonSize = 68.dp,
                                onShuffle = { PlayerManager.toggleShuffle() },
                                onPrevious = { PlayerManager.playPrevious() },
                                onTogglePlay = { PlayerManager.togglePlayPause() },
                                onNext = { PlayerManager.playNext() },
                                onRepeat = { PlayerManager.toggleRepeat() }
                            )
                        }

                        PlayerInspectorPanel(
                            activeTab = activeTab,
                            onSelectTab = { activeTab = it },
                            track = track,
                            queue = queue,
                            queueIndex = queueIndex,
                            likedIds = likedIds,
                            lyricsData = lyricsData,
                            isLoadingLyrics = isLoadingLyrics,
                            positionMs = positionMs,
                            relatedTracks = relatedTracks,
                            isLoadingRelated = isLoadingRelated,
                            liveSignalPath = liveSignalPath,
                            latencyMs = lastLoadLatencyMs,
                            selectedTerminal = selectedTerminal,
                            selectedGain = selectedGain,
                            bitPerfectEnabled = bitPerfectEnabled,
                            activeHardwareSummary = activeHardwareSummary,
                            onOpenOutputSheet = { showOutputSheet = true },
                            onSeekToMs = { PlayerManager.seekTo(it) },
                            onSelectQueueTrack = { t -> PlayerManager.playTrack(t, queue) },
                            onSelectRelatedTrack = { t ->
                                val nextQueue = (listOf(t) + relatedTracks).distinctBy { it.id }
                                PlayerManager.playTrack(t, nextQueue)
                            },
                            modifier = Modifier
                                .weight(0.53f)
                                .fillMaxHeight()
                        )
                    }
                }

                // 3) COMPACT PHONE VERTICAL LAYOUT (KV-Music Watch Page rhythm)
                else -> {
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
                            .padding(horizontal = 22.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.SpaceBetween
                    ) {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth()
                                .padding(vertical = 10.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            ArtworkOrSpectrumStage(
                                coverUrl = coverModel,
                                title = track.title,
                                isSpectrumMode = isSpectrumMode,
                                isPlaying = isPlaying,
                                progressFraction = progressFraction,
                                waveformBars = waveformBars,
                                modifier = Modifier
                                    .fillMaxWidth(0.92f)
                                    .aspectRatio(1f)
                            )
                        }

                        TrackMetaSection(
                            track = track,
                            modifier = Modifier.fillMaxWidth()
                        )

                        Spacer(modifier = Modifier.height(14.dp))

                        PlayerActionsCarousel(
                            track = track,
                            outputBadge = selectedTerminal.shortBadge,
                            isLiked = isLiked,
                            isDownloaded = isDownloaded,
                            downloadProgress = dlProg,
                            onOutputClick = { showOutputSheet = true },
                            onLike = { PlayerManager.toggleLike(track.id) },
                            onDislike = {
                                Toast.makeText(context, "Skipped track", Toast.LENGTH_SHORT).show()
                                PlayerManager.playNext()
                            },
                            onLyrics = {
                                activeTab = PlayerInspectorTab.LYRICS
                                showCompactInspectorSheet = true
                            },
                            onSave = {
                                localPlaylists = loadLocalPlaylists(context)
                                showPlaylistPicker = true
                            },
                            onDownload = { PlayerManager.toggleDownload(context, track) },
                            onNasVault = { PlayerManager.queueToNas(context, track, musicRepo) },
                            onRadio = { startRadioSeed() },
                            onShare = { shareTrackIntent(context, track) }
                        )

                        Spacer(modifier = Modifier.height(10.dp))

                        PlayerSeekSection(
                            progressFraction = progressFraction,
                            displayPosMs = if (sliderDragFraction != null) {
                                (sliderDragFraction!! * safeDuration).toLong()
                            } else positionMs,
                            durationMs = safeDuration,
                            latencyMs = lastLoadLatencyMs,
                            sourceTag = lastLoadSource,
                            onScrub = { sliderDragFraction = it },
                            onCommit = { frac ->
                                PlayerManager.seekTo((frac * safeDuration).toLong())
                                sliderDragFraction = null
                            }
                        )

                        Spacer(modifier = Modifier.height(6.dp))

                        PlayerTransportRow(
                            isPlaying = isPlaying,
                            isBuffering = isBuffering,
                            isShuffle = isShuffle,
                            isRepeat = isRepeat,
                            playButtonSize = 72.dp,
                            onShuffle = { PlayerManager.toggleShuffle() },
                            onPrevious = { PlayerManager.playPrevious() },
                            onTogglePlay = { PlayerManager.togglePlayPause() },
                            onNext = { PlayerManager.playNext() },
                            onRepeat = { PlayerManager.toggleRepeat() }
                        )

                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    // Bottom Docked 3-Tab Switcher on Compact Phones
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = TidalCard,
                        shape = RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp),
                        border = BorderStroke(0.6.dp, TidalWhite10)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 14.dp),
                            horizontalArrangement = Arrangement.SpaceEvenly
                        ) {
                            listOf(
                                PlayerInspectorTab.UP_NEXT,
                                PlayerInspectorTab.LYRICS,
                                PlayerInspectorTab.RELATED
                            ).forEach { tab ->
                                Text(
                                    text = tab.label,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 0.8.sp,
                                    color = TidalGrey04,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .clickable {
                                            activeTab = tab
                                            showCompactInspectorSheet = true
                                        }
                                        .padding(horizontal = 14.dp, vertical = 4.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // Compact Phone Expandable Queue / Lyrics / Related Sheet
    if (showCompactInspectorSheet) {
        ModalBottomSheet(
            onDismissRequest = { showCompactInspectorSheet = false },
            containerColor = TidalGrey13,
            contentColor = TidalPureWhite,
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight(0.74f)
                    .padding(horizontal = 8.dp)
            ) {
                PlayerInspectorPanel(
                    activeTab = activeTab,
                    onSelectTab = { activeTab = it },
                    track = track,
                    queue = queue,
                    queueIndex = queueIndex,
                    likedIds = likedIds,
                    lyricsData = lyricsData,
                    isLoadingLyrics = isLoadingLyrics,
                    positionMs = positionMs,
                    relatedTracks = relatedTracks,
                    isLoadingRelated = isLoadingRelated,
                    liveSignalPath = liveSignalPath,
                    latencyMs = lastLoadLatencyMs,
                    selectedTerminal = selectedTerminal,
                    selectedGain = selectedGain,
                    bitPerfectEnabled = bitPerfectEnabled,
                    activeHardwareSummary = activeHardwareSummary,
                    onOpenOutputSheet = {
                        showCompactInspectorSheet = false
                        showOutputSheet = true
                    },
                    onSeekToMs = { PlayerManager.seekTo(it) },
                    onSelectQueueTrack = { t -> PlayerManager.playTrack(t, queue) },
                    onSelectRelatedTrack = { t ->
                        val nextQueue = (listOf(t) + relatedTracks).distinctBy { it.id }
                        PlayerManager.playTrack(t, nextQueue)
                    },
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
    }

    // Interactive Signal Path Inspector Modal Sheet
    if (showSignalPathSheet) {
        ModalBottomSheet(
            onDismissRequest = { showSignalPathSheet = false },
            containerColor = TidalGrey13,
            contentColor = TidalPureWhite
        ) {
            SignalPathInspectorContent(
                track = track,
                signalPath = liveSignalPath,
                latencyMs = lastLoadLatencyMs,
                selectedTerminal = selectedTerminal,
                selectedGain = selectedGain,
                bitPerfectEnabled = bitPerfectEnabled,
                activeHardwareSummary = activeHardwareSummary,
                onOpenOutputSheet = {
                    showSignalPathSheet = false
                    showOutputSheet = true
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp)
                    .padding(bottom = 24.dp)
            )
        }
    }

    if (showOutputSheet) {
        OutputDeviceSheet(
            musicRepo = musicRepo,
            onDismiss = { showOutputSheet = false }
        )
    }

    // Save to Playlist Sheet
    if (showPlaylistPicker) {
        ModalBottomSheet(
            onDismissRequest = { showPlaylistPicker = false },
            containerColor = TidalGrey13,
            contentColor = TidalPureWhite
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 8.dp)
                    .padding(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "Save to Playlist",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = TidalPureWhite
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedTextField(
                        value = quickPlaylistName,
                        onValueChange = { quickPlaylistName = it },
                        placeholder = { Text("New playlist name...", color = TidalGrey06) },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = TidalCyan,
                            unfocusedBorderColor = TidalWhite20,
                            focusedTextColor = TidalPureWhite,
                            unfocusedTextColor = TidalPureWhite,
                            cursorColor = TidalCyan
                        ),
                        modifier = Modifier.weight(1f)
                    )
                    Button(
                        onClick = {
                            val clean = quickPlaylistName.trim()
                            if (clean.isNotEmpty()) {
                                val updated = saveNewLocalPlaylist(context, clean)
                                updated.firstOrNull()?.let { created ->
                                    addTrackToLocalPlaylist(context, created.id, track.id)
                                }
                                localPlaylists = loadLocalPlaylists(context)
                                quickPlaylistName = ""
                                showPlaylistPicker = false
                                Toast.makeText(context, "Added to '$clean'", Toast.LENGTH_SHORT).show()
                            }
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = TidalCyan,
                            contentColor = TidalPureBlack
                        )
                    ) {
                        Text("Add", fontWeight = FontWeight.Bold)
                    }
                }

                localPlaylists.forEach { pl ->
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = TidalCard,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .clickable {
                                addTrackToLocalPlaylist(context, pl.id, track.id)
                                showPlaylistPicker = false
                                Toast.makeText(context, "Added '${track.title}' to '${pl.name}'", Toast.LENGTH_SHORT).show()
                            }
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(pl.name, color = TidalPureWhite, fontWeight = FontWeight.SemiBold)
                            Text("${pl.trackIds.size} tracks", color = TidalGrey05, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PlayerTopBar(
    isSpectrumMode: Boolean,
    signalPillText: String,
    isMaxSignal: Boolean,
    onToggleMode: (Boolean) -> Unit,
    onSignalPillClick: () -> Unit,
    onDismiss: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        IconButton(onClick = onDismiss) {
            Icon(
                imageVector = YtmIcons.ChevronDown24,
                contentDescription = "Minimize player",
                tint = TidalPureWhite,
                modifier = Modifier.size(26.dp)
            )
        }

        // Segmented Audio / Spectrum Switcher
        Surface(
            shape = CircleShape,
            color = TidalCardHover,
            border = BorderStroke(0.8.dp, TidalWhite15)
        ) {
            Row(modifier = Modifier.padding(3.dp)) {
                listOf(false to "Audio", true to "Spectrum").forEach { (spectrum, label) ->
                    val selected = isSpectrumMode == spectrum
                    Surface(
                        shape = CircleShape,
                        color = if (selected) TidalWhite15 else Color.Transparent,
                        modifier = Modifier
                            .clip(CircleShape)
                            .clickable { onToggleMode(spectrum) }
                    ) {
                        Text(
                            text = label,
                            fontSize = 12.sp,
                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                            color = if (selected) TidalPureWhite else TidalGrey05,
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 5.dp)
                        )
                    }
                }
            }
        }

        // Interactive Signal Path Pill
        val fg = if (isMaxSignal) TidalMaxGold else TidalCyan
        val bg = if (isMaxSignal) TidalMaxGoldDim else TidalCyanDim
        Surface(
            shape = CircleShape,
            color = bg,
            border = BorderStroke(0.8.dp, fg.copy(alpha = 0.5f)),
            modifier = Modifier
                .clip(CircleShape)
                .clickable { onSignalPillClick() }
        ) {
            Text(
                text = signalPillText,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                color = fg,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
            )
        }
    }
}

@Composable
private fun ArtworkOrSpectrumStage(
    coverUrl: String,
    title: String,
    isSpectrumMode: Boolean,
    isPlaying: Boolean,
    progressFraction: Float,
    waveformBars: List<Float>,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, TidalCyanAccent.copy(alpha = 0.25f), RoundedCornerShape(16.dp)),
        shape = RoundedCornerShape(16.dp),
        color = TidalCard
    ) {
        if (!isSpectrumMode) {
            AsyncImage(
                model = coverUrl,
                contentDescription = title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        } else {
            val infiniteTransition = rememberInfiniteTransition(label = "spectrum")
            val phase by infiniteTransition.animateFloat(
                initialValue = 0f,
                targetValue = (Math.PI * 2.0).toFloat(),
                animationSpec = infiniteRepeatable(
                    animation = tween(durationMillis = 1600, easing = LinearEasing),
                    repeatMode = RepeatMode.Restart
                ),
                label = "phase"
            )

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.radialGradient(
                            colors = listOf(Color(0xFF0A242D), TidalPureBlack)
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Canvas(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 18.dp, vertical = 28.dp)
                ) {
                    val bars = waveformBars.ifEmpty { List(56) { 0.45f } }
                    val count = bars.size
                    val slotW = size.width / count
                    val barW = (slotW * 0.62f).coerceAtLeast(3f)
                    val centerY = size.height / 2f

                    for (i in 0 until count) {
                        val base = bars[i]
                        val pulse = if (isPlaying) {
                            (0.65f + 0.35f * sin(phase + i * 0.42f))
                        } else 0.45f
                        val h = (size.height * 0.88f * base * pulse).coerceAtLeast(8f)
                        val frac = i.toFloat() / count
                        val barColor = if (frac <= progressFraction) TidalCyan else TidalCyanAccent.copy(alpha = 0.35f)
                        drawRoundRect(
                            color = barColor,
                            topLeft = Offset(i * slotW + (slotW - barW) / 2f, centerY - h / 2f),
                            size = Size(barW, h),
                            cornerRadius = CornerRadius(barW / 2f, barW / 2f)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TrackMetaSection(
    track: Track,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        Text(
            text = track.title,
            fontSize = 21.sp,
            fontWeight = FontWeight.Bold,
            color = TidalPureWhite,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Spacer(modifier = Modifier.height(3.dp))
        Text(
            text = buildString {
                append(track.artist.ifBlank { "Unknown Artist" })
                if (track.album.isNotBlank()) append(" • ${track.album}")
            },
            fontSize = 14.sp,
            color = TidalGrey04,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun PlayerActionsCarousel(
    track: Track,
    outputBadge: String,
    isLiked: Boolean,
    isDownloaded: Boolean,
    downloadProgress: Float?,
    onOutputClick: () -> Unit,
    onLike: () -> Unit,
    onDislike: () -> Unit,
    onLyrics: () -> Unit,
    onSave: () -> Unit,
    onDownload: () -> Unit,
    onNasVault: () -> Unit,
    onRadio: () -> Unit,
    onShare: () -> Unit
) {
    LazyRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item {
            ActionPillButton(
                label = outputBadge,
                icon = YtmIcons.Headset24,
                highlighted = true,
                onClick = onOutputClick
            )
        }
        item {
            ActionPillButton(
                label = if (isLiked) "Liked" else "Like",
                icon = if (isLiked) YtmIcons.ThumbUpFilled else YtmIcons.ThumbUpOutline,
                highlighted = isLiked,
                onClick = onLike
            )
        }
        item {
            ActionPillButton(
                label = "Skip",
                icon = YtmIcons.ThumbDownOutline,
                onClick = onDislike
            )
        }
        item {
            ActionPillButton(
                label = "Lyrics",
                icon = YtmIcons.LyricsBubble24,
                onClick = onLyrics
            )
        }
        item {
            ActionPillButton(
                label = "Save",
                icon = YtmIcons.PlaylistAdd24,
                onClick = onSave
            )
        }
        item {
            val dlLabel = when {
                downloadProgress != null -> "${(downloadProgress * 100).toInt()}%"
                isDownloaded -> "Saved"
                else -> "Download"
            }
            ActionPillButton(
                label = dlLabel,
                icon = if (isDownloaded) YtmIcons.Downloaded24 else YtmIcons.Download24,
                highlighted = isDownloaded,
                onClick = onDownload
            )
        }
        item {
            ActionPillButton(
                label = "NAS Vault",
                icon = YtmIcons.Album24,
                onClick = onNasVault
            )
        }
        item {
            ActionPillButton(
                label = "Radio",
                icon = YtmIcons.RadioLive24,
                onClick = onRadio
            )
        }
        item {
            ActionPillButton(
                label = "Share",
                icon = YtmIcons.Share24,
                onClick = onShare
            )
        }
    }
}

@Composable
private fun ActionPillButton(
    label: String,
    icon: ImageVector,
    highlighted: Boolean = false,
    onClick: () -> Unit
) {
    Surface(
        shape = CircleShape,
        color = if (highlighted) TidalCyanDim else TidalWhite10,
        border = BorderStroke(
            0.8.dp,
            if (highlighted) TidalCyanAccent else TidalWhite15
        ),
        modifier = Modifier
            .height(36.dp)
            .clip(CircleShape)
            .clickable { onClick() }
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 13.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = if (highlighted) TidalCyan else TidalPureWhite,
                modifier = Modifier.size(16.dp)
            )
            Text(
                text = label,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = if (highlighted) TidalCyan else TidalPureWhite
            )
        }
    }
}

@Composable
private fun PlayerSeekSection(
    progressFraction: Float,
    displayPosMs: Long,
    durationMs: Long,
    latencyMs: Long?,
    sourceTag: String?,
    onScrub: (Float) -> Unit,
    onCommit: (Float) -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Slider(
            value = progressFraction.coerceIn(0f, 1f),
            onValueChange = { onScrub(it) },
            onValueChangeFinished = { onCommit(progressFraction) },
            colors = SliderDefaults.colors(
                thumbColor = TidalPureWhite,
                activeTrackColor = TidalCyan,
                inactiveTrackColor = TidalWhite20
            ),
            modifier = Modifier.fillMaxWidth()
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .offset(y = (-6).dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = formatMillis(displayPosMs),
                fontSize = 11.sp,
                color = TidalGrey04
            )
            if (latencyMs != null || !sourceTag.isNullOrBlank()) {
                Text(
                    text = buildString {
                        if (!sourceTag.isNullOrBlank()) append(sourceTag)
                        if (latencyMs != null) {
                            if (isNotEmpty()) append(" • ")
                            append("${latencyMs}ms")
                        }
                    },
                    fontSize = 10.sp,
                    color = TidalCyanAccent,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Text(
                text = formatMillis(durationMs),
                fontSize = 11.sp,
                color = TidalGrey04
            )
        }
    }
}

@Composable
private fun PlayerTransportRow(
    isPlaying: Boolean,
    isBuffering: Boolean,
    isShuffle: Boolean,
    isRepeat: Boolean,
    playButtonSize: Dp,
    onShuffle: () -> Unit,
    onPrevious: () -> Unit,
    onTogglePlay: () -> Unit,
    onNext: () -> Unit,
    onRepeat: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onShuffle) {
            Icon(
                imageVector = YtmIcons.Shuffle24,
                contentDescription = "Shuffle",
                tint = if (isShuffle) TidalCyan else TidalGrey04,
                modifier = Modifier.size(22.dp)
            )
        }
        IconButton(onClick = onPrevious, modifier = Modifier.size(48.dp)) {
            Icon(
                imageVector = YtmIcons.SkipPrevious36,
                contentDescription = "Previous",
                tint = TidalPureWhite,
                modifier = Modifier.size(32.dp)
            )
        }
        Surface(
            shape = CircleShape,
            color = TidalCyan,
            modifier = Modifier
                .size(playButtonSize)
                .clip(CircleShape)
                .clickable { onTogglePlay() }
        ) {
            Box(contentAlignment = Alignment.Center) {
                if (isBuffering) {
                    CircularProgressIndicator(
                        color = TidalPureBlack,
                        strokeWidth = 2.5.dp,
                        modifier = Modifier.size(playButtonSize - 10.dp)
                    )
                }
                Icon(
                    imageVector = if (isPlaying) YtmIcons.Pause36 else YtmIcons.Play36,
                    contentDescription = if (isPlaying) "Pause" else "Play",
                    tint = TidalPureBlack,
                    modifier = Modifier.size(34.dp)
                )
            }
        }
        IconButton(onClick = onNext, modifier = Modifier.size(48.dp)) {
            Icon(
                imageVector = YtmIcons.SkipNext36,
                contentDescription = "Next",
                tint = TidalPureWhite,
                modifier = Modifier.size(32.dp)
            )
        }
        IconButton(onClick = onRepeat) {
            Icon(
                imageVector = if (isRepeat) YtmIcons.RepeatOne24 else YtmIcons.Repeat24,
                contentDescription = "Repeat",
                tint = if (isRepeat) TidalCyan else TidalGrey04,
                modifier = Modifier.size(22.dp)
            )
        }
    }
}

@Composable
private fun PlayerInspectorPanel(
    activeTab: PlayerInspectorTab,
    onSelectTab: (PlayerInspectorTab) -> Unit,
    track: Track,
    queue: List<Track>,
    queueIndex: Int,
    likedIds: Set<String>,
    lyricsData: SyncedLyricsResponse?,
    isLoadingLyrics: Boolean,
    positionMs: Long,
    relatedTracks: List<Track>,
    isLoadingRelated: Boolean,
    liveSignalPath: LiveSignalPathInfo?,
    latencyMs: Long?,
    selectedTerminal: OutputTerminal,
    selectedGain: GainStage,
    bitPerfectEnabled: Boolean,
    activeHardwareSummary: String,
    onOpenOutputSheet: () -> Unit,
    onSeekToMs: (Long) -> Unit,
    onSelectQueueTrack: (Track) -> Unit,
    onSelectRelatedTrack: (Track) -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        color = TidalSurface.copy(alpha = 0.85f),
        border = BorderStroke(0.8.dp, TidalWhite15)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Tab Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(TidalCard)
                    .padding(horizontal = 8.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                PlayerInspectorTab.entries.forEach { tab ->
                    val selected = activeTab == tab
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { onSelectTab(tab) }
                            .padding(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = tab.label,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.6.sp,
                            color = if (selected) TidalCyan else TidalGrey05
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Box(
                            modifier = Modifier
                                .width(28.dp)
                                .height(2.dp)
                                .background(if (selected) TidalCyan else Color.Transparent)
                        )
                    }
                }
            }

            when (activeTab) {
                PlayerInspectorTab.UP_NEXT -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(vertical = 6.dp)
                    ) {
                        itemsIndexed(queue, key = { idx, t -> "q_${idx}_${t.id}" }) { idx, item ->
                            val isCurrent = idx == queueIndex || item.id == track.id
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(if (isCurrent) TidalCyanDim else Color.Transparent)
                            ) {
                                TrackListItem(
                                    track = item,
                                    rankNumber = idx + 1,
                                    isLiked = likedIds.contains(item.id),
                                    onTrackClick = { onSelectQueueTrack(item) },
                                    queue = queue
                                )
                            }
                        }
                    }
                }

                PlayerInspectorTab.LYRICS -> {
                    LyricsTabContent(
                        lyricsData = lyricsData,
                        isLoading = isLoadingLyrics,
                        positionMs = positionMs,
                        onLineClick = onSeekToMs
                    )
                }

                PlayerInspectorTab.RELATED -> {
                    if (isLoadingRelated && relatedTracks.isEmpty()) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = TidalCyan)
                        }
                    } else if (relatedTracks.isEmpty()) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text(
                                text = "Tap Radio above to discover similar Hi-Res tracks",
                                color = TidalGrey05,
                                fontSize = 13.sp,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.padding(24.dp)
                            )
                        }
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(vertical = 6.dp)
                        ) {
                            itemsIndexed(relatedTracks, key = { idx, t -> "rel_${idx}_${t.id}" }) { _, item ->
                                TrackListItem(
                                    track = item,
                                    isLiked = likedIds.contains(item.id),
                                    onTrackClick = { onSelectRelatedTrack(item) },
                                    queue = relatedTracks
                                )
                            }
                        }
                    }
                }

                PlayerInspectorTab.SIGNAL_PATH -> {
                    SignalPathInspectorContent(
                        track = track,
                        signalPath = liveSignalPath,
                        latencyMs = latencyMs,
                        selectedTerminal = selectedTerminal,
                        selectedGain = selectedGain,
                        bitPerfectEnabled = bitPerfectEnabled,
                        activeHardwareSummary = activeHardwareSummary,
                        onOpenOutputSheet = onOpenOutputSheet,
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(18.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun LyricsTabContent(
    lyricsData: SyncedLyricsResponse?,
    isLoading: Boolean,
    positionMs: Long,
    onLineClick: (Long) -> Unit
) {
    if (isLoading && lyricsData == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = TidalCyan)
        }
        return
    }
    val lines = lyricsData?.lyrics.orEmpty()
    if (lines.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                text = "Lyrics not available for this track yet",
                color = TidalGrey05,
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(24.dp)
            )
        }
        return
    }

    val posSec = positionMs / 1000.0
    val activeIdx = remember(posSec, lines) {
        lines.indexOfLast { it.time <= posSec }
    }
    val listState = rememberLazyListState()

    LaunchedEffect(activeIdx) {
        if (activeIdx >= 0 && lyricsData?.synced == true) {
            listState.animateScrollToItem((activeIdx - 2).coerceAtLeast(0))
        }
    }

    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        itemsIndexed(lines) { idx, line ->
            val isCurrent = lyricsData?.synced == true && idx == activeIdx
            Text(
                text = line.text,
                fontSize = if (isCurrent) 20.sp else 16.sp,
                lineHeight = if (isCurrent) 28.sp else 23.sp,
                fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Medium,
                color = if (isCurrent) TidalCyan else TidalWhite67,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(enabled = lyricsData?.synced == true) {
                        onLineClick((line.time * 1000.0).toLong())
                    }
                    .padding(vertical = 2.dp)
            )
        }
    }
}

@Composable
private fun SignalPathInspectorContent(
    track: Track,
    signalPath: LiveSignalPathInfo?,
    latencyMs: Long?,
    selectedTerminal: OutputTerminal,
    selectedGain: GainStage,
    bitPerfectEnabled: Boolean,
    activeHardwareSummary: String,
    onOpenOutputSheet: () -> Unit,
    modifier: Modifier = Modifier
) {
    val fmt = (signalPath?.format ?: track.format ?: "FLAC").uppercase()
    val bd = signalPath?.bitDepth ?: track.bitDepth ?: 16
    val sr = signalPath?.sampleRate ?: track.sampleRate ?: 44100
    val dr = signalPath?.drScore ?: track.drScore
    val src = signalPath?.source ?: track.source
    val isDsd = signalPath?.isDsd ?: track.isDsd
    val isBluetoothSafeActive by AudioOutputManager.isBluetoothSafePcmActive.collectAsState()

    Column(
        modifier = modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(if (track.isMaxQuality || isDsd) TidalMaxGold else TidalCyan)
            )
            Text(
                text = "Studio Signal Path Inspector",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = TidalPureWhite
            )
        }

        SignalStageCard(
            stage = "1. Master Source",
            detail = "${src.uppercase()} • $fmt ${if (isDsd) "1-bit DSD" else "${bd}-bit / ${sr / 1000f}kHz"}${dr?.let { " • DR$it" }.orEmpty()}",
            accent = TidalMaxGold
        )
        SignalStageCard(
            stage = "2. Transport & Cache",
            detail = "${RetrofitClient.getStreamQualityMode()} • HTTP/2 Range + ExoPlayer 250MB SimpleCache${latencyMs?.let { " (${it}ms)" }.orEmpty()}",
            accent = TidalCyan
        )
        SignalStageCard(
            stage = "3. DSP & Volume Stage",
            detail = when {
                isBluetoothSafeActive ->
                    "Bluetooth A2DP Safe 16-bit Integer PCM • -1.4 dB True-Peak Headroom • Spatializer Off • Zero SCO/Float Distortion"
                bitPerfectEnabled || selectedTerminal == OutputTerminal.LINE_OUT_LO ->
                    "Bit-Perfect 32-bit Float • 0.0 dBFS Unity • Zero Playback Scaling"
                else ->
                    "32-bit Float Engine • Gain Stage: ${selectedGain.label} (${selectedGain.vrmsLabel})"
            },
            accent = TidalEmerald
        )
        SignalStageCard(
            stage = "4. Output Terminal & DAC",
            detail = "${selectedTerminal.title} • ${selectedTerminal.voltageSpec}\nRoute: $activeHardwareSummary",
            accent = TidalCyanAccent
        )

        Button(
            onClick = onOpenOutputSheet,
            colors = ButtonDefaults.buttonColors(
                containerColor = TidalCyan,
                contentColor = TidalPureBlack
            ),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = "Switch Output / DAC / LO / 3.5mm / 4.4mm",
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp
            )
        }
    }
}

@Composable
private fun SignalStageCard(
    stage: String,
    detail: String,
    accent: Color
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = TidalCard,
        border = BorderStroke(0.8.dp, accent.copy(alpha = 0.4f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                text = stage,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = accent
            )
            Spacer(modifier = Modifier.height(3.dp))
            Text(
                text = detail,
                fontSize = 13.sp,
                color = TidalPureWhite
            )
        }
    }
}

private fun shareTrackIntent(context: android.content.Context, track: Track) {
    val sendIntent = Intent(Intent.ACTION_SEND).apply {
        putExtra(
            Intent.EXTRA_TEXT,
            "Listening to '${track.title}' by ${track.artist} (${track.audioSpecLine}) on KV Tidal"
        )
        type = "text/plain"
    }
    context.startActivity(Intent.createChooser(sendIntent, "Share Track"))
}

private fun formatMillis(ms: Long): String {
    val totalSec = (ms / 1000L).coerceAtLeast(0L)
    val min = totalSec / 60L
    val sec = totalSec % 60L
    return String.format(Locale.getDefault(), "%d:%02d", min, sec)
}
