package com.kvtidal.app.player

import android.content.Context
import android.content.SharedPreferences
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.kvtidal.app.data.api.RetrofitClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.Locale

enum class OutputTerminal(
    val id: String,
    val shortBadge: String,
    val title: String,
    val subtitle: String,
    val voltageSpec: String,
    val isBitPerfectCapable: Boolean
) {
    AUTO_DAC(
        id = "auto",
        shortBadge = "AUTO",
        title = "Auto Hardware Routing",
        subtitle = "Automatically selects active USB DAC, 4.4mm / 3.5mm wired or speaker",
        voltageSpec = "Adaptive DAC / Android Route",
        isBitPerfectCapable = true
    ),
    USB_DAC(
        id = "usb_dac",
        shortBadge = "USB DAC",
        title = "External USB DAC (Bit-Perfect)",
        subtitle = "USB Audio Class 2.0 OTG dongle & desktop DAC direct PCM / DSD route",
        voltageSpec = "Up to 32-bit / 384kHz • Float PCM",
        isBitPerfectCapable = true
    ),
    BALANCED_4_4MM(
        id = "bal_4_4mm",
        shortBadge = "4.4mm BAL",
        title = "4.4mm Balanced Output (4mm)",
        subtitle = "Dual-DAC differential Pentaconn stage for balanced IEMs & planars",
        voltageSpec = "4.0 Vrms Balanced • High Current",
        isBitPerfectCapable = true
    ),
    SINGLE_ENDED_3_5MM(
        id = "se_3_5mm",
        shortBadge = "3.5mm PO",
        title = "3.5mm Single-Ended (3mm PO)",
        subtitle = "Dedicated 3.5mm stereo phone-out stage for monitors & headphones",
        voltageSpec = "2.0 Vrms Single-Ended",
        isBitPerfectCapable = true
    ),
    LINE_OUT_LO(
        id = "line_out",
        shortBadge = "LO 0dB",
        title = "Line-Out (LO Fixed Level)",
        subtitle = "Fixed 0.0 dBFS unattenuated line output for external desktop amplifiers",
        voltageSpec = "Fixed Line-Level • Unity Gain",
        isBitPerfectCapable = true
    ),
    COAX_OPTICAL(
        id = "spdif",
        shortBadge = "S/PDIF",
        title = "Coaxial / Optical / HDMI Digital",
        subtitle = "Bit-transparent S/PDIF & HDMI ARC digital audio transport",
        voltageSpec = "24-bit / 192kHz Digital",
        isBitPerfectCapable = true
    ),
    BLUETOOTH_HIRES(
        id = "bluetooth",
        shortBadge = "BT LDAC",
        title = "Bluetooth Hi-Res (LDAC / aptX)",
        subtitle = "Wireless A2DP / LE Audio stereo headset & wireless DAC link",
        voltageSpec = "24-bit / 96kHz • Wireless",
        isBitPerfectCapable = false
    ),
    INTERNAL_SPEAKER(
        id = "speaker",
        shortBadge = "SPEAKER",
        title = "Device Stereo Speakers",
        subtitle = "Built-in phone, foldable or tablet stereo speaker array",
        voltageSpec = "Internal Amplifier",
        isBitPerfectCapable = false
    );

    companion object {
        fun fromId(id: String?): OutputTerminal =
            entries.find { it.id.equals(id, ignoreCase = true) } ?: AUTO_DAC
    }
}

enum class GainStage(
    val id: String,
    val label: String,
    val vrmsLabel: String,
    val volumeMultiplier: Float
) {
    LOW("low", "Low Gain (IEM)", "1.0 Vrms (-4 dB)", 0.68f),
    MEDIUM("med", "Mid Gain", "2.0 Vrms (-1.5 dB)", 0.85f),
    HIGH("high", "High / Unity", "4.0 Vrms (0.0 dBFS)", 1.0f);

    companion object {
        fun fromId(id: String?): GainStage =
            entries.find { it.id.equals(id, ignoreCase = true) } ?: HIGH
    }
}

