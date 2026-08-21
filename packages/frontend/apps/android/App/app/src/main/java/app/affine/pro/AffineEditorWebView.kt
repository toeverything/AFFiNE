package app.affine.pro

import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.util.AttributeSet
import android.util.Log
import android.view.KeyEvent
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.ExtractedTextRequest
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputConnectionWrapper
import android.view.inputmethod.InputMethodManager
import android.webkit.JavascriptInterface
import com.getcapacitor.CapacitorWebView

private const val AFFINE_IME_TAG = "AffineIME"

private fun logDebug(message: String) {
    if (BuildConfig.DEBUG) {
        Log.d(AFFINE_IME_TAG, message)
    }
}

private fun isTrustedAffineOrigin(url: String?): Boolean {
    val uri = Uri.parse(url ?: return false)
    val scheme = uri.scheme?.lowercase()
    val host = uri.host?.lowercase()
    if (scheme == "https" && host == "localhost") return true

    return BuildConfig.DEBUG &&
        scheme == "http" &&
        host in setOf("localhost", "127.0.0.1", "10.0.2.2")
}

class AffineEditorWebView(
    context: Context,
    attrs: AttributeSet,
) : CapacitorWebView(context, attrs) {
    private val imeState = AndroidIMEState()
    private val androidIMEBridge = AndroidIMEBridge()

    init {
        logDebug("AffineEditorWebView created sdk=${Build.VERSION.SDK_INT}")
    }

    fun updateAndroidIMEBridge(url: String?) {
        if (isTrustedAffineOrigin(url)) {
            addJavascriptInterface(androidIMEBridge, "AffineAndroidIME")
        } else {
            removeJavascriptInterface("AffineAndroidIME")
            imeState.editorFocused = false
        }
    }

    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
        val connection = super.onCreateInputConnection(outAttrs) ?: return null
        logDebug(
            "onCreateInputConnection inputType=${outAttrs.inputType.toFlags()} " +
                "imeOptions=${outAttrs.imeOptions.toFlags()} " +
                "initialSelection=${outAttrs.initialSelStart},${outAttrs.initialSelEnd} " +
                "package=${outAttrs.packageName}"
        )
        return AffineInputConnection(
            connection,
            imeState,
            dispatchDeleteBackward = {
                dispatchAndroidEditorInput("deleteContentBackward")
            },
            dispatchDeleteForward = {
                dispatchAndroidEditorInput("deleteContentForward")
            },
        )
    }

    private fun dispatchAndroidEditorInput(inputType: String) {
        val escapedInputType = inputType.replace("\\", "\\\\").replace("'", "\\'")
        post {
            evaluateJavascript(
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
                        const handled = !target.dispatchEvent(new CustomEvent('affine-android-ime-input', {
                          detail: { inputType: '$escapedInputType' },
                          bubbles: true,
                          cancelable: true,
                          composed: true,
                        }));
                        let fallbackKey = null;
                        if (!handled) {
                          const key = '$escapedInputType' === 'deleteContentForward'
                            ? 'Delete'
                            : 'Backspace';
                          const keyCode = '$escapedInputType' === 'deleteContentForward'
                            ? 46
                            : 8;
                          fallbackKey = key;
                          target.dispatchEvent(new KeyboardEvent('keydown', {
                            key,
                            code: key,
                            keyCode,
                            which: keyCode,
                            bubbles: true,
                            cancelable: true,
                            composed: true,
                          }));
                        }
                        return {
                          inputType: '$escapedInputType',
                          handled,
                          fallbackKey,
                        };
                      } catch (error) {
                        console.error('[AffineIME] dispatch editor input failed', error);
                        return { error: String(error) };
                      }
                    })();
                """.trimIndent(),
                { result ->
                    logDebug("dispatchAndroidEditorInput result=$result inputType=$inputType")
                },
            )
        }
    }

    private inner class AndroidIMEBridge {
        @JavascriptInterface
        fun finishComposingSession(reason: String?) {
            if (!isTrustedAffineOrigin(this@AffineEditorWebView.url)) return
            val reasonForLog = reason?.take(48) ?: "unknown"
            val isDeleteReason = reason?.contains("deleteContent") == true
            logDebug("finishComposingSessionFromWeb reason=$reasonForLog")
            if (!isDeleteReason) {
                imeState.nextClearRequestGeneration()
            }
            requestRestartInput(
                if (isDeleteReason) {
                    DELETE_RESTART_INPUT_DEBOUNCE_MS
                } else {
                    0L
                },
            )
        }

        @JavascriptInterface
        fun setEditorFocused(focused: Boolean) {
            if (isTrustedAffineOrigin(this@AffineEditorWebView.url)) {
                imeState.editorFocused = focused
            }
        }
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
        inputMethodManager?.restartInput(this@AffineEditorWebView)
    }

    private class AndroidIMEState {
        @Volatile
        var clearRequestGeneration: Long = 0L

        @Volatile
        var editorFocused: Boolean = false

        @Volatile
        var lastDeleteIntentAtMs: Long = 0L

        @Volatile
        var restartInputGeneration: Int = 0

        @Synchronized
        fun nextRestartGeneration(): Int {
            restartInputGeneration += 1
            return restartInputGeneration
        }

        @Synchronized
        fun nextClearRequestGeneration(): Long {
            clearRequestGeneration += 1
            return clearRequestGeneration
        }
    }

    private class AffineInputConnection(
        target: InputConnection,
        private val state: AndroidIMEState,
        private val dispatchDeleteBackward: () -> Unit,
        private val dispatchDeleteForward: () -> Unit,
    ) : InputConnectionWrapper(target, true) {
        private var handledClearRequestGeneration = 0L
        private var composingText = ""
        private var isComposingTextActive = false
        private var externalRegionText = ""
        private var externalRegionAtMs = 0L
        private var isDroppingExternalReplay = false
        private var lastExternalReplayTextLength = -1
        private var lastExternalReplayTextAtMs = 0L
        private var lastExternalReplayDeletedLength = 0
        private var syntheticExternalDeleteAtMs = 0L
        private var isConsumingDeleteKeyEvent = false

        override fun setComposingRegion(start: Int, end: Int): Boolean {
            consumeClearRequest()
            val regionText = getTextForRegion(start, end)
            logDebug(
                "setComposingRegion start=$start end=$end text=${regionText.previewForLog()}"
            )

            if (!isComposingTextActive) {
                externalRegionText = regionText
                externalRegionAtMs = SystemClock.uptimeMillis()
                isDroppingExternalReplay = false
                lastExternalReplayTextLength = regionText.length
                lastExternalReplayTextAtMs = externalRegionAtMs
                lastExternalReplayDeletedLength = 0
            } else if (regionText != composingText) {
                // Keep the mirror local instead of delegating to the native WebView
                // connection; delegating would reintroduce the IME replay we suppress.
                composingText = regionText
                isComposingTextActive = regionText.isNotEmpty()
                clearExternalRegion()
            }

            return true
        }

        override fun setComposingText(text: CharSequence?, newCursorPosition: Int): Boolean {
            consumeClearRequest()
            val nextText = text?.toString() ?: ""
            logDebug(
                "setComposingText text=${nextText.previewForLog()} " +
                    "length=${nextText.length} cursor=$newCursorPosition"
            )

            if (shouldAdoptExternalRegionForReplacement(nextText)) {
                logDebug(
                    "resumeExternalReplayAsReplacement text=${nextText.previewForLog()} " +
                        "regionText=${externalRegionText.previewForLog()}"
                )
                isDroppingExternalReplay = false
            }

            if (shouldDropExternalReplay(nextText)) {
                logDebug(
                    "dropExternalComposingReplay text=${nextText.previewForLog()} " +
                        "regionText=${externalRegionText.previewForLog()}"
                )
                isDroppingExternalReplay = true
                deleteForShrinkingExternalReplay(nextText.length)
                return true
            }

            adoptExternalRegionAsComposingTextIfNeeded(nextText)
            clearExternalRegion()
            return applyComposingText(nextText)
        }

        override fun commitText(text: CharSequence?, newCursorPosition: Int): Boolean {
            consumeClearRequest()
            val committedText = text?.toString() ?: ""
            logDebug(
                "commitText text=${committedText.previewForLog()} " +
                    "length=${committedText.length} cursor=$newCursorPosition"
            )

            if (shouldDeleteExternalRegionOnEmptyCommit(committedText)) {
                logDebug(
                    "deleteExternalRegionOnEmptyCommit text=" +
                        externalRegionText.previewForLog()
                )
                deleteRemainingExternalReplayText()
                clearExternalRegion()
                return true
            }

            if (isDroppingExternalReplay) {
                if (committedText.isEmpty() || committedText == externalRegionText) {
                    logDebug("dropExternalReplayCommit text=${committedText.previewForLog()}")
                    if (committedText.isEmpty()) {
                        deleteRemainingExternalReplayTextAfterShrink()
                    }
                    return true
                }
                clearExternalRegion()
            }

            if (isComposingTextActive && committedText.isNotEmpty()) {
                if (isWordBoundaryCommit(committedText)) {
                    resetComposingText()
                    clearExternalRegion()
                    return super.commitText(text, newCursorPosition)
                }

                val result = applyComposingText(committedText)
                resetComposingText()
                return result
            }

            if (committedText.isNotEmpty()) {
                clearExternalRegion()
            }

            return super.commitText(text, newCursorPosition)
        }

        override fun finishComposingText(): Boolean {
            consumeClearRequest()
            logDebug("finishComposingText")
            resetComposingText()
            clearExternalRegion()
            return super.finishComposingText()
        }

        override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean {
            consumeClearRequest()
            logDebug("deleteSurroundingText before=$beforeLength after=$afterLength")
            recordDeleteIntent(beforeLength, afterLength)
            if (shouldDropNativeDeleteAfterSyntheticExternalDelete(beforeLength, afterLength)) {
                logDebug(
                    "dropNativeDeleteAfterSyntheticExternalDelete before=$beforeLength " +
                        "after=$afterLength"
                )
                clearExternalRegion()
                return true
            }
            clearExternalRegion()
            if (isComposingTextActive && beforeLength > 0) {
                trimComposingTail(beforeLength, codePoints = false)
            }
            return super.deleteSurroundingText(beforeLength, afterLength)
        }

        override fun deleteSurroundingTextInCodePoints(
            beforeLength: Int,
            afterLength: Int,
        ): Boolean {
            consumeClearRequest()
            logDebug("deleteSurroundingTextInCodePoints before=$beforeLength after=$afterLength")
            recordDeleteIntent(beforeLength, afterLength)
            if (shouldDropNativeDeleteAfterSyntheticExternalDelete(beforeLength, afterLength)) {
                logDebug(
                    "dropNativeDeleteInCodePointsAfterSyntheticExternalDelete " +
                        "before=$beforeLength after=$afterLength"
                )
                clearExternalRegion()
                return true
            }
            clearExternalRegion()
            if (isComposingTextActive && beforeLength > 0) {
                trimComposingTail(beforeLength, codePoints = true)
            }
            return super.deleteSurroundingTextInCodePoints(beforeLength, afterLength)
        }

        override fun setSelection(start: Int, end: Int): Boolean {
            consumeClearRequest()
            logDebug("setSelection start=$start end=$end")
            clearExternalRegion()
            resetComposingText()
            return super.setSelection(start, end)
        }

        override fun performEditorAction(editorAction: Int): Boolean {
            consumeClearRequest()
            logDebug("performEditorAction action=$editorAction")
            resetComposingText()
            clearExternalRegion()
            return super.performEditorAction(editorAction)
        }

        override fun sendKeyEvent(event: KeyEvent): Boolean {
            val isDeleteActionDown =
                event.action == KeyEvent.ACTION_DOWN &&
                    (event.keyCode == KeyEvent.KEYCODE_DEL ||
                        event.keyCode == KeyEvent.KEYCODE_FORWARD_DEL)
            consumeClearRequest(skipNativeFinish = isDeleteActionDown)
            logDebug(
                "sendKeyEvent action=${event.action} keyCode=${event.keyCode} " +
                    "unicode=${event.unicodeChar} repeat=${event.repeatCount}"
            )
            if (event.keyCode == KeyEvent.KEYCODE_DEL) {
                if (!state.editorFocused && !isConsumingDeleteKeyEvent) {
                    return super.sendKeyEvent(event)
                }
                if (event.action == KeyEvent.ACTION_DOWN) {
                    logDebug("dispatchDeleteKeyEventToEditorInput")
                    recordDeleteIntent()
                    dispatchDeleteBackward()
                    isConsumingDeleteKeyEvent = true
                    return true
                }
                if (event.action == KeyEvent.ACTION_UP && isConsumingDeleteKeyEvent) {
                    isConsumingDeleteKeyEvent = false
                    return true
                }
            }
            if (event.keyCode == KeyEvent.KEYCODE_FORWARD_DEL) {
                if (!state.editorFocused && !isConsumingDeleteKeyEvent) {
                    return super.sendKeyEvent(event)
                }
                if (event.action == KeyEvent.ACTION_DOWN) {
                    logDebug("dispatchForwardDeleteKeyEventToEditorInput")
                    recordDeleteIntent()
                    dispatchDeleteForward()
                    isConsumingDeleteKeyEvent = true
                    return true
                }
                if (event.action == KeyEvent.ACTION_UP && isConsumingDeleteKeyEvent) {
                    isConsumingDeleteKeyEvent = false
                    return true
                }
            }
            if (
                event.action == KeyEvent.ACTION_DOWN &&
                    (event.keyCode == KeyEvent.KEYCODE_SPACE ||
                        event.keyCode == KeyEvent.KEYCODE_ENTER)
            ) {
                resetComposingText()
                clearExternalRegion()
            }
            return super.sendKeyEvent(event)
        }

        private fun applyComposingText(nextText: String): Boolean {
            val previousText = composingText
            val prefixLength = commonPrefixLength(previousText, nextText)
            val deleteCount = previousText.length - prefixLength
            val insertText = nextText.substring(prefixLength)

            logDebug(
                "applyComposingText previous=${previousText.previewForLog()} " +
                    "next=${nextText.previewForLog()} delete=$deleteCount " +
                    "insert=${insertText.previewForLog()}"
            )

            if (deleteCount > 0) {
                super.deleteSurroundingText(deleteCount, 0)
            }
            if (insertText.isNotEmpty()) {
                super.commitText(insertText, 1)
            }

            composingText = nextText
            isComposingTextActive = nextText.isNotEmpty()
            return true
        }

        private fun trimComposingTail(beforeLength: Int, codePoints: Boolean) {
            val length =
                if (codePoints) {
                    beforeLength.coerceAtMost(composingText.codePointCount(0, composingText.length))
                } else {
                    beforeLength.coerceAtMost(composingText.length)
                }
            composingText =
                if (codePoints) {
                    val end = composingText.offsetByCodePoints(composingText.length, -length)
                    composingText.substring(0, end)
                } else {
                    composingText.dropLast(length)
                }
            if (composingText.isEmpty()) {
                resetComposingText()
            }
        }

        private fun shouldDropExternalReplay(text: String): Boolean {
            if (text.isEmpty()) return false
            if (isDroppingExternalReplay) {
                return !shouldAdoptExternalRegionForReplacement(text)
            }
            if (externalRegionText.isEmpty()) return false

            val now = SystemClock.uptimeMillis()
            if (
                now - externalRegionAtMs > EXTERNAL_REGION_REPLAY_WINDOW_MS &&
                    !shouldAdoptExternalRegionForReplacement(text)
            ) {
                clearExternalRegion()
                return false
            }

            val isSameRegionReplay =
                externalRegionText == text && hasRecentDeleteIntent(now)
            val isDeleteShrinkReplay =
                externalRegionText.startsWith(text) && hasRecentDeleteIntent(now)
            val isLikelyPassiveReplay = text.length > 1 || externalRegionText.length > 1

            return (isSameRegionReplay || isDeleteShrinkReplay) && isLikelyPassiveReplay
        }

        private fun adoptExternalRegionAsComposingTextIfNeeded(nextText: String) {
            if (externalRegionText.isEmpty()) return

            val now = SystemClock.uptimeMillis()
            if (
                now - externalRegionAtMs > EXTERNAL_REGION_REPLAY_WINDOW_MS &&
                    !shouldAdoptExternalRegionForReplacement(nextText)
            ) {
                return
            }

            composingText = externalRegionText
            isComposingTextActive = composingText.isNotEmpty()
            logDebug(
                "adoptExternalRegionAsComposingText regionText=" +
                    "${externalRegionText.previewForLog()} next=${nextText.previewForLog()}"
            )
        }

        private fun shouldAdoptExternalRegionForReplacement(nextText: String): Boolean {
            if (nextText.isEmpty() || externalRegionText.isEmpty()) return false
            if (externalRegionText.startsWith(nextText)) return false

            val commonPrefixLength = commonPrefixLength(externalRegionText, nextText)
            val minPrefixLength = minOf(
                MIN_REPLACEMENT_COMMON_PREFIX_LENGTH,
                externalRegionText.length,
                nextText.length,
            )

            return commonPrefixLength >= minPrefixLength &&
                nextText.length >= externalRegionText.length
        }

        private fun resetComposingText() {
            composingText = ""
            isComposingTextActive = false
        }

        private fun clearExternalRegion() {
            externalRegionText = ""
            externalRegionAtMs = 0L
            isDroppingExternalReplay = false
            lastExternalReplayTextLength = -1
            lastExternalReplayTextAtMs = 0L
            lastExternalReplayDeletedLength = 0
        }

        private fun deleteForShrinkingExternalReplay(nextTextLength: Int) {
            val now = SystemClock.uptimeMillis()
            val deleteCount =
                if (
                    lastExternalReplayTextLength > 0 &&
                        nextTextLength < lastExternalReplayTextLength &&
                        now - lastExternalReplayTextAtMs <=
                        EXTERNAL_REPLAY_DELETE_WINDOW_MS
                ) {
                    lastExternalReplayTextLength - nextTextLength
                } else {
                    0
                }

            if (deleteCount > 0) {
                logDebug(
                    "deleteForShrinkingExternalReplay before=$deleteCount " +
                        "from=$lastExternalReplayTextLength to=$nextTextLength"
                )
                recordDeleteIntent()
                super.deleteSurroundingText(deleteCount, 0)
                lastExternalReplayDeletedLength += deleteCount
                syntheticExternalDeleteAtMs = SystemClock.uptimeMillis()
            }

            lastExternalReplayTextLength = nextTextLength
            lastExternalReplayTextAtMs = now
        }

        private fun deleteRemainingExternalReplayText() {
            val now = SystemClock.uptimeMillis()
            if (
                lastExternalReplayTextLength <= 0 ||
                    now - lastExternalReplayTextAtMs >
                    EXTERNAL_REPLAY_DELETE_WINDOW_MS
            ) {
                return
            }

            logDebug(
                "deleteRemainingExternalReplayText before=$lastExternalReplayTextLength"
            )
            recordDeleteIntent()
            super.deleteSurroundingText(lastExternalReplayTextLength, 0)
            syntheticExternalDeleteAtMs = SystemClock.uptimeMillis()
            lastExternalReplayTextLength = 0
            lastExternalReplayTextAtMs = now
        }

        private fun deleteRemainingExternalReplayTextAfterShrink() {
            if (lastExternalReplayDeletedLength <= 0) return

            deleteRemainingExternalReplayText()
        }

        private fun shouldDropNativeDeleteAfterSyntheticExternalDelete(
            beforeLength: Int,
            afterLength: Int,
        ): Boolean {
            val now = SystemClock.uptimeMillis()
            return beforeLength > 0 &&
                afterLength == 0 &&
                now - syntheticExternalDeleteAtMs <=
                SYNTHETIC_EXTERNAL_DELETE_SUPPRESS_WINDOW_MS
        }

        private fun shouldDeleteExternalRegionOnEmptyCommit(committedText: String): Boolean {
            if (committedText.isNotEmpty()) return false
            if (isComposingTextActive || externalRegionText.isEmpty()) return false
            if (lastExternalReplayTextLength <= 0) return false
            if (lastExternalReplayDeletedLength <= 0) return false

            val now = SystemClock.uptimeMillis()
            return now - externalRegionAtMs <= EXTERNAL_REPLAY_DELETE_WINDOW_MS &&
                hasRecentDeleteIntent(now)
        }

        private fun hasRecentDeleteIntent(now: Long): Boolean {
            return now - state.lastDeleteIntentAtMs <= EXTERNAL_REPLAY_DELETE_WINDOW_MS
        }

        private fun recordDeleteIntent(beforeLength: Int, afterLength: Int) {
            if (beforeLength <= 0 || afterLength != 0) return
            recordDeleteIntent()
        }

        private fun recordDeleteIntent() {
            state.lastDeleteIntentAtMs = SystemClock.uptimeMillis()
        }

        private fun consumeClearRequest(skipNativeFinish: Boolean = false) {
            val clearRequestGeneration = state.clearRequestGeneration
            if (
                clearRequestGeneration == 0L ||
                    clearRequestGeneration == handledClearRequestGeneration
            ) {
                return
            }

            handledClearRequestGeneration = clearRequestGeneration
            logDebug("clearNativeComposingStateFromWeb")
            resetComposingText()
            clearExternalRegion()
            if (skipNativeFinish) {
                logDebug("skipFinishComposingText clearForDelete=true")
                return
            }
            super.finishComposingText()
        }

        private fun getTextForRegion(start: Int, end: Int): String {
            if (start < 0 || end <= start) return ""

            val extractedText = getExtractedTextSafely() ?: return ""
            val text = extractedText.text?.toString().orEmpty()
            val localStart = start - extractedText.startOffset
            val localEnd = end - extractedText.startOffset
            if (localStart < 0 || localEnd > text.length) return ""

            return text.substring(localStart, localEnd)
        }

        private fun getExtractedTextSafely() = try {
            getExtractedText(ExtractedTextRequest(), 0)
        } catch (error: Exception) {
            logDebug("getExtractedTextFailed error=${error.javaClass.simpleName}")
            null
        }

        private fun isWordBoundaryCommit(text: String): Boolean {
            return text == " " || text == "\n"
        }

        private fun commonPrefixLength(left: String, right: String): Int {
            val maxLength = minOf(left.length, right.length)
            for (index in 0 until maxLength) {
                if (left[index] != right[index]) {
                    return snapToCodePointBoundary(left, index)
                }
            }
            return snapToCodePointBoundary(left, maxLength)
        }

        private fun snapToCodePointBoundary(text: String, index: Int): Int {
            return if (
                index > 0 &&
                    index < text.length &&
                    Character.isHighSurrogate(text[index - 1]) &&
                    Character.isLowSurrogate(text[index])
            ) {
                index - 1
            } else {
                index
            }
        }
    }

    companion object {
        private const val DELETE_RESTART_INPUT_DEBOUNCE_MS = 120L
        private const val EXTERNAL_REGION_REPLAY_WINDOW_MS = 500L
        private const val EXTERNAL_REPLAY_DELETE_WINDOW_MS = 500L
        private const val SYNTHETIC_EXTERNAL_DELETE_SUPPRESS_WINDOW_MS = 120L
        private const val MIN_REPLACEMENT_COMMON_PREFIX_LENGTH = 2
    }
}

private fun Int.toFlags(): String = "0x${toString(16)}"

private fun CharSequence?.previewForLog(): String {
    if (this == null) return "null"
    return toString()
        .replace('\n', ' ')
        .replace('\r', ' ')
        .take(32)
}
