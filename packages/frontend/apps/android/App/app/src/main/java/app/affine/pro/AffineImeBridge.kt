package app.affine.pro

import android.net.Uri
import android.webkit.JavascriptInterface

internal const val AFFINE_IME_BRIDGE_NAME = "AffineAndroidIME"
internal const val AFFINE_IME_BRIDGE_PROTOCOL_VERSION = 1
internal const val DELETE_RESTART_INPUT_DEBOUNCE_MS = 120L

internal fun normalizeAffineOrigin(url: String?): String? {
    val uri = Uri.parse(url ?: return null)
    val scheme = uri.scheme?.lowercase() ?: return null
    val host = uri.host?.lowercase() ?: return null
    val isSupportedOrigin =
        (scheme == "https" && host == "localhost") ||
            (BuildConfig.DEBUG &&
                scheme == "http" &&
                host in setOf("localhost", "127.0.0.1", "10.0.2.2"))
    if (!isSupportedOrigin) return null

    val port = when {
        uri.port == -1 -> ""
        scheme == "https" && uri.port == 443 -> ""
        scheme == "http" && uri.port == 80 -> ""
        else -> ":${uri.port}"
    }
    return "$scheme://$host$port"
}

internal fun isTrustedAffineOrigin(url: String?, expectedOrigin: String?): Boolean {
    return expectedOrigin != null && normalizeAffineOrigin(url) == expectedOrigin
}

internal class AffineImeBridge(
    private val isTrustedPage: () -> Boolean,
    private val clearComposingState: () -> Unit,
    private val requestRestartInput: (Long) -> Unit,
    private val onEditorFocusedChanged: (Boolean) -> Unit,
) {
    @JavascriptInterface
    fun getProtocolVersion(): Int {
        return if (isTrustedPage()) AFFINE_IME_BRIDGE_PROTOCOL_VERSION else 0
    }

    @JavascriptInterface
    fun finishComposingSession() {
        if (!isTrustedPage()) return
        clearComposingState()
        requestRestartInput(0L)
    }

    @JavascriptInterface
    fun finishDeleteSession() {
        if (!isTrustedPage()) return
        requestRestartInput(DELETE_RESTART_INPUT_DEBOUNCE_MS)
    }

    @JavascriptInterface
    fun setEditorFocused(focused: Boolean) {
        if (isTrustedPage()) {
            onEditorFocusedChanged(focused)
        }
    }
}