data class DetectedAudioSink(
    val id: Int,
    val productName: String,
    val deviceType: Int,
    val typeLabel: String,
    val mappedTerminal: OutputTerminal,
    val maxSampleRateHz: Int,
    val bitPerfectCapable: Boolean,
    val deviceInfo: AudioDeviceInfo? = null
)

const val BLUETOOTH_HEADROOM_GAIN = 0.85f

fun isVoiceOnlyOutputDevice(deviceType: Int): Boolean =
    deviceType == AudioDeviceInfo.TYPE_TELEPHONY ||
        deviceType == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE ||
        deviceType == AudioDeviceInfo.TYPE_BLUETOOTH_SCO

fun isBluetoothMusicDeviceType(deviceType: Int): Boolean =
    deviceType == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
        deviceType == 23 /* TYPE_HEARING_AID */ ||
        deviceType == 26 /* TYPE_BLE_HEADSET */ ||
        deviceType == 27 /* TYPE_BLE_SPEAKER */

private fun isWiredBitPerfectTerminal(terminal: OutputTerminal): Boolean = when (terminal) {
    OutputTerminal.USB_DAC,
    OutputTerminal.BALANCED_4_4MM,
    OutputTerminal.SINGLE_ENDED_3_5MM,
    OutputTerminal.LINE_OUT_LO,
    OutputTerminal.COAX_OPTICAL -> true
    else -> false
}

fun resolveEffectiveOutputTerminal(
    selectedTerminal: OutputTerminal,
    detectedSinks: List<DetectedAudioSink>
): OutputTerminal {
    if (selectedTerminal == OutputTerminal.AUTO_DAC) {
        val wiredPriority = listOf(
            OutputTerminal.USB_DAC,
            OutputTerminal.BALANCED_4_4MM,
            OutputTerminal.SINGLE_ENDED_3_5MM,
            OutputTerminal.LINE_OUT_LO,
            OutputTerminal.COAX_OPTICAL
        )
        for (candidate in wiredPriority) {
            if (detectedSinks.any { it.mappedTerminal == candidate }) {
                return candidate
            }
        }
        if (detectedSinks.any { it.mappedTerminal == OutputTerminal.BLUETOOTH_HIRES }) {
            return OutputTerminal.BLUETOOTH_HIRES
        }
        return OutputTerminal.INTERNAL_SPEAKER
    }
    if (selectedTerminal == OutputTerminal.BLUETOOTH_HIRES ||
        selectedTerminal == OutputTerminal.INTERNAL_SPEAKER
    ) {
        return selectedTerminal
    }
    if (isWiredBitPerfectTerminal(selectedTerminal)) {
        val hasAnyWiredSink = detectedSinks.any { isWiredBitPerfectTerminal(it.mappedTerminal) }
        if (hasAnyWiredSink) {
            return selectedTerminal
        }
        if (detectedSinks.any { it.mappedTerminal == OutputTerminal.BLUETOOTH_HIRES }) {
            return OutputTerminal.BLUETOOTH_HIRES
        }
    }
    return selectedTerminal
}

fun shouldEnableFloatPcmOutput(
    selectedTerminal: OutputTerminal,
    detectedSinks: List<DetectedAudioSink>,
    bitPerfectEnabled: Boolean
): Boolean {
    if (!bitPerfectEnabled) return false
    val effective = resolveEffectiveOutputTerminal(selectedTerminal, detectedSinks)
    return effective.isBitPerfectCapable && effective != OutputTerminal.AUTO_DAC
}

fun resolveEffectiveVolumeMultiplier(
    terminal: OutputTerminal,
    gain: GainStage,
    bitPerfectEnabled: Boolean,
    effectiveTerminal: OutputTerminal = terminal
): Float {
    if (effectiveTerminal == OutputTerminal.BLUETOOTH_HIRES) {
        return if (bitPerfectEnabled) BLUETOOTH_HEADROOM_GAIN
        else minOf(gain.volumeMultiplier, BLUETOOTH_HEADROOM_GAIN)
    }
    // Line-Out and Bit-Perfect digital passthrough lock digital volume at 1.0 (0.0 dBFS unity)
    if (effectiveTerminal == OutputTerminal.LINE_OUT_LO ||
        (bitPerfectEnabled && effectiveTerminal.isBitPerfectCapable)
    ) {
        return 1.0f
    }
    return gain.volumeMultiplier
}

