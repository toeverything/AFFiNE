package app.affine.pro

import android.content.Context
import android.util.AttributeSet
import android.view.KeyEvent
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputMethodManager
import com.getcapacitor.CapacitorWebView
import org.json.JSONObject

class AffineEditorWebView(
    context: Context,
    attrs: AttributeSet,
) : CapacitorWebView(context, attrs) {
    private val imeState = AndroidImeState()
    private var imeBridgeInstalled = false
    @Volatile
    private var isTrustedPage = false

    private val imeBridge = AffineImeBridge(
        isTrustedPage = { this.isTrustedPage },
        clearComposingState = { imeState.nextClearRequestGeneration() },
        requestRestartInput = ::requestRestartInput,
        setEditorFocused = { focused -> imeState.editorFocused = focused },
    )

    fun updateAndroidIMEBridge(url: String?, expectedOrigin: String?) {
        val shouldInstallBridge = isTrustedAffineOrigin(url, expectedOrigin)
        if (shouldInstallBridge == imeBridgeInstalled) {
            isTrustedPage = shouldInstallBridge
            return
        }

        if (shouldInstallBridge) {
            addJavascriptInterface(imeBridge, AFFINE_IME_BRIDGE_NAME)
            imeBridgeInstalled = true
            isTrustedPage = true
        } else {
            isTrustedPage = false
            imeBridgeInstalled = false
            removeJavascriptInterface(AFFINE_IME_BRIDGE_NAME)
            imeState.editorFocused = false
        }
    }

    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
        val connection = super.onCreateInputConnection(outAttrs) ?: return null
        return AffineInputConnection(
            connection,
            imeState,
            dispatchDeleteBackward = {
                dispatchAndroidEditorInput(this, AndroidImeInputType.BACKWARD_DELETE)
            },
            dispatchDeleteForward = {
                dispatchAndroidEditorInput(this, AndroidImeInputType.FORWARD_DELETE)
            },
        )
    }

    @Suppress("DEPRECATION")
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_MULTIPLE) {
            val characters = JSONObject.quote(event.characters.orEmpty())
            evaluateJavascript(
                "document.activeElement.value = document.activeElement.value + $characters;",
                null,
            )
            return false
        }
        return super.dispatchKeyEvent(event)
    }

    private fun requestRestartInput(delayMs: Long) {
        val restartGeneration = imeState.nextRestartGeneration()
        if (delayMs <= 0L) {
            post { restartInput() }
            return
        }

        postDelayed(
            {
                if (restartGeneration != imeState.restartInputGeneration) return@postDelayed
                restartInput()
            },
            delayMs,
        )
    }

    private fun restartInput() {
        val inputMethodManager =
            context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
        inputMethodManager?.restartInput(this)
    }
}
