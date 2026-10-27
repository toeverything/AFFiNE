package app.affine.pro

import android.view.KeyEvent
import android.view.inputmethod.ExtractedTextRequest
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputConnectionWrapper

internal class AffineInputConnection(
    target: InputConnection,
    private val state: AndroidImeState,
    private val dispatchDeleteBackward: () -> Unit,
    private val dispatchDeleteForward: () -> Unit,
) : InputConnectionWrapper(target, true) {
    private var handledClearRequestGeneration = state.clearRequestGeneration
    private var composingText = ""
    private var isComposingTextActive = false
    private var isConsumingDeleteKeyEvent = false

    private val replay = ImeReplayController(
        deleteBefore = { length -> super.deleteSurroundingText(length, 0) },
        recordDeleteIntent = { recordDeleteIntent() },
        hasRecentDeleteIntent = { currentTime -> hasRecentDeleteIntent(currentTime) },
    )

    override fun setComposingRegion(start: Int, end: Int): Boolean {
        consumeClearRequest()
        val regionText = getTextForRegion(start, end)

        val nextComposingText = replay.updateComposingRegion(
            regionText,
            composingText,
            isComposingTextActive,
        )
        if (nextComposingText != null) {
            composingText = nextComposingText
            isComposingTextActive = nextComposingText.isNotEmpty()
        }

        // Keep the native composing region untouched so IME autocorrect replay stays in the
        // explicit replay state machine instead of being applied twice by the platform.
        return true
    }

    override fun setComposingText(text: CharSequence?, newCursorPosition: Int): Boolean {
        consumeClearRequest()
        val nextText = text?.toString() ?: ""

        if (replay.shouldAdoptExternalRegionForReplacement(nextText)) {
            replay.clearDroppingReplay()
        }

        if (replay.shouldDropExternalReplay(nextText)) {
            replay.markDroppingReplay()
            replay.deleteForShrinkingExternalReplay(nextText.length)
            return true
        }

        val adoptedText = replay.adoptExternalRegionAsComposingTextIfNeeded(nextText)
        if (adoptedText != null) {
            composingText = adoptedText
            isComposingTextActive = adoptedText.isNotEmpty()
        }
        replay.clearExternalRegion()
        return applyComposingText(nextText)
    }

    override fun commitText(text: CharSequence?, newCursorPosition: Int): Boolean {
        consumeClearRequest()
        val committedText = text?.toString() ?: ""

        if (
            replay.shouldDeleteExternalRegionOnEmptyCommit(
                committedText,
                isComposingTextActive,
            )
        ) {
            replay.deleteRemainingExternalReplayText()
            replay.clearExternalRegion()
            return true
        }

        if (replay.isDroppingReplay) {
            if (
                committedText.isEmpty() ||
                    committedText == replay.currentExternalRegionText
            ) {
                if (committedText.isEmpty()) {
                    replay.deleteRemainingExternalReplayTextAfterShrink()
                }
                return true
            }
            replay.clearExternalRegion()
        }

        if (isComposingTextActive && committedText.isNotEmpty()) {
            if (isWordBoundaryCommit(committedText)) {
                resetComposingText()
                replay.clearExternalRegion()
                return super.commitText(text, newCursorPosition)
            }

            val result = applyComposingText(committedText)
            resetComposingText()
            return result
        }

        if (committedText.isNotEmpty()) {
            replay.clearExternalRegion()
        }

        return super.commitText(text, newCursorPosition)
    }

    override fun finishComposingText(): Boolean {
        consumeClearRequest()
        resetComposingText()
        replay.clearExternalRegion()
        return super.finishComposingText()
    }

    override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean {
        consumeClearRequest()
        recordDeleteIntent(beforeLength, afterLength)
        if (replay.shouldDropNativeDeleteAfterSyntheticExternalDelete(beforeLength, afterLength)) {
            replay.clearExternalRegion()
            return true
        }
        replay.clearExternalRegion()
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
        recordDeleteIntent(beforeLength, afterLength)
        if (replay.shouldDropNativeDeleteAfterSyntheticExternalDelete(beforeLength, afterLength)) {
            replay.clearExternalRegion()
            return true
        }
        replay.clearExternalRegion()
        if (isComposingTextActive && beforeLength > 0) {
            trimComposingTail(beforeLength, codePoints = true)
        }
        return super.deleteSurroundingTextInCodePoints(beforeLength, afterLength)
    }

    override fun setSelection(start: Int, end: Int): Boolean {
        consumeClearRequest()
        replay.clearExternalRegion()
        resetComposingText()
        return super.setSelection(start, end)
    }

    override fun performEditorAction(editorAction: Int): Boolean {
        consumeClearRequest()
        resetComposingText()
        replay.clearExternalRegion()
        return super.performEditorAction(editorAction)
    }

    override fun sendKeyEvent(event: KeyEvent): Boolean {
        val isDeleteActionDown =
            event.action == KeyEvent.ACTION_DOWN &&
                (event.keyCode == KeyEvent.KEYCODE_DEL ||
                    event.keyCode == KeyEvent.KEYCODE_FORWARD_DEL)
        consumeClearRequest(skipNativeFinish = isDeleteActionDown)

        if (event.keyCode == KeyEvent.KEYCODE_DEL) {
            if (!state.editorFocused && !isConsumingDeleteKeyEvent) {
                return super.sendKeyEvent(event)
            }
            if (event.action == KeyEvent.ACTION_DOWN) {
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
            replay.clearExternalRegion()
        }
        return super.sendKeyEvent(event)
    }

    private fun applyComposingText(nextText: String): Boolean {
        val previousText = composingText
        val prefixLength = commonPrefixLength(previousText, nextText)
        val deleteCount = previousText.length - prefixLength
        val insertText = nextText.substring(prefixLength)

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

    private fun resetComposingText() {
        composingText = ""
        isComposingTextActive = false
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
        resetComposingText()
        replay.clearExternalRegion()
        if (skipNativeFinish) {
            return
        }
        super.finishComposingText()
    }

    private fun getTextForRegion(start: Int, end: Int): String {
        if (start < 0 || end <= start) return ""

        val extractedText =
            try {
                getExtractedText(ExtractedTextRequest(), 0)
            } catch (_: Exception) {
                null
            } ?: return ""
        val text = extractedText.text?.toString().orEmpty()
        val localStart = start - extractedText.startOffset
        val localEnd = end - extractedText.startOffset
        if (localStart < 0 || localEnd > text.length) return ""

        return text.substring(localStart, localEnd)
    }

    private fun recordDeleteIntent(beforeLength: Int, afterLength: Int) {
        if (beforeLength <= 0 || afterLength != 0) return
        recordDeleteIntent()
    }

    private fun recordDeleteIntent() {
        state.lastDeleteIntentAtMs = android.os.SystemClock.uptimeMillis()
    }

    private fun hasRecentDeleteIntent(currentTime: Long): Boolean {
        return currentTime - state.lastDeleteIntentAtMs <= IME_REPLAY_DELETE_WINDOW_MS
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
