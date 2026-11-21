package com.kvtidal.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kvtidal.app.ui.theme.*

/**
 * Icon set matching KV-Music's layout ergonomics for KV Tidal.
 */
object YtmIcons {

    private fun buildVector(
        name: String,
        pathData: String,
        sizeDp: Float = 24f,
        fillType: PathFillType = PathFillType.NonZero
    ): ImageVector {
        return ImageVector.Builder(
            name = name,
            defaultWidth = sizeDp.dp,
            defaultHeight = sizeDp.dp,
            viewportWidth = sizeDp,
            viewportHeight = sizeDp
        ).addPath(
            pathData = PathParser().parsePathString(pathData).toNodes(),
            pathFillType = fillType,
            fill = SolidColor(Color.White)
        ).build()
    }

    val HomeFilled: ImageVector by lazy {
        buildVector(
            name = "HomeFilled",
            pathData = "m11.485,2.143 l-8,4.8 -2,1.2a1,1 0,0 0,1.03 1.714L3,9.567V20a2,2 0,0 0,2 2h5v-8h4v8h5a2,2 0,0 0,2 -2V9.567l0.485,0.29a1,1 0,0 0,1.03 -1.714l-2,-1.2 -8,-4.8a1,1 0,0 0,-1.03 0Z"
        )
    }

    val HomeOutline: ImageVector by lazy {
        buildVector(
            name = "HomeOutline",
            pathData = "m11.485,2.143 l-8,4.8 -2,1.2a1,1 0,0 0,1.03 1.714L3,9.567V20a2,2 0,0 0,2 2h6v-7h2v7h6a2,2 0,0 0,2 -2V9.567l0.485,0.29a1,1 0,0 0,1.03 -1.714l-2,-1.2 -8,-4.8a1,1 0,0 0,-1.03 0ZM5,8.366l7,-4.2 7,4.2V20h-4v-5.5a1.5,1.5 0,0 0,-1.5 -1.5h-3A1.5,1.5 0,0 0,9 14.5V20H5V8.366Z"
        )
    }

    val ExploreFilled: ImageVector by lazy {
        buildVector(
            name = "ExploreFilled",
            pathData = "M12,1C5.925,1 1,5.925 1,12s4.925,11 11,11 11,-4.925 11,-11S18.075,1 12,1ZM16.962,6.997a1,1 0,0 1,0.261 0.967l-1.812,6.762a1,1 0,0 1,-0.703 0.706L8.007,17.26a1,1 0,0 1,-1.23 -1.224l1.812,-6.762a1,1 0,0 1,0.703 -0.706l6.701,-1.828a1,1 0,0 1,0.969 0.257ZM10.551,11.611a1.5,1.5 0,0 0,2.199 1.69,1.503 1.503 0,0 0,0.7,-0.911 1.501,1.501 0,1 0,-2.899 -0.779Z"
        )
    }

    val ExploreOutline: ImageVector by lazy {
        buildVector(
            name = "ExploreOutline",
            pathData = "M12,1C5.925,1 1,5.925 1,12s4.925,11 11,11 11,-4.925 11,-11S18.075,1 12,1ZM12,3a9,9 0,1 1,0 18.001A9,9 0,0 1,12 3ZM15.73,5.775L9.028,7.604a2,2 0,0 0,-1.405 1.412l-1.811,6.76a2,2 0,0 0,2.458 2.448l6.701,-1.828a2,2 0,0 0,1.406 -1.412l1.812,-6.761a2.001,2.001 0,0 0,-2.459 -2.448ZM9.555,9.533l6.702,-1.828 -1.812,6.762 -6.702,1.826 1.812,-6.76ZM10.793,11.676a1.25,1.25 0,1 0,2.415 0.647,1.25 1.25 0,0 0,-2.415,-0.647Z"
        )
    }

    val LibraryFilled: ImageVector by lazy {
        buildVector(
            name = "LibraryFilled",
            pathData = "M18,21H3V6h1v14h14V21zM21,3v15H6V3H21zM16,6h-3v5.28C12.7,11.11 12.37,11 12,11c-1.1,0 -2,0.9 -2,2s0.9,2 2,2s2,-0.9 2,-2V8h2V6z"
        )
    }

    val LibraryOutline: ImageVector by lazy {
        buildVector(
            name = "LibraryOutline",
            pathData = "M16,6v2h-2v5c0,1.1 -0.9,2 -2,2s-2,-0.9 -2,-2s0.9,-2 2,-2c0.37,0 0.7,0.11 1,0.28V6H16zM18,20H4V6H3v15h15V20zM21,3H6v15h15V3zM7,4h13v13H7V4z"
        )
    }

    val SearchOutline: ImageVector by lazy {
        buildVector(
            name = "SearchOutline",
            pathData = "M11,2a9,9 0,1 0,5.641 16.01,0.966 0.966,0 0,0 0.152,0.197l3.5,3.5a1,1 0,1 0,1.414 -1.414l-3.5,-3.5a1,1 0,0 0,-0.197 -0.153A8.96,8.96 0,0 0,20 11a9,9 0,0 0,-9 -9ZM11,4a7,7 0,1 1,0 14,7 7,0 0,1 0,-14Z"
        )
    }

    val ChevronDown24: ImageVector by lazy {
        buildVector(
            name = "ChevronDown24",
            pathData = "M18.707,8.793a1,1 0,0 0,-1.414 0L12,14.086 6.707,8.793a1,1 0,1 0,-1.414 1.414L12,16.914l6.707,-6.707a1,1 0,0 0,0 -1.414Z"
        )
    }

