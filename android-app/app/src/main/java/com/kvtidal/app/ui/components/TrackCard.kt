package com.kvtidal.app.ui.components

import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.kvtidal.app.KVTidalApp
import com.kvtidal.app.data.model.Track
import com.kvtidal.app.player.PlayerManager
import com.kvtidal.app.ui.theme.*
import kotlinx.coroutines.launch
import java.util.Locale

internal fun formatDuration(durationSeconds: Int): String {
    if (durationSeconds <= 0) return ""
    val hours = durationSeconds / 3600
    val minutes = (durationSeconds % 3600) / 60
    val seconds = durationSeconds % 60
    return if (hours > 0) {
        String.format(Locale.getDefault(), "%d:%02d:%02d", hours, minutes, seconds)
    } else {
        String.format(Locale.getDefault(), "%d:%02d", minutes, seconds)
    }
}

private fun shareTrack(context: Context, track: Track) {
    val sendIntent = Intent(Intent.ACTION_SEND).apply {
        putExtra(
            Intent.EXTRA_TEXT,
            "Listen to '${track.title}' by ${track.artist} (${track.qualityBadge}) on KV Tidal"
        )
        type = "text/plain"
    }
    context.startActivity(Intent.createChooser(sendIntent, "Share Track"))
}

@Composable
fun TrackListItem(
    track: Track,
    onTrackClick: () -> Unit,
    rankNumber: Int? = null,
    isLiked: Boolean = false,
    onLikeClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
    queue: List<Track> = emptyList(),
    onPlayNext: (() -> Unit)? = null,
    contentPadding: PaddingValues = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val currentTrack by PlayerManager.currentTrack.collectAsState()
    val isPlayerPlaying by PlayerManager.isPlaying.collectAsState()
    val downloadedIds by PlayerManager.downloadedTrackIds.collectAsState()
    val downloadProgress by PlayerManager.downloadProgress.collectAsState()
    val likedIds by PlayerManager.likedTrackIds.collectAsState()

    val isCurrentPlaying = currentTrack?.id == track.id && isPlayerPlaying
    val isDownloaded = downloadedIds.contains(track.id)
    val trackDownloadProgress = downloadProgress[track.id]

    var likedOverride by remember(track.id, isLiked) { mutableStateOf<Boolean?>(null) }
    val effectiveLiked = likedOverride ?: (isLiked || likedIds.contains(track.id))

    var showMenuSheet by remember { mutableStateOf(false) }

    val formattedDuration = formatDuration(track.duration)
    val subtitleText = buildString {
        if (track.artist.isNotBlank()) append(track.artist)
        if (formattedDuration.isNotEmpty()) {
            if (isNotEmpty()) append(" • ")
            append(formattedDuration)
        }
    }

    val toggleLikeAction: () -> Unit = {
        val nextLiked = !effectiveLiked
        if (onLikeClick != null) onLikeClick() else PlayerManager.toggleLike(track.id)
        likedOverride = nextLiked
        Toast.makeText(
            context,
            if (nextLiked) "Saved '${track.title}' to library" else "Removed '${track.title}' from library",
            Toast.LENGTH_SHORT
        ).show()
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 64.dp)
            .clickable { onTrackClick() }
            .padding(contentPadding),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (rankNumber != null) {
            Text(
                text = "$rankNumber",
                style = YtmTitle02,
                color = if (rankNumber <= 3) TidalCyan else TidalWhite67,
                textAlign = TextAlign.Center,
                modifier = Modifier.width(24.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
        }

        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(TidalSurface),
            contentAlignment = Alignment.Center
        ) {
            AsyncImage(
                model = track.coverUrl,
                contentDescription = track.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
            if (isCurrentPlaying) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(TidalBlackAt50),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = YtmIcons.WaveformMusic18,
                        contentDescription = "Playing",
                        tint = TidalCyan,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 14.dp, end = 8.dp)
        ) {
            Text(
                text = track.title,
                style = YtmTitle02,
                color = if (currentTrack?.id == track.id) TidalCyan else TidalWhite,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(modifier = Modifier.height(3.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (trackDownloadProgress != null) {
                    CircularProgressIndicator(
                        color = TidalCyan,
                        strokeWidth = 1.5.dp,
                        modifier = Modifier.size(12.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                } else if (isDownloaded) {
                    Icon(
                        imageVector = YtmIcons.Downloaded24,
                        contentDescription = "Downloaded",
                        tint = TidalEmerald,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(5.dp))
                }
                QualityBadgePill(
                    text = track.qualityBadge,
                    isMax = track.isMaxQuality
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = subtitleText,
                    style = YtmSubtitle01,
                    color = TidalWhite67,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        IconButton(
            onClick = { showMenuSheet = true },
            modifier = Modifier.size(40.dp)
        ) {
            Icon(
                imageVector = YtmIcons.OverflowVertical24,
                contentDescription = "Menu",
                tint = TidalWhite67,
                modifier = Modifier.size(22.dp)
            )
        }
    }

    if (showMenuSheet) {
        TrackMenuBottomSheet(
            track = track,
            isLiked = effectiveLiked,
            isDownloaded = isDownloaded,
            downloadProgress = trackDownloadProgress,
            onDismiss = { showMenuSheet = false },
            onPlayNext = {
                if (onPlayNext != null) {
                    onPlayNext()
                } else {
                    PlayerManager.enqueueNext(context, track)
                }
                showMenuSheet = false
            },
            onStartRadio = {
                showMenuSheet = false
                scope.launch {
                    Toast.makeText(context, "Building Hi-Res radio for '${track.title}'...", Toast.LENGTH_SHORT).show()
                    val recs = KVTidalApp.instance.musicRepository
                        .getRecommendations(track.id, track.artist, track.title)
                        .getOrDefault(emptyList())
                    val radioQueue = (listOf(track) + recs).distinctBy { it.id }
                    PlayerManager.playTrack(track, radioQueue)
                }
            },
            onToggleLike = toggleLikeAction,
            onToggleDownload = {
                PlayerManager.toggleDownload(context, track)
                showMenuSheet = false
            },
            onQueueToNas = {
                PlayerManager.queueToNas(context, track, KVTidalApp.instance.musicRepository)
                showMenuSheet = false
            },
            onShare = {
                shareTrack(context, track)
                showMenuSheet = false
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TrackMenuBottomSheet(
    track: Track,
    isLiked: Boolean,
    isDownloaded: Boolean,
    downloadProgress: Float?,
    onDismiss: () -> Unit,
    onPlayNext: () -> Unit,
    onStartRadio: () -> Unit,
    onToggleLike: () -> Unit,
    onToggleDownload: () -> Unit,
    onQueueToNas: () -> Unit,
    onShare: () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = TidalCard,
        contentColor = TidalWhite,
        shape = RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp),
        dragHandle = null
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(bottom = 8.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                AsyncImage(
                    model = track.coverUrl,
                    contentDescription = track.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(TidalSurface)
                )

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = track.title,
                        style = YtmTitle02,
                        color = TidalWhite,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = "${track.artist} • ${track.audioSpecLine}",
                        style = YtmCaption02,
                        color = TidalWhite67,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                IconButton(onClick = onToggleLike) {
                    Icon(
                        imageVector = if (isLiked) YtmIcons.ThumbUpFilled else YtmIcons.ThumbUpOutline,
                        contentDescription = if (isLiked) "Unlike" else "Like",
                        tint = if (isLiked) TidalCyan else TidalWhite,
                        modifier = Modifier.size(24.dp)
                    )
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(TidalWhite08)
            )

            TrackMenuItem(
                icon = YtmIcons.QueueNext24,
                label = "Play next",
                onClick = onPlayNext
            )
            TrackMenuItem(
                icon = YtmIcons.RadioLive24,
                label = "Start Hi-Res radio",
                onClick = onStartRadio
            )
            TrackMenuItem(
                icon = if (isLiked) YtmIcons.CheckCircle24 else YtmIcons.PlaylistAdd24,
                label = if (isLiked) "Saved to library" else "Save to library",
                onClick = {
                    onToggleLike()
                    onDismiss()
                }
            )
            TrackMenuItem(
                icon = if (isDownloaded) YtmIcons.Downloaded24 else YtmIcons.Download24,
                label = when {
                    downloadProgress != null -> "Saving ${(downloadProgress * 100).toInt().coerceIn(1, 99)}% (tap to cancel)"
                    isDownloaded -> "Remove offline download"
                    else -> "Save offline to phone (Music/KV Tidal)"
                },
                onClick = onToggleDownload
            )
            TrackMenuItem(
                icon = YtmIcons.Album24,
                label = "Download Hi-Res FLAC to Synology NAS",
                onClick = onQueueToNas
            )
            TrackMenuItem(
                icon = YtmIcons.Share24,
                label = "Share",
                onClick = onShare
            )
        }
    }
}

@Composable
private fun TrackMenuItem(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 48.dp)
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = TidalWhite,
            modifier = Modifier.size(22.dp)
        )
        Spacer(modifier = Modifier.width(20.dp))
        Text(
            text = label,
            style = YtmTitle02,
            color = TidalWhite,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
fun TrackCardSquare(
    track: Track,
    onClick: () -> Unit,
    modifier: Modifier = Modifier.width(148.dp)
) {
    val currentTrack by PlayerManager.currentTrack.collectAsState()
    val isPlayerPlaying by PlayerManager.isPlaying.collectAsState()
    val isCurrentPlaying = currentTrack?.id == track.id && isPlayerPlaying

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .clickable { onClick() }
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(6.dp))
                .background(TidalSurface),
            contentAlignment = Alignment.Center
        ) {
            AsyncImage(
                model = track.coverUrl,
                contentDescription = track.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
            QualityBadgePill(
                text = track.qualityBadge,
                isMax = track.isMaxQuality,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(6.dp)
            )
            if (isCurrentPlaying) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(TidalBlackAt50),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = YtmIcons.WaveformMusic18,
                        contentDescription = "Playing",
                        tint = TidalCyan,
                        modifier = Modifier.size(24.dp)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(6.dp))

        Text(
            text = track.title,
            style = YtmTitle02,
            color = TidalWhite,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )

        Spacer(modifier = Modifier.height(2.dp))

        Text(
            text = track.artist,
            style = YtmSubtitle01,
            color = TidalWhite67,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
    }
}