fun mapAndroidDeviceTypeToTerminal(
    deviceType: Int,
    productName: String = ""
): OutputTerminal {
    val lower = productName.lowercase(Locale.US)
    val looksBalanced44 = lower.contains("4.4") || lower.contains("balanced") || lower.contains("pentaconn")
    val looksLineOut = lower.contains("line out") || lower.contains("line-out") || lower.contains("pre-out")

    return when (deviceType) {
        AudioDeviceInfo.TYPE_USB_DEVICE,
        AudioDeviceInfo.TYPE_USB_HEADSET,
        AudioDeviceInfo.TYPE_USB_ACCESSORY -> when {
            looksLineOut -> OutputTerminal.LINE_OUT_LO
            looksBalanced44 -> OutputTerminal.BALANCED_4_4MM
            else -> OutputTerminal.USB_DAC
        }
        AudioDeviceInfo.TYPE_LINE_ANALOG,
        AudioDeviceInfo.TYPE_AUX_LINE -> OutputTerminal.LINE_OUT_LO
        AudioDeviceInfo.TYPE_LINE_DIGITAL,
        AudioDeviceInfo.TYPE_HDMI,
        AudioDeviceInfo.TYPE_HDMI_ARC,
        29 /* AudioDeviceInfo.TYPE_HDMI_EARC on API 33+ */ -> OutputTerminal.COAX_OPTICAL
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> when {
            looksLineOut -> OutputTerminal.LINE_OUT_LO
            looksBalanced44 -> OutputTerminal.BALANCED_4_4MM
            else -> OutputTerminal.SINGLE_ENDED_3_5MM
        }
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
        23 /* TYPE_HEARING_AID */,
        26 /* TYPE_BLE_HEADSET */,
        27 /* TYPE_BLE_SPEAKER */ -> OutputTerminal.BLUETOOTH_HIRES
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER_SAFE -> OutputTerminal.INTERNAL_SPEAKER
        else -> OutputTerminal.AUTO_DAC
    }
}

object AudioOutputManager {
    private const val PREFS_NAME = "kv_tidal_audio_output"
    private const val KEY_TERMINAL = "selected_terminal"
    private const val KEY_BIT_PERFECT = "bit_perfect_enabled"
    private const val KEY_GAIN = "gain_stage"
    private const val KEY_SERVER_DEVICE = "server_device_id"

    private var appContext: Context? = null
    private var prefs: SharedPreferences? = null
    private var audioManager: AudioManager? = null
    private var callbackRegistered = false

    private val _selectedTerminal = MutableStateFlow(OutputTerminal.AUTO_DAC)
    val selectedTerminal: StateFlow<OutputTerminal> = _selectedTerminal

    private val _bitPerfectEnabled = MutableStateFlow(true)
    val bitPerfectEnabled: StateFlow<Boolean> = _bitPerfectEnabled

    private val _selectedGain = MutableStateFlow(GainStage.HIGH)
    val selectedGain: StateFlow<GainStage> = _selectedGain

    private val _detectedHardwareDevices = MutableStateFlow<List<DetectedAudioSink>>(emptyList())
    val detectedHardwareDevices: StateFlow<List<DetectedAudioSink>> = _detectedHardwareDevices

    private val _activeHardwareSummary = MutableStateFlow("Auto Hardware • 32-bit Float Bit-Perfect")
    val activeHardwareSummary: StateFlow<String> = _activeHardwareSummary

    private val _selectedServerDeviceId = MutableStateFlow("browser")
    val selectedServerDeviceId: StateFlow<String> = _selectedServerDeviceId

    private val _effectiveTerminal = MutableStateFlow(OutputTerminal.AUTO_DAC)
    val effectiveTerminal: StateFlow<OutputTerminal> = _effectiveTerminal

    private val _isBluetoothSafePcmActive = MutableStateFlow(false)
    val isBluetoothSafePcmActive: StateFlow<Boolean> = _isBluetoothSafePcmActive

