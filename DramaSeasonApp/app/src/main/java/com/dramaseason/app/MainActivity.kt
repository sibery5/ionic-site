package com.dramaseason.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import com.dramaseason.app.UrlPolicy.Action
import java.net.URISyntaxException

/**
 * Siteyi birebir gösteren tek ekran. Tasarım sitenin kendisi olduğu için
 * anasayfa, dizi detay, player, üye girişi/kayıt ve kripto ödeme sayfaları
 * sitede nasıl görünüyorsa uygulamada da öyle görünür.
 */
class MainActivity : Activity() {

    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var errorView: View
    private lateinit var errorMessage: TextView

    private val policy = UrlPolicy.fromConfig(BuildConfig.SITE_URL, BuildConfig.ADMIN_PATHS, BuildConfig.IN_APP_HOSTS)

    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
    private var orientationBeforeFullscreen = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    private var cutoutModeBeforeFullscreen = 0
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var backCallback: Any? = null
    private var backCallbackRegistered = false
    private var lightSystemBars = false
    private var splashVisible = true
    private var rendererGone = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        root = findViewById(R.id.root)
        webView = findViewById(R.id.web_view)
        progressBar = findViewById(R.id.progress)
        errorView = findViewById(R.id.error_view)
        errorMessage = findViewById(R.id.error_message)
        findViewById<View>(R.id.retry_button).setOnClickListener { retry() }

