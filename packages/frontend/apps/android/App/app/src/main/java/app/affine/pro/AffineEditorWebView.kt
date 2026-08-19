package app.affine.pro

import android.content.Context
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

class AffineEditorWebView(
    context: Context,
    attrs: AttributeSet,
) : CapacitorWebView(context, attrs) {
    private val imeState = AndroidIMEState()

    init {
        Log.i(TAG, "AffineEditorWebView created sdk=${Build.VERSION.SDK_INT}")
        addJavascriptInterface(AndroidIMEBridge(), "AffineAndroidIME")
    }

    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
        val connection = super.onCreateInputConnection(outAttrs) ?: return null
        Log.i(
            TAG,
            "onCreateInputConnection inputType=${outAttrs.inputType.toFlags()} " +
                "imeOptions=${outAttrs.imeOptions.toFlags()} " +
                "initialSelection=${outAttrs.initialSelStart},${outAttrs.initialSelEnd} " +
                "package=${outAttrs.packageName}",
        )
        imeState.updateSelection(outAttrs.initialSelStart, outAttrs.initialSelEnd)
        return AffineInputConnection(
            connection,
            imeState,
            dispatchDeleteBackward = {
                dispatchAndroidEditorInput("deleteContentBackward")
            },
            dispatchDeleteForward = {
                dispatchAndroidEditorInput("deleteContentForward")
            },
            dispatchKeyDown = { key, keyCode ->
                dispatchAndroidKeyDown(key, keyCode)
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
                        window.AffineAndroidIME?.finishComposingSession?.(
                          'android:$escapedInputType'
                        );
                        return { inputType: '$escapedInputType', handled, fallbackKey };
                      } catch (error) {
                        console.error('[AffineIME] dispatch editor input failed', error);
                        return { error: String(error) };
                      }
                    })();
                """.trimIndent(),
                { result ->
                    Log.i(
                        TAG,
                        "dispatchAndroidEditorInput result=$result inputType=$inputType",
                    )
                },
            )
        }
    }

    private fun dispatchAndroidKeyDown(key: String, keyCode: Int) {
        val escapedKey = key.replace("\\", "\\\\").replace("'", "\\'")
        post {
            evaluateJavascript(
                """
                    (() => {
                      try {
                        let endedComposition = false;
                        const selection = document.getSelection();
                        let target = selection?.anchorNode ?? document.activeElement ?? document.body;
                        if (target && target.nodeType === Node.TEXT_NODE) {
                          target = target.parentElement;
                        }
                        if (!(target instanceof EventTarget)) {
                          target = document.activeElement ?? document.body;
                        }
                        if ('$escapedKey' === 'Backspace' || '$escapedKey' === 'Delete') {
                          target.dispatchEvent(new CompositionEvent('compositionend', {
                            data: '',
                            bubbles: true,
                            cancelable: true,
                            composed: true,
                          }));
                          endedComposition = true;
                        }
                        target.dispatchEvent(new KeyboardEvent('keydown', {
                          key: '$escapedKey',
                          code: '$escapedKey',
                          keyCode: $keyCode,
                          which: $keyCode,
                          bubbles: true,
                          cancelable: true,
                          composed: true,
                        }));
                        if ('$escapedKey' === 'Backspace' || '$escapedKey' === 'Delete') {
                          window.AffineAndroidIME?.finishComposingSession?.('keydown:$escapedKey');
                        }
                        return { endedComposition };
                      } catch (error) {
                        console.error('[AffineIME] dispatch keydown failed', error);
                        return { error: String(error) };
                      }
                    })();
                """.trimIndent(),
                { result ->
                    Log.i(
                        TAG,
                        "dispatchAndroidKeyDown result=$result key=$key keyCode=$keyCode",
                    )
                },
            )
        }
    }

    private inner class AndroidIMEBridge {
        @JavascriptInterface
        fun finishComposingSession(reason: String?) {
            val reasonForLog = reason?.take(48) ?: "unknown"
            Log.i(TAG, "finishComposingSessionFromWeb reason=$reasonForLog")
            imeState.clearRequestedAtMs = SystemClock.uptimeMillis()
            requestRestartInput(
                if (
                    shouldUseLegacyNativeDelete() &&
                    reason?.startsWith("beforeinput:deleteContent") == true
                ) {
                    DELETE_RESTART_INPUT_DELAY_MS
                } else {
                    0L
                }
            )
        }
    }

    private fun requestRestartInput(delayMs: Long) {
        if (delayMs <= 0) {
            post { restartInput() }
            return
        }

        val restartGeneration = imeState.nextRestartGeneration()
        val delayedRestart = Runnable {
            if (restartGeneration != imeState.restartInputGeneration) return@Runnable

            restartInput()
        }
        postDelayed(delayedRestart, delayMs)
    }

    private fun restartInput() {
        val inputMethodManager =
            context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
        inputMethodManager?.restartInput(this@AffineEditorWebView)
    }

    private fun shouldUseLegacyNativeDelete(): Boolean {
        return Build.VERSION.SDK_INT <= Build.VERSION_CODES.Q
    }

    private class AndroidIMEState {
        @Volatile
        var clearRequestedAtMs: Long = 0L

        @Volatile
        var lastDeleteIntentAtMs: Long = 0L

        @Volatile
        var lastSelectionStart: Int = -1

        @Volatile
        var lastSelectionEnd: Int = -1

        @Volatile
        var restartInputGeneration: Int = 0

        fun updateSelection(start: Int, end: Int) {
            if (start < 0 || end < 0) return

            lastSelectionStart = start
            lastSelectionEnd = end
        }

        @Synchronized
        fun nextRestartGeneration(): Int {
            restartInputGeneration += 1
            return restartInputGeneration
        }
    }

    private class AffineInputConnection(
        target: InputConnection,
        private val state: AndroidIMEState,
        private val dispatchDeleteBackward: () -> Unit,
        private val dispatchDeleteForward: () -> Unit,
        private val dispatchKeyDown: (String, Int) -> Unit,
    ) : InputConnectionWrapper(target, true) {
        private var handledClearRequestedAtMs = 0L
        private var composingText = ""
        private var isComposingTextActive = false
        private var externalRegionText = ""
        private var externalRegionAtMs = 0L
        private var isDroppingExternalReplay = false
        private var lastExternalReplayTextLength = -1
        private var lastExternalReplayTextAtMs = 0L
        private var syntheticExternalDeleteAtMs = 0L
        private var lastLegacyKeymapBackspaceAtMs = 0L
        private var isConsumingDeleteKeyEvent = false

        override fun setComposingRegion(start: Int, end: Int): Boolean {
            consumeClearRequest()
            val regionText = getTextForRegion(start, end)
            Log.i(
                TAG,
                "setComposingRegion start=$start end=$end text=${regionText.previewForLog()}",
            )

            if (!isComposingTextActive) {
                externalRegionText = regionText
                externalRegionAtMs = SystemClock.uptimeMillis()
                isDroppingExternalReplay = false
                lastExternalReplayTextLength = regionText.length
                lastExternalReplayTextAtMs = externalRegionAtMs
            }

            return true
        }

        override fun setComposingText(text: CharSequence?, newCursorPosition: Int): Boolean {
            consumeClearRequest()
            val nextText = text?.toString() ?: ""
            Log.i(
                TAG,
                "setComposingText text=${nextText.previewForLog()} " +
                    "length=${nextText.length} cursor=$newCursorPosition",
            )

            if (shouldAdoptExternalRegionForReplacement(nextText)) {
                Log.i(
                    TAG,
                    "resumeExternalReplayAsReplacement text=${nextText.previewForLog()} " +
                        "regionText=${externalRegionText.previewForLog()}",
                )
                isDroppingExternalReplay = false
            }

            if (shouldDropExternalReplay(nextText)) {
                Log.w(
                    TAG,
                    "dropExternalComposingReplay text=${nextText.previewForLog()} " +
                        "regionText=${externalRegionText.previewForLog()}",
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
            Log.i(
                TAG,
                "commitText text=${committedText.previewForLog()} " +
                    "length=${committedText.length} cursor=$newCursorPosition",
            )

            if (shouldDeleteExternalRegionOnEmptyCommit(committedText)) {
                Log.w(
                    TAG,
                    "deleteExternalRegionOnEmptyCommit text=" +
                        externalRegionText.previewForLog(),
                )
                deleteRemainingExternalReplayText()
                clearExternalRegion()
                return true
            }

            if (isDroppingExternalReplay) {
                if (committedText.isEmpty() || committedText == externalRegionText) {
                    Log.w(
                        TAG,
                        "dropExternalReplayCommit text=${committedText.previewForLog()}",
                    )
                    if (committedText.isEmpty()) {
                        deleteRemainingExternalReplayText()
                    }
                    return true
                }
                clearExternalRegion()
            }

            if (isComposingTextActive && committedText.isNotEmpty()) {
                if (isWordBoundaryCommit(committedText)) {
                    resetComposingText()
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
            Log.i(TAG, "finishComposingText")
            resetComposingText()
            clearExternalRegion()
            return super.finishComposingText()
        }

        override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean {
            consumeClearRequest()
            Log.i(TAG, "deleteSurroundingText before=$beforeLength after=$afterLength")
            recordDeleteIntent(beforeLength, afterLength)
            if (shouldDropNativeDeleteAfterSyntheticExternalDelete(beforeLength, afterLength)) {
                Log.w(
                    TAG,
                    "dropNativeDeleteAfterSyntheticExternalDelete before=$beforeLength " +
                        "after=$afterLength",
                )
                clearExternalRegion()
                return true
            }
            clearExternalRegion()
            if (isComposingTextActive && beforeLength > 0) {
                composingText = composingText.dropLast(beforeLength.coerceAtMost(composingText.length))
                if (composingText.isEmpty()) {
                    resetComposingText()
                }
            }
            return super.deleteSurroundingText(beforeLength, afterLength)
        }

        override fun deleteSurroundingTextInCodePoints(
            beforeLength: Int,
            afterLength: Int,
        ): Boolean {
            consumeClearRequest()
            Log.i(TAG, "deleteSurroundingTextInCodePoints before=$beforeLength after=$afterLength")
            recordDeleteIntent(beforeLength, afterLength)
            if (shouldDropNativeDeleteAfterSyntheticExternalDelete(beforeLength, afterLength)) {
                Log.w(
                    TAG,
                    "dropNativeDeleteInCodePointsAfterSyntheticExternalDelete " +
                        "before=$beforeLength after=$afterLength",
                )
                clearExternalRegion()
                return true
            }
            clearExternalRegion()
            if (isComposingTextActive && beforeLength > 0) {
                composingText = composingText.dropLast(beforeLength.coerceAtMost(composingText.length))
                if (composingText.isEmpty()) {
                    resetComposingText()
                }
            }
            return super.deleteSurroundingTextInCodePoints(beforeLength, afterLength)
        }

        override fun setSelection(start: Int, end: Int): Boolean {
            consumeClearRequest()
            Log.i(TAG, "setSelection start=$start end=$end")
            clearExternalRegion()
            resetComposingText()
            return super.setSelection(start, end)
        }

        override fun performEditorAction(editorAction: Int): Boolean {
            consumeClearRequest()
            Log.i(TAG, "performEditorAction action=$editorAction")
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
            Log.i(
                TAG,
                "sendKeyEvent action=${event.action} keyCode=${event.keyCode} " +
                    "unicode=${event.unicodeChar} repeat=${event.repeatCount}",
            )
            if (event.keyCode == KeyEvent.KEYCODE_DEL) {
                if (event.action == KeyEvent.ACTION_DOWN) {
                    if (shouldUseLegacyNativeDelete()) {
                        val selectionBeforeDelete = getSelectionSnapshot()
                        Log.w(TAG, "applyLegacyNativeDeleteForKeyEvent forward=false")
                        recordDeleteIntent()
                        resetComposingText()
                        clearExternalRegion()
                        if (shouldSuppressRepeatedLegacyKeymapBackspace(selectionBeforeDelete)) {
                            Log.w(
                                TAG,
                                "suppressRepeatedLegacyKeymapBackspace " +
                                    "selection=${selectionBeforeDelete.previewForLog()}",
                            )
                            isConsumingDeleteKeyEvent = true
                            return true
                        }
                        if (shouldRouteLegacyBackspaceToEditorInput()) {
                            dispatchDeleteBackward()
                            isConsumingDeleteKeyEvent = true
                            return true
                        }
                        applyNativeDelete(forward = false)
                        isConsumingDeleteKeyEvent = true
                        return true
                    }

                    Log.i(TAG, "dispatchDeleteKeyEventToEditorInput")
                    recordDeleteIntent()
                    resetComposingText()
                    clearExternalRegion()
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
                if (event.action == KeyEvent.ACTION_DOWN) {
                    if (shouldUseLegacyNativeDelete()) {
                        Log.w(TAG, "applyLegacyNativeDeleteForKeyEvent forward=true")
                        recordDeleteIntent()
                        resetComposingText()
                        clearExternalRegion()
                        applyNativeDelete(forward = true)
                        isConsumingDeleteKeyEvent = true
                        return true
                    }

                    Log.i(TAG, "dispatchForwardDeleteKeyEventToEditorInput")
                    recordDeleteIntent()
                    resetComposingText()
                    clearExternalRegion()
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

            Log.i(
                TAG,
                "applyComposingText previous=${previousText.previewForLog()} " +
                    "next=${nextText.previewForLog()} delete=$deleteCount " +
                    "insert=${insertText.previewForLog()}",
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

            val isRestoringExistingRegion =
                externalRegionText == text ||
                    externalRegionText.startsWith(text)
            val isLikelyPassiveReplay = text.length > 1 || externalRegionText.length > 1

            return isRestoringExistingRegion && isLikelyPassiveReplay
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
            Log.i(
                TAG,
                "adoptExternalRegionAsComposingText regionText=" +
                    "${externalRegionText.previewForLog()} next=${nextText.previewForLog()}",
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

        private fun applyNativeDelete(forward: Boolean) {
            if (forward) {
                super.deleteSurroundingText(0, 1)
            } else {
                super.deleteSurroundingText(1, 0)
            }
            syntheticExternalDeleteAtMs = SystemClock.uptimeMillis()
        }

        private fun shouldRouteLegacyBackspaceToEditorInput(): Boolean {
            val beforeCursor = getTextBeforeCursor(2, 0)?.toString()
            val shouldRoute =
                beforeCursor == "" ||
                    beforeCursor?.endsWith("\n") == true ||
                    beforeCursor?.endsWith("\r") == true
            if (shouldRoute) {
                Log.i(TAG, "routeLegacyBackspaceToEditorInput before=${beforeCursor.previewForLog()}")
            } else {
                Log.i(TAG, "skipLegacyBackspaceEditorInput before=${beforeCursor.previewForLog()}")
            }
            return shouldRoute
        }

        private fun shouldSuppressRepeatedLegacyKeymapBackspace(
            selection: SelectionSnapshot?,
        ): Boolean {
            if (selection?.start != 0 || selection.end != 0) return false

            return SystemClock.uptimeMillis() - lastLegacyKeymapBackspaceAtMs <=
                LEGACY_KEYMAP_BACKSPACE_SUPPRESS_WINDOW_MS
        }

        private fun dispatchLegacyAndroidKeyDown(key: String, keyCode: Int) {
            Log.i(TAG, "dispatchLegacyAndroidKeyDown key=$key keyCode=$keyCode")
            dispatchKeyDown(key, keyCode)
        }

        private fun shouldUseLegacyNativeDelete(): Boolean {
            return Build.VERSION.SDK_INT <= Build.VERSION_CODES.Q
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
                Log.w(
                    TAG,
                    "deleteForShrinkingExternalReplay before=$deleteCount " +
                        "from=$lastExternalReplayTextLength to=$nextTextLength",
                )
                recordDeleteIntent()
                super.deleteSurroundingText(deleteCount, 0)
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

            Log.w(
                TAG,
                "deleteRemainingExternalReplayText before=$lastExternalReplayTextLength",
            )
            recordDeleteIntent()
            super.deleteSurroundingText(lastExternalReplayTextLength, 0)
            syntheticExternalDeleteAtMs = SystemClock.uptimeMillis()
            lastExternalReplayTextLength = 0
            lastExternalReplayTextAtMs = now
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

            val now = SystemClock.uptimeMillis()
            return now - externalRegionAtMs <= EXTERNAL_REPLAY_DELETE_WINDOW_MS &&
                now - state.lastDeleteIntentAtMs <= EXTERNAL_REPLAY_DELETE_WINDOW_MS
        }

        private fun recordDeleteIntent(beforeLength: Int, afterLength: Int) {
            if (beforeLength <= 0 || afterLength != 0) return
            recordDeleteIntent()
        }

        private fun recordDeleteIntent() {
            state.lastDeleteIntentAtMs = SystemClock.uptimeMillis()
        }

        private fun consumeClearRequest(skipNativeFinish: Boolean = false) {
            val clearRequestedAtMs = state.clearRequestedAtMs
            if (
                clearRequestedAtMs == 0L ||
                    clearRequestedAtMs == handledClearRequestedAtMs
            ) {
                return
            }

            handledClearRequestedAtMs = clearRequestedAtMs
            Log.i(TAG, "clearNativeComposingStateFromWeb")
            resetComposingText()
            clearExternalRegion()
            if (skipNativeFinish || shouldUseLegacyNativeDelete()) {
                Log.i(
                    TAG,
                    "skipFinishComposingText clearForDelete=$skipNativeFinish " +
                        "legacy=${shouldUseLegacyNativeDelete()}",
                )
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

        private fun getSelectionSnapshot(): SelectionSnapshot? {
            val extractedText = getExtractedTextSafely() ?: return getLastKnownSelectionSnapshot()
            val textLength = extractedText.startOffset + (extractedText.text?.length ?: return null)
            val start = extractedText.selectionStart + extractedText.startOffset
            val end = extractedText.selectionEnd + extractedText.startOffset
            if (start < 0 || end < 0) return getLastKnownSelectionSnapshot()

            state.updateSelection(start, end)

            return SelectionSnapshot(start, end, textLength)
        }

        private fun getExtractedTextSafely() = try {
            getExtractedText(ExtractedTextRequest(), 0)
        } catch (error: Throwable) {
            Log.w(TAG, "getExtractedTextFailed error=${error.javaClass.simpleName}")
            null
        }

        private fun getLastKnownSelectionSnapshot(): SelectionSnapshot? {
            val start = state.lastSelectionStart
            val end = state.lastSelectionEnd
            if (start < 0 || end < 0) return null

            return SelectionSnapshot(start, end, null)
        }

        private fun isWordBoundaryCommit(text: String): Boolean {
            return text == " " || text == "\n"
        }

        private fun commonPrefixLength(left: String, right: String): Int {
            val maxLength = minOf(left.length, right.length)
            for (index in 0 until maxLength) {
                if (left[index] != right[index]) return index
            }
            return maxLength
        }
    }

    companion object {
        private const val TAG = "AffineIME"
        private const val DELETE_RESTART_INPUT_DELAY_MS = 180L
        private const val EXTERNAL_REGION_REPLAY_WINDOW_MS = 2_500L
        private const val EXTERNAL_REPLAY_DELETE_WINDOW_MS = 3_000L
        private const val LEGACY_KEYMAP_BACKSPACE_SUPPRESS_WINDOW_MS = 400L
        private const val SYNTHETIC_EXTERNAL_DELETE_SUPPRESS_WINDOW_MS = 120L
        private const val MIN_REPLACEMENT_COMMON_PREFIX_LENGTH = 2
    }
}

private data class SelectionSnapshot(
    val start: Int,
    val end: Int,
    val textLength: Int?,
)

private fun SelectionSnapshot?.previewForLog(): String {
    if (this == null) return "null"
    return "$start,$end/$textLength"
}

private fun Int.toFlags(): String = "0x${toString(16)}"

private fun CharSequence?.previewForLog(): String {
    if (this == null) return "null"
    return toString()
        .replace('\n', ' ')
        .replace('\r', ' ')
        .take(32)
}