    val ChevronDown18: ImageVector by lazy {
        buildVector(
            name = "ChevronDown18",
            pathData = "M14.03,6.595a0.75,0.75 0,0 0,-1.004 -0.052l-0.056,0.052L9,10.565l-3.97,-3.97a0.75,0.75 0,1 0,-1.06 1.06L9,12.685l5.03,-5.03 0.052,-0.056a0.75,0.75 0,0 0,-0.052 -1.004Z",
            sizeDp = 18f
        )
    }

    val ChevronRight24: ImageVector by lazy {
        buildVector(
            name = "ChevronRight24",
            pathData = "M8.793,5.293a1,1 0,0 0,0 1.414L14.086,12l-5.293,5.293a1,1 0,1 0,1.414 1.414L16.914,12l-6.707,-6.707a1,1 0,0 0,-1.414 0Z"
        )
    }

    val ArrowLeft24: ImageVector by lazy {
        buildVector(
            name = "ArrowLeft24",
            pathData = "M10.293,4.293 L2.586,12l7.707,7.706a1,1 0,1 0,1.414 -1.413L6.414,13H20a1,1 0,0 0,0 -2H6.414l5.293,-5.292a1,1 0,0 0,-1.414 -1.415Z"
        )
    }

    val OverflowVertical24: ImageVector by lazy {
        buildVector(
            name = "OverflowVertical24",
            pathData = "M12,4a2,2 0,1 0,0 4,2 2,0 0,0 0,-4ZM12,10a2,2 0,1 0,0 4,2 2,0 0,0 0,-4ZM12,16a2,2 0,1 0,0 4,2 2,0 0,0 0,-4Z"
        )
    }

    val Cast24: ImageVector by lazy {
        buildVector(
            name = "Cast24",
            pathData = "M21,3L3,3a2,2 0,0 0,-2 2v3c0.67,0 1.337,0.051 2,0.153L3,5h18v14h-7.153c0.1,0.653 0.152,1.32 0.153,2h7a2,2 0,0 0,2 -2L23,5a2,2 0,0 0,-2 -2ZM1,10v2a9,9 0,0 1,9 9h2A11,11 0,0 0,1 10ZM1,14v2a5,5 0,0 1,5 5h2a7,7 0,0 0,-7 -7ZM1,18v3h3a3.003,3.003 0,0 0,-3 -3Z"
        )
    }

    val WaveformMusic18: ImageVector by lazy {
        buildVector(
            name = "WaveformMusic18",
            pathData = "M10,3a1,1 0,1 1,2 0v12a1,1 0,1 1,-2 0L10,3ZM7,5.002a1,1 0,0 0,-1 1v6a1,1 0,1 0,2 0v-6a1,1 0,0 0,-1 -1ZM3,7a1,1 0,0 0,-1 1v2a1,1 0,1 0,2 0L4,8a1,1 0,0 0,-1 -1ZM15,5.998a1,1 0,0 0,-1 1v4a1,1 0,0 0,2 0v-4a1,1 0,0 0,-1 -1Z",
            sizeDp = 18f
        )
    }

    val Mic24: ImageVector by lazy {
        buildVector(
            name = "Mic24",
            pathData = "M18.063,14.5a1,1 0,1 1,1.73 1A8.998,8.998 0,0 1,13 19.942V22a1,1 0,1 1,-2 0v-2.058A8.999,8.999 0,0 1,4.206 15.5l0.866,-0.5 0.865,-0.5a7.002,7.002 0,0 0,12.125 0ZM12,1a5,5 0,0 1,5 5v5a5,5 0,0 1,-10 0V6a5,5 0,0 1,5 -5ZM4.572,14.134a1,1 0,0 1,1.365 0.366l-1.731,1a1,1 0,0 1,0.366 -1.366ZM12,3a3,3 0,0 0,-3 3v5a3,3 0,1 0,6 0V6a3,3 0,0 0,-3 -3Z"
        )
    }

    val CloseX24: ImageVector by lazy {
        buildVector(
            name = "CloseX24",
            pathData = "M17.293,5.293 L12,10.586 6.707,5.293a1,1 0,1 0,-1.414 1.414L10.586,12l-5.293,5.293a1,1 0,0 0,1.414 1.414L12,13.414l5.293,5.293a1,1 0,0 0,1.414 -1.414L13.414,12l5.293,-5.293a1,1 0,1 0,-1.414 -1.414Z"
        )
    }

    val SettingsGear24: ImageVector by lazy {
        buildVector(
            name = "SettingsGear24",
            pathData = "M12.844,1h-1.687a2,2 0,0 0,-1.962 1.616,3 3,0 0,1 -3.92,2.263 2,2 0,0 0,-2.38 0.891l-0.842,1.46a2,2 0,0 0,0.417 2.507,3 3,0 0,1 0,4.525 2,2 0,0 0,-0.417 2.507l0.843,1.46a2,2 0,0 0,2.38 0.892,3.001 3.001,0 0,1 3.918,2.263A2,2 0,0 0,11.157 23h1.686a2,2 0,0 0,1.963 -1.615,3.002 3.002,0 0,1 3.92,-2.263 2,2 0,0 0,2.38 -0.892l0.842,-1.46a2,2 0,0 0,-0.418 -2.507,3 3,0 0,1 0,-4.526 2,2 0,0 0,0.418 -2.508l-0.843,-1.46a2,2 0,0 0,-2.38 -0.891,3 3,0 0,1 -3.919,-2.263A2,2 0,0 0,12.844 1ZM11.077,3.347a6,6 0,0 0,0.08 -0.347h1.687a4.98,4.98 0,0 0,2.407 3.37,4.98 4.98,0 0,0 4.122,0.4l0.843,1.46A4.98,4.98 0,0 0,18.5 12a4.98,4.98 0,0 0,1.716 3.77l-0.843,1.46a4.98,4.98 0,0 0,-4.123 0.4A4.979,4.979 0,0 0,12.843 21h-1.686a4.98,4.98 0,0 0,-2.408 -3.371,4.999 4.999,0 0,0 -4.12,-0.399l-0.844,-1.46A4.979,4.979 0,0 0,5.5 12a4.98,4.98 0,0 0,-1.715 -3.77l0.842,-1.459a4.98,4.98 0,0 0,4.123 -0.399,4.981 4.981,0 0,0 2.327,-3.025ZM16,12a4,4 0,1 1,-7.999 0,4 4,0 0,1 8,0ZM12,14a2,2 0,1 0,0 -4,2 2,0 0,0 0,4Z"
        )
    }

