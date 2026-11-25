package app.affine.pro.host

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import java.util.concurrent.atomic.AtomicBoolean

/**
 * One-shot upgrade/rollback probe that reads or writes whitelisted `localStorage`
 * keys on the legacy Capacitor Android origin (`https://localhost`) with active
 * `window.indexedDB.open` / `deleteDatabase` interception, timeout/error/crash
 * WebView cleanup, and zero network traffic. Never instantiated by the main app shell.
 */
class LegacyLocalStorageProbe(private val context: Context) {
  companion object {
    const val LEGACY_ORIGIN = "https://localhost"
    const val PROBE_URL = "https://localhost/__affine_probe__"
    const val LOCAL_WORKSPACE_KEY = "affine-local-workspace"
    const val DEFAULT_TIMEOUT_MS = 5_000L

    /**
     * Exact `0.27.5` `localStorage` keys (`local.ts:58`, `storage.ts:83,91`, `auth.ts:59`).
     */
    val EXACT_ALLOWED_KEYS: List<String> = listOf(
      LOCAL_WORKSPACE_KEY,
      "global-state:serverList",
      "global-cache:i18n_lng",
      "last_workspace_id",
      "last_workspace_flavour",
      "affine-settings",
      "theme",
    )

    fun isAllowedKey(key: String): Boolean {
      if (key in EXACT_ALLOWED_KEYS) return true
      if (key.startsWith("global-state:serverConfig:")) {
        return key.length > "global-state:serverConfig:".length
      }
      if (key.startsWith("global-state:affine-flag:")) {
        return key.length > "global-state:affine-flag:".length
      }
      if (key.startsWith("affine-flag:")) {
        return key.length > "affine-flag:".length
      }
      if (key.startsWith("global-state:") && key.endsWith("-auth")) {
        val serverId = key.removePrefix("global-state:").removeSuffix("-auth")
        return serverId.isNotEmpty()
      }
      if (key.endsWith("-auth")) {
        val serverId = key.removeSuffix("-auth")
        return serverId.isNotEmpty() && !serverId.contains(':')
      }
      return false
    }

    private const val IDB_GUARD_PRELUDE = """
      let idbTouchCount = 0;
      const idbBlocked = true;
      if (typeof window !== 'undefined' && window.indexedDB) {
        const blockIdb = (name) => () => {
          idbTouchCount += 1;
          throw new Error('AFFINE_IDB_FORBIDDEN:' + name);
        };
        try {
          Object.defineProperty(window.indexedDB, 'open', {
            configurable: true,
            value: blockIdb('open'),
          });
          Object.defineProperty(window.indexedDB, 'deleteDatabase', {
            configurable: true,
            value: blockIdb('deleteDatabase'),
          });
        } catch (_) {
          window.indexedDB.open = blockIdb('open');
          window.indexedDB.deleteDatabase = blockIdb('deleteDatabase');
        }
      }
    """

    private fun jsString(raw: String): String {
      val escaped = raw
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
      return "\"$escaped\""
    }

    private fun jsAllowMatcher(extraExactKeys: List<String>): String {
      val exactList = (EXACT_ALLOWED_KEYS + extraExactKeys).distinct().joinToString(",") { jsString(it) }
      return """
        const exactAllow = new Set([$exactList]);
        const isAllowedKey = (k) => {
          if (exactAllow.has(k)) return true;
          if (k.startsWith("global-state:serverConfig:")) return k.length > "global-state:serverConfig:".length;
          if (k.startsWith("global-state:affine-flag:")) return k.length > "global-state:affine-flag:".length;
          if (k.startsWith("affine-flag:")) return k.length > "affine-flag:".length;
          if (k.startsWith("global-state:") && k.endsWith("-auth")) {
            return k.slice("global-state:".length, -"-auth".length).length > 0;
          }
          if (k.endsWith("-auth")) {
            const id = k.slice(0, -"-auth".length);
            return id.length > 0 && !id.includes(":");
          }
          return false;
        };
      """.trimIndent()
    }

    fun buildCaptureScript(extraExactKeys: List<String> = emptyList()): String {
      val matcher = jsAllowMatcher(extraExactKeys)
      return """
        (() => {
          $IDB_GUARD_PRELUDE
          $matcher
          const keys = [];
          const entries = {};
          const total = window.localStorage.length;
          for (let i = 0; i < total; i += 1) {
            const k = window.localStorage.key(i);
            if (k !== null) {
              keys.push(k);
              if (isAllowedKey(k)) {
                const v = window.localStorage.getItem(k);
                if (v !== null) entries[k] = v;
              }
            }
          }
          keys.sort();
          return {
            origin: window.location.origin,
            length: total,
            keys,
            entries,
            idbBlocked,
            idbTouchCount
          };
        })()
      """.trimIndent()
    }

    fun buildWriteBackScript(
      setEntries: Map<String, String>,
      removeKeys: List<String> = emptyList(),
    ): String {
      require(LOCAL_WORKSPACE_KEY !in removeKeys) {
        "affine-local-workspace must be written as \"[]\" in setEntries, never removed"
      }
      for (k in setEntries.keys) {
        require(isAllowedKey(k)) { "non-allowlisted setEntries key: $k" }
      }
      for (k in removeKeys) {
        require(isAllowedKey(k)) { "non-allowlisted removeKeys key: $k" }
      }
      val matcher = jsAllowMatcher(emptyList())
      val setPairs = setEntries.entries
        .sortedBy { it.key }
        .joinToString(",") { (k, v) -> "[${jsString(k)},${jsString(v)}]" }
      val remList = removeKeys.distinct().sorted().joinToString(",") { jsString(it) }
      return """
        (() => {
          $IDB_GUARD_PRELUDE
          $matcher
          const targetSet = [$setPairs];
          const targetRemove = [$remList];
          for (const [k] of targetSet) {
            if (!isAllowedKey(k)) throw new Error('AFFINE_WRITEBACK_KEY_FORBIDDEN:' + k);
          }
          for (const k of targetRemove) {
            if (!isAllowedKey(k) || k === "affine-local-workspace") {
              throw new Error('AFFINE_WRITEBACK_REMOVE_FORBIDDEN:' + k);
            }
          }
          for (const [k, v] of targetSet) {
            window.localStorage.setItem(k, v);
          }
          for (const k of targetRemove) {
            window.localStorage.removeItem(k);
          }
          const keys = [];
          const entries = {};
          const total = window.localStorage.length;
          for (let i = 0; i < total; i += 1) {
            const k = window.localStorage.key(i);
            if (k !== null) {
              keys.push(k);
              if (isAllowedKey(k)) {
                const v = window.localStorage.getItem(k);
                if (v !== null) entries[k] = v;
              }
            }
          }
          let verified = true;
          for (const [k, v] of targetSet) {
            if (entries[k] !== v) verified = false;
          }
          const removedKeys = [];
          for (const k of targetRemove) {
            if (window.localStorage.getItem(k) === null) {
              removedKeys.push(k);
            } else {
              verified = false;
            }
          }
          keys.sort();
          removedKeys.sort();
          return {
            origin: window.location.origin,
            length: total,
            keys,
            entries,
            removedKeys,
            verified,
            idbBlocked,
            idbTouchCount
          };
        })()
      """.trimIndent()
    }
  }

