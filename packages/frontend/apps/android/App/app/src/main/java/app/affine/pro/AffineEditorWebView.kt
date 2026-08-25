package app.affine.pro

import android.content.Context
import android.util.AttributeSet
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputMethodManager
import com.getcapacitor.CapacitorWebView

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
        onEditorFocusedChanged = { focused -> imeState.editorFocused = focused },
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