    val DragBars24: ImageVector by lazy {
        buildVector(
            name = "DragBars24",
            pathData = "M21,10H3V9H21V10ZM21,14H3V15H21V14Z"
        )
    }

    val Spark24: ImageVector by lazy {
        buildVector(
            name = "Spark24",
            pathData = "M12,2c0.39,0 0.71,0.303 0.763,0.69a10.001,10.001 0,0 0,8.547 8.533c0.386,0.052 0.69,0.372 0.69,0.762s-0.304,0.71 -0.69,0.763a10,10 0,0 0,-8.551 8.565A0.78,0.78 0,0 1,12 22a0.78,0.78 0,0 1,-0.759 -0.688,10.002 10.002,0 0,0 -8.552,-8.565 0.784,0.784 0,0 1,-0.689 -0.763c0,-0.39 0.303,-0.709 0.69,-0.761a10.002,10.002 0,0 0,8.547 -8.534A0.784,0.784 0,0 1,12 2Z"
        )
    }

    val Play24: ImageVector by lazy {
        buildVector(
            name = "Play24",
            pathData = "M5,4.623V19.38a1.5,1.5 0,0 0,2.26 1.29L22,12 7.26,3.33A1.5,1.5 0,0 0,5 4.623Z"
        )
    }

    val Pause24: ImageVector by lazy {
        buildVector(
            name = "Pause24",
            pathData = "M6.5,3A1.5,1.5 0,0 0,5 4.5v15A1.5,1.5 0,0 0,6.5 21h2a1.5,1.5 0,0 0,1.5 -1.5v-15A1.5,1.5 0,0 0,8.5 3h-2ZM15.5,3A1.5,1.5 0,0 0,14 4.5v15a1.5,1.5 0,0 0,1.5 1.5h2a1.5,1.5 0,0 0,1.5 -1.5v-15A1.5,1.5 0,0 0,17.5 3h-2Z"
        )
    }

    val SkipNext24: ImageVector by lazy {
        buildVector(
            name = "SkipNext24",
            pathData = "M20,20a1,1 0,0 0,1 -1L21,5a1,1 0,0 0,-2 0v14a1,1 0,0 0,1 1ZM5.045,19.774L18,12 5.045,4.228A1.35,1.35 0,0 0,3 5.386v13.23a1.35,1.35 0,0 0,2.045 1.158Z"
        )
    }

    val SkipPrevious24: ImageVector by lazy {
        buildVector(
            name = "SkipPrevious24",
            pathData = "M4,4a1,1 0,0 0,-1 1v14a1,1 0,1 0,2 0L5,5a1,1 0,0 0,-1 -1ZM18.955,4.23L6,12.003l12.955,7.772A1.35,1.35 0,0 0,21 18.617L21,5.387a1.35,1.35 0,0 0,-2.045 -1.157Z"
        )
    }

    val Play36: ImageVector by lazy {
        buildVector(
            name = "Play36",
            pathData = "M7.5,6.934v22.132c0,1.74 1.89,2.822 3.39,1.94L33,18 10.89,4.995c-1.5,-0.883 -3.39,0.198 -3.39,1.939Z",
            sizeDp = 36f
        )
    }

    val Pause36: ImageVector by lazy {
        buildVector(
            name = "Pause36",
            pathData = "M12.75,4.5h-3A2.25,2.25 0,0 0,7.5 6.75v22.5a2.25,2.25 0,0 0,2.25 2.25h3A2.25,2.25 0,0 0,15 29.25L15,6.75a2.25,2.25 0,0 0,-2.25 -2.25ZM26.25,4.5h-3A2.25,2.25 0,0 0,21 6.75v22.5a2.25,2.25 0,0 0,2.25 2.25h3a2.25,2.25 0,0 0,2.25 -2.25L28.5,6.75a2.25,2.25 0,0 0,-2.25 -2.25Z",
            sizeDp = 36f
        )
    }

    val SkipNext36: ImageVector by lazy {
        buildVector(
            name = "SkipNext36",
            pathData = "M7.566,29.661 L27,18.002 7.566,6.342c-1.35,-0.81 -3.066,0.162 -3.066,1.736v19.847c0,1.574 1.717,2.546 3.066,1.736ZM30,30a1.5,1.5 0,0 0,1.5 -1.5v-21a1.5,1.5 0,1 0,-3 0v21A1.5,1.5 0,0 0,30 30Z",
            sizeDp = 36f
        )
    }

    val SkipPrevious36: ImageVector by lazy {
        buildVector(
            name = "SkipPrevious36",
            pathData = "M28.434,6.345 L9,18.005l19.434,11.66c1.35,0.809 3.066,-0.163 3.066,-1.737V8.08c0,-1.574 -1.717,-2.545 -3.066,-1.735ZM6,6a1.5,1.5 0,0 0,-1.5 1.5v21a1.5,1.5 0,0 0,3 0v-21A1.5,1.5 0,0 0,6 6Z",
            sizeDp = 36f
        )
    }

