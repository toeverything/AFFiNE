package app.affine.pro

import android.os.SystemClock

internal const val IME_REPLAY_DELETE_WINDOW_MS = 500L

internal class ImeReplayController(
    private val deleteBefore: (Int) -> Unit,
    private val recordDeleteIntent: () -> Unit,
    private val hasRecentDeleteIntent: (Long) -> Boolean,
    private val now: () -> Long = SystemClock::uptimeMillis,
) {
    private var externalRegionText = ""
    private var externalRegionAtMs = 0L
    private var isDroppingExternalReplay = false
    private var lastExternalReplayTextLength = -1
    private var lastExternalReplayTextAtMs = 0L
    private var lastExternalReplayDeletedLength = 0
    private var syntheticExternalDeleteAtMs = 0L

    val currentExternalRegionText: String
        get() = externalRegionText

    val isDroppingReplay: Boolean
        get() = isDroppingExternalReplay

    fun updateComposingRegion(
        regionText: String,
        composingText: String,
        isComposingTextActive: Boolean,
    ): String? {
        if (!isComposingTextActive) {
            externalRegionText = regionText
            externalRegionAtMs = now()
            isDroppingExternalReplay = false
            lastExternalReplayTextLength = regionText.length
            lastExternalReplayTextAtMs = externalRegionAtMs
            lastExternalReplayDeletedLength = 0
            return null
        }

        if (regionText == composingText) return null

        clearExternalRegion()
        return regionText
    }

    fun shouldAdoptExternalRegionForReplacement(nextText: String): Boolean {
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

    fun shouldDropExternalReplay(nextText: String): Boolean {
        if (nextText.isEmpty()) return false
        if (isDroppingExternalReplay) {
            return !shouldAdoptExternalRegionForReplacement(nextText)
        }
        if (externalRegionText.isEmpty()) return false

        val currentTime = now()
        if (
            currentTime - externalRegionAtMs > EXTERNAL_REGION_REPLAY_WINDOW_MS &&
                !shouldAdoptExternalRegionForReplacement(nextText)
        ) {
            clearExternalRegion()
            return false
        }

        val isSameRegionReplay =
            externalRegionText == nextText && hasRecentDeleteIntent(currentTime)
        val isDeleteShrinkReplay =
            externalRegionText.startsWith(nextText) && hasRecentDeleteIntent(currentTime)
        val isLikelyPassiveReplay = nextText.length > 1 || externalRegionText.length > 1

        return (isSameRegionReplay || isDeleteShrinkReplay) && isLikelyPassiveReplay
    }

    fun markDroppingReplay() {
        isDroppingExternalReplay = true
    }

    fun clearDroppingReplay() {
        isDroppingExternalReplay = false
    }

    fun adoptExternalRegionAsComposingTextIfNeeded(nextText: String): String? {
        if (externalRegionText.isEmpty()) return null

        val currentTime = now()
        if (
            currentTime - externalRegionAtMs > EXTERNAL_REGION_REPLAY_WINDOW_MS &&
                !shouldAdoptExternalRegionForReplacement(nextText)
        ) {
            return null
        }

        return externalRegionText
    }

    fun clearExternalRegion() {
        externalRegionText = ""
        externalRegionAtMs = 0L
        isDroppingExternalReplay = false
        lastExternalReplayTextLength = -1
        lastExternalReplayTextAtMs = 0L
        lastExternalReplayDeletedLength = 0
    }

    fun deleteForShrinkingExternalReplay(nextTextLength: Int) {
        val currentTime = now()
        val deleteCount =
            if (
                lastExternalReplayTextLength > 0 &&
                    nextTextLength < lastExternalReplayTextLength &&
                    currentTime - lastExternalReplayTextAtMs <= IME_REPLAY_DELETE_WINDOW_MS
            ) {
                lastExternalReplayTextLength - nextTextLength
            } else {
                0
        }

        if (deleteCount > 0) {
            recordDeleteIntent()
            deleteBefore(deleteCount)
            lastExternalReplayDeletedLength += deleteCount
            syntheticExternalDeleteAtMs = now()
        }

        lastExternalReplayTextLength = nextTextLength
        lastExternalReplayTextAtMs = currentTime
    }

    fun deleteRemainingExternalReplayText() {
        val currentTime = now()
        if (
            lastExternalReplayTextLength <= 0 ||
                currentTime - lastExternalReplayTextAtMs > IME_REPLAY_DELETE_WINDOW_MS
        ) {
            return
        }

        recordDeleteIntent()
        deleteBefore(lastExternalReplayTextLength)
        syntheticExternalDeleteAtMs = now()
        lastExternalReplayTextLength = 0
        lastExternalReplayTextAtMs = currentTime
    }

    fun deleteRemainingExternalReplayTextAfterShrink() {
        if (lastExternalReplayDeletedLength <= 0) return
        deleteRemainingExternalReplayText()
    }

    fun shouldDropNativeDeleteAfterSyntheticExternalDelete(
        beforeLength: Int,
        afterLength: Int,
    ): Boolean {
        val currentTime = now()
        return beforeLength > 0 &&
            afterLength == 0 &&
            currentTime - syntheticExternalDeleteAtMs <=
                SYNTHETIC_EXTERNAL_DELETE_SUPPRESS_WINDOW_MS
    }

    fun shouldDeleteExternalRegionOnEmptyCommit(
        committedText: String,
        isComposingTextActive: Boolean,
    ): Boolean {
        if (committedText.isNotEmpty()) return false
        if (isComposingTextActive || externalRegionText.isEmpty()) return false
        if (lastExternalReplayTextLength <= 0) return false
        if (lastExternalReplayDeletedLength <= 0) return false

        val currentTime = now()
        return currentTime - externalRegionAtMs <= IME_REPLAY_DELETE_WINDOW_MS &&
            hasRecentDeleteIntent(currentTime)
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

    private companion object {
        const val EXTERNAL_REGION_REPLAY_WINDOW_MS = 500L
        const val SYNTHETIC_EXTERNAL_DELETE_SUPPRESS_WINDOW_MS = 120L
        const val MIN_REPLACEMENT_COMMON_PREFIX_LENGTH = 2
    }
}
