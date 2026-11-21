package com.kvtidal.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.kvtidal.app.R

val TidalDisplayFontFamily = FontFamily(
    Font(R.font.yt_sans_medium, FontWeight.Medium),
    Font(R.font.yt_sans_medium, FontWeight.SemiBold),
    Font(R.font.yt_sans_bold, FontWeight.Bold),
    Font(R.font.yt_sans_bold, FontWeight.Black)
)

// Alias kept consistent with KV-Music components
val YouTubeSansFontFamily = TidalDisplayFontFamily

val YtmDisplay01 = TextStyle(
    fontFamily = TidalDisplayFontFamily,
    fontWeight = FontWeight.Bold,
    fontSize = 28.sp,
    lineHeight = 34.sp,
    letterSpacing = (-0.04).em,
    color = TidalWhite
)

val YtmDisplay02 = TextStyle(
    fontFamily = TidalDisplayFontFamily,
    fontWeight = FontWeight.Bold,
    fontSize = 22.sp,
    lineHeight = 28.sp,
    letterSpacing = (-0.04).em,
    color = TidalWhite
)

val YtmEntityHeaderTitle = TextStyle(
    fontFamily = TidalDisplayFontFamily,
    fontWeight = FontWeight.Bold,
    fontSize = 24.sp,
    lineHeight = 30.sp,
    letterSpacing = (-0.04).em,
    color = TidalWhite
)

val YtmTitle03 = TextStyle(
    fontFamily = TidalDisplayFontFamily,
    fontWeight = FontWeight.Bold,
    fontSize = 18.sp,
    lineHeight = 24.sp,
    color = TidalWhite
)

val YtmTitle02 = TextStyle(
    fontFamily = FontFamily.SansSerif,
    fontWeight = FontWeight.Medium,
    fontSize = 14.sp,
    lineHeight = 18.sp,
    color = TidalWhite
)

val YtmSubtitle01 = TextStyle(
    fontFamily = FontFamily.SansSerif,
    fontWeight = FontWeight.Normal,
    fontSize = 14.sp,
    lineHeight = 18.sp,
    color = TidalWhite67
)

val YtmCaption02 = TextStyle(
    fontFamily = FontFamily.SansSerif,
    fontWeight = FontWeight.Normal,
    fontSize = 12.sp,
    lineHeight = 16.sp,
    color = TidalWhite67
)

val YtmCaption03 = TextStyle(
    fontFamily = FontFamily.SansSerif,
    fontWeight = FontWeight.Normal,
    fontSize = 10.sp,
    lineHeight = 14.sp,
    color = TidalWhite67
)

val Typography = Typography(
    headlineLarge = YtmDisplay01.copy(color = Color.Unspecified),
    headlineMedium = YtmDisplay02.copy(color = Color.Unspecified),
    titleLarge = YtmTitle03.copy(color = Color.Unspecified),
    titleMedium = YtmTitle02.copy(color = Color.Unspecified),
    bodyLarge = YtmSubtitle01.copy(color = Color.Unspecified),
    bodyMedium = YtmSubtitle01.copy(color = Color.Unspecified),
    labelLarge = YtmTitle02.copy(color = Color.Unspecified),
    labelMedium = YtmCaption02.copy(color = Color.Unspecified),
    labelSmall = YtmCaption03.copy(color = Color.Unspecified)
)
