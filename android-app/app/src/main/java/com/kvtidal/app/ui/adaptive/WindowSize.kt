package com.kvtidal.app.ui.adaptive

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import kotlinx.coroutines.CancellationException

/**
 * Material window width classes:
 * - Compact (< 600dp): Phone portrait / cover screen of foldables
 * - Medium (600..839dp): Unfolded foldable portrait / compact tablet / split-screen
 * - Expanded (>= 840dp): Unfolded foldable landscape / large tablet
 */
enum class WidthClass {
    Compact, Medium, Expanded;

    val isCompact get() = this == Compact
    val isWide get() = this != Compact

    companion object {
        fun forWidthDp(dp: Int): WidthClass = when {
            dp < 600 -> Compact
            dp < 840 -> Medium
            else -> Expanded
        }
    }
}

enum class FoldPosture { Flat, Tabletop, Book }

data class WindowState(
    val widthClass: WidthClass = WidthClass.Compact,
    val widthDp: Int = 360,
    val heightDp: Int = 640,
    val foldPosture: FoldPosture = FoldPosture.Flat,
    val hingeTopDp: Float = 0f,
    val hingeHeightDp: Float = 0f,
    val hingeStartDp: Float = 0f,
    val hingeWidthDp: Float = 0f
) {
    val isCompact get() = widthClass.isCompact
    val isWide get() = widthClass.isWide
    val isLandscape get() = widthDp > heightDp
    val isTabletop get() = foldPosture == FoldPosture.Tabletop
    val isBook get() = foldPosture == FoldPosture.Book

    /** Foldables & tablets >= 600dp use left NavigationRail; compact phones use BottomNavBar. */
    val useNavigationRail get() = isWide

    /** FullPlayerScreen shows 2-pane artwork/controls + Up Next/Lyrics/Related panel on wide screens or Book posture. */
    val isTwoPanePlayer get() = (isWide && !isTabletop) || isBook

    /** DetailScreen shows 2-pane header + tracklist on wide windows (>= 700dp) or Book posture. */
    val isTwoPaneDetail get() = widthDp >= 700 || isBook

    /** Mood & genre tiles adapt from 2 columns (phone) -> 3 (medium foldable) -> 4 (expanded tablet). */
    val moodGridColumns: Int
        get() = when (widthClass) {
            WidthClass.Compact -> 2
            WidthClass.Medium -> 3
            WidthClass.Expanded -> 4
        }

    /** Chart & ranked track lists switch to 2 columns on Expanded tablets/unfolded landscape. */
    val chartGridColumns: Int
        get() = when (widthClass) {
            WidthClass.Expanded -> 2
            else -> 1
        }

    /** Library & search track lists switch to 2 columns on Medium/Expanded foldables & tablets. */
    val libraryGridColumns: Int
        get() = when {
            widthClass == WidthClass.Expanded -> 2
            isWide && isLandscape -> 2
            else -> 1
        }
}

val LocalWidthClass = compositionLocalOf { WidthClass.Compact }
val LocalWindowState = compositionLocalOf { WindowState() }

const val MaxContentWidthDp = 1280

fun computeWindowState(
    widthDp: Int,
    heightDp: Int,
    isHalfOpened: Boolean = false,
    isHorizontalHinge: Boolean = false,
    hingeTopDp: Float = 0f,
    hingeHeightDp: Float = 0f,
    hingeStartDp: Float = 0f,
    hingeWidthDp: Float = 0f
): WindowState {
    val posture = when {
        !isHalfOpened -> FoldPosture.Flat
        isHorizontalHinge -> FoldPosture.Tabletop
        else -> FoldPosture.Book
    }
    return WindowState(
        widthClass = WidthClass.forWidthDp(widthDp),
        widthDp = widthDp,
        heightDp = heightDp,
        foldPosture = posture,
        hingeTopDp = if (posture == FoldPosture.Tabletop) hingeTopDp else 0f,
        hingeHeightDp = if (posture == FoldPosture.Tabletop) hingeHeightDp else 0f,
        hingeStartDp = if (posture == FoldPosture.Book) hingeStartDp else 0f,
        hingeWidthDp = if (posture == FoldPosture.Book) hingeWidthDp else 0f
    )
}

private data class RawFoldInfo(
    val isHalfOpened: Boolean = false,
    val isHorizontalHinge: Boolean = false,
    val leftPx: Int = 0,
    val topPx: Int = 0,
    val widthPx: Int = 0,
    val heightPx: Int = 0
)

internal tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

@Composable
fun ProvideWidthClass(content: @Composable () -> Unit) {
    val config = LocalConfiguration.current
    val widthDp = config.screenWidthDp
    val heightDp = config.screenHeightDp
    val density = LocalDensity.current.density.coerceAtLeast(1f)
    val activity = LocalContext.current.findActivity()
    var rawFold by remember(activity) { mutableStateOf(RawFoldInfo()) }

    LaunchedEffect(activity) {
        if (activity == null) return@LaunchedEffect
        try {
            WindowInfoTracker.getOrCreate(activity)
                .windowLayoutInfo(activity)
                .collect { layoutInfo ->
                    val feature = layoutInfo.displayFeatures
                        .filterIsInstance<FoldingFeature>()
                        .firstOrNull()
                    rawFold = if (feature != null) {
                        RawFoldInfo(
                            isHalfOpened = feature.state == FoldingFeature.State.HALF_OPENED,
                            isHorizontalHinge = feature.orientation == FoldingFeature.Orientation.HORIZONTAL,
                            leftPx = feature.bounds.left,
                            topPx = feature.bounds.top,
                            widthPx = feature.bounds.width(),
                            heightPx = feature.bounds.height()
                        )
                    } else {
                        RawFoldInfo()
                    }
                }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            rawFold = RawFoldInfo()
        }
    }

    val state = remember(widthDp, heightDp, rawFold, density) {
        computeWindowState(
            widthDp = widthDp,
            heightDp = heightDp,
            isHalfOpened = rawFold.isHalfOpened,
            isHorizontalHinge = rawFold.isHorizontalHinge,
            hingeTopDp = rawFold.topPx / density,
            hingeHeightDp = rawFold.heightPx / density,
            hingeStartDp = rawFold.leftPx / density,
            hingeWidthDp = rawFold.widthPx / density
        )
    }

    CompositionLocalProvider(
        LocalWidthClass provides state.widthClass,
        LocalWindowState provides state
    ) {
        content()
    }
}
