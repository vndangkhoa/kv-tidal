package com.kvtidal.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.ripple.rememberRipple
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kvtidal.app.ui.theme.*

sealed class NavScreen(
    val route: String,
    val title: String,
    val icon: ImageVector,
    val unselectedIcon: ImageVector = icon
) {
    object Home : NavScreen(
        route = "home",
        title = "Home",
        icon = YtmIcons.HomeFilled,
        unselectedIcon = YtmIcons.HomeOutline
    )

    object Search : NavScreen(
        route = "search",
        title = "Explore",
        icon = YtmIcons.ExploreFilled,
        unselectedIcon = YtmIcons.ExploreOutline
    )

    object Library : NavScreen(
        route = "library",
        title = "Library",
        icon = YtmIcons.LibraryFilled,
        unselectedIcon = YtmIcons.LibraryOutline
    )

    object Settings : NavScreen(
        route = "settings",
        title = "Settings",
        icon = YtmIcons.SettingsGear24,
        unselectedIcon = YtmIcons.SettingsGear24
    )
}

@Composable
fun BottomNavBar(
    currentRoute: String,
    onNavigate: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val items = listOf(
        NavScreen.Home,
        NavScreen.Search,
        NavScreen.Library,
        NavScreen.Settings
    )

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .height(56.dp),
        color = TidalSurface,
        tonalElevation = 0.dp,
        shadowElevation = 0.dp
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(TidalWhite08)
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                verticalAlignment = Alignment.Top
            ) {
                items.forEach { screen ->
                    val isSelected = currentRoute == screen.route
                    val tint = if (isSelected) TidalCyan else TidalWhite67
                    val tabIcon = if (isSelected) screen.icon else screen.unselectedIcon
                    val interactionSource = remember { MutableInteractionSource() }

                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .defaultMinSize(minWidth = 48.dp)
                            .selectable(
                                selected = isSelected,
                                interactionSource = interactionSource,
                                indication = rememberRipple(bounded = false, color = TidalCyan.copy(alpha = 0.25f)),
                                role = Role.Tab,
                                onClick = { onNavigate(screen.route) }
                            )
                            .padding(top = 6.dp, start = 4.dp, end = 4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = tabIcon,
                            contentDescription = screen.title,
                            tint = tint,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = screen.title,
                            style = YtmCaption03.copy(
                                color = tint,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                            ),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }
    }
}

/**
 * Adaptive NavigationRail for Foldables & Tablets (>= 600dp width).
 */
@Composable
fun TidalNavigationRail(
    currentRoute: String,
    onNavigate: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val items = listOf(
        NavScreen.Home,
        NavScreen.Search,
        NavScreen.Library,
        NavScreen.Settings
    )

    Row(modifier = modifier.fillMaxHeight()) {
        Column(
            modifier = Modifier
                .width(84.dp)
                .fillMaxHeight()
                .background(TidalSurface)
                .windowInsetsPadding(WindowInsets.systemBars.only(WindowInsetsSides.Start + WindowInsetsSides.Top + WindowInsetsSides.Bottom))
                .padding(vertical = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            KvTidalBrandMark(modifier = Modifier.size(34.dp))
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "TIDAL",
                fontSize = 10.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 1.4.sp,
                color = TidalCyan
            )
            Spacer(modifier = Modifier.height(24.dp))

            items.forEach { screen ->
                val isSelected = currentRoute == screen.route
                val tint = if (isSelected) TidalCyan else TidalWhite67
                val tabIcon = if (isSelected) screen.icon else screen.unselectedIcon

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = rememberRipple(color = TidalCyan.copy(alpha = 0.2f)),
                            role = Role.Tab,
                            onClick = { onNavigate(screen.route) }
                        )
                ) {
                    if (isSelected) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.CenterStart)
                                .width(3.dp)
                                .height(28.dp)
                                .clip(RoundedCornerShape(topEnd = 3.dp, bottomEnd = 3.dp))
                                .background(TidalCyan)
                        )
                    }

                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp, horizontal = 6.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (isSelected) TidalCyanDim else Color.Transparent)
                                .padding(horizontal = 14.dp, vertical = 5.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = tabIcon,
                                contentDescription = screen.title,
                                tint = tint,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = screen.title,
                            fontSize = 11.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                            color = tint,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.weight(1f))

            QualityBadgePill(
                text = "24-BIT",
                isMax = true,
                modifier = Modifier.padding(bottom = 4.dp)
            )
        }

        Box(
            modifier = Modifier
                .width(1.dp)
                .fillMaxHeight()
                .background(TidalWhite08)
        )
    }
}
