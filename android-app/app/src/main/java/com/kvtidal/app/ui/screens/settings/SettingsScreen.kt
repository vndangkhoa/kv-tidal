package com.kvtidal.app.ui.screens.settings

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kvtidal.app.data.api.RetrofitClient
import com.kvtidal.app.data.model.TidalSettingsResponse
import com.kvtidal.app.data.repository.AuthRepository
import com.kvtidal.app.data.repository.MusicRepository
import com.kvtidal.app.data.update.AppUpdateInfo
import com.kvtidal.app.data.update.UpdateChecker
import com.kvtidal.app.player.AudioCacheManager
import com.kvtidal.app.player.PlayerManager
import com.kvtidal.app.ui.adaptive.LocalWindowState
import com.kvtidal.app.ui.adaptive.MaxContentWidthDp
import com.kvtidal.app.ui.components.KvTidalBrandMark
import com.kvtidal.app.ui.components.QualityBadgePill
import com.kvtidal.app.ui.components.YtmIcons
import com.kvtidal.app.ui.theme.*
import kotlinx.coroutines.launch
import java.util.Locale

private data class QualityModeOption(
    val id: String,
    val title: String,
    val subtitle: String,
    val isMax: Boolean
)

private val QUALITY_OPTIONS = listOf(
    QualityModeOption(
        id = "HI_RES_LOSSLESS",
        title = "Hi-Res Lossless (MAX)",
        subtitle = "Up to 24-bit / 192kHz FLAC & DSD passthrough",
        isMax = true
    ),
    QualityModeOption(
        id = "LOSSLESS",
        title = "Lossless CD Quality",
        subtitle = "16-bit / 44.1kHz uncompressed FLAC",
        isMax = false
    ),
    QualityModeOption(
        id = "OPUS",
        title = "Low Bandwidth (OPUS)",
        subtitle = "Data saver transcode via KV Tidal backend",
        isMax = false
    )
)