        setUpEdgeToEdge()
        setUpWebView()
        holdSplashUntilFirstPage()

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(BuildConfig.SITE_URL)
        }
    }

    // region WebView

    @SuppressLint("SetJavaScriptEnabled")
    private fun setUpWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = true
            allowFileAccess = false
            allowContentAccess = false
            // Sunucu tarafında "DramaSeasonApp" ile uygulamadan gelen istekleri ayırt edebilirsiniz
            userAgentString = "$userAgentString DramaSeasonApp/${BuildConfig.VERSION_NAME}"
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }
        webView.webViewClient = SiteClient()
        webView.webChromeClient = SiteChromeClient()
    }

    private inner class SiteClient : WebViewClient() {

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url.toString()
            if (request.isForMainFrame) return handleNavigation(url)
            // iframe içindeki cüzdan butonları (ör. ödeme widget'ı) yalnızca kullanıcı dokununca açılır;
            // reklam iframe'lerinin kendiliğinden uygulama/market açmasını engeller.
            if (policy.decide(url) == Action.OPEN_EXTERNAL_APP) {
                if (request.hasGesture()) openExternal(url)
                return true
            }
            return false
        }

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            // POST sonrası yönlendirmeler shouldOverrideUrlLoading'e uğramayabilir; admin'e düşerse geri dön.
            if (policy.decide(url) == Action.BLOCK_ADMIN) {
                view.stopLoading()
                toast(R.string.admin_blocked)
                if (view.canGoBack()) view.goBack() else view.loadUrl(BuildConfig.SITE_URL)
                return
            }
            progressBar.visibility = View.VISIBLE
        }

        override fun onPageCommitVisible(view: WebView, url: String) {
            releaseSplash()
        }

        override fun onPageFinished(view: WebView, url: String) {
            progressBar.visibility = View.GONE
            releaseSplash()
            updateBackHandling()
            injectPageScripts(view, url)
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
            updateBackHandling()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            showError("${error.description}\n${request.url}")
            releaseSplash()
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // Sayfa işlemcisi çökerse/öldürülürse uygulama da çökmesin: temiz bir WebView ile yeniden başla.
            rendererGone = true
            root.removeView(view)
            view.destroy()
            recreate()
            return true
        }
    }

    private inner class SiteChromeClient : WebChromeClient() {

        override fun onProgressChanged(view: WebView, newProgress: Int) {
            progressBar.progress = newProgress
            progressBar.visibility = if (newProgress < 100) View.VISIBLE else View.GONE
        }

        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            enterFullscreen(view, callback)
        }

        override fun onHideCustomView() {
            exitFullscreen()
        }

        override fun onShowFileChooser(
            webView: WebView,
            callback: ValueCallback<Array<Uri>>,
            params: FileChooserParams,
        ): Boolean {
            filePathCallback?.onReceiveValue(null)
            filePathCallback = callback
            try {
                @Suppress("DEPRECATION")
                startActivityForResult(params.createIntent(), REQUEST_FILE_CHOOSER)
            } catch (e: ActivityNotFoundException) {
                filePathCallback = null
                callback.onReceiveValue(null)
                toast(R.string.file_chooser_error)
            }
            return true
        }

        // Poster'ı olmayan videolarda WebView'in gri oynat ikonunu gizler
        override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
    }

    private fun handleNavigation(url: String): Boolean = when (policy.decide(url)) {
        Action.LOAD_IN_APP -> false
        Action.BLOCK_ADMIN -> {
            toast(R.string.admin_blocked)
            true
        }
        Action.OPEN_IN_BROWSER, Action.OPEN_EXTERNAL_APP -> {
            openExternal(url)
            true
        }
    }

    private fun openExternal(url: String) {
        val intent = if (url.startsWith("intent:", ignoreCase = true)) {
            parseIntentUri(url) ?: return toast(R.string.no_app_for_link)
        } else {
            Intent(Intent.ACTION_VIEW, Uri.parse(url))
        }
        intent.addCategory(Intent.CATEGORY_BROWSABLE)
        try {
            startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            val fallback = intent.getStringExtra("browser_fallback_url")
            if (fallback != null && fallback.startsWith("http", ignoreCase = true)) {
                if (!handleNavigation(fallback)) webView.loadUrl(fallback)
            } else {
                toast(R.string.no_app_for_link)
            }
        } catch (e: SecurityException) {
            toast(R.string.no_app_for_link)
        }
    }

    private fun parseIntentUri(url: String): Intent? = try {
        Intent.parseUri(url, Intent.URI_INTENT_SCHEME).apply {
            // Sayfanın uygulama içindeki belirli bir bileşeni hedeflemesini engelle
            component = null
            selector = null
        }
    } catch (e: URISyntaxException) {
        null
    }

    private fun injectPageScripts(view: WebView, url: String) {
        if (policy.decide(url) != Action.LOAD_IN_APP) return
        view.evaluateJavascript(PageScripts.CLIPBOARD_FALLBACK, null)
        if (!policy.isSiteUrl(url)) return
        if (policy.adminPaths.isNotEmpty()) {
            view.evaluateJavascript(PageScripts.hideAdminLinks(policy.adminPaths, policy.basePath), null)
        }
        view.evaluateJavascript(PageScripts.THEME_COLOR) { result ->
            PageScripts.parseRgbResult(result)?.let { (r, g, b) -> setSystemBarColor(Color.rgb(r, g, b)) }
        }
    }

    // endregion

    // region Hata ekranı ve açılış ekranı

    private fun showError(details: String) {
        val message = getString(R.string.error_message)
        errorMessage.text = if (BuildConfig.DEBUG) "$message\n\n$details" else message
        progressBar.visibility = View.GONE
        errorView.visibility = View.VISIBLE
    }

    private fun retry() {
        errorView.visibility = View.GONE
        val current = webView.url
        if (current.isNullOrEmpty() || current == "about:blank") webView.loadUrl(BuildConfig.SITE_URL) else webView.reload()
    }

    /** Android 12+ açılış ekranını ilk sayfa çizilene kadar (en fazla birkaç saniye) tutar. */
    private fun holdSplashUntilFirstPage() {
        val content = findViewById<View>(android.R.id.content)
        content.viewTreeObserver.addOnPreDrawListener(object : ViewTreeObserver.OnPreDrawListener {
            override fun onPreDraw(): Boolean {
                if (splashVisible) return false
                content.viewTreeObserver.removeOnPreDrawListener(this)
                return true
            }
        })
        content.postDelayed({ releaseSplash() }, SPLASH_TIMEOUT_MS)
    }

    private fun releaseSplash() {
        if (!splashVisible) return
        splashVisible = false
        findViewById<View>(android.R.id.content).invalidate()
    }

    // endregion

    // region Sistem çubukları ve tam ekran video

    @Suppress("DEPRECATION")
    private fun setUpEdgeToEdge() {
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
        } else {
            window.decorView.systemUiVisibility = LAYOUT_FLAGS
        }
        // İçerik çubukların ve klavyenin altında kalmasın; çubukların arkasında root'un rengi görünür.
        root.setOnApplyWindowInsetsListener { view, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                val ime = insets.getInsets(WindowInsets.Type.ime())
                view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
                WindowInsets.CONSUMED
            } else {
                view.setPadding(
                    insets.systemWindowInsetLeft,
                    insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight,
                    insets.systemWindowInsetBottom,
                )
                insets.consumeSystemWindowInsets()
            }
        }
        setSystemBarColor(getColor(R.color.ds_background), force = true)
    }

    private fun setSystemBarColor(color: Int, force: Boolean = false) {
        root.setBackgroundColor(color)
        val light = Color.luminance(color) > 0.5f
        if (light == lightSystemBars && !force) return
        lightSystemBars = light
        applySystemBarAppearance()
    }

    @Suppress("DEPRECATION")
    private fun applySystemBarAppearance() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(if (lightSystemBars) mask else 0, mask)
        } else if (fullscreenView == null) {
            val lightFlags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            window.decorView.systemUiVisibility = LAYOUT_FLAGS or (if (lightSystemBars) lightFlags else 0)
        }
    }

    private fun enterFullscreen(view: View, callback: WebChromeClient.CustomViewCallback) {
        if (fullscreenView != null) {
            callback.onCustomViewHidden()
            return
        }
        fullscreenView = view
        fullscreenCallback = callback
        view.setBackgroundColor(Color.BLACK)
        (window.decorView as ViewGroup).addView(
            view,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            cutoutModeBeforeFullscreen = window.attributes.layoutInDisplayCutoutMode
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        hideSystemBars()
        orientationBeforeFullscreen = requestedOrientation
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        updateBackHandling()
    }

    private fun exitFullscreen() {
        val view = fullscreenView ?: return
        fullscreenView = null
        fullscreenCallback = null
        (window.decorView as ViewGroup).removeView(view)
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply { layoutInDisplayCutoutMode = cutoutModeBeforeFullscreen }
        }
        showSystemBars()
        requestedOrientation = orientationBeforeFullscreen
        updateBackHandling()
    }

    @Suppress("DEPRECATION")
    private fun hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let {
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                it.hide(WindowInsets.Type.systemBars())
            }
        } else {
            window.decorView.systemUiVisibility = LAYOUT_FLAGS or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        }
    }

    private fun showSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.show(WindowInsets.Type.systemBars())
        }
        applySystemBarAppearance()
    }

    // endregion

    // region Geri tuşu

    private fun shouldInterceptBack() = fullscreenView != null || webView.canGoBack()

    private fun handleBack() {
        if (fullscreenView != null) {
            fullscreenCallback?.onCustomViewHidden()
            exitFullscreen()
        } else if (webView.canGoBack()) {
            webView.goBack()
        }
        updateBackHandling()
    }

    /**
     * Android 13+ (predictive back): geri hareketini yalnızca uygulama içinde geri gidilecek
     * bir sayfa varken yakalar; yoksa sistem uygulamayı normal şekilde arka plana alır.
     */
    private fun updateBackHandling() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || rendererGone) return
        val wanted = shouldInterceptBack()
        if (wanted == backCallbackRegistered) return
        val callback = backCallback as? OnBackInvokedCallback
            ?: OnBackInvokedCallback { handleBack() }.also { backCallback = it }
        if (wanted) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback)
        } else {
            onBackInvokedDispatcher.unregisterOnBackInvokedCallback(callback)
        }
        backCallbackRegistered = wanted
    }

    @Deprecated("Android 12 ve öncesi için geri tuşu")
    override fun onBackPressed() {
        if (shouldInterceptBack()) {
            handleBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    // endregion

    // region Yaşam döngüsü

    @Deprecated("Dosya seçici sonucu")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQUEST_FILE_CHOOSER) {
            filePathCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            filePathCallback = null
            return
        }
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onResume() {
        super.onResume()
        if (!rendererGone) webView.onResume()
    }

    override fun onPause() {
        if (!rendererGone) webView.onPause()
        // Üye oturumu (çerezler) uygulama kapansa da kalsın
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (!rendererGone) webView.saveState(outState)
    }

    override fun onDestroy() {
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        if (!rendererGone) {
            root.removeView(webView)
            webView.destroy()
        }
        super.onDestroy()
    }

    // endregion

    private fun toast(message: Int) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    private companion object {
        const val REQUEST_FILE_CHOOSER = 1001
        const val SPLASH_TIMEOUT_MS = 2500L

        @Suppress("DEPRECATION")
        const val LAYOUT_FLAGS = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
    }
}
