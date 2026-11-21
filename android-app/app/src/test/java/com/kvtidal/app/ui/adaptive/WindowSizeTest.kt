package com.kvtidal.app.ui.adaptive

import android.media.AudioDeviceInfo
import com.kvtidal.app.player.GainStage
import com.kvtidal.app.player.OutputTerminal
import com.kvtidal.app.player.mapAndroidDeviceTypeToTerminal
import com.kvtidal.app.player.resolveEffectiveVolumeMultiplier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
}