    private val _isFloatPcmActive = MutableStateFlow(false)
    val isFloatPcmActive: StateFlow<Boolean> = _isFloatPcmActive

    private val deviceCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) {
            refreshHardwareDevices()
        }

        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) {
            refreshHardwareDevices()
        }
    }

    @Synchronized
    fun init(context: Context) {
        if (appContext == null) {
            val ctx = context.applicationContext
            appContext = ctx
            prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            audioManager = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

            _selectedTerminal.value = OutputTerminal.fromId(prefs?.getString(KEY_TERMINAL, null))
            _bitPerfectEnabled.value = prefs?.getBoolean(KEY_BIT_PERFECT, true) ?: true
            _selectedGain.value = GainStage.fromId(prefs?.getString(KEY_GAIN, null))
            _selectedServerDeviceId.value = prefs?.getString(KEY_SERVER_DEVICE, "browser") ?: "browser"

            if (_bitPerfectEnabled.value) {
                RetrofitClient.setStreamQualityMode("HI_RES_LOSSLESS")
            }

            if (!callbackRegistered) {
                runCatching {
                    audioManager?.registerAudioDeviceCallback(
                        deviceCallback,
                        Handler(Looper.getMainLooper())
                    )
                    callbackRegistered = true
                }
            }
        }
        refreshHardwareDevices()
    }

    fun refreshHardwareDevices() {
        val am = audioManager ?: return
        val rawDevices = runCatching {
            am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList()
        }.getOrDefault(emptyList())

        val mapped = rawDevices
            .filter { !isVoiceOnlyOutputDevice(it.type) }
            .map { dev ->
                val pName = dev.productName?.toString()?.trim().orEmpty().ifBlank { friendlyTypeName(dev.type) }
                val terminal = mapAndroidDeviceTypeToTerminal(dev.type, pName)
                val maxRate = dev.sampleRates.maxOrNull()?.takeIf { it > 0 } ?: 48000
                DetectedAudioSink(
                    id = dev.id,
                    productName = pName,
                    deviceType = dev.type,
                    typeLabel = friendlyTypeName(dev.type),
                    mappedTerminal = terminal,
                    maxSampleRateHz = maxRate,
                    bitPerfectCapable = terminal.isBitPerfectCapable,
                    deviceInfo = dev
                )
            }
            .distinctBy { "${it.typeLabel}_${it.productName}_${it.maxSampleRateHz}" }

        _detectedHardwareDevices.value = mapped
        updateSummary()
        PlayerManager.applyAudioOutputRouting()
    }

    fun selectTerminal(terminal: OutputTerminal) {
        _selectedTerminal.value = terminal
        prefs?.edit()?.putString(KEY_TERMINAL, terminal.id)?.apply()
        if (terminal == OutputTerminal.LINE_OUT_LO) {
            _selectedGain.value = GainStage.HIGH
            prefs?.edit()?.putString(KEY_GAIN, GainStage.HIGH.id)?.apply()
        }
        updateSummary()
        PlayerManager.applyAudioOutputRouting()
    }

    fun setBitPerfectEnabled(enabled: Boolean) {
        _bitPerfectEnabled.value = enabled
        prefs?.edit()?.putBoolean(KEY_BIT_PERFECT, enabled)?.apply()
        if (enabled) {
            RetrofitClient.setStreamQualityMode("HI_RES_LOSSLESS")
        }
        updateSummary()
        PlayerManager.applyAudioOutputRouting()
    }

    fun setGainStage(gain: GainStage) {
        _selectedGain.value = gain
        prefs?.edit()?.putString(KEY_GAIN, gain.id)?.apply()
        updateSummary()
        PlayerManager.applyAudioOutputRouting()
    }

    fun setServerDeviceId(deviceId: String) {
        _selectedServerDeviceId.value = deviceId
        prefs?.edit()?.putString(KEY_SERVER_DEVICE, deviceId)?.apply()
    }

    private fun findPreferredBluetoothSink(sinks: List<DetectedAudioSink>): DetectedAudioSink? {
        val btSinks = sinks.filter { it.mappedTerminal == OutputTerminal.BLUETOOTH_HIRES }
        if (btSinks.isEmpty()) return null
        return btSinks.firstOrNull { it.deviceType == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP }
            ?: btSinks.firstOrNull { it.deviceType == 26 /* TYPE_BLE_HEADSET */ }
            ?: btSinks.firstOrNull { it.deviceType == 27 /* TYPE_BLE_SPEAKER */ }
            ?: btSinks.firstOrNull { it.deviceType == 23 /* TYPE_HEARING_AID */ }
    }

    private fun findPreferredWiredSink(sinks: List<DetectedAudioSink>): DetectedAudioSink? {
        return sinks.firstOrNull { it.mappedTerminal == OutputTerminal.USB_DAC }
            ?: sinks.firstOrNull { it.mappedTerminal == OutputTerminal.BALANCED_4_4MM }
            ?: sinks.firstOrNull { it.mappedTerminal == OutputTerminal.SINGLE_ENDED_3_5MM }
            ?: sinks.firstOrNull { it.mappedTerminal == OutputTerminal.LINE_OUT_LO }
            ?: sinks.firstOrNull { it.mappedTerminal == OutputTerminal.COAX_OPTICAL }
    }

    fun resolvePreferredAudioDevice(): AudioDeviceInfo? {
        val sinks = _detectedHardwareDevices.value
        if (sinks.isEmpty()) return null
        val target = _selectedTerminal.value
        return when (target) {
            OutputTerminal.AUTO_DAC -> {
                findPreferredWiredSink(sinks)?.deviceInfo
                    ?: findPreferredBluetoothSink(sinks)?.deviceInfo
            }
            OutputTerminal.USB_DAC -> sinks.firstOrNull { it.mappedTerminal == OutputTerminal.USB_DAC }?.deviceInfo
            OutputTerminal.BALANCED_4_4MM -> {
                sinks.firstOrNull { it.mappedTerminal == OutputTerminal.BALANCED_4_4MM }?.deviceInfo
                    ?: sinks.firstOrNull {
                        it.mappedTerminal == OutputTerminal.USB_DAC ||
                            it.mappedTerminal == OutputTerminal.SINGLE_ENDED_3_5MM
                    }?.deviceInfo
            }
            OutputTerminal.SINGLE_ENDED_3_5MM -> {
                sinks.firstOrNull { it.mappedTerminal == OutputTerminal.SINGLE_ENDED_3_5MM }?.deviceInfo
                    ?: sinks.firstOrNull { it.mappedTerminal == OutputTerminal.USB_DAC }?.deviceInfo
            }
            OutputTerminal.LINE_OUT_LO -> {
                sinks.firstOrNull { it.mappedTerminal == OutputTerminal.LINE_OUT_LO }?.deviceInfo
                    ?: sinks.firstOrNull {
                        it.mappedTerminal == OutputTerminal.USB_DAC ||
                            it.mappedTerminal == OutputTerminal.SINGLE_ENDED_3_5MM
                    }?.deviceInfo
            }
            OutputTerminal.COAX_OPTICAL -> sinks.firstOrNull { it.mappedTerminal == OutputTerminal.COAX_OPTICAL }?.deviceInfo
            OutputTerminal.BLUETOOTH_HIRES -> findPreferredBluetoothSink(sinks)?.deviceInfo
            OutputTerminal.INTERNAL_SPEAKER -> sinks.firstOrNull { it.mappedTerminal == OutputTerminal.INTERNAL_SPEAKER }?.deviceInfo
        }
    }

    /**
     * Returns preferred AudioDeviceInfo for ExoPlayer.setPreferredAudioDevice().
     * In AUTO_DAC mode when Bluetooth/Speaker is active, returns null so Android's
     * native A2DP/LE-Audio stack handles codec & transport routing without interference.
     */
    fun resolvePreferredAudioDeviceForRouting(): AudioDeviceInfo? {
        val sinks = _detectedHardwareDevices.value
        if (sinks.isEmpty()) return null
        return when (_selectedTerminal.value) {
            OutputTerminal.AUTO_DAC -> findPreferredWiredSink(sinks)?.deviceInfo
            OutputTerminal.BLUETOOTH_HIRES -> findPreferredBluetoothSink(sinks)?.deviceInfo
            else -> resolvePreferredAudioDevice()
        }
    }

    fun shouldUseFloatPcmOutput(): Boolean = shouldEnableFloatPcmOutput(
        selectedTerminal = _selectedTerminal.value,
        detectedSinks = _detectedHardwareDevices.value,
        bitPerfectEnabled = _bitPerfectEnabled.value
    )

    fun effectiveVolume(): Float {
        val effective = resolveEffectiveOutputTerminal(_selectedTerminal.value, _detectedHardwareDevices.value)
        return resolveEffectiveVolumeMultiplier(
            terminal = _selectedTerminal.value,
            gain = _selectedGain.value,
            bitPerfectEnabled = _bitPerfectEnabled.value,
            effectiveTerminal = effective
        )
    }

    private fun updateSummary() {
        val term = _selectedTerminal.value
        val sinks = _detectedHardwareDevices.value
        val effective = resolveEffectiveOutputTerminal(term, sinks)
        val useFloat = shouldEnableFloatPcmOutput(term, sinks, _bitPerfectEnabled.value)
        val isBtSafe = effective == OutputTerminal.BLUETOOTH_HIRES

        _effectiveTerminal.value = effective
        _isFloatPcmActive.value = useFloat
        _isBluetoothSafePcmActive.value = isBtSafe

        val matchedSink = resolvePreferredAudioDevice()
        val sinkName = matchedSink?.productName?.toString()?.takeIf { it.isNotBlank() }
        val maxRate = matchedSink?.sampleRates?.maxOrNull()?.let { "${it / 1000}kHz" }
        _activeHardwareSummary.value = when {
            isBtSafe -> buildString {
                append("BT A2DP")
                if (sinkName != null) append(" • $sinkName")
                if (maxRate != null) append(" ($maxRate)")
                append(" • 16-bit Safe PCM (-1.4 dB Headroom)")
            }
            useFloat -> buildString {
                append(term.shortBadge)
                if (sinkName != null) append(" • $sinkName")
                if (maxRate != null) append(" ($maxRate)")
                append(" • Bit-Perfect 32-bit Float")
            }
            else -> buildString {
                append(term.shortBadge)
                if (sinkName != null) append(" • $sinkName")
                if (maxRate != null) append(" ($maxRate)")
                append(" • Safe Int PCM • ${_selectedGain.value.vrmsLabel}")
            }
        }
    }

    private fun friendlyTypeName(type: Int): String = when (type) {
        AudioDeviceInfo.TYPE_USB_DEVICE -> "USB DAC Audio"
        AudioDeviceInfo.TYPE_USB_HEADSET -> "USB-C DAC Headset"
        AudioDeviceInfo.TYPE_USB_ACCESSORY -> "USB Audio Dock"
        AudioDeviceInfo.TYPE_WIRED_HEADSET -> "3.5mm / Wired Headset"
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "3.5mm / 4.4mm Wired Headphones"
        AudioDeviceInfo.TYPE_LINE_ANALOG -> "Analog Line-Out (LO)"
        AudioDeviceInfo.TYPE_LINE_DIGITAL -> "S/PDIF Coax / Optical"
        AudioDeviceInfo.TYPE_HDMI -> "HDMI Digital Out"
        AudioDeviceInfo.TYPE_HDMI_ARC -> "HDMI ARC"
        29 -> "HDMI eARC"
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "Bluetooth Hi-Res A2DP"
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "Bluetooth SCO"
        26 -> "Bluetooth LE Audio"
        27 -> "Bluetooth LE Speaker"
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "Device Stereo Speakers"
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER_SAFE -> "Device Safe Speaker"
        else -> if (Build.VERSION.SDK_INT >= 28 && type == AudioDeviceInfo.TYPE_HEARING_AID) {
            "Hearing Aid Audio"
        } else {
            "Android Audio Output"
        }
    }
}
