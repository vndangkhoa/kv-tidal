package com.kvtidal.app.ui.adaptive

import android.media.AudioDeviceInfo
import com.kvtidal.app.data.update.UpdateChecker
import com.kvtidal.app.player.BLUETOOTH_HEADROOM_GAIN
import com.kvtidal.app.player.DetectedAudioSink
import com.kvtidal.app.player.GainStage
import com.kvtidal.app.player.OutputTerminal
import com.kvtidal.app.player.isVoiceOnlyOutputDevice
import com.kvtidal.app.player.mapAndroidDeviceTypeToTerminal
import com.kvtidal.app.player.resolveEffectiveOutputTerminal
import com.kvtidal.app.player.resolveEffectiveVolumeMultiplier
import com.kvtidal.app.player.shouldEnableFloatPcmOutput
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WindowSizeTest {

    @Test
    fun compactPhoneLayout() {
        val state = computeWindowState(widthDp = 412, heightDp = 915)
        assertEquals(WidthClass.Compact, state.widthClass)
        assertTrue(state.isCompact)
        assertFalse(state.isWide)
        assertFalse(state.useNavigationRail)
        assertFalse(state.isTwoPanePlayer)
        assertFalse(state.isTwoPaneDetail)
        assertEquals(2, state.moodGridColumns)
        assertEquals(1, state.chartGridColumns)
        assertEquals(1, state.libraryGridColumns)
    }

    @Test
    fun unfoldedFoldablePortraitLayout() {
        val state = computeWindowState(widthDp = 673, heightDp = 841)
        assertEquals(WidthClass.Medium, state.widthClass)
        assertTrue(state.isWide)
        assertTrue(state.useNavigationRail)
        assertTrue(state.isTwoPanePlayer)
        assertFalse(state.isTwoPaneDetail)
        assertEquals(3, state.moodGridColumns)
        assertEquals(1, state.chartGridColumns)
    }

    @Test
    fun tabletopHalfOpenedFoldable() {
        val state = computeWindowState(
            widthDp = 673,
            heightDp = 841,
            isHalfOpened = true,
            isHorizontalHinge = true,
            hingeTopDp = 410f,
            hingeHeightDp = 12f
        )
        assertEquals(FoldPosture.Tabletop, state.foldPosture)
        assertTrue(state.isTabletop)
        assertFalse(state.isTwoPanePlayer)
        assertEquals(410f, state.hingeTopDp, 0.01f)
        assertEquals(12f, state.hingeHeightDp, 0.01f)
    }

    @Test
    fun bookHalfOpenedFoldable() {
        val state = computeWindowState(
            widthDp = 760,
            heightDp = 690,
            isHalfOpened = true,
            isHorizontalHinge = false,
            hingeStartDp = 376f,
            hingeWidthDp = 8f
        )
        assertEquals(FoldPosture.Book, state.foldPosture)
        assertTrue(state.isBook)
        assertTrue(state.isTwoPanePlayer)
        assertTrue(state.isTwoPaneDetail)
        assertEquals(376f, state.hingeStartDp, 0.01f)
    }

    @Test
    fun expandedTabletLandscapeLayout() {
        val state = computeWindowState(widthDp = 1280, heightDp = 800)
        assertEquals(WidthClass.Expanded, state.widthClass)
        assertTrue(state.useNavigationRail)
        assertTrue(state.isTwoPanePlayer)
        assertTrue(state.isTwoPaneDetail)
        assertEquals(4, state.moodGridColumns)
        assertEquals(2, state.chartGridColumns)
        assertEquals(2, state.libraryGridColumns)
    }

    @Test
    fun bitPerfectAndLineOutLockUnityVolume() {
        assertEquals(
            1.0f,
            resolveEffectiveVolumeMultiplier(OutputTerminal.USB_DAC, GainStage.LOW, bitPerfectEnabled = true),
            0.0001f
        )
        assertEquals(
            1.0f,
            resolveEffectiveVolumeMultiplier(OutputTerminal.LINE_OUT_LO, GainStage.LOW, bitPerfectEnabled = false),
            0.0001f
        )
        assertEquals(
            GainStage.LOW.volumeMultiplier,
            resolveEffectiveVolumeMultiplier(OutputTerminal.SINGLE_ENDED_3_5MM, GainStage.LOW, bitPerfectEnabled = false),
            0.0001f
        )
    }

    @Test
    fun terminalAndGainLookupAndAndroidDeviceMapping() {
        assertEquals(OutputTerminal.BALANCED_4_4MM, OutputTerminal.fromId("bal_4_4mm"))
        assertEquals(OutputTerminal.LINE_OUT_LO, OutputTerminal.fromId("line_out"))
        assertEquals(OutputTerminal.SINGLE_ENDED_3_5MM, OutputTerminal.fromId("se_3_5mm"))
        assertEquals(OutputTerminal.USB_DAC, OutputTerminal.fromId("usb_dac"))
        assertEquals(GainStage.MEDIUM, GainStage.fromId("med"))

        assertEquals(
            OutputTerminal.USB_DAC,
            mapAndroidDeviceTypeToTerminal(AudioDeviceInfo.TYPE_USB_DEVICE, "iBasso DC04 Pro")
        )
        assertEquals(
            OutputTerminal.BALANCED_4_4MM,
            mapAndroidDeviceTypeToTerminal(AudioDeviceInfo.TYPE_USB_HEADSET, "FiiO KA17 4.4mm Balanced")
        )
        assertEquals(
            OutputTerminal.SINGLE_ENDED_3_5MM,
            mapAndroidDeviceTypeToTerminal(AudioDeviceInfo.TYPE_WIRED_HEADPHONES, "Wired 3.5mm")
        )
        assertEquals(
            OutputTerminal.LINE_OUT_LO,
            mapAndroidDeviceTypeToTerminal(AudioDeviceInfo.TYPE_LINE_ANALOG, "Rear Line Out")
        )
    }

    @Test
    fun bluetoothScoVoiceDeviceExcludedFromHiResMusicRouting() {
        assertTrue(isVoiceOnlyOutputDevice(AudioDeviceInfo.TYPE_BLUETOOTH_SCO))
        assertTrue(isVoiceOnlyOutputDevice(AudioDeviceInfo.TYPE_TELEPHONY))
        assertTrue(isVoiceOnlyOutputDevice(AudioDeviceInfo.TYPE_BUILTIN_EARPIECE))
        assertFalse(isVoiceOnlyOutputDevice(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP))

        assertNotEquals(
            OutputTerminal.BLUETOOTH_HIRES,
            mapAndroidDeviceTypeToTerminal(AudioDeviceInfo.TYPE_BLUETOOTH_SCO, "Sony WH-1000XM5")
        )
        assertEquals(
            OutputTerminal.BLUETOOTH_HIRES,
            mapAndroidDeviceTypeToTerminal(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, "Sony WH-1000XM5")
        )
    }

    @Test
    fun floatPcmDisabledAndHeadroomAppliedForBluetoothHiResFlac() {
        val btA2dpSink = DetectedAudioSink(
            id = 10,
            productName = "Sony WH-1000XM5",
            deviceType = AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
            typeLabel = "Bluetooth Hi-Res A2DP",
            mappedTerminal = OutputTerminal.BLUETOOTH_HIRES,
            maxSampleRateHz = 96000,
            bitPerfectCapable = false
        )
        val usbDacSink = DetectedAudioSink(
            id = 20,
            productName = "iBasso DC04 Pro",
            deviceType = AudioDeviceInfo.TYPE_USB_DEVICE,
            typeLabel = "USB DAC Audio",
            mappedTerminal = OutputTerminal.USB_DAC,
            maxSampleRateHz = 384000,
            bitPerfectCapable = true
        )

        // When only Bluetooth A2DP is active, Float PCM must be OFF even in AUTO_DAC + bitPerfectEnabled
        assertEquals(
            OutputTerminal.BLUETOOTH_HIRES,
            resolveEffectiveOutputTerminal(OutputTerminal.AUTO_DAC, listOf(btA2dpSink))
        )
        assertFalse(
            shouldEnableFloatPcmOutput(OutputTerminal.AUTO_DAC, listOf(btA2dpSink), bitPerfectEnabled = true)
        )
        assertFalse(
            shouldEnableFloatPcmOutput(OutputTerminal.BLUETOOTH_HIRES, listOf(btA2dpSink), bitPerfectEnabled = true)
        )
        // Even if USB DAC was previously selected and unplugged while BT headphones remain connected
        assertFalse(
            shouldEnableFloatPcmOutput(OutputTerminal.USB_DAC, listOf(btA2dpSink), bitPerfectEnabled = true)
        )

        // Wired USB DAC / 4.4mm / 3.5mm / LO with bitPerfectEnabled keeps 32-bit Float PCM enabled
        assertTrue(
            shouldEnableFloatPcmOutput(OutputTerminal.AUTO_DAC, listOf(btA2dpSink, usbDacSink), bitPerfectEnabled = true)
        )
        assertTrue(
            shouldEnableFloatPcmOutput(OutputTerminal.USB_DAC, listOf(usbDacSink), bitPerfectEnabled = true)
        )
        assertTrue(
            shouldEnableFloatPcmOutput(OutputTerminal.BALANCED_4_4MM, emptyList(), bitPerfectEnabled = true)
        )
        assertTrue(
            shouldEnableFloatPcmOutput(OutputTerminal.SINGLE_ENDED_3_5MM, emptyList(), bitPerfectEnabled = true)
        )
        assertTrue(
            shouldEnableFloatPcmOutput(OutputTerminal.LINE_OUT_LO, emptyList(), bitPerfectEnabled = true)
        )

        // Bluetooth applies -1.4 dB headroom gain instead of unity 1.0f clipping, while wired keeps 1.0f
        assertEquals(
            BLUETOOTH_HEADROOM_GAIN,
            resolveEffectiveVolumeMultiplier(
                terminal = OutputTerminal.AUTO_DAC,
                gain = GainStage.HIGH,
                bitPerfectEnabled = true,
                effectiveTerminal = OutputTerminal.BLUETOOTH_HIRES
            ),
            0.0001f
        )
        assertEquals(
            GainStage.LOW.volumeMultiplier,
            resolveEffectiveVolumeMultiplier(
                terminal = OutputTerminal.BLUETOOTH_HIRES,
                gain = GainStage.LOW,
                bitPerfectEnabled = false,
                effectiveTerminal = OutputTerminal.BLUETOOTH_HIRES
            ),
            0.0001f
        )
        assertEquals(
            1.0f,
            resolveEffectiveVolumeMultiplier(
                terminal = OutputTerminal.USB_DAC,
                gain = GainStage.LOW,
                bitPerfectEnabled = true,
                effectiveTerminal = OutputTerminal.USB_DAC
            ),
            0.0001f
        )
        assertEquals(
            1.0f,
            resolveEffectiveVolumeMultiplier(
                terminal = OutputTerminal.LINE_OUT_LO,
                gain = GainStage.LOW,
                bitPerfectEnabled = false,
                effectiveTerminal = OutputTerminal.LINE_OUT_LO
            ),
            0.0001f
        )
    }

    @Test
    fun updateCheckerDetectsNewerSemanticVersionTags() {
        assertTrue(UpdateChecker.isNewer("v1.0.1", "1.0.0"))
        assertTrue(UpdateChecker.isNewer("android-v1.0.1", "1.0.0"))
        assertFalse(UpdateChecker.isNewer("v1.0.1", "1.0.1"))
    }
}
