package app.affine.pro

import android.webkit.WebView
import app.affine.pro.service.CookieStore
import app.affine.pro.utils.dataStore
import app.affine.pro.utils.get
import app.affine.pro.utils.getCurrentServerBaseUrl
import app.affine.pro.utils.logger.FileTree
import com.getcapacitor.Bridge
import com.getcapacitor.WebViewListener
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import okhttp3.Cookie
import okhttp3.HttpUrl.Companion.toHttpUrl
import timber.log.Timber

object AuthInitializer {

    fun initialize(bridge: Bridge) {
        bridge.addWebViewListener(object : WebViewListener() {
            override fun onPageLoaded(webView: WebView?) {
                bridge.removeWebViewListener(this)
                MainScope().launch(Dispatchers.IO) {
                    try {
                        val server = bridge.getCurrentServerBaseUrl().toHttpUrl()
                        val sessionCookieStr = AFFiNEApp.context().dataStore
                            .get(server.host + CookieStore.AFFINE_SESSION)
                        val userIdCookieStr = AFFiNEApp.context().dataStore
                            .get(server.host + CookieStore.AFFINE_USER_ID)
                        if (sessionCookieStr.isEmpty() || userIdCookieStr.isEmpty()) {
                            Timber.i("[init] user has not signed in yet.")
                            return@launch
                        }
                        Timber.i("[init] user already signed in.")
                        val cookies = listOf(
                            Cookie.parse(server, sessionCookieStr)
                                ?: error("Parse session cookie fail:[ cookie = $sessionCookieStr ]"),
                            Cookie.parse(server, userIdCookieStr)
                                ?: error("Parse user id cookie fail:[ cookie = $userIdCookieStr ]"),
                        )
                        CookieStore.saveCookies(server.host, cookies)
                        FileTree.get()?.checkAndUploadOldLogs(server)
                    } catch (e: Exception) {
                        Timber.w(e, "[init] load persistent cookies fail.")
                    }
                }
            }
        })
    }

}