    val Shuffle24: ImageVector by lazy {
        buildVector(
            name = "Shuffle24",
            pathData = "M16.293,1.293a1,1 0,0 0,-0.001 1.415L18.585,5L17.21,5a7,7 0,0 0,-5.823 3.118L6.95,14.774A5,5 0,0 1,2.79 17L2,17a1,1 0,0 0,0 2h0.79a7,7 0,0 0,5.822 -3.117l4.438,-6.656A5,5 0,0 1,17.21 7h1.376l-2.293,2.293a1,1 0,0 0,1.414 1.414L22.414,6l-4.707,-4.707a1,1 0,0 0,-1.414 0ZM2.789,5L2,5a1,1 0,0 0,0 2h0.79a5,5 0,0 1,4.159 2.227l0.647,0.97 1.202,-1.802 -0.185,-0.277A7,7 0,0 0,2.789 5ZM16.293,13.293a1,1 0,0 0,-0.001 1.414L18.585,17L17.21,17a5,5 0,0 1,-4.16 -2.226l-0.648,-0.972 -1.202,1.803 0.186,0.278A7,7 0,0 0,17.21 19h1.376l-2.293,2.294 -0.068,0.076a1,1 0,0 0,1.406 1.406l0.076,-0.07L22.414,18l-4.707,-4.707a1,1 0,0 0,-1.414 0Z"
        )
    }

    val Repeat24: ImageVector by lazy {
        buildVector(
            name = "Repeat24",
            pathData = "M17.293,1.293a1,1 0,0 0,0 1.415L18.586,4H7a5,5 0,0 0,-5 5v4a1,1 0,1 0,2 0V9a3,3 0,0 1,3 -3h11.586l-1.293,1.293a1,1 0,0 0,1.414 1.415L22.414,5l-3.707,-3.707a1,1 0,0 0,-1.414 0ZM21,10a1,1 0,0 0,-1 1v4a3,3 0,0 1,-3 3H5.414l1.293,-1.292a1.001,1.001 0,0 0,-1.414 -1.415L1.586,19l3.707,3.707a1,1 0,1 0,1.414 -1.413L5.414,20H17a5,5 0,0 0,5 -5v-4a1,1 0,0 0,-1 -1Z"
        )
    }

    val RepeatOne24: ImageVector by lazy {
        buildVector(
            name = "RepeatOne24",
            pathData = "M17.293,1.293a1,1 0,0 0,0 1.415L18.586,4L7,4a5,5 0,0 0,-5 5v4a1,1 0,1 0,2 0L4,9a3,3 0,0 1,3 -3h11.586l-1.293,1.293a1,1 0,0 0,1.414 1.415L22.414,5l-3.707,-3.707a1,1 0,0 0,-1.414 0ZM13,15L13,8h-2.5a1,1 0,0 0,0 2h0.5v5a1,1 0,0 0,2 0ZM21,10a1,1 0,0 0,-1 1v4a3,3 0,0 1,-3 3L5.414,18l1.293,-1.292a1.001,1.001 0,0 0,-1.414 -1.415L1.586,19l3.707,3.707a1,1 0,1 0,1.414 -1.413L5.414,20L17,20a5,5 0,0 0,5 -5v-4a1,1 0,0 0,-1 -1Z"
        )
    }

    val PlayCircle24: ImageVector by lazy {
        buildVector(
            name = "PlayCircle24",
            pathData = "M12,1C5.925,1 1,5.925 1,12s4.925,11 11,11 11,-4.925 11,-11S18.075,1 12,1ZM9,16.8V7.2l8,4.8 -8,4.8Z"
        )
    }

    val Headset24: ImageVector by lazy {
        buildVector(
            name = "Headset24",
            pathData = "M12,3a9,9 0,0 0,-9 9v7a2,2 0,0 0,2 2h2a2,2 0,0 0,2 -2v-4a2,2 0,0 0,-2 -2H5v-1a7,7 0,1 1,14 0v1h-2a2,2 0,0 0,-2 2v4a2,2 0,0 0,2 2h2a2,2 0,0 0,2 -2v-7a9,9 0,0 0,-9 -9Z"
        )
    }

    val SleepTimer24: ImageVector by lazy {
        buildVector(
            name = "SleepTimer24",
            pathData = "M12.335,1.005A11.989,11.989 0,0 0,12 1C5.925,1 1,5.925 1,12s4.925,11 11,11a11,11 0,0 0,9.643 -5.704c0.422,-0.765 -0.429,-1.557 -1.29,-1.41a8,8 0,0 1,-7.458 -13.055c0.564,-0.666 0.313,-1.8 -0.56,-1.826ZM15.568,2.604a1,1 0,0 0,0.449 1.341,9 9,0 0,1 2.72,2.087 1,1 0,0 0,1.497 -1.326,11 11,0 0,0 -3.325,-2.55 1,1 0,0 0,-1.341 0.448ZM10.241,3.172A9.96,9.96 0,0 0,9 8c0,5.426 4.323,9.844 9.711,9.996a9,9 0,1 1,-8.47 -14.824ZM21.17,7.886a1,1 0,0 0,-0.632 1.264,9 9,0 0,1 0.446,3.4 1,1 0,1 0,1.997 0.122c0.085,-1.407 -0.1,-2.817 -0.546,-4.154a1,1 0,0 0,-1.265 -0.632Z"
        )
    }

