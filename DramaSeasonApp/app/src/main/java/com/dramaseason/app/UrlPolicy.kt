package com.dramaseason.app

import java.net.URI

/**
 * Uygulama içinde açılan her linkin nereye gideceğine karar verir.
 *
 * - Sitenin kendi sayfaları uygulamada açılır, admin sayfaları engellenir.
 * - Kripto ödeme sağlayıcıları (inAppHosts) uygulamada açılır ki üye oturumu korunsun.
 * - Diğer web siteleri telefonun tarayıcısında açılır.
 * - bitcoin:, ethereum:, wc:, intent: gibi linkler cüzdan / ilgili uygulamaya gönderilir.
 *
 * Android'e bağımlı değildir, bu yüzden düz JVM unit testleriyle test edilir.
 */
class UrlPolicy(
    siteUrl: String,
    adminPaths: Collection<String>,
    inAppHosts: Collection<String>,
) {

    enum class Action { LOAD_IN_APP, BLOCK_ADMIN, OPEN_IN_BROWSER, OPEN_EXTERNAL_APP }

    val siteHost: String = hostOf(siteUrl)?.let(::normalizeHost).orEmpty()
    val basePath: String = pathOf(siteUrl).lowercase().let { if (it.endsWith("/")) it else "$it/" }
    val adminPaths: List<String> = adminPaths.map { it.trim().lowercase() }.filter { it.isNotEmpty() }
    private val inAppHosts: List<String> = inAppHosts.map { normalizeHost(it.trim()) }.filter { it.isNotEmpty() }

    fun decide(url: String): Action {
        val scheme = schemeOf(url) ?: return Action.LOAD_IN_APP
        if (scheme !in WEB_SCHEMES) {
            return if (scheme in WEBVIEW_SCHEMES) Action.LOAD_IN_APP else Action.OPEN_EXTERNAL_APP
        }
        val host = hostOf(url)?.let(::normalizeHost) ?: return Action.OPEN_IN_BROWSER
        return when {
            isSiteHost(host) -> if (isAdmin(host, pathOf(url))) Action.BLOCK_ADMIN else Action.LOAD_IN_APP
            inAppHosts.any { isSameOrSubdomain(host, it) } -> Action.LOAD_IN_APP
            else -> Action.OPEN_IN_BROWSER
        }
    }

    fun isSiteUrl(url: String): Boolean =
        schemeOf(url) in WEB_SCHEMES && hostOf(url)?.let { isSiteHost(normalizeHost(it)) } == true

    private fun isSiteHost(host: String) = siteHost.isNotEmpty() && isSameOrSubdomain(host, siteHost)

    private fun isAdmin(host: String, path: String): Boolean {
        // admin.siteniz.com gibi alt alan adları
        if (host != siteHost && host.substringBefore('.') in adminPaths) return true
        val lower = path.lowercase()
        val relative = if (lower.startsWith(basePath)) lower.substring(basePath.length) else lower
        return relative.split('/').any { it.substringBefore(';').substringBefore('.') in adminPaths }
    }

    companion object {
        private val WEB_SCHEMES = setOf("http", "https")

        // WebView'in kendisinin işlemesi gereken (veya zaten reddettiği) şemalar
        private val WEBVIEW_SCHEMES = setOf("about", "data", "blob", "javascript", "file", "content")

        private val SCHEME = Regex("^([a-zA-Z][a-zA-Z0-9+.-]*):")

        // Chromium gibi ters bölüyü (\) de ayraç sayar; "site.com@evil.com" -> evil.com
        private val AUTHORITY = Regex("^[a-zA-Z][a-zA-Z0-9+.-]*://(?:[^@/\\\\?#]*@)?(\\[[^\\]]*]|[^:/\\\\?#]*)([^?#]*)")

        fun fromConfig(siteUrl: String, adminPathsCsv: String, inAppHostsCsv: String) =
            UrlPolicy(siteUrl, adminPathsCsv.split(','), inAppHostsCsv.split(','))

        private fun schemeOf(url: String): String? = SCHEME.find(url)?.groupValues?.get(1)?.lowercase()

        private fun hostOf(url: String): String? {
            val parsed = runCatching { URI(url).host }.getOrNull()
            val host = parsed ?: AUTHORITY.find(url)?.groupValues?.get(1)
            return host?.takeIf { it.isNotBlank() }
        }

        private fun pathOf(url: String): String =
            runCatching { URI(url).path }.getOrNull() ?: AUTHORITY.find(url)?.groupValues?.get(2).orEmpty()

        private fun normalizeHost(host: String) = host.lowercase().trimEnd('.').removePrefix("www.")

        private fun isSameOrSubdomain(host: String, domain: String) = host == domain || host.endsWith(".$domain")
    }
}
