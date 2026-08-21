package app.affine.pro

import android.webkit.WebResourceRequest
import android.webkit.WebView
import com.getcapacitor.Bridge
import com.getcapacitor.BridgeWebViewClient

internal class AffineWebViewClient(
    bridge: Bridge,
    private val trustedOrigin: String?,
) : BridgeWebViewClient(bridge) {
    override fun shouldOverrideUrlLoading(
        view: WebView,
        request: WebResourceRequest,
    ): Boolean {
        if (request.isForMainFrame) {
            (view as? AffineEditorWebView)?.updateAndroidIMEBridge(
                request.url.toString(),
                trustedOrigin,
            )
        }
        return super.shouldOverrideUrlLoading(view, request)
    }
}
