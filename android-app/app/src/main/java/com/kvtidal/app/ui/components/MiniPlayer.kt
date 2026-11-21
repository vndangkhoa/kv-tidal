package com.kvtidal.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.kvtidal.app.data.model.Track
import com.kvtidal.app.player.AudioOutputManager
import com.kvtidal.app.player.PlayerManager
import com.kvtidal.app.ui.adaptive.LocalWindowState
import com.kvtidal.app.ui.theme.*
import kotlin.math.roundToInt

@Composable
fun MiniPlayer(
    track: Track?,
    isPlaying: Boolean,
    progressFraction: Float,
    onTogglePlay: () -> Unit,
    onSkipNext: () -> Unit,
    onClickExpand: () -> Unit,
    modifier: Modifier = Modifier
) {
    val windowState = LocalWindowState.current
    val likedIds by PlayerManager.likedTrackIds.collectAsState()
    val isBuffering by PlayerManager.isBuffering.collectAsState()
    val selectedTerminal by AudioOutputManager.selectedTerminal.collectAsState()
    val bitPerfectEnabled by AudioOutputManager.bitPerfectEnabled.collectAsState()

    AnimatedVisibility(
        visible = track != null,
        enter = slideInVertically(initialOffsetY = { it }),
        exit = slideOutVertically(targetOffsetY = { it }),
        modifier = modifier
    ) {
        if (track == null) return@AnimatedVisibility

        val isWide = windowState.isWide
        val isLiked = likedIds.contains(track.id)
        var isDragging by remember(track.id) { mutableStateOf(false) }
        var dragOffsetPx by remember(track.id) { mutableFloatStateOf(0f) }
        val animatedOffsetPx by animateFloatAsState(
            targetValue = dragOffsetPx,
            animationSpec = if (isDragging) snap() else tween(durationMillis = 180),
            label = "miniPlayerSwipeOffset"
        )
        val swipeThresholdPx = with(LocalDensity.current) { 72.dp.toPx() }

        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .height(if (isWide) 70.dp else 64.dp)
                .clickable { onClickExpand() },
            color = TidalCard,
            tonalElevation = 0.dp,
            shadowElevation = 0.dp
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(TidalWhite08)
                )

                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(start = 16.dp, end = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .clipToBounds()
                            .pointerInput(track.id) {
                                var totalDrag = 0f
                                detectHorizontalDragGestures(
                                    onDragStart = {
                                        isDragging = true
                                        totalDrag = 0f
                                    },
                                    onHorizontalDrag = { change, dragAmount ->
                                        change.consume()
                                        totalDrag += dragAmount
                                        dragOffsetPx = (dragOffsetPx + dragAmount)
                                            .coerceIn(-swipeThresholdPx * 1.4f, swipeThresholdPx * 1.4f)
                                    },
                                    onDragEnd = {
                                        when {
                                            totalDrag <= -swipeThresholdPx -> onSkipNext()
                                            totalDrag >= swipeThresholdPx -> PlayerManager.playPrevious()
                                        }
                                        isDragging = false
                                        dragOffsetPx = 0f
                                    },
                                    onDragCancel = {
                                        isDragging = false
                                        dragOffsetPx = 0f
                                    }
                                )
                            },
                        contentAlignment = Alignment.CenterStart
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .offset { IntOffset(animatedOffsetPx.roundToInt(), 0) },
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            AsyncImage(
                                model = track.coverUrl,
                                contentDescription = track.title,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(if (isWide) 52.dp else 48.dp)
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(TidalSurface)
                            )

                            Spacer(modifier = Modifier.width(12.dp))

                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(end = 8.dp)
                            ) {
                                Text(
                                    text = track.title,
                                    style = YtmTitle02,
                                    color = TidalWhite,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    QualityBadgePill(
                                        text = track.qualityBadge,
                                        isMax = track.isMaxQuality
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = track.artist,
                                        style = YtmSubtitle01,
                                        color = TidalWhite67,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }

                    if (isWide) {
                        QualityBadgePill(
                            text = "${selectedTerminal.shortBadge} • ${if (bitPerfectEnabled) "BIT-PERFECT" else "GAIN"}",
                            isMax = selectedTerminal.isBitPerfectCapable && bitPerfectEnabled,
                            modifier = Modifier.padding(end = 6.dp)
                        )
                        QualityBadgePill(
                            text = track.audioSpecLine,
                            isMax = track.isMaxQuality,
                            modifier = Modifier.padding(end = 8.dp)
                        )
                        IconButton(
                            onClick = { PlayerManager.toggleLike(track.id) },
                            modifier = Modifier.size(44.dp)
                        ) {
                            Icon(
                                imageVector = if (isLiked) YtmIcons.ThumbUpFilled else YtmIcons.ThumbUpOutline,
                                contentDescription = "Like",
                                tint = if (isLiked) TidalCyan else TidalWhite,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        IconButton(
                            onClick = { PlayerManager.playPrevious() },
                            modifier = Modifier.size(44.dp)
                        ) {
                            Icon(
                                imageVector = YtmIcons.SkipPrevious24,
                                contentDescription = "Previous track",
                                tint = TidalWhite,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                    }

                    IconButton(
                        onClick = onTogglePlay,
                        modifier = Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            if (isBuffering) {
                                CircularProgressIndicator(
                                    color = TidalCyan,
                                    strokeWidth = 2.dp,
                                    modifier = Modifier.size(28.dp)
                                )
                            }
                            Icon(
                                imageVector = if (isPlaying) YtmIcons.Pause24 else YtmIcons.Play24,
                                contentDescription = if (isPlaying) "Pause" else "Play",
                                tint = TidalCyan,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                    }

                    IconButton(
                        onClick = onSkipNext,
                        modifier = Modifier.size(44.dp)
                    ) {
                        Icon(
                            imageVector = YtmIcons.SkipNext24,
                            contentDescription = "Next track",
                            tint = TidalWhite,
                            modifier = Modifier.size(22.dp)
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .height(2.dp)
                        .background(TidalWhite15)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxHeight()
                            .fillMaxWidth(fraction = progressFraction.coerceIn(0f, 1f))
                            .background(TidalCyan)
                    )
                }
            }
        }
    }
}