    val ThumbUpFilled: ImageVector by lazy {
        buildVector(
            name = "ThumbUpFilled",
            pathData = "M10.72,2.18a3.263,3.263 0,0 1,2.352 4.063l-0.708,2.476a1,1 0,0 0,0.962 1.275h5.29c0.848,0 1.624,0.48 2.003,1.238l0.179,0.359a1.785,1.785 0,0 1,-0.6 2.279,0.446 0.446,0 0,0 -0.198,0.37v0.07c0,0.124 0.041,0.246 0.116,0.346a2.375,2.375 0,0 1,-0.41 3.278l-0.5,0.399a0.38,0.38 0,0 0,-0.123 0.416l0.07,0.206c0.217,0.653 0.1,1.372 -0.313,1.923a2.8,2.8 0,0 1,-2.24 1.12l-3.914,-0.002a12,12 0,0 1,-5.952 -1.584l-0.272,-0.155a2.002,2.002 0,0 0,-0.993 -0.265H3a1,1 0,0 1,-1 -1v-5.996a1,1 0,0 1,1.002 -1L5.789,12a1,1 0,0 0,0.945 -0.67l3.02,-8.628a0.816,0.816 0,0 1,0.967 -0.523Z"
        )
    }

    val ThumbUpOutline: ImageVector by lazy {
        buildVector(
            name = "ThumbUpOutline",
            pathData = "M9.221,1.795a1,1 0,0 1,1.109 -0.656l1.04,0.173a4,4 0,0 1,3.252 4.784L14,9h4.061a3.664,3.664 0,0 1,3.576 2.868A3.68,3.68 0,0 1,21 14.85l0.02,0.087A3.815,3.815 0,0 1,20 18.5v0.043l-0.01,0.227a2.82,2.82 0,0 1,-0.135 0.663l-0.106,0.282A3.754,3.754 0,0 1,16.295 22h-3.606l-0.392,-0.007a12.002,12.002 0,0 1,-5.223 -1.388l-0.343,-0.189 -0.27,-0.154a2.005,2.005 0,0 0,-0.863 -0.26l-0.13,-0.004L3.5,19.998a1.5,1.5 0,0 1,-1.5 -1.5L2,12.5A1.5,1.5 0,0 1,3.5 11h1.79l0.157,-0.013a1,1 0,0 0,0.724 -0.512l0.063,-0.145 2.987,-8.535ZM8.121,10.991A3,3 0,0 1,5.29 13L4,13v4.998h1.468a4,4 0,0 1,1.986 0.528l0.27,0.155 0.285,0.157A10,10 0,0 0,12.69 20h3.606c0.754,0 1.424,-0.483 1.663,-1.2l0.03,-0.126a0.819,0.819 0,0 0,0.012 -0.131v-0.872l0.587,-0.586c0.388,-0.388 0.577,-0.927 0.523,-1.465l-0.038,-0.23 -0.02,-0.087 -0.21,-0.9 0.55,-0.744A1.663,1.663 0,0 0,18.061 11L14,11a2.002,2.002 0,0 1,-1.956 -2.418l0.623,-2.904a2,2 0,0 0,-1.626 -2.392l-0.21,-0.035 -2.71,7.741Z"
        )
    }

    val ThumbDownFilled: ImageVector by lazy {
        buildVector(
            name = "ThumbDownFilled",
            pathData = "M11.313,2.002c2.088,0 4.14,0.546 5.953,1.583l0.273,0.156a2,2 0,0 0,0.993 0.264H21a1,1 0,0 1,1 1V11a1,1 0,0 1,-1.002 1l-2.787,-0.005a1,1 0,0 0,-0.946 0.67l-3.02,8.628a0.815,0.815 0,0 1,-0.966 0.522,3.262 3.262,0 0,1 -2.35,-4.062l0.707,-2.477a1,1 0,0 0,-0.961 -1.274h-5.29a2.24,2.24 0,0 1,-2.004 -1.238l-0.18,-0.359a1.784,1.784 0,0 1,0.601 -2.278,0.446 0.446,0 0,0 0.198,-0.37v-0.07a0.578,0.578 0,0 0,-0.116 -0.347,2.374 2.374,0 0,1 0.412,-3.278l0.498,-0.399a0.379,0.379 0,0 0,0.123 -0.415l-0.07,-0.207a2.1,2.1 0,0 1,0.313 -1.923A2.798,2.798 0,0 1,7.4 2l3.913,0.002Z"
        )
    }

    val ThumbDownOutline: ImageVector by lazy {
        buildVector(
            name = "ThumbDownOutline",
            pathData = "m11.31,2 l0.392,0.007c1.824,0.06 3.61,0.534 5.223,1.388l0.343,0.189 0.27,0.154c0.264,0.152 0.56,0.24 0.863,0.26l0.13,0.004H20.5a1.5,1.5 0,0 1,1.5 1.5V11.5a1.5,1.5 0,0 1,-1.5 1.5h-1.79l-0.158,0.013a1,1 0,0 0,-0.723 0.512l-0.064,0.145 -2.987,8.535a1,1 0,0 1,-1.109 0.656l-1.04,-0.174a4,4 0,0 1,-3.251 -4.783L10,15H5.938a3.664,3.664 0,0 1,-3.576 -2.868A3.682,3.682 0,0 1,3 9.15l-0.02,-0.088A3.816,3.816 0,0 1,4 5.5v-0.043l0.008,-0.227a2.86,2.86 0,0 1,0.136 -0.664l0.107,-0.28A3.754,3.754 0,0 1,7.705 2h3.605ZM7.705,4c-0.755,0 -1.425,0.483 -1.663,1.2l-0.032,0.126a0.818,0.818 0,0 0,-0.01 0.131v0.872l-0.587,0.586a1.816,1.816 0,0 0,-0.524 1.465l0.038,0.23 0.02,0.087 0.21,0.9 -0.55,0.744a1.686,1.686 0,0 0,-0.321 1.18l0.029,0.177c0.17,0.76 0.844,1.302 1.623,1.302H10a2.002,2.002 0,0 1,1.956 2.419l-0.623,2.904 -0.034,0.208a2.002,2.002 0,0 0,1.454 2.139l0.206,0.045 0.21,0.035 2.708,-7.741A3.001,3.001 0,0 1,18.71 11H20V6.002h-1.47c-0.696,0 -1.38,-0.183 -1.985,-0.528l-0.27,-0.155 -0.285,-0.157A10.002,10.002 0,0 0,11.31 4H7.705Z"
        )
    }

