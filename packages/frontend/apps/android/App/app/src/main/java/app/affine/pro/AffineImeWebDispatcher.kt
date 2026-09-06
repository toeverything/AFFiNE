package app.affine.pro

import android.webkit.WebView

internal enum class AndroidImeInputType(
    val value: String,
    val key: String,
    val keyCode: Int,
) {
    BACKWARD_DELETE("deleteContentBackward", "Backspace", 8),
    FORWARD_DELETE("deleteContentForward", "Delete", 46),
}

internal fun dispatchAndroidEditorInput(
    webView: WebView,
    inputType: AndroidImeInputType,
) {
    webView.post {
        webView.evaluateJavascript(
            """
                (() => {
                  try {
                    const selection = document.getSelection();
                    let target = selection?.anchorNode ?? document.activeElement ?? document.body;
                    if (target && target.nodeType === Node.TEXT_NODE) {
                      target = target.parentElement;
                    }
                    if (!(target instanceof EventTarget)) {
                      target = document.activeElement ?? document.body;
                    }
                    const detail = {
                      inputType: '${inputType.value}',
                      handled: false,
                    };
                    const event = new CustomEvent('affine-android-ime-input', {
                      detail,
                      bubbles: true,
                      cancelable: true,
                      composed: true,
                    });
                    const dispatched = target.dispatchEvent(event);
                    const handled = detail.handled || !dispatched;
                    let fallbackKey = null;
                    if (!handled) {
                      fallbackKey = '${inputType.key}';
                      target.dispatchEvent(new KeyboardEvent('keydown', {
                        key: '${inputType.key}',
                        code: '${inputType.key}',
                        keyCode: ${inputType.keyCode},
                        which: ${inputType.keyCode},
                        bubbles: true,
                        cancelable: true,
                        composed: true,
                      }));
                    }
                    return {
                      inputType: '${inputType.value}',
                      handled,
                      fallbackKey,
                    };
                  } catch (error) {
                    console.error('[AffineIME] dispatch editor input failed', error);
                    return { error: String(error) };
                  }
                })();
            """.trimIndent(),
            null,
        )
    }
}
