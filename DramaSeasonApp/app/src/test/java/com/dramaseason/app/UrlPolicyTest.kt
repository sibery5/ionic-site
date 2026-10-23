package com.dramaseason.app

import com.dramaseason.app.UrlPolicy.Action
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UrlPolicyTest {

    private val policy = UrlPolicy(
        siteUrl = "https://www.dramaseason.com/",
        adminPaths = listOf("admin", "yonetim"),
        inAppHosts = listOf("nowpayments.io", "commerce.coinbase.com"),
    )

    private fun assertAction(expected: Action, url: String, p: UrlPolicy = policy) =
        assertEquals(url, expected, p.decide(url))

    @Test
    fun sitePagesLoadInApp() {
        assertAction(Action.LOAD_IN_APP, "https://www.dramaseason.com/")
        assertAction(Action.LOAD_IN_APP, "https://www.dramaseason.com/dizi/kara-sevda?bolum=3")
        assertAction(Action.LOAD_IN_APP, "https://dramaseason.com/uye/giris")
        assertAction(Action.LOAD_IN_APP, "http://www.dramaseason.com/kayit")
        assertAction(Action.LOAD_IN_APP, "HTTPS://WWW.DRAMASEASON.COM/Dizi")
        assertAction(Action.LOAD_IN_APP, "https://m.dramaseason.com/")
    }

    @Test
    fun adminPagesAreBlocked() {
        assertAction(Action.BLOCK_ADMIN, "https://www.dramaseason.com/admin")
        assertAction(Action.BLOCK_ADMIN, "https://www.dramaseason.com/admin/")
        assertAction(Action.BLOCK_ADMIN, "https://www.dramaseason.com/admin/index.php?x=1")
        assertAction(Action.BLOCK_ADMIN, "https://www.dramaseason.com/ADMIN/login")
        assertAction(Action.BLOCK_ADMIN, "https://www.dramaseason.com/admin.php")
        assertAction(Action.BLOCK_ADMIN, "https://www.dramaseason.com/yonetim/ayarlar")
        assertAction(Action.BLOCK_ADMIN, "https://www.dramaseason.com/%61dmin/")
        assertAction(Action.BLOCK_ADMIN, "https://admin.dramaseason.com/")
    }

    @Test
    fun pathsThatOnlyContainTheWordAreNotBlocked() {
        assertAction(Action.LOAD_IN_APP, "https://www.dramaseason.com/dizi/administrator-dizisi")
        assertAction(Action.LOAD_IN_APP, "https://www.dramaseason.com/blog/admins")
        assertAction(Action.LOAD_IN_APP, "https://www.dramaseason.com/ara?q=admin")
    }

    @Test
    fun adminCheckIgnoresSegmentsOfTheBasePath() {
        val local = UrlPolicy("http://10.0.2.2/panel/DramaSeason/", listOf("panel", "admin"), emptyList())
        assertAction(Action.LOAD_IN_APP, "http://10.0.2.2/panel/DramaSeason/", local)
        assertAction(Action.LOAD_IN_APP, "http://10.0.2.2/panel/DramaSeason/dizi/1", local)
        assertAction(Action.BLOCK_ADMIN, "http://10.0.2.2/panel/DramaSeason/admin/", local)
        assertAction(Action.BLOCK_ADMIN, "http://10.0.2.2/panel/dramaseason/panel/giris", local)
    }

    @Test
    fun paymentGatewayHostsLoadInApp() {
        assertAction(Action.LOAD_IN_APP, "https://nowpayments.io/payment/?iid=123")
        assertAction(Action.LOAD_IN_APP, "https://sandbox.nowpayments.io/payment/?iid=1")
        assertAction(Action.LOAD_IN_APP, "https://commerce.coinbase.com/charges/ABC")
    }

    @Test
    fun otherWebsitesOpenInBrowser() {
        assertAction(Action.OPEN_IN_BROWSER, "https://www.youtube.com/watch?v=1")
        assertAction(Action.OPEN_IN_BROWSER, "https://evil-nowpayments.io/")
        assertAction(Action.OPEN_IN_BROWSER, "https://nowpayments.io.evil.com/")
        assertAction(Action.OPEN_IN_BROWSER, "https://www.coinbase.com/")
        assertAction(Action.OPEN_IN_BROWSER, "https://dramaseason.com.evil.com/")
    }

    @Test
    fun userinfoAndBackslashTricksDoNotPassAsTheSite() {
        assertAction(Action.OPEN_IN_BROWSER, "https://www.dramaseason.com@evil.com/")
        assertAction(Action.OPEN_IN_BROWSER, "https://evil.com\\@www.dramaseason.com/")
    }

    @Test
    fun walletAndAppSchemesOpenExternalApps() {
        assertAction(Action.OPEN_EXTERNAL_APP, "bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh?amount=0.001")
        assertAction(Action.OPEN_EXTERNAL_APP, "ethereum:0xabc@1?value=1e16")
        assertAction(Action.OPEN_EXTERNAL_APP, "tron:TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7")
        assertAction(Action.OPEN_EXTERNAL_APP, "wc:abc@2?relay-protocol=irn")
        assertAction(Action.OPEN_EXTERNAL_APP, "metamask://wc?uri=abc")
        assertAction(
            Action.OPEN_EXTERNAL_APP,
            "intent://pay#Intent;scheme=trust;package=com.wallet.crypto.trustapp;end",
        )
        assertAction(Action.OPEN_EXTERNAL_APP, "mailto:destek@dramaseason.com")
        assertAction(Action.OPEN_EXTERNAL_APP, "tel:+905555555555")
    }

    @Test
    fun webViewInternalSchemesStayInWebView() {
        assertAction(Action.LOAD_IN_APP, "about:blank")
        assertAction(Action.LOAD_IN_APP, "data:text/html,merhaba")
        assertAction(Action.LOAD_IN_APP, "blob:https://www.dramaseason.com/1b2c")
        assertAction(Action.LOAD_IN_APP, "javascript:void(0)")
        assertAction(Action.LOAD_IN_APP, "file:///sdcard/a.html")
    }

    @Test
    fun malformedUrlsDoNotCrash() {
        assertAction(Action.OPEN_IN_BROWSER, "http://")
        assertAction(Action.OPEN_IN_BROWSER, "https://exa mple.com/")
        policy.decide("")
        policy.decide("::::")
    }

    @Test
    fun isSiteUrlOnlyMatchesTheSite() {
        assertTrue(policy.isSiteUrl("https://dramaseason.com/dizi/1"))
        assertFalse(policy.isSiteUrl("https://nowpayments.io/payment"))
        assertFalse(policy.isSiteUrl("bitcoin:bc1q"))
    }

    @Test
    fun fromConfigTrimsAndDropsEmptyEntries() {
        val p = UrlPolicy.fromConfig("http://10.0.2.2/DramaSeason/", " Admin, yonetim ,,", "")
        assertEquals(listOf("admin", "yonetim"), p.adminPaths)
        assertEquals("/dramaseason/", p.basePath)
        assertAction(Action.OPEN_IN_BROWSER, "https://nowpayments.io/", p)
    }

    @Test
    fun basePathAlwaysEndsWithSlash() {
        assertEquals("/", UrlPolicy("https://dramaseason.com", emptyList(), emptyList()).basePath)
        assertEquals("/a/b/", UrlPolicy("http://10.0.2.2/a/b", emptyList(), emptyList()).basePath)
    }
}
