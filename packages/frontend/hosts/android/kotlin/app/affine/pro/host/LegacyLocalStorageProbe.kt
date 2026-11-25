package app.affine.pro.host

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream

/**
 * One-shot upgrade-only probe that reads whitelisted `localStorage` keys from
 * the legacy Capacitor Android origin (`https://localhost`) with zero IndexedDB
 * access and zero network traffic. Never instantiated by the main app shell.
 */
class LegacyLocalStorageProbe(private val context: Context) {
  companion object {
    const val LEGACY_ORIGIN = "https://localhost"
    const val PROBE_URL = "https://localhost/__affine_probe__"
  }

  @SuppressLint("SetJavaScriptEnabled")
  fun capture(allowedKeys: List<String>, onResult: (String?) -> Unit) {
    val webView = WebView(context)
    webView.settings.javaScriptEnabled = true
    webView.settings.domStorageEnabled = true

    val escapedKeys = allowedKeys.joinToString(",") { key ->
      val safe = key.replace("\\", "\\\\").replace("\"", "\\\"")
      "\"$safe\""
    }

    // Synchronous window.localStorage read only. Zero IndexedDB access.
    val script = """
      (() => {
        const allow = new Set([$escapedKeys]);
        const keys = [];
        const entries = {};
        const total = window.localStorage.length;
        for (let i = 0; i < total; i += 1) {
          const k = window.localStorage.key(i);
          if (k !== null && allow.has(k)) {
            keys.push(k);
            const v = window.localStorage.getItem(k);
            if (v !== null) entries[k] = v;
          }
        }
        keys.sort();
        return {
          origin: window.location.origin,
          length: total,
          keys,
          entries
        };
      })()
    """.trimIndent()

    webView.webViewClient = object : WebViewClient() {
      override fun shouldInterceptRequest(
        view: WebView?,
        request: WebResourceRequest?,
      ): WebResourceResponse? {
        if (request?.url?.toString() == PROBE_URL) {
          return WebResourceResponse(
            "text/html",
            "utf-8",
            ByteArrayInputStream("<!doctype html><html><body></body></html>".toByteArray()),
          )
        }
        return WebResourceResponse(
          "text/plain",
          "utf-8",
          204,
          "No Content",
          emptyMap(),
          ByteArrayInputStream(ByteArray(0)),
        )
      }

      override fun onPageFinished(view: WebView?, url: String?) {
        webView.evaluateJavascript(script) { raw ->
          webView.destroy()
          onResult(raw)
        }
      }
    }

    webView.loadUrl(PROBE_URL)
  }
}