    val Share24: ImageVector by lazy {
        buildVector(
            name = "Share24",
            pathData = "M10,3.158L10,7.51c-5.428,0.223 -8.27,3.75 -8.875,11.199 -0.04,0.487 -0.07,0.975 -0.09,1.464l-0.014,0.395c-0.014,0.473 0.578,0.684 0.88,0.32 0.302,-0.368 0.61,-0.73 0.925,-1.086l0.244,-0.273c1.79,-1.967 3,-2.677 4.93,-2.917a18.011,18.011 0,0 1,2 -0.112v4.346a1,1 0,0 0,1.646 0.763l9.805,-8.297 1.55,-1.31 -1.55,-1.31 -9.805,-8.297A1,1 0,0 0,10 3.158ZM12,9.428v0.002,-4.116l7.904,6.688L12,18.689v-4.212l-2.023,0.024c-1.935,0.022 -3.587,0.17 -5.197,1.024a9,9 0,0 0,-1.348 0.893c0.355,-1.947 0.916,-3.39 1.63,-4.425 1.062,-1.541 2.607,-2.385 5.02,-2.485L12,9.428Z"
        )
    }

    val Download24: ImageVector by lazy {
        buildVector(
            name = "Download24",
            pathData = "M12,2a1,1 0,0 0,-1 1v11.586l-4.293,-4.293a1,1 0,1 0,-1.414 1.414L12,18.414l6.707,-6.707a1,1 0,1 0,-1.414 -1.414L13,14.586L13,3a1,1 0,0 0,-1 -1ZM19,20L5,20a1,1 0,0 0,0 2h14a1,1 0,0 0,0 -2Z"
        )
    }

    val Downloaded24: ImageVector by lazy {
        buildVector(
            name = "Downloaded24",
            pathData = "M12,2C6.5,2 2,6.5 2,12c0,5.5 4.5,10 10,10s10,-4.5 10,-10C22,6.5 17.5,2 12,2zM9.8,16.9l-3.3,-3.3l1.4,-1.4l1.9,1.9l6.3,-6.3l1.4,1.4L9.8,16.9z"
        )
    }

    val PlaylistAdd24: ImageVector by lazy {
        buildVector(
            name = "PlaylistAdd24",
            pathData = "M19,15a1,1 0,0 1,1 1v2h2a1,1 0,1 1,0 2h-2v2a1,1 0,1 1,-2 0v-2h-2a1,1 0,1 1,0 -2h2v-2a1,1 0,0 1,1 -1ZM13,19L4,19a1,1 0,1 1,0 -2h9v2ZM20,11a1,1 0,1 1,0 2L4,13a1,1 0,1 1,0 -2h16ZM20,5a1,1 0,1 1,0 2L4,7a1,1 0,0 1,0 -2h16Z"
        )
    }

    val QueueNext24: ImageVector by lazy {
        buildVector(
            name = "QueueNext24",
            pathData = "M6,2.86L6,5L3,5a1,1 0,0 0,-1 1v12a1,1 0,1 0,2 0L4,7h2v2.137a0.5,0.5 0,0 0,0.748 0.434L13,5.998 6.748,2.426A0.5,0.5 0,0 0,6 2.86ZM21,5h-5a1,1 0,1 0,0 2h5a1,1 0,1 0,0 -2ZM21,11L9,11a1,1 0,0 0,0 2h12a1,1 0,0 0,0 -2ZM21,17L9,17a1,1 0,0 0,0 2h12a1,1 0,0 0,0 -2Z"
        )
    }

    val RadioLive24: ImageVector by lazy {
        buildVector(
            name = "RadioLive24",
            pathData = "M14,12c0,1.1 -0.9,2 -2,2s-2,-0.9 -2,-2s0.9,-2 2,-2S14,10.9 14,12zM8.48,8.45L7.77,7.75C6.68,8.83 6,10.34 6,12s0.68,3.17 1.77,4.25l0.71,-0.71C7.57,14.64 7,13.39 7,12S7.57,9.36 8.48,8.45zM16.23,7.75l-0.71,0.71C16.43,9.36 17,10.61 17,12s-0.57,2.64 -1.48,3.55l0.71,0.71C17.32,15.17 18,13.66 18,12S17.32,8.83 16.23,7.75zM5.65,5.63L4.95,4.92C3.13,6.73 2,9.24 2,12s1.13,5.27 2.95,7.08l0.71,-0.71C4.02,16.74 3,14.49 3,12S4.02,7.26 5.65,5.63zM19.05,4.92l-0.71,0.71C19.98,7.26 21,9.51 21,12s-1.02,4.74 -2.65,6.37l0.71,0.71C20.87,17.27 22,14.76 22,12S20.87,6.73 19.05,4.92z"
        )
    }

