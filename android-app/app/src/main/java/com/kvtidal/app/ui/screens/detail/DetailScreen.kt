package com.kvtidal.app.ui.screens.detail

import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
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
import com.kvtidal.app.data.model.Track
import com.kvtidal.app.data.repository.MusicRepository
import com.kvtidal.app.player.PlayerManager
import com.kvtidal.app.ui.adaptive.LocalWindowState
import com.kvtidal.app.ui.components.QualityBadgePill
import com.kvtidal.app.ui.components.TrackListItem
import com.kvtidal.app.ui.components.YtmIcons
import com.kvtidal.app.ui.theme.*

@Composable
fun DetailScreen(
    musicRepo: MusicRepository,
    id: String,
    title: String,
    coverUrl: String,
    subtitle: String,
    type: String,
    initialTracks: List<Track> = emptyList(),
    onBack: () -> Unit,
    onTrackPlay: (Track, List<Track>) -> Unit,
    bottomPadding: Dp = 0.dp
) {
    val context = LocalContext.current
    val windowState = LocalWindowState.current
    val likedIds by PlayerManager.likedTrackIds.collectAsState()

    var tracks by remember(id, title, initialTracks) { mutableStateOf(initialTracks) }
    var isLoading by remember(id, title) { mutableStateOf(initialTracks.isEmpty()) }
    var resolvedCover by remember(id, coverUrl) { mutableStateOf(RetrofitClient.resolveCoverUrl(coverUrl)) }

    LaunchedEffect(id, title, type) {
        if (initialTracks.isNotEmpty() && type == "playlist") {
            isLoading = false
            return@LaunchedEffect
        }
        isLoading = true
        when (type) {
            "artist" -> {
                musicRepo.getArtistTopTracks(id = id, artist = title, limit = 30)
                    .onSuccess { fetched ->
                        val finalTracks = if (fetched.isNotEmpty()) {
                            fetched
                        } else {
                            musicRepo.search(title).getOrDefault(emptyList())
                        }
                        tracks = finalTracks
                        if (resolvedCover.isBlank()) {
                            resolvedCover = finalTracks.firstOrNull()?.coverUrl.orEmpty()
                        }
                    }
                    .onFailure {
                        val fallback = musicRepo.search(title).getOrDefault(emptyList())
                        tracks = fallback
                    }
            }
            "album", "nas_album" -> {
                musicRepo.getAlbumDetails(
                    albumId = id,
                    fallbackTitle = title,
                    fallbackArtist = subtitle,
                    fallbackCover = resolvedCover
                ).onSuccess { fetched ->
                    tracks = fetched
                    if (resolvedCover.isBlank()) {
                        resolvedCover = fetched.firstOrNull()?.coverUrl.orEmpty()
                    }
                }
            }
            else -> {
                if (tracks.isEmpty() && title.isNotBlank()) {
                    musicRepo.search(title).onSuccess { tracks = it }
                }
            }
        }
        isLoading = false
    }

    val totalSeconds = remember(tracks) { tracks.sumOf { it.duration.coerceAtLeast(0) } }
    val hiresCount = remember(tracks) { tracks.count { it.hires || it.isMaxQuality } }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(TidalPureBlack)
    ) {
        // Blurred ambient backdrop
        if (resolvedCover.isNotBlank()) {
            AsyncImage(
                model = resolvedCover,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(340.dp)
                    .blur(46.dp)
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(360.dp)
                .background(
                    Brush.verticalGradient(
                        listOf(
                            TidalBlackAt50,
                            TidalCyanAccent.copy(alpha = 0.12f),
                            TidalPureBlack
                        )
                    )
                )
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
        ) {
            // Top Nav Overlay
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = YtmIcons.ArrowLeft24,
                        contentDescription = "Back",
                        tint = TidalPureWhite
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    IconButton(
                        onClick = {
                            if (tracks.isNotEmpty()) {
                                PlayerManager.downloadTracks(context, tracks)
                            } else {
                                Toast.makeText(context, "No tracks loaded yet", Toast.LENGTH_SHORT).show()
                            }
                        }
                    ) {
                        Icon(
                            imageVector = YtmIcons.Download24,
                            contentDescription = "Download all offline",
                            tint = TidalPureWhite
                        )
                    }
                    IconButton(
                        onClick = {
                            val sendIntent = Intent(Intent.ACTION_SEND).apply {
                                putExtra(
                                    Intent.EXTRA_TEXT,
                                    "Listen to '$title' (${tracks.size} Hi-Res tracks) on KV Tidal"
                                )
                                setType("text/plain")
                            }
                            context.startActivity(Intent.createChooser(sendIntent, "Share"))
                        }
                    ) {
                        Icon(
                            imageVector = YtmIcons.Share24,
                            contentDescription = "Share",
                            tint = TidalPureWhite
                        )
                    }
                }
            }

            if (windowState.isTwoPaneDetail) {
                // Wide Foldable / Book / Tablet 2-Pane Split
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 24.dp),
                    horizontalArrangement = Arrangement.spacedBy(24.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .width(320.dp)
                            .fillMaxHeight()
                            .padding(bottom = bottomPadding + 20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        EntityHeaderContent(
                            title = title,
                            subtitle = subtitle,
                            type = type,
                            coverUrl = resolvedCover,
                            trackCount = tracks.size,
                            hiresCount = hiresCount,
                            totalSeconds = totalSeconds,
                            isCompact = false,
                            onPlayAll = {
                                tracks.firstOrNull()?.let { onTrackPlay(it, tracks) }
                            },
                            onShufflePlay = {
                                if (tracks.isNotEmpty()) {
                                    val shuffled = tracks.shuffled()
                                    onTrackPlay(shuffled.first(), shuffled)
                                }
                            },
                            onDownloadAll = {
                                if (tracks.isNotEmpty()) {
                                    PlayerManager.downloadTracks(context, tracks)
                                }
                            }
                        )
                    }

                    DetailTrackListPane(
                        tracks = tracks,
                        isLoading = isLoading,
                        likedIds = likedIds,
                        type = type,
                        bottomPadding = bottomPadding,
                        onTrackClick = { t -> onTrackPlay(t, tracks) },
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                    )
                }
            } else {
                // Compact Phone Single-Column Scroll
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = bottomPadding + 28.dp)
                ) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp, vertical = 6.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            EntityHeaderContent(
                                title = title,
                                subtitle = subtitle,
                                type = type,
                                coverUrl = resolvedCover,
                                trackCount = tracks.size,
                                hiresCount = hiresCount,
                                totalSeconds = totalSeconds,
                                isCompact = true,
                                onPlayAll = {
                                    tracks.firstOrNull()?.let { onTrackPlay(it, tracks) }
                                },
                                onShufflePlay = {
                                    if (tracks.isNotEmpty()) {
                                        val shuffled = tracks.shuffled()
                                        onTrackPlay(shuffled.first(), shuffled)
                                    }
                                },
                                onDownloadAll = {
                                    if (tracks.isNotEmpty()) {
                                        PlayerManager.downloadTracks(context, tracks)
                                    }
                                }
                            )
                        }
                    }

                    if (isLoading && tracks.isEmpty()) {
                        item {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 48.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator(color = TidalCyan)
                            }
                        }
                    } else if (tracks.isEmpty()) {
                        item {
                            Text(
                                text = "No tracks found for $title",
                                fontSize = 14.sp,
                                color = TidalGrey05,
                                textAlign = TextAlign.Center,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 48.dp)
                            )
                        }
                    } else {
                        itemsIndexed(tracks, key = { idx, t -> "det_${idx}_${t.id}" }) { idx, track ->
                            TrackListItem(
                                track = track,
                                rankNumber = if (type == "album" || type == "nas_album") idx + 1 else null,
                                isLiked = likedIds.contains(track.id),
                                onTrackClick = { onTrackPlay(track, tracks) },
                                queue = tracks
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EntityHeaderContent(
    title: String,
    subtitle: String,
    type: String,
    coverUrl: String,
    trackCount: Int,
    hiresCount: Int,
    totalSeconds: Int,
    isCompact: Boolean,
    onPlayAll: () -> Unit,
    onShufflePlay: () -> Unit,
    onDownloadAll: () -> Unit
) {
    val artSize = if (isCompact) 186.dp else 210.dp
    val isArtist = type == "artist"
    val shape = if (isArtist) CircleShape else RoundedCornerShape(14.dp)

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        Box(
            modifier = Modifier
                .size(artSize)
                .clip(shape)
                .background(TidalCard)
                .border(1.dp, TidalCyanAccent.copy(alpha = 0.4f), shape),
            contentAlignment = Alignment.Center
        ) {
            if (coverUrl.isNotBlank()) {
                AsyncImage(
                    model = coverUrl,
                    contentDescription = title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                Icon(
                    imageVector = if (isArtist) YtmIcons.PersonAudio24 else YtmIcons.Album24,
                    contentDescription = null,
                    tint = TidalCyan,
                    modifier = Modifier.size(64.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            QualityBadgePill(
                text = when (type) {
                    "artist" -> "ARTIST"
                    "nas_album" -> "NAS FLAC"
                    "playlist" -> "PLAYLIST"
                    else -> "HI-RES MAX"
                },
                isMax = type != "nas_album"
            )
            if (hiresCount > 0) {
                QualityBadgePill(text = "$hiresCount LOSSLESS", isMax = false)
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = title,
            fontSize = if (isCompact) 22.sp else 24.sp,
            fontWeight = FontWeight.Bold,
            color = TidalPureWhite,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )

        if (subtitle.isNotBlank()) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = subtitle,
                fontSize = 13.sp,
                color = TidalGrey04,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }

        if (trackCount > 0) {
            val mins = (totalSeconds / 60).coerceAtLeast(1)
            Text(
                text = if (totalSeconds > 0) "$trackCount tracks • $mins min" else "$trackCount tracks",
                fontSize = 12.sp,
                color = TidalGrey05,
                modifier = Modifier.padding(top = 4.dp)
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Surface(
                shape = CircleShape,
                color = TidalCardHover,
                border = BorderStroke(1.dp, TidalWhite20),
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .clickable { onShufflePlay() }
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = YtmIcons.Shuffle24,
                        contentDescription = "Shuffle",
                        tint = TidalPureWhite,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            // Signature 56.dp Electric Cyan Play Circle
            Surface(
                shape = CircleShape,
                color = TidalCyan,
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .clickable { onPlayAll() }
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = YtmIcons.Play24,
                        contentDescription = "Play All",
                        tint = TidalPureBlack,
                        modifier = Modifier.size(28.dp)
                    )
                }
            }

            Surface(
                shape = CircleShape,
                color = TidalCardHover,
                border = BorderStroke(1.dp, TidalWhite20),
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .clickable { onDownloadAll() }
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = YtmIcons.Download24,
                        contentDescription = "Download All",
                        tint = TidalPureWhite,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun DetailTrackListPane(
    tracks: List<Track>,
    isLoading: Boolean,
    likedIds: Set<String>,
    type: String,
    bottomPadding: Dp,
    onTrackClick: (Track) -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.padding(bottom = bottomPadding + 16.dp),
        shape = RoundedCornerShape(16.dp),
        color = TidalSurface.copy(alpha = 0.85f),
        border = BorderStroke(0.8.dp, TidalWhite15)
    ) {
        if (isLoading && tracks.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = TidalCyan)
            }
        } else if (tracks.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No tracks found", color = TidalGrey05, fontSize = 14.sp)
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(vertical = 8.dp)
            ) {
                itemsIndexed(tracks, key = { idx, t -> "det2_${idx}_${t.id}" }) { idx, track ->
                    TrackListItem(
                        track = track,
                        rankNumber = if (type == "album" || type == "nas_album") idx + 1 else idx + 1,
                        isLiked = likedIds.contains(track.id),
                        onTrackClick = { onTrackClick(track) },
                        queue = tracks
                    )
                }
            }
        }
    }
}
