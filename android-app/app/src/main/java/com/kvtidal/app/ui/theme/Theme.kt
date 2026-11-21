package com.kvtidal.app.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

val TidalDarkColorScheme = darkColorScheme(
    primary = TidalCyan,
    onPrimary = TidalPureBlack,
    primaryContainer = TidalCardHover,
    onPrimaryContainer = TidalWhite,
    secondary = TidalCyanAccent,
    onSecondary = TidalPureBlack,
    tertiary = TidalMaxGold,
    onTertiary = TidalPureBlack,
    background = TidalPureBlack,
    onBackground = TidalWhite,
    surface = TidalSurface,
    onSurface = TidalWhite,
    surfaceVariant = TidalCardHover,
    onSurfaceVariant = TidalWhite67,
    outline = TidalWhite15,
    error = TidalRedError,
    onError = TidalPureWhite
)

@Composable
fun KVTidalTheme(
    content: @Composable () -> Unit
) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            window.statusBarColor = android.graphics.Color.TRANSPARENT
            window.navigationBarColor = TidalSurface.toArgb()
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = false
                isAppearanceLightNavigationBars = false
            }
        }
    }

    MaterialTheme(
        colorScheme = TidalDarkColorScheme,
        typography = Typography,
        content = content
    )
}