  fun capture(
    extraExactKeys: List<String> = emptyList(),
    timeoutMs: Long = DEFAULT_TIMEOUT_MS,
    onResult: (String?) -> Unit,
  ) {
    runIsolatedScript(buildCaptureScript(extraExactKeys), timeoutMs, onResult)
  }

  fun writeBackLegacyLocalStorage(
    setEntries: Map<String, String>,
    removeKeys: List<String> = emptyList(),
    timeoutMs: Long = DEFAULT_TIMEOUT_MS,
    onResult: (String?) -> Unit,
  ) {
    runIsolatedScript(buildWriteBackScript(setEntries, removeKeys), timeoutMs, onResult)
  }

  @SuppressLint("SetJavaScriptEnabled")
  private fun runIsolatedScript(
    script: String,
    timeoutMs: Long,
    onResult: (String?) -> Unit,
  ) {
    val webView = WebView(context)
    webView.settings.javaScriptEnabled = true
    webView.settings.domStorageEnabled = true
    val completed = AtomicBoolean(false)
    val mainHandler = Handler(Looper.getMainLooper())

    lateinit var timeoutRunnable: Runnable
    fun finish(result: String?) {
      if (!completed.compareAndSet(false, true)) return
      mainHandler.removeCallbacks(timeoutRunnable)
      runCatching { webView.stopLoading() }
      runCatching { webView.destroy() }
      onResult(result)
    }

    timeoutRunnable = Runnable { finish(null) }
    mainHandler.postDelayed(timeoutRunnable, timeoutMs.coerceAtLeast(1L))

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
        if (completed.get()) return
        webView.evaluateJavascript(script) { raw -> finish(raw) }
      }

      override fun onReceivedError(
        view: WebView?,
        request: WebResourceRequest?,
        error: WebResourceError?,
      ) {
        if (request?.isForMainFrame == true) {
          finish(null)
        }
      }

      override fun onRenderProcessGone(
        view: WebView?,
        detail: RenderProcessGoneDetail?,
      ): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          finish(null)
          return true
        }
        return false
      }
    }

    webView.loadUrl(PROBE_URL)
  }
}