@Composable
fun SettingsScreen(
    musicRepo: MusicRepository,
    authRepo: AuthRepository,
    onBack: () -> Unit,
    bottomPadding: Dp = 0.dp
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val windowState = LocalWindowState.current

    val isServerOnline by authRepo.isServerOnline.collectAsState()
    val latencyMs by authRepo.serverLatencyMs.collectAsState()
    val librarySummary by authRepo.librarySummary.collectAsState()
    val totalDownloadBytes by PlayerManager.totalDownloadBytes.collectAsState()

    var serverUrlInput by remember { mutableStateOf(RetrofitClient.getBaseUrl()) }
    var isTestingHost by remember { mutableStateOf(false) }

    var selectedQuality by remember { mutableStateOf(RetrofitClient.getStreamQualityMode()) }
    var audioCacheBytes by remember { mutableLongStateOf(AudioCacheManager.getCacheSizeBytes(context)) }

    var serverSettings by remember { mutableStateOf<TidalSettingsResponse?>(null) }
    var tidalTokenInput by remember { mutableStateOf("") }
    var engineStatusMsg by remember { mutableStateOf<String?>(null) }
    var isTestingEngines by remember { mutableStateOf(false) }

    var isCheckingUpdate by remember { mutableStateOf(false) }
    var updateInfo by remember { mutableStateOf<AppUpdateInfo?>(null) }
    var updateStatusText by remember { mutableStateOf<String?>(null) }
    var showClearDataDialog by remember { mutableStateOf(false) }

    val currentVersionName = remember(context) {
        runCatching {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "1.0.0"
        }.getOrDefault("1.0.0")
    }

    LaunchedEffect(Unit) {
        musicRepo.getSettings().onSuccess { serverSettings = it }
    }

    val horizontalGutter = if (windowState.isWide) 24.dp else 16.dp

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(TidalPureBlack)
            .statusBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = MaxContentWidthDp.dp)
                .padding(horizontal = 8.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = YtmIcons.ArrowLeft24,
                    contentDescription = "Back",
                    tint = TidalPureWhite
                )
            }
            KvTidalBrandMark(modifier = Modifier.size(26.dp))
            Spacer(modifier = Modifier.width(10.dp))
            Text(
                text = "KV Tidal Settings",
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = TidalPureWhite
            )
            Spacer(modifier = Modifier.weight(1f))
            QualityBadgePill(text = "v$currentVersionName", isMax = true)
            Spacer(modifier = Modifier.width(12.dp))
        }

        val serverCard: @Composable () -> Unit = {
            SettingsCardContainer(
                title = "KV Tidal Server Host",
                badgeText = if (isServerOnline) "ONLINE ${latencyMs ?: 0}ms" else "OFFLINE",
                badgeAccent = if (isServerOnline) TidalEmerald else TidalRedError
            ) {
                Text(
                    text = "Point to your Synology NAS Reverse Proxy or LAN IP (port 26784).",
                    fontSize = 12.sp,
                    color = TidalGrey05
                )
                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = serverUrlInput,
                    onValueChange = { serverUrlInput = it },
                    singleLine = true,
                    label = { Text("Server URL", color = TidalGrey05) },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = TidalCyan,
                        unfocusedBorderColor = TidalWhite20,
                        focusedTextColor = TidalPureWhite,
                        unfocusedTextColor = TidalPureWhite,
                        cursorColor = TidalCyan
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    PresetHostButton(
                        label = "Public HTTPS",
                        onClick = { serverUrlInput = RetrofitClient.DEFAULT_BASE_URL },
                        modifier = Modifier.weight(1f)
                    )
                    PresetHostButton(
                        label = "Synology LAN",
                        onClick = { serverUrlInput = "http://192.168.1.10:26784" },
                        modifier = Modifier.weight(1f)
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))
                Button(
                    onClick = {
                        if (isTestingHost) return@Button
                        scope.launch {
                            isTestingHost = true
                            RetrofitClient.setBaseUrl(serverUrlInput)
                            serverUrlInput = RetrofitClient.getBaseUrl()
                            val res = authRepo.refreshServerStatus()
                            musicRepo.getSettings().onSuccess { serverSettings = it }
                            if (res.isSuccess) {
                                Toast.makeText(
                                    context,
                                    "Connected (${authRepo.serverLatencyMs.value ?: 0}ms)",
                                    Toast.LENGTH_SHORT
                                ).show()
                            } else {
                                Toast.makeText(
                                    context,
                                    "Unreachable: ${res.exceptionOrNull()?.message ?: "timeout"}",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                            isTestingHost = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = TidalCyan,
                        contentColor = TidalPureBlack
                    ),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    if (isTestingHost) {
                        CircularProgressIndicator(
                            color = TidalPureBlack,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(18.dp)
                        )
                    } else {
                        Text("Save & Test Connection", fontWeight = FontWeight.Bold)
                    }
                }

                librarySummary?.let { sum ->
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Vault: ${sum.totalTracks} tracks • ${sum.totalHires} Hi-Res • OpenSubsonic user: ${sum.subsonicUser}",
                        fontSize = 11.sp,
                        color = TidalCyanAccent
                    )
                }
            }
        }

        val audioCard: @Composable () -> Unit = {
            SettingsCardContainer(
                title = "Audio Quality & Cache",
                badgeText = if (selectedQuality == "HI_RES_LOSSLESS") "MAX 24-BIT" else selectedQuality,
                badgeAccent = if (selectedQuality == "HI_RES_LOSSLESS") TidalMaxGold else TidalCyan
            ) {
                QUALITY_OPTIONS.forEach { opt ->
                    val chosen = selectedQuality == opt.id
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = if (chosen) TidalCyanDim else TidalSurface,
                        border = BorderStroke(
                            1.dp,
                            if (chosen) TidalCyanAccent else TidalWhite10
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .clickable {
                                selectedQuality = opt.id
                                RetrofitClient.setStreamQualityMode(opt.id)
                                Toast.makeText(
                                    context,
                                    "Streaming quality: ${opt.title}",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Text(
                                        text = opt.title,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = TidalPureWhite
                                    )
                                    if (opt.isMax) {
                                        QualityBadgePill(text = "MAX", isMax = true)
                                    }
                                }
                                Text(
                                    text = opt.subtitle,
                                    fontSize = 11.sp,
                                    color = TidalGrey05
                                )
                            }
                            if (chosen) {
                                Icon(
                                    imageVector = YtmIcons.CheckCircle24,
                                    contentDescription = "Selected",
                                    tint = TidalCyan,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "ExoPlayer Streaming Cache",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TidalPureWhite
                        )
                        Text(
                            text = "Used: ${formatMbSize(audioCacheBytes)} / 250 MB • Offline: ${formatMbSize(totalDownloadBytes)}",
                            fontSize = 11.sp,
                            color = TidalGrey05
                        )
                    }
                    OutlinedButton(
                        onClick = {
                            AudioCacheManager.clearCache(context)
                            audioCacheBytes = AudioCacheManager.getCacheSizeBytes(context)
                            Toast.makeText(context, "Streaming cache cleared", Toast.LENGTH_SHORT).show()
                        },
                        border = BorderStroke(1.dp, TidalWhite20),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Clear Cache", color = TidalPureWhite, fontSize = 12.sp)
                    }
                }
            }
        }

        val engineCard: @Composable () -> Unit = {
            SettingsCardContainer(
                title = "Server Engines (TIDAL & Soulseek)",
                badgeText = if (serverSettings?.tidalHasToken == true) "TOKEN READY" else "SERVER CFG",
                badgeAccent = if (serverSettings?.tidalHasToken == true) TidalEmerald else TidalMaxGold
            ) {
                val cfg = serverSettings
                Text(
                    text = buildString {
                        append("TIDAL Token: ")
                        append(
                            if (cfg?.tidalHasToken == true) {
                                cfg.tidalTokenMasked ?: "Configured"
                            } else "Not configured on server"
                        )
                        append("\nSoulseek (slskd): ")
                        append(if (cfg?.soulseekEnabled == true) "Enabled" else "Disabled")
                        append(" • Quality: ${cfg?.tidalQuality ?: "HI_RES_LOSSLESS"}")
                    },
                    fontSize = 12.sp,
                    color = TidalGrey04,
                    lineHeight = 18.sp
                )

                Spacer(modifier = Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = {
                            if (isTestingEngines) return@OutlinedButton
                            scope.launch {
                                isTestingEngines = true
                                val res = musicRepo.testTidalToken()
                                engineStatusMsg = res.fold(
                                    onSuccess = { "TIDAL: ${it.message}" },
                                    onFailure = { "TIDAL error: ${it.message}" }
                                )
                                isTestingEngines = false
                            }
                        },
                        border = BorderStroke(1.dp, TidalCyanAccent.copy(alpha = 0.6f)),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Test TIDAL", color = TidalCyan, fontSize = 12.sp)
                    }

                    OutlinedButton(
                        onClick = {
                            if (isTestingEngines) return@OutlinedButton
                            scope.launch {
                                isTestingEngines = true
                                val res = musicRepo.testSoulseek()
                                engineStatusMsg = res.fold(
                                    onSuccess = { "Soulseek: ${it.message}" },
                                    onFailure = { "Soulseek error: ${it.message}" }
                                )
                                isTestingEngines = false
                            }
                        },
                        border = BorderStroke(1.dp, TidalWhite20),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Test Soulseek", color = TidalPureWhite, fontSize = 12.sp)
                    }
                }

                if (!engineStatusMsg.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = engineStatusMsg!!,
                        fontSize = 12.sp,
                        color = TidalCyanAccent
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))
                OutlinedTextField(
                    value = tidalTokenInput,
                    onValueChange = { tidalTokenInput = it },
                    singleLine = true,
                    label = { Text("Update Server TIDAL Token (optional)", color = TidalGrey05) },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = TidalCyan,
                        unfocusedBorderColor = TidalWhite20,
                        focusedTextColor = TidalPureWhite,
                        unfocusedTextColor = TidalPureWhite,
                        cursorColor = TidalCyan
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    onClick = {
                        scope.launch {
                            val tok = tidalTokenInput.trim().takeIf { it.isNotEmpty() }
                            val res = musicRepo.updateSettings(token = tok, quality = selectedQuality)
                            if (res.isSuccess) {
                                tidalTokenInput = ""
                                musicRepo.getSettings().onSuccess { serverSettings = it }
                                Toast.makeText(context, "Server settings updated", Toast.LENGTH_SHORT).show()
                            } else {
                                Toast.makeText(
                                    context,
                                    "Update failed: ${res.exceptionOrNull()?.message ?: "error"}",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = TidalCardHover,
                        contentColor = TidalPureWhite
                    ),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Push Quality / Token to Server", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }

        val updatesCard: @Composable () -> Unit = {
            SettingsCardContainer(
                title = "App Info & Adaptive Updates",
                badgeText = "${windowState.widthClass.name.uppercase()} • ${windowState.foldPosture.name.uppercase()}",
                badgeAccent = TidalCyanAccent
            ) {
                Text(
                    text = "Viewport: ${windowState.widthDp}x${windowState.heightDp}dp • Navigation: ${if (windowState.useNavigationRail) "Side Rail" else "Bottom Bar"}",
                    fontSize = 12.sp,
                    color = TidalGrey04
                )
                Spacer(modifier = Modifier.height(10.dp))

                Button(
                    onClick = {
                        if (isCheckingUpdate) return@Button
                        scope.launch {
                            isCheckingUpdate = true
                            val info = UpdateChecker.fetchLatest()
                            updateInfo = info
                            updateStatusText = when {
                                info == null -> "Could not reach update mirrors — direct APK available at syno.vndns.net"
                                UpdateChecker.isNewer(info.tag, currentVersionName) ->
                                    "Update available: ${info.tag} (${info.name})"
                                else -> "You are on the latest version (v$currentVersionName)"
                            }
                            isCheckingUpdate = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = TidalCyan,
                        contentColor = TidalPureBlack
                    ),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    if (isCheckingUpdate) {
                        CircularProgressIndicator(
                            color = TidalPureBlack,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(18.dp)
                        )
                    } else {
                        Text("Check for App Updates", fontWeight = FontWeight.Bold)
                    }
                }

                if (!updateStatusText.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = updateStatusText!!,
                        fontSize = 12.sp,
                        color = TidalCyanAccent
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = {
                            val target = updateInfo?.apkUrl ?: "https://syno.vndns.net/kvtidal-release.apk"
                            runCatching {
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(target)))
                            }
                        },
                        border = BorderStroke(1.dp, TidalCyanAccent.copy(alpha = 0.6f)),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Download APK", color = TidalCyan, fontSize = 12.sp)
                    }
                    OutlinedButton(
                        onClick = { showClearDataDialog = true },
                        border = BorderStroke(1.dp, TidalRedError.copy(alpha = 0.5f)),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Reset Local History", color = TidalSoftRed, fontSize = 12.sp)
                    }
                }
            }
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .widthIn(max = MaxContentWidthDp.dp),
            contentPadding = PaddingValues(
                start = horizontalGutter,
                end = horizontalGutter,
                top = 8.dp,
                bottom = bottomPadding + 28.dp
            ),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            if (windowState.isWide) {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Box(modifier = Modifier.weight(1f)) { serverCard() }
                        Box(modifier = Modifier.weight(1f)) { audioCard() }
                    }
                }
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Box(modifier = Modifier.weight(1f)) { engineCard() }
                        Box(modifier = Modifier.weight(1f)) { updatesCard() }
                    }
                }
            } else {
                item { serverCard() }
                item { audioCard() }
                item { engineCard() }
                item { updatesCard() }
            }
        }
    }

    if (showClearDataDialog) {
        AlertDialog(
            onDismissRequest = { showClearDataDialog = false },
            containerColor = TidalGrey13,
            titleContentColor = TidalPureWhite,
            textContentColor = TidalGrey04,
            title = { Text("Reset Local History & Likes?") },
            text = { Text("Clears liked track IDs, playback queue, and recently played history on this device. Offline downloaded files are preserved.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        PlayerManager.clearAllUserData()
                        showClearDataDialog = false
                        Toast.makeText(context, "Local player data cleared", Toast.LENGTH_SHORT).show()
                    }
                ) {
                    Text("Reset", color = TidalRedError, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showClearDataDialog = false }) {
                    Text("Cancel", color = TidalPureWhite)
                }
            }
        )
    }
}

@Composable
private fun SettingsCardContainer(
    title: String,
    badgeText: String,
    badgeAccent: Color,
    content: @Composable ColumnScope.() -> Unit
) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = TidalCard,
        border = BorderStroke(0.8.dp, TidalWhite15),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = TidalPureWhite,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Surface(
                    shape = CircleShape,
                    color = badgeAccent.copy(alpha = 0.16f),
                    border = BorderStroke(0.8.dp, badgeAccent.copy(alpha = 0.5f))
                ) {
                    Text(
                        text = badgeText,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = badgeAccent,
                        maxLines = 1,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
            }
            Spacer(modifier = Modifier.height(10.dp))
            content()
        }
    }
}

@Composable
private fun PresetHostButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    OutlinedButton(
        onClick = onClick,
        border = BorderStroke(0.8.dp, TidalWhite20),
        shape = RoundedCornerShape(8.dp),
        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
        modifier = modifier
    ) {
        Text(
            text = label,
            fontSize = 12.sp,
            color = TidalGrey02,
            maxLines = 1
        )
    }
}

private fun formatMbSize(bytes: Long): String {
    if (bytes <= 0L) return "0.0 MB"
    return String.format(Locale.US, "%.1f MB", bytes / (1024.0 * 1024.0))
}
