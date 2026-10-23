package com.dramaseason.app

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PageScriptsTest {

    @Test
    fun parsesRgbResultFromEvaluateJavascript() {
        assertArrayEquals(intArrayOf(14, 14, 19), PageScripts.parseRgbResult("\"14,14,19\""))
        assertArrayEquals(intArrayOf(255, 255, 255), PageScripts.parseRgbResult("\"255, 255, 255\""))
    }

    @Test
    fun rejectsMissingOrInvalidColors() {
        assertNull(PageScripts.parseRgbResult(null))
        assertNull(PageScripts.parseRgbResult("null"))
        assertNull(PageScripts.parseRgbResult("\"\""))
        assertNull(PageScripts.parseRgbResult("\"300,0,0\""))
        assertNull(PageScripts.parseRgbResult("\"1,2\""))
        assertNull(PageScripts.parseRgbResult("\"a,b,c\""))
    }

    @Test
    fun jsStringEscapesQuotesBackslashesAndNewlines() {
        assertEquals("'a\\'b\\\\c\\nd'", PageScripts.jsString("a'b\\c\nd"))
        assertEquals("'x\\ry'", PageScripts.jsString("x\ry"))
    }

    @Test
    fun hideAdminLinksEmbedsKeysAndBasePath() {
        val script = PageScripts.hideAdminLinks(listOf("admin", "yonetim"), "/dramaseason/")
        assertTrue(script.contains("['admin','yonetim']"))
        assertTrue(script.contains("'/dramaseason/'"))
    }
}
