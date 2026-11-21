package com.kvtidal.app.ui.adaptive

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
}
