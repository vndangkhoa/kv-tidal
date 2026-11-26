package com.kvtidal.app.ui.components

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kvtidal.app.data.model.TidalServerAudioDevice
import com.kvtidal.app.data.repository.MusicRepository
import com.kvtidal.app.player.AudioOutputManager
import com.kvtidal.app.player.DetectedAudioSink
import com.kvtidal.app.player.GainStage
import com.kvtidal.app.player.OutputTerminal
import com.kvtidal.app.ui.theme.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OutputDeviceSheet(
    musicRepo: MusicRepository? = null,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val selectedTerminal by AudioOutputManager.selectedTerminal.collectAsState()
    val effectiveTerminal by AudioOutputManager.effectiveTerminal.collectAsState()
    val bitPerfectEnabled by AudioOutputManager.bitPerfectEnabled.collectAsState()
    val isBluetoothSafeActive by AudioOutputManager.isBluetoothSafePcmActive.collectAsState()
    val selectedGain by AudioOutputManager.selectedGain.collectAsState()
    val detectedSinks by AudioOutputManager.detectedHardwareDevices.collectAsState()
    val activeSummary by AudioOutputManager.activeHardwareSummary.collectAsState()
    val selectedServerDeviceId by AudioOutputManager.selectedServerDeviceId.collectAsState()

    var serverDevices by remember { mutableStateOf<List<TidalServerAudioDevice>>(emptyList()) }
    var isLoadingServer by remember { mutableStateOf(musicRepo != null) }

    LaunchedEffect(musicRepo) {
        AudioOutputManager.init(context)
        AudioOutputManager.refreshHardwareDevices()
        if (musicRepo != null) {
            isLoadingServer = true
            musicRepo.getServerAudioDevices().onSuccess { resp ->
                serverDevices = resp.devices
                AudioOutputManager.setServerDeviceId(resp.activeDeviceId)
            }
            isLoadingServer = false
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = TidalGrey13,
        contentColor = TidalPureWhite,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding(),
            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Sheet Header
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(38.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(TidalCyanDim),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = YtmIcons.Headset24,
                                contentDescription = null,
                                tint = TidalCyan,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        Column {
                            Text(
                                text = "Hi-Res Audio Output & DAC",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = TidalPureWhite
                            )
                            Text(
                                text = activeSummary,
                                fontSize = 11.sp,
                                color = TidalCyanAccent,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }

                    TextButton(onClick = { AudioOutputManager.refreshHardwareDevices() }) {
                        Text("Scan", color = TidalCyan, fontWeight = FontWeight.Bold)
                    }
                }
            }

            // Bit-Perfect Direct Engine Card
            item {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = if (bitPerfectEnabled) TidalEmeraldDim else TidalCard,
                    border = BorderStroke(
                        1.dp,
                        if (bitPerfectEnabled) TidalEmerald.copy(alpha = 0.55f) else TidalWhite15
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    text = "Bit-Perfect Direct PCM",
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = TidalPureWhite
                                )
                                QualityBadgePill(
                                    text = when {
                                        isBluetoothSafeActive -> "BT SAFE"
                                        bitPerfectEnabled -> "ACTIVE"
                                        else -> "DSP"
                                    },
                                    isMax = !bitPerfectEnabled || isBluetoothSafeActive
                                )
                            }
                            Spacer(modifier = Modifier.height(3.dp))
                            Text(
                                text = if (isBluetoothSafeActive) {
                                    "Bluetooth A2DP Safe Mode: 16-bit Integer PCM • -1.4 dB True-Peak Headroom • SCO & Spatializer bypassed (32-bit Float auto-resumes on wired DAC)"
                                } else {
                                    "32-bit Float ExoPlayer AudioSink • 0.0 dBFS unity gain • Bypasses pitch/speed resampler"
                                },
                                fontSize = 11.sp,
                                color = TidalGrey04
                            )
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Switch(
                            checked = bitPerfectEnabled,
                            onCheckedChange = { enabled ->
                                AudioOutputManager.setBitPerfectEnabled(enabled)
                                Toast.makeText(
                                    context,
                                    if (enabled) "Bit-Perfect Direct PCM enabled (HI_RES_LOSSLESS)"
                                    else "Adjustable gain mode enabled",
                                    Toast.LENGTH_SHORT
                                ).show()
                            },
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = TidalPureBlack,
                                checkedTrackColor = TidalEmerald,
                                uncheckedThumbColor = TidalGrey04,
                                uncheckedTrackColor = TidalCardHover
                            )
                        )
                    }
                }
            }

            // Output Terminal Matrix (DAC / LO / 3.5mm / 4.4mm / Optical / BT / Speaker)
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "OUTPUT STAGE / TERMINAL (DAC • LO • 3mm • 4mm)",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.8.sp,
                        color = TidalCyanAccent
                    )

                    val terminalRows = OutputTerminal.entries.chunked(2)
                    terminalRows.forEach { pair ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            pair.forEach { terminal ->
                                val selected = selectedTerminal == terminal
                                TerminalCard(
                                    terminal = terminal,
                                    selected = selected,
                                    onClick = {
                                        AudioOutputManager.selectTerminal(terminal)
                                        Toast.makeText(
                                            context,
                                            "Output routed to ${terminal.title}",
                                            Toast.LENGTH_SHORT
                                        ).show()
                                    },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                            if (pair.size == 1) {
                                Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }
            }

            // Output Gain Stage / Voltage Selector
            item {
                val unityLocked = !isBluetoothSafeActive && (
                    effectiveTerminal == OutputTerminal.LINE_OUT_LO ||
                        (bitPerfectEnabled && effectiveTerminal.isBitPerfectCapable)
                    )
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "ANALOG / DIGITAL GAIN STAGE",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.8.sp,
                            color = TidalGrey04
                        )
                        Text(
                            text = when {
                                isBluetoothSafeActive && bitPerfectEnabled -> "-1.4 dB BT SAFE"
                                isBluetoothSafeActive -> "${selectedGain.vrmsLabel} (BT CAPPED)"
                                unityLocked -> "LOCKED 0.0 dBFS UNITY"
                                else -> selectedGain.vrmsLabel
                            },
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (unityLocked) TidalEmerald else TidalCyan
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        GainStage.entries.forEach { gain ->
                            val active = (!unityLocked && selectedGain == gain) ||
                                (unityLocked && gain == GainStage.HIGH)
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = if (active) TidalCyanDim else TidalCard,
                                border = BorderStroke(
                                    1.dp,
                                    if (active) TidalCyanAccent else TidalWhite15
                                ),
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(10.dp))
                                    .clickable {
                                        if (unityLocked) {
                                            Toast.makeText(
                                                context,
                                                "Disable Bit-Perfect or Line-Out lock to adjust gain attenuation",
                                                Toast.LENGTH_SHORT
                                            ).show()
                                        } else {
                                            AudioOutputManager.setGainStage(gain)
                                        }
                                    }
                            ) {
                                Column(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Text(
                                        text = gain.label,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (active) TidalCyan else TidalPureWhite,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        text = gain.vrmsLabel,
                                        fontSize = 10.sp,
                                        color = TidalGrey05,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Detected Physical Android Hardware Endpoints
            item {
                Text(
                    text = "DETECTED DEVICE HARDWARE SINKS (${detectedSinks.size})",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.8.sp,
                    color = TidalGrey04
                )
            }

            if (detectedSinks.isEmpty()) {
                item {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = TidalCard,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = "No external DAC/headset detected — using internal Android audio pipeline.",
                            fontSize = 12.sp,
                            color = TidalGrey05,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }
            } else {
                items(detectedSinks, key = { "sink_${it.id}_${it.productName}" }) { sink ->
                    DetectedSinkRow(
                        sink = sink,
                        isSelected = selectedTerminal == sink.mappedTerminal,
                        onClick = {
                            AudioOutputManager.selectTerminal(sink.mappedTerminal)
                            Toast.makeText(
                                context,
                                "Routed via ${sink.productName} (${sink.mappedTerminal.shortBadge})",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    )
                }
            }

            // Synology NAS Server Hardware Devices (/api/devices)
            if (musicRepo != null) {
                item {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "SYNOLOGY NAS AUDIO OUTPUT NODES",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.8.sp,
                        color = TidalGrey04
                    )
                }

                if (isLoadingServer && serverDevices.isEmpty()) {
                    item {
                        LinearProgressIndicator(
                            color = TidalCyan,
                            trackColor = TidalCard,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                } else {
                    items(serverDevices, key = { "srv_${it.id}" }) { srv ->
                        val active = selectedServerDeviceId == srv.id
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = if (active) TidalCyanDim else TidalCard,
                            border = BorderStroke(
                                0.8.dp,
                                if (active) TidalCyanAccent else TidalWhite15
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .clickable {
                                    scope.launch {
                                        musicRepo.selectServerAudioDevice(srv.id).onSuccess {
                                            AudioOutputManager.setServerDeviceId(srv.id)
                                            Toast.makeText(
                                                context,
                                                "NAS output set to ${srv.name}",
                                                Toast.LENGTH_SHORT
                                            ).show()
                                        }
                                    }
                                }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = srv.name,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = TidalPureWhite,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        text = "${srv.deviceType} • ${srv.maxSampleRate / 1000}kHz",
                                        fontSize = 11.sp,
                                        color = TidalGrey05,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                QualityBadgePill(
                                    text = if (srv.isBitPerfect) "BIT-PERFECT" else "CLIENT",
                                    isMax = srv.isBitPerfect
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TerminalCard(
    terminal: OutputTerminal,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = if (selected) TidalCyanDim else TidalCard,
        border = BorderStroke(
            1.dp,
            if (selected) TidalCyan else TidalWhite15
        ),
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable { onClick() }
    ) {
        Column(modifier = Modifier.padding(11.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    shape = CircleShape,
                    color = if (selected) TidalCyan else TidalCardHover
                ) {
                    Text(
                        text = terminal.shortBadge,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (selected) TidalPureBlack else TidalCyan,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                    )
                }
                if (selected) {
                    Icon(
                        imageVector = YtmIcons.CheckCircle24,
                        contentDescription = "Active",
                        tint = TidalCyan,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = terminal.title,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = TidalPureWhite,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = terminal.voltageSpec,
                fontSize = 10.sp,
                color = if (selected) TidalCyanAccent else TidalGrey05,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun DetectedSinkRow(
    sink: DetectedAudioSink,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = if (isSelected) TidalCyanDim else TidalCard,
        border = BorderStroke(
            0.8.dp,
            if (isSelected) TidalCyanAccent else TidalWhite10
        ),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .clickable { onClick() }
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = sink.productName,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TidalPureWhite,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = "${sink.typeLabel} • ${sink.maxSampleRateHz / 1000}kHz max",
                    fontSize = 11.sp,
                    color = TidalGrey05,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            QualityBadgePill(
                text = sink.mappedTerminal.shortBadge,
                isMax = sink.bitPerfectCapable
            )
        }
    }
}