    val Pin24: ImageVector by lazy {
        buildVector(
            name = "Pin24",
            pathData = "M21.007,6.298 L11.7,0.924a0.85,0.85 0,0 0,-0.85 1.47l0.736,0.425 -3.394,5.878 -1.718,0.46a1.5,1.5 0,0 0,-0.91 0.698l-1.012,1.753a0.75,0.75 0,0 0,0.274 1.024l9.479,5.473a0.75,0.75 0,0 0,1.024 -0.275l1.01,-1.752a1.5,1.5 0,0 0,0.15 -1.14l-0.46,-1.715 3.395,-5.88 0.734,0.425a0.85,0.85 0,0 0,0.849 -1.47ZM7.15,21.814l3.395,-5.88 -1.96,-1.13 -3.393,5.88 -0.152,2.524 2.11,-1.394Z"
        )
    }

    val LyricsBubble24: ImageVector by lazy {
        buildVector(
            name = "LyricsBubble24",
            pathData = "M16,2L4,2a3,3 0,0 0,-3 3v8a3,3 0,0 0,3 3h1v2.14a0.8,0.8 0,0 0,1.188 0.7L11.3,16L16,16a3,3 0,0 0,3 -3L19,5a3,3 0,0 0,-3 -3ZM4,4h12a1,1 0,0 1,1 1v8a1,1 0,0 1,-1 1h-5.218l-0.452,0.252L7,16.1L7,14L4,14a1,1 0,0 1,-1 -1L3,5a1,1 0,0 1,1 -1ZM21,6.174A3,3 0,0 1,23 9v8a3,3 0,0 1,-2.846 2.996L20,20v2.14a0.8,0.8 0,0 1,-1.189 0.7L13.701,20L8.216,20l3.6,-2h2.402l0.453,0.252L18,20.101L18,18.05l1.95,-0.05 0.113,-0.003A1,1 0,0 0,21 17L21,6.174Z"
        )
    }

    val Add24: ImageVector by lazy {
        buildVector(
            name = "Add24",
            pathData = "M12,3a1,1 0,0 0,-1 1v7H4a1,1 0,0 0,0 2h7v7a1,1 0,0 0,2 0v-7h7a1,1 0,0 0,0 -2h-7V4a1,1 0,0 0,-1 -1Z"
        )
    }

    val Check24: ImageVector by lazy {
        buildVector(
            name = "Check24",
            pathData = "M19.793,5.793 L8.5,17.086l-4.293,-4.293a1,1 0,1 0,-1.414 1.414L8.5,19.914 21.207,7.207a1,1 0,1 0,-1.414 -1.414Z"
        )
    }

    val CheckCircle24: ImageVector by lazy {
        buildVector(
            name = "CheckCircle24",
            pathData = "M12,1C5.925,1 1,5.925 1,12s4.925,11 11,11 11,-4.925 11,-11S18.075,1 12,1ZM12,3a9,9 0,1 1,0 18.001A9,9 0,0 1,12 3ZM16.293,8.293L10,14.586l-2.293,-2.293a1,1 0,1 0,-1.414 1.414L10,17.414l7.707,-7.707a1,1 0,1 0,-1.414 -1.414Z"
        )
    }

    val Sort24: ImageVector by lazy {
        buildVector(
            name = "Sort24",
            pathData = "M21,5L3,5a1,1 0,0 0,0 2h18a1,1 0,1 0,0 -2ZM15,11L3,11a1,1 0,0 0,0 2h12a1,1 0,0 0,0 -2ZM9,17L3,17a1,1 0,0 0,0 2h6a1,1 0,0 0,0 -2Z"
        )
    }

    val Mix24: ImageVector by lazy {
        buildVector(
            name = "Mix24",
            pathData = "M18.364,4.222a1,1 0,0 1,1.414 0,11 11,0 0,1 0,15.556 1,1 0,0 1,-1.414 -1.414,9.001 9.001,0 0,0 0,-12.728 1,1 0,0 1,0 -1.414ZM4.222,4.219a1,1 0,0 1,1.414 1.414,9.001 9.001,0 0,0 0,12.728 1,1 0,0 1,-1.414 1.414,11.002 11.002,0 0,1 0,-15.556ZM15.535,7.054c0.39,-0.39 1.025,-0.39 1.415,0a7,7 0,0 1,0 9.9,1.001 1.001,0 0,1 -1.415,-1.415 5,5 0,0 0,0 -7.07,1.001 1.001,0 0,1 0,-1.415ZM7.05,7.05a1.001,1.001 0,0 1,1.415 1.415,5 5,0 0,0 0,7.07A1.001,1.001 0,0 1,7.05 16.95a7.002,7.002 0,0 1,0 -9.9ZM15,12l-5,3L10,9l5,3Z"
        )
    }

    val PersonAudio24: ImageVector by lazy {
        buildVector(
            name = "PersonAudio24",
            pathData = "M12,2a5,5 0,1 0,0 10,5 5,0 0,0 0,-10ZM12,4a3,3 0,1 1,0 6,3 3,0 0,1 0,-6ZM19,12.888v4.286a3,3 0,1 0,1.996 2.98L21,20v-4.301l2.614,1.57A0.255,0.255 0,0 0,24 17.05v-1.743a0.5,0.5 0,0 0,-0.241 -0.428l-4,-2.42a0.5,0.5 0,0 0,-0.759 0.429ZM12,13a8,8 0,0 0,-8 8,1 1,0 1,0 2,0 6,6 0,0 1,9.121 -5.122l1.444,-1.444A8,8 0,0 0,12 13ZM18,19a1,1 0,1 1,0 2,1 1,0 0,1 0,-2Z"
        )
    }

