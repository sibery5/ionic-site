package com.dramaseason.app

/** Sayfa yüklendikten sonra WebView'e enjekte edilen küçük JavaScript parçaları. */
object PageScripts {

    /**
     * Kopyala butonları (cüzdan adresi, tutar vb.) WebView'de navigator.clipboard
     * çalışmadığında da çalışsın diye eski execCommand('copy') yöntemine düşer.
     */
    const val CLIPBOARD_FALLBACK = """
(function () {
  if (window.__dsClipboardPatched) return;
  window.__dsClipboardPatched = true;
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return ok ? Promise.resolve() : Promise.reject(new Error('copy failed'));
  }
  var clip = navigator.clipboard;
  if (clip && typeof clip.writeText === 'function') {
    var original = clip.writeText.bind(clip);
    clip.writeText = function (text) {
      return original(text).catch(function () { return legacyCopy(String(text)); });
    };
  } else {
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: function (text) { return legacyCopy(String(text)); } }
      });
    } catch (e) {}
  }
})();
"""

    /**
     * Sayfanın rengini "r,g,b" olarak döndürür: önce <meta name="theme-color">,
     * sonra html/body arka planı, hiçbiri yoksa tarayıcı varsayılanı beyaz.
     * Durum çubuğu ve alt çubuk bu renge boyanır, böylece uygulama sitenin renginde görünür.
     */
    const val THEME_COLOR = """
(function () {
  try {
    function rgb(value) {
      if (!value) return null;
      var probe = document.createElement('div');
      probe.style.color = value;
      if (!probe.style.color) return null;
      document.body.appendChild(probe);
      var parts = getComputedStyle(probe).color.match(/[\d.]+/g);
      document.body.removeChild(probe);
      if (!parts || parts.length < 3 || (parts.length > 3 && parseFloat(parts[3]) < 0.5)) return null;
      return [parts[0], parts[1], parts[2]].map(function (n) { return Math.round(parseFloat(n)); }).join(',');
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    return rgb(meta && meta.getAttribute('content')) ||
      rgb(getComputedStyle(document.documentElement).backgroundColor) ||
      rgb(getComputedStyle(document.body).backgroundColor) ||
      '255,255,255';
  } catch (e) {
    return '';
  }
})();
"""

    /** Sayfadaki admin paneli linklerini gizler (tıklansalar da UrlPolicy zaten engeller). */
    fun hideAdminLinks(adminPaths: List<String>, basePath: String): String = """
(function (keys, basePath) {
  var host = location.hostname.replace(/^www\./, '');
  function isAdmin(href) {
    try {
      var u = new URL(href, location.href);
      if (u.hostname.replace(/^www\./, '') !== host) return false;
      var p = decodeURIComponent(u.pathname).toLowerCase();
      if (p.indexOf(basePath) === 0) p = p.substring(basePath.length);
      return p.split('/').some(function (s) { return keys.indexOf(s.split(';')[0].split('.')[0]) !== -1; });
    } catch (e) {
      return false;
    }
  }
  document.querySelectorAll('a[href]').forEach(function (a) {
    if (isAdmin(a.getAttribute('href'))) a.style.display = 'none';
  });
})(${adminPaths.joinToString(",", "[", "]") { jsString(it) }}, ${jsString(basePath)});
"""

    /** evaluateJavascript sonucunu ("\"14,14,19\"") renk bileşenlerine çevirir. */
    fun parseRgbResult(result: String?): IntArray? {
        val parts = result?.trim()?.removeSurrounding("\"")?.split(',') ?: return null
        if (parts.size != 3) return null
        val values = parts.map { it.trim().toIntOrNull() ?: return null }
        if (values.any { it !in 0..255 }) return null
        return values.toIntArray()
    }

    fun jsString(value: String): String {
        val escaped = buildString {
            for (c in value) {
                when (c) {
                    '\\' -> append("\\\\")
                    '\'' -> append("\\'")
                    '\n' -> append("\\n")
                    '\r' -> append("\\r")
                    else -> append(c)
                }
            }
        }
        return "'$escaped'"
    }
}
