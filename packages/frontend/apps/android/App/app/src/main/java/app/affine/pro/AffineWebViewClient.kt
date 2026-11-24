package app.affine.pro

import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import app.affine.pro.utils.LocalNetwork
import com.getcapacitor.Bridge
import com.getcapacitor.BridgeWebViewClient

internal class AffineWebViewClient(
    bridge: Bridge,
    private val trustedOrigin: String?,
) : BridgeWebViewClient(bridge) {
    override fun shouldInterceptRequest(
        view: WebView,
        request: WebResourceRequest,
    ): WebResourceResponse? {
        if (LocalNetwork.blocksCleartext(request.url.scheme, request.url.host)) {
            return WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", emptyMap(), null)
        }
        return super.shouldInterceptRequest(view, request)
    }

    override fun shouldOverrideUrlLoading(
        view: WebView,
        request: WebResourceRequest,
    ): Boolean {
        val shouldOverride = super.shouldOverrideUrlLoading(view, request)
        if (!shouldOverride && request.isForMainFrame) {
            (view as? AffineEditorWebView)?.updateAndroidIMEBridge(
                request.url.toString(),
                trustedOrigin,
            )
        }
        return shouldOverride
    }
}