    val Album24: ImageVector by lazy {
        buildVector(
            name = "Album24",
            pathData = "M12,1C5.925,1 1,5.925 1,12s4.925,11 11,11 11,-4.925 11,-11S18.075,1 12,1ZM12,3a9,9 0,1 1,0 18.001A9,9 0,0 1,12 3ZM16.242,7.051a0.5,0.5 0,0 0,0 0.707,6 6,0 0,1 1.553,2.69 0.5,0.5 0,0 0,0.967 -0.26,7 7,0 0,0 -1.813,-3.137 0.5,0.5 0,0 0,-0.707 0ZM14.828,8.465a0.5,0.5 0,0 0,0 0.707,4 4,0 0,1 1.035,1.793 0.5,0.5 0,1 0,0.966 -0.259,5 5,0 0,0 -1.294,-2.241 0.5,0.5 0,0 0,-0.707 0ZM12,9a3,3 0,1 0,0 6,3 3,0 0,0 0,-6ZM12,11a1,1 0,1 1,0 2,1 1,0 0,1 0,-2ZM7.523,12.682a0.5,0.5 0,0 0,-0.353 0.612,5 5,0 0,0 1.294,2.242 0.501,0.501 0,0 0,0.708 -0.708,4 4,0 0,1 -1.036,-1.793 0.5,0.5 0,0 0,-0.613 -0.353ZM5.592,13.2a0.496,0.496 0,0 0,-0.354 0.612A7,7 0,0 0,7.05 16.95a0.5,0.5 0,1 0,0.707 -0.707,6 6,0 0,1 -1.553,-2.69 0.5,0.5 0,0 0,-0.612 -0.353Z"
        )
    }
}

/**
 * Authentic TIDAL 4-Diamond Monogram drawn to match kv-tidal/frontend/src/components/Logo.tsx.
 */
@Composable
fun TidalDiamondLogo(
    modifier: Modifier = Modifier,
    color: Color = TidalCyan
) {
    Canvas(modifier = modifier) {
        val sx = size.width / 24f
        val sy = size.height / 16f
        val diamonds = listOf(
            listOf(4f to 0f, 8f to 4f, 4f to 8f, 0f to 4f),
            listOf(12f to 0f, 16f to 4f, 12f to 8f, 8f to 4f),
            listOf(20f to 0f, 24f to 4f, 20f to 8f, 16f to 4f),
            listOf(12f to 8f, 16f to 12f, 12f to 16f, 8f to 12f)
        )
        diamonds.forEach { pts ->
            val path = Path().apply {
                moveTo(pts[0].first * sx, pts[0].second * sy)
                lineTo(pts[1].first * sx, pts[1].second * sy)
                lineTo(pts[2].first * sx, pts[2].second * sy)
                lineTo(pts[3].first * sx, pts[3].second * sy)
                close()
            }
            drawPath(path = path, color = color)
        }
    }
}

/**
 * KV Tidal Studio Squircle Brand Mark: electric cyan gradient squircle + obsidian studio disc + 4-diamond TIDAL emblem.
 */
@Composable
fun KvTidalBrandMark(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val s = size.minDimension / 512f
        val squircleOffset = Offset(16f * s, 16f * s)
        val squircleSize = Size(480f * s, 480f * s)
        val squircleRadius = CornerRadius(112f * s, 112f * s)

        drawRoundRect(
            brush = Brush.linearGradient(
                colors = listOf(
                    Color(0xFF22D3EE),
                    Color(0xFF06B6D4),
                    Color(0xFF0E7490)
                ),
                start = Offset(48f * s, 24f * s),
                end = Offset(464f * s, 488f * s)
            ),
            topLeft = squircleOffset,
            size = squircleSize,
            cornerRadius = squircleRadius
        )
        drawRoundRect(
            color = Color.White.copy(alpha = 0.22f),
            topLeft = Offset(20f * s, 20f * s),
            size = Size(472f * s, 472f * s),
            cornerRadius = CornerRadius(108f * s, 108f * s),
            style = Stroke(width = 4f * s)
        )

        val center = Offset(256f * s, 256f * s)
        drawCircle(color = Color(0xFF0A0D12), radius = 178f * s, center = center)
        drawCircle(
            color = TidalCyan.copy(alpha = 0.42f),
            radius = 178f * s,
            center = center,
            style = Stroke(width = 4f * s)
        )

        // Draw 4-diamond monogram centered inside the disc
        val originX = 136f * s
        val originY = 176f * s
        val ds = 10f * s
        val diamonds = listOf(
            listOf(4f to 0f, 8f to 4f, 4f to 8f, 0f to 4f),
            listOf(12f to 0f, 16f to 4f, 12f to 8f, 8f to 4f),
            listOf(20f to 0f, 24f to 4f, 20f to 8f, 16f to 4f),
            listOf(12f to 8f, 16f to 12f, 12f to 16f, 8f to 12f)
        )
        diamonds.forEach { pts ->
            val path = Path().apply {
                moveTo(originX + pts[0].first * ds, originY + pts[0].second * ds)
                lineTo(originX + pts[1].first * ds, originY + pts[1].second * ds)
                lineTo(originX + pts[2].first * ds, originY + pts[2].second * ds)
                lineTo(originX + pts[3].first * ds, originY + pts[3].second * ds)
                close()
            }
            drawPath(path = path, color = TidalCyan)
        }
    }
}

@Composable
fun QualityBadgePill(
    text: String,
    isMax: Boolean,
    modifier: Modifier = Modifier
) {
    val fg = if (isMax) TidalMaxGold else TidalCyan
    val bg = if (isMax) TidalMaxGoldDim else TidalCyanDim
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(4.dp),
        color = bg,
        border = BorderStroke(0.8.dp, fg.copy(alpha = 0.45f))
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp)
        ) {
            Text(
                text = text,
                fontSize = 9.sp,
                lineHeight = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.4.sp,
                color = fg,
                maxLines = 1
            )
        }
    }
}
