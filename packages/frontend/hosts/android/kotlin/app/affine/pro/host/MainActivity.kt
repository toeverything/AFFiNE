package app.affine.pro.host

import android.annotation.TargetApi
import android.app.Activity
import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.pdf.PdfRenderer
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.ParcelFileDescriptor
import android.text.InputType
import android.text.Layout
import android.text.StaticLayout
import android.text.TextDirectionHeuristics
import android.text.TextPaint
import java.text.BreakIterator
import android.util.SparseArray
import android.view.Choreographer
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.View
import android.view.ViewStructure
import android.view.WindowInsets
import android.view.WindowInsetsAnimation
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.view.inputmethod.CompletionInfo
import android.view.inputmethod.CorrectionInfo
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.ExtractedText
import android.view.inputmethod.ExtractedTextRequest
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputContentInfo
import android.view.inputmethod.TextAttribute
import android.widget.FrameLayout
import android.window.BackEvent
import android.window.OnBackAnimationCallback
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher

object NativeBridge {
  init {
    System.loadLibrary("affine_android_host")
  }

  external fun nativeShouldExposeAutofill(sdkInt: Int): Boolean
  external fun nativeCreateHost(): Long
  external fun nativeDestroyHost(handle: Long)
  external fun nativeSetHasBackDestination(handle: Long, hasDestination: Boolean)
  external fun nativeOnSurfaceCreated(handle: Long, surface: Surface)
  external fun nativeOnSurfaceChanged(handle: Long, format: Int, widthPx: Int, heightPx: Int)
  external fun nativeOnSurfaceDestroyed(handle: Long)
  external fun nativeRequestFrame(handle: Long)
  external fun nativeGetSurfaceGeneration(handle: Long): Long
  external fun nativeIsSurfaceReady(handle: Long): Boolean
  external fun nativeHasPendingFrame(handle: Long): Boolean
  external fun nativeGetFrameCount(handle: Long): Long
  external fun nativeGetRenderBackend(handle: Long): Int
  external fun nativeOnSurfaceInsetsPx(
    handle: Long,
    safeTopPx: Int,
    safeRightPx: Int,
    safeBottomPx: Int,
    safeLeftPx: Int,
    imeBottomPx: Int,
    density: Float,
  )
  external fun nativeOnFrameTick(handle: Long, frameTimeNanos: Long): Int
  external fun nativeOnBackGesturePhase(
    handle: Long,
    phaseCode: Int,
    progress: Float,
  ): Boolean
  external fun nativeOnCommitText(handle: Long, text: String, newCursorPosition: Int)
  external fun nativeOnSetComposingText(handle: Long, text: String, newCursorPosition: Int)
  external fun nativeOnSetComposingRegion(handle: Long, start: Int, end: Int)
  external fun nativeOnFinishComposingText(handle: Long)
  external fun nativeOnSetSelection(handle: Long, start: Int, end: Int)
  external fun nativeOnDeleteSurroundingText(handle: Long, beforeLen: Int, afterLen: Int)
  external fun nativeOnDeleteSurroundingTextInCodePoints(
    handle: Long,
    beforeLen: Int,
    afterLen: Int,
  ): Boolean
  external fun nativeOnReplaceText(
    handle: Long,
    start: Int,
    end: Int,
    text: String,
    newCursorPosition: Int,
  ): Boolean
  external fun nativeGetUtf16Length(handle: Long): Int
  external fun nativeGetUtf16Unit(handle: Long, index: Int): Int
  external fun nativeGetSelectionStart(handle: Long): Int
  external fun nativeGetSelectionEnd(handle: Long): Int
  external fun nativeGetComposingStart(handle: Long): Int
  external fun nativeGetComposingEnd(handle: Long): Int

  // Legacy localStorage upgrade import & rollback write-back (zero IndexedDB).
  external fun nativeIsAllowedLegacyLocalStorageKey(key: String): Boolean
  external fun nativeFilterLegacyLocalStorageProbe(rawJson: String): String?
  external fun nativeImportLegacyLocalStorageProbe(
    handle: Long,
    payloadJson: String,
    allowedKeysCsv: String,
  ): Boolean
  external fun nativeCanCreateDefaultWorkspace(handle: Long): Boolean
  external fun nativeGetAllowlistedWorkspaceIdsJson(handle: Long): String
  external fun nativeGetPreservedLocalWorkspaceRaw(handle: Long): String?
  external fun nativePlanLegacyLocalStorageWriteBack(handle: Long): String?
  external fun nativeVerifyLegacyWriteBack(
    expectedSetJson: String,
    expectedRemoveJson: String,
    readbackJson: String,
  ): Boolean

  // In-place SQLite WAL co-storage (allowlist-only, never scans disk *.db).
  external fun nativeConnectWorkspace(
    handle: Long,
    filesDir: String,
    peer: String,
    spaceId: String,
  ): String?
  external fun nativeOpenUserspace(
    handle: Long,
    filesDir: String,
    peer: String,
    userId: String,
  ): String?
  external fun nativeStoragePushUpdateB64(
    handle: Long,
    connectionKey: String,
    docId: String,
    updateB64: String,
    nowMs: Long,
  ): Long
  external fun nativeStorageGetDocB64(
    handle: Long,
    connectionKey: String,
    docId: String,
  ): String?
  external fun nativeStorageCheckpoint(handle: Long, connectionKey: String): Boolean
  external fun nativeStorageCheckpointAllPassive(handle: Long): Int
  external fun nativeStorageClose(handle: Long, connectionKey: String): Boolean

  // Jetpack Preferences DataStore (`auth-sessions`) & `v1:` AES-GCM auth contract.
  external fun nativeCanonicalEndpoint(endpoint: String): String
  external fun nativeAuthTokenKey(endpoint: String): String
  external fun nativeKeystoreAlias(endpoint: String): String
  external fun nativeDataStoreGetString(filesDir: String, key: String): String?
  external fun nativeDataStoreReadResult(filesDir: String, key: String): String
  external fun nativeDataStoreGetOrCreateString(
    filesDir: String,
    key: String,
    candidateValue: String,
  ): String
  external fun nativeDataStoreSetString(filesDir: String, key: String, value: String): Boolean
  external fun nativeDataStoreDeleteKey(filesDir: String, key: String): Boolean
  external fun nativeLegacyAppDataStoreDeleteKey(filesDir: String, key: String): Boolean
  external fun nativePrepareAuthSessionJson(responseJson: String, nowMs: Long): String?
  external fun nativeValidateAuthSessionJson(storedJson: String): Boolean
  external fun nativeValidateV1Ciphertext(encoded: String): Boolean
  external fun nativeIsPermanentAuthErrorCode(code: String): Boolean
  external fun nativeExtractJsonStringField(json: String, field: String): String?
  external fun nativeJsonStringArrayLen(json: String): Int
  external fun nativeJsonStringArrayGet(json: String, index: Int): String?

  // Native selection teardrop handles, magnifier loupe, and context action menu.
  external fun nativeSetSelectionViewport(
    handle: Long,
    width: Float,
    height: Float,
    density: Float,
  )
  external fun nativeUpdateSelectionOverlay(
    handle: Long,
    startX: Float,
    startY: Float,
    endX: Float,
    endY: Float,
    lineHeight: Float,
    directionCode: Int,
    hasSelection: Boolean,
  )
  external fun nativeApplyTextDragEndpoints(
    handle: Long,
    startX: Float,
    startY: Float,
    endX: Float,
    endY: Float,
    lineHeight: Float,
    directionCode: Int,
    activeHandleCode: Int,
  )
  external fun nativeSelectionBeginDrag(handle: Long, touchX: Float, touchY: Float): Int
  external fun nativeSelectionEndDrag(handle: Long): Boolean
  external fun nativeSelectionCancelDrag(handle: Long)
  external fun nativeClearSelectionOverlay(handle: Long)
  external fun nativeGetSelectionOverlayJson(handle: Long): String
  external fun nativeGetSelectionOverlayGeometry(handle: Long): FloatArray?
  external fun nativeFillSelectionOverlayGeometry(handle: Long, outBuffer: FloatArray): Boolean

  // Surface recreation state preservation, effective IME insets, and Vulkan -> GLES3 recovery.
  external fun nativeSetSurfaceScrollOffset(handle: Long, scrollX: Float, scrollY: Float)
  external fun nativeGetSurfaceScrollY(handle: Long): Float
  external fun nativeGetSurfaceDensity(handle: Long): Float
  external fun nativeGetTextureGeneration(handle: Long): Long
  external fun nativeGetEffectiveImeBottomDp(handle: Long): Float
  external fun nativeSelectRenderBackend(
    handle: Long,
    vulkanAvailable: Boolean,
    gles3Available: Boolean,
  ): Int
  external fun nativeReportVulkanDeviceLost(handle: Long): Int

  // API 26+ AutofillManager virtual view structure and value write-back.
  external fun nativeConfigureAutofillSdk(handle: Long, sdkInt: Int): Boolean
  external fun nativeUpsertAutofillField(
    handle: Long,
    autofillId: Int,
    kindCode: Int,
    left: Int,
    top: Int,
    right: Int,
    bottom: Int,
    masked: Boolean,
    valueLen: Int,
  ): Boolean
  external fun nativeFocusAutofillField(handle: Long, autofillId: Int): Int
  external fun nativeGetFocusedAutofillFieldId(handle: Long): Int
  external fun nativeSetAutofillFieldText(handle: Long, autofillId: Int, text: String): Boolean
  external fun nativeApplyAutofillValue(handle: Long, autofillId: Int, value: String): Boolean
  external fun nativeGetAutofillValue(handle: Long, autofillId: Int): String?
  external fun nativeGetAutofillValueByKind(handle: Long, kindCode: Int): String?
  external fun nativeCommitAutofill(handle: Long): Boolean
  external fun nativeCancelAutofill(handle: Long): Boolean
  external fun nativeClearAutofillFields(handle: Long)
  external fun nativeGetAutofillStructureJson(handle: Long): String

  // Predictive back API-level dispatch and destination navigation stack.
  external fun nativeBackDispatchMode(sdkInt: Int): Int
  external fun nativePushDestination(handle: Long, route: String): Boolean
  external fun nativeGetCurrentDestination(handle: Long): String?
  external fun nativeSetBackStackDepth(handle: Long, depth: Int)
  external fun nativeGetBackStackDepth(handle: Long): Int

  // Native PdfRenderer page validation, cache key, and ARGB_8888 -> RGBA8 conversion.
  external fun nativeValidatePdfPageRequest(
    pageIndex: Int,
    pageCount: Int,
    widthPx: Int,
    heightPx: Int,
  ): Boolean
  external fun nativePdfPageCacheKey(
    docId: String,
    pageIndex: Int,
    widthPx: Int,
    heightPx: Int,
    dpiBucket: Int,
  ): String
  external fun nativePdfConvertArgbToRgba(
    argbPixels: IntArray,
    widthPx: Int,
    heightPx: Int,
  ): ByteArray?
}

/**
 * Testable clipboard bridge wrapping Android `ClipboardManager` so `Copy`, `Cut`,
 * and `Paste` interact with the system clipboard without losing text on `Cut`.
 */
interface HostClipboard {
  fun setPlainText(label: String, text: String): Boolean
  fun getPlainText(): String?
  fun hasPlainText(): Boolean = !getPlainText().isNullOrEmpty()
}

class AndroidClipboardAdapter(
  private val manager: ClipboardManager?,
) : HostClipboard {
  override fun setPlainText(label: String, text: String): Boolean {
    val cm = manager ?: return false
    return try {
      cm.setPrimaryClip(ClipData.newPlainText(label, text))
      true
    } catch (_: Throwable) {
      false
    }
  }

  override fun getPlainText(): String? {
    val cm = manager ?: return null
    return try {
      val clip = cm.primaryClip ?: return null
      if (clip.itemCount <= 0) return null
      clip.getItemAt(0)?.text?.toString()
    } catch (_: Throwable) {
      null
    }
  }

  override fun hasPlainText(): Boolean {
    val cm = manager ?: return false
    return try {
      if (!cm.hasPrimaryClip()) return false
      val desc = cm.primaryClipDescription ?: return false
      desc.hasMimeType(ClipDescription.MIMETYPE_TEXT_PLAIN) ||
        desc.hasMimeType(ClipDescription.MIMETYPE_TEXT_HTML)
    } catch (_: Throwable) {
      false
    }
  }
}

/**
 * Pure Kotlin IME controller backed directly by `AndroidHostState` over JNI as
 * the single source of truth for text, selection, and composing spans.
 */
class AffineImeController(
  private val handleProvider: () -> Long,
  private val onMutated: () -> Unit,
  private val onTextEdited: (String) -> Unit,
) {
  constructor(handleProvider: () -> Long) : this(handleProvider, {}, {})
  constructor(handleProvider: () -> Long, onMutated: () -> Unit) : this(handleProvider, onMutated, {})

  fun currentText(): String = readText()

  fun commitText(text: String, newCursorPosition: Int): Boolean {
    val handle = handleProvider()
    if (handle == 0L) return false
    NativeBridge.nativeOnCommitText(handle, text, newCursorPosition)
    onMutated()
    onTextEdited(currentText())
    return true
  }

  fun setComposingText(text: String, newCursorPosition: Int): Boolean {
    val handle = handleProvider()
    if (handle == 0L) return false
    NativeBridge.nativeOnSetComposingText(handle, text, newCursorPosition)
    onMutated()
    onTextEdited(currentText())
    return true
  }

  fun setComposingRegion(start: Int, end: Int): Boolean {
    val handle = handleProvider()
    if (handle == 0L) return false
    NativeBridge.nativeOnSetComposingRegion(handle, start, end)
    onMutated()
    return true
  }

  fun finishComposingText(): Boolean {
    val handle = handleProvider()
    if (handle == 0L) return false
    NativeBridge.nativeOnFinishComposingText(handle)
    onMutated()
    onTextEdited(currentText())
    return true
  }

  fun setSelection(start: Int, end: Int): Boolean {
    val handle = handleProvider()
    if (handle == 0L) return false
    NativeBridge.nativeOnSetSelection(handle, start, end)
    onMutated()
    return true
  }

  fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean {
    val handle = handleProvider()
    if (handle == 0L || beforeLength < 0 || afterLength < 0) return false
    NativeBridge.nativeOnDeleteSurroundingText(handle, beforeLength, afterLength)
    onMutated()
    onTextEdited(currentText())
    return true
  }

  fun deleteSurroundingTextInCodePoints(beforeLength: Int, afterLength: Int): Boolean {
    val handle = handleProvider()
    if (handle == 0L || beforeLength < 0 || afterLength < 0) return false
    val ok = NativeBridge.nativeOnDeleteSurroundingTextInCodePoints(handle, beforeLength, afterLength)
    if (ok) {
      onMutated()
      onTextEdited(currentText())
    }
    return ok
  }

  fun replaceText(start: Int, end: Int, text: String, newCursorPosition: Int): Boolean {
    val handle = handleProvider()
    if (handle == 0L || start < 0 || end < 0) return false
    val ok = NativeBridge.nativeOnReplaceText(handle, start, end, text, newCursorPosition)
    if (ok) {
      onMutated()
      onTextEdited(currentText())
    }
    return ok
  }

  fun readText(): String {
    val handle = handleProvider()
    if (handle == 0L) return ""
    val len = NativeBridge.nativeGetUtf16Length(handle)
    if (len <= 0) return ""
    val chars = CharArray(len) { idx -> NativeBridge.nativeGetUtf16Unit(handle, idx).toChar() }
    return String(chars)
  }

  fun selectionStart(): Int {
    val handle = handleProvider()
    return if (handle == 0L) 0 else NativeBridge.nativeGetSelectionStart(handle)
  }

  fun selectionEnd(): Int {
    val handle = handleProvider()
    return if (handle == 0L) 0 else NativeBridge.nativeGetSelectionEnd(handle)
  }

  fun composingStart(): Int {
    val handle = handleProvider()
    return if (handle == 0L) -1 else NativeBridge.nativeGetComposingStart(handle)
  }

  fun composingEnd(): Int {
    val handle = handleProvider()
    return if (handle == 0L) -1 else NativeBridge.nativeGetComposingEnd(handle)
  }

  fun getTextBeforeCursor(length: Int): String {
    if (length <= 0) return ""
    val text = readText()
    val selStart = selectionStart().coerceIn(0, text.length)
    val take = length.coerceAtMost(selStart)
    return text.substring(selStart - take, selStart)
  }

  fun getTextAfterCursor(length: Int): String {
    if (length <= 0) return ""
    val text = readText()
    val selEnd = selectionEnd().coerceIn(0, text.length)
    val take = length.coerceAtMost(text.length - selEnd)
    return text.substring(selEnd, selEnd + take)
  }

  fun getSelectedText(): String? {
    val text = readText()
    val selStart = selectionStart().coerceIn(0, text.length)
    val selEnd = selectionEnd().coerceIn(selStart, text.length)
    return if (selStart == selEnd) null else text.substring(selStart, selEnd)
  }
}

/**
 * Direct `InputConnection` implementation backed solely by `AffineImeController`
 * and Rust `AndroidHostState` with zero Kotlin `Editable` mirror buffer.
 */
class AffineInputConnection(
  private val ime: AffineImeController,
  private val onContextMenuAction: (Int) -> Boolean = { false },
) : InputConnection {
  private var batchEditDepth: Int = 0

  override fun getTextBeforeCursor(n: Int, flags: Int): CharSequence = ime.getTextBeforeCursor(n)

  override fun getTextAfterCursor(n: Int, flags: Int): CharSequence = ime.getTextAfterCursor(n)

  override fun getSelectedText(flags: Int): CharSequence? = ime.getSelectedText()

  override fun getCursorCapsMode(reqModes: Int): Int = 0

  override fun getExtractedText(request: ExtractedTextRequest?, flags: Int): ExtractedText? = null

  override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean =
    ime.deleteSurroundingText(beforeLength, afterLength)

  override fun deleteSurroundingTextInCodePoints(beforeLength: Int, afterLength: Int): Boolean =
    ime.deleteSurroundingTextInCodePoints(beforeLength, afterLength)

  override fun setComposingText(text: CharSequence?, newCursorPosition: Int): Boolean =
    ime.setComposingText(text?.toString() ?: "", newCursorPosition)

  override fun setComposingText(
    text: CharSequence,
    newCursorPosition: Int,
    textAttribute: TextAttribute?,
  ): Boolean = ime.setComposingText(text.toString(), newCursorPosition)

  override fun setComposingRegion(start: Int, end: Int): Boolean =
    ime.setComposingRegion(start, end)

  override fun setComposingRegion(start: Int, end: Int, textAttribute: TextAttribute?): Boolean =
    ime.setComposingRegion(start, end)

  override fun finishComposingText(): Boolean = ime.finishComposingText()

  override fun commitText(text: CharSequence?, newCursorPosition: Int): Boolean =
    ime.commitText(text?.toString() ?: "", newCursorPosition)

  override fun commitText(
    text: CharSequence,
    newCursorPosition: Int,
    textAttribute: TextAttribute?,
  ): Boolean = ime.commitText(text.toString(), newCursorPosition)

  override fun replaceText(
    start: Int,
    end: Int,
    text: CharSequence,
    newCursorPosition: Int,
    textAttribute: TextAttribute?,
  ): Boolean = ime.replaceText(start, end, text.toString(), newCursorPosition)

  override fun setSelection(start: Int, end: Int): Boolean = ime.setSelection(start, end)

  override fun beginBatchEdit(): Boolean {
    batchEditDepth += 1
    return true
  }

  override fun endBatchEdit(): Boolean {
    if (batchEditDepth > 0) {
      batchEditDepth -= 1
    }
    return batchEditDepth > 0
  }

  override fun closeConnection() {
    finishComposingText()
    batchEditDepth = 0
  }

  override fun getHandler(): Handler? = null

  override fun commitCompletion(text: CompletionInfo?): Boolean = false

  override fun commitCorrection(correctionInfo: CorrectionInfo?): Boolean = false

  override fun commitContent(
    inputContentInfo: InputContentInfo,
    flags: Int,
    opts: Bundle?,
  ): Boolean = false

  override fun performEditorAction(editorAction: Int): Boolean = false

  override fun performContextMenuAction(id: Int): Boolean = when (id) {
    android.R.id.copy,
    android.R.id.cut,
    android.R.id.paste,
    android.R.id.selectAll -> onContextMenuAction(id)
    else -> false
  }

  override fun performPrivateCommand(action: String?, data: Bundle?): Boolean = false

  override fun sendKeyEvent(event: KeyEvent?): Boolean = false

  override fun clearMetaKeyStates(states: Int): Boolean = false

  override fun reportFullscreenMode(enabled: Boolean): Boolean = false

  override fun requestCursorUpdates(cursorUpdateMode: Int): Boolean = false
}

/**
 * Selection teardrop handle and magnifier coordinator backed by Rust
 * `SelectionOverlayState` without touching `SurfaceHolder.lockCanvas`.
 */
class AndroidSelectionCoordinator(
  private val handleProvider: () -> Long,
  private val onMutated: () -> Unit = {},
) {
  fun setViewport(width: Float, height: Float, density: Float) {
    val handle = handleProvider()
    if (handle == 0L) return
    NativeBridge.nativeSetSelectionViewport(handle, width, height, density)
    onMutated()
  }

  fun updateSelection(
    startX: Float,
    startY: Float,
    endX: Float,
    endY: Float,
    lineHeight: Float,
    rtl: Boolean = false,
    hasSelection: Boolean = true,
  ) {
    val handle = handleProvider()
    if (handle == 0L) return
    NativeBridge.nativeUpdateSelectionOverlay(
      handle,
      startX,
      startY,
      endX,
      endY,
      lineHeight,
      if (rtl) 1 else 0,
      hasSelection,
    )
    onMutated()
  }

  fun applyTextDragEndpoints(
    startX: Float,
    startY: Float,
    endX: Float,
    endY: Float,
    lineHeight: Float,
    rtl: Boolean = false,
    activeHandleCode: Int,
  ) {
    val handle = handleProvider()
    if (handle == 0L) return
    NativeBridge.nativeApplyTextDragEndpoints(
      handle,
      startX,
      startY,
      endX,
      endY,
      lineHeight,
      if (rtl) 1 else 0,
      activeHandleCode,
    )
    onMutated()
  }

  fun beginDrag(touchX: Float, touchY: Float): Int {
    val handle = handleProvider()
    if (handle == 0L) return 0
    val hit = NativeBridge.nativeSelectionBeginDrag(handle, touchX, touchY)
    if (hit != 0) onMutated()
    return hit
  }

  fun endDrag(): Boolean {
    val handle = handleProvider()
    if (handle == 0L) return false
    val hasMenu = NativeBridge.nativeSelectionEndDrag(handle)
    onMutated()
    return hasMenu
  }

  fun cancelDrag() {
    val handle = handleProvider()
    if (handle == 0L) return
    NativeBridge.nativeSelectionCancelDrag(handle)
    onMutated()
  }

  fun clear() {
    val handle = handleProvider()
    if (handle == 0L) return
    NativeBridge.nativeClearSelectionOverlay(handle)
    onMutated()
  }

  fun snapshotJson(): String {
    val handle = handleProvider()
    return if (handle == 0L) "{}" else NativeBridge.nativeGetSelectionOverlayJson(handle)
  }

  fun overlayGeometry(): FloatArray? {
    val handle = handleProvider()
    return if (handle == 0L) null else NativeBridge.nativeGetSelectionOverlayGeometry(handle)
  }

  fun fillOverlayGeometry(outBuffer: FloatArray): Boolean {
    val handle = handleProvider()
    if (handle == 0L || outBuffer.size < 24) return false
    return NativeBridge.nativeFillSelectionOverlayGeometry(handle, outBuffer)
  }

  fun performCopy(ime: AffineImeController, clipboard: HostClipboard): String? {
    val selected = ime.getSelectedText() ?: return null
    if (!clipboard.setPlainText("AFFiNE", selected)) {
      return null
    }
    return selected
  }

  fun performCut(ime: AffineImeController, clipboard: HostClipboard): String? {
    val selected = ime.getSelectedText() ?: return null
    // Always persist to the system clipboard BEFORE deleting text so Cut never loses content.
    if (!clipboard.setPlainText("AFFiNE", selected)) {
      return null
    }
    val start = ime.selectionStart()
    val end = ime.selectionEnd()
    if (start < end) {
      ime.replaceText(start, end, "", 1)
      onMutated()
    }
    return selected
  }

  fun performPaste(ime: AffineImeController, clipboard: HostClipboard): String? {
    val text = clipboard.getPlainText() ?: return null
    val start = ime.selectionStart()
    val end = ime.selectionEnd()
    if (!ime.replaceText(start, end, text, 1)) {
      return null
    }
    onMutated()
    return text
  }

  fun performSelectAll(ime: AffineImeController): Boolean {
    val len = ime.currentText().length
    if (len <= 0) return false
    val ok = ime.setSelection(0, len)
    if (ok) onMutated()
    return ok
  }

  fun handleContextMenuAction(
    id: Int,
    ime: AffineImeController,
    clipboard: HostClipboard,
  ): Boolean = when (id) {
    android.R.id.copy -> performCopy(ime, clipboard) != null
    android.R.id.cut -> performCut(ime, clipboard) != null
    android.R.id.paste -> performPaste(ime, clipboard) != null
    android.R.id.selectAll -> performSelectAll(ime)
    else -> false
  }
}

/**
 * Caret visual geometry in viewport pixels computed by Android `StaticLayout`.
 */
data class CaretBounds(
  val x: Float,
  val top: Float,
  val bottom: Float,
  val lineIndex: Int,
  val isRtlParagraph: Boolean,
) {
  val lineHeight: Float
    get() = (bottom - top).coerceAtLeast(1f)
  val midY: Float
    get() = (top + bottom) * 0.5f
}

/**
 * Single authoritative text layout contract implemented by Android `ShapedTextLayout`
 * (`StaticLayout`) on devices and deterministic proportional harnesses in JVM parity tests.
 */
interface TextLayoutAuthority {
  val cachedText: String
  fun ensureLayoutReady(text: String, viewportWidthPx: Int, density: Float): Boolean
  fun caretBounds(
    utf16Offset: Int,
    isSelectionEnd: Boolean = false,
    selStart: Int = utf16Offset,
    selEnd: Int = utf16Offset,
  ): CaretBounds?
  fun selectionEndCarets(selStart: Int, selEnd: Int): Pair<CaretBounds, CaretBounds>?
  fun fillSelectionEndCarets(selStart: Int, selEnd: Int, out: FloatArray): Boolean {
    val pair = selectionEndCarets(selStart, selEnd) ?: return false
    val (startCaret, endCaret) = pair
    out[0] = startCaret.x
    out[1] = startCaret.bottom
    out[2] = endCaret.x
    out[3] = endCaret.bottom
    out[4] = startCaret.lineHeight
    out[5] = if (startCaret.isRtlParagraph) 1f else 0f
    return true
  }
  fun closestOffset(x: Float, y: Float): Int
  fun closestOffset(x: Float, y: Float, preferredOffset: Int): Int = closestOffset(x, y)
}

/**
 * Pure Kotlin handle-drag gesture controller that keeps `TextLayoutAuthority`
 * (`ShapedTextLayout`) as the single source of truth across `ACTION_DOWN`,
 * `ACTION_MOVE` (line-midpoint vertical probe + cross-anchor `active_drag` flip),
 * `ACTION_UP`, and `ACTION_CANCEL` (never reverting to Rust fallback glyph widths).
 */
class SelectionGestureController(
  private val coordinator: AndroidSelectionCoordinator,
  private val layoutAuthority: TextLayoutAuthority,
  private val selectionStartProvider: () -> Int,
  private val selectionEndProvider: () -> Int,
  private val onSelectionChanged: (Int, Int) -> Unit,
  private val onOverlaySynced: () -> Unit = {},
) {
  private val geomBuf = FloatArray(24)
  private val dragCaretsBuf = FloatArray(8)
  var draggingHandle: Boolean = false
    private set
  private var dragAnchorOffset: Int = -1
  private var dragMovingOffset: Int = -1
  private var dragInitialHandle: Int = 0
  private var dragGrabDx: Float = 0f
  private var dragGrabDy: Float = 0f

  fun syncSelectionFromLayout(
    text: String,
    selStart: Int,
    selEnd: Int,
    viewportWidthPx: Int,
    density: Float,
  ) {
    val hasLayout = layoutAuthority.ensureLayoutReady(text, viewportWidthPx, density)
    val lo = selStart.coerceIn(0, text.length)
    val hi = selEnd.coerceIn(lo, text.length)
    if (lo < hi && hasLayout) {
      if (layoutAuthority.fillSelectionEndCarets(lo, hi, dragCaretsBuf)) {
        coordinator.updateSelection(
          startX = dragCaretsBuf[0],
          startY = dragCaretsBuf[1],
          endX = dragCaretsBuf[2],
          endY = dragCaretsBuf[3],
          lineHeight = dragCaretsBuf[4],
          rtl = dragCaretsBuf[5] >= 0.5f,
          hasSelection = true,
        )
      }
    } else if (!draggingHandle) {
      coordinator.clear()
    }
    onOverlaySynced()
  }

  fun onDown(x: Float, y: Float, density: Float): Int {
    val hit = coordinator.beginDrag(x, y)
    if (hit == 0) return 0
    draggingHandle = true
    dragInitialHandle = hit
    val selStart = selectionStartProvider()
    val selEnd = selectionEndProvider()
    dragAnchorOffset = if (hit == 1) selEnd else selStart
    val grabbedOffset = if (hit == 1) selStart else selEnd
    dragMovingOffset = grabbedOffset
    val caret = layoutAuthority.caretBounds(
      utf16Offset = grabbedOffset,
      isSelectionEnd = hit == 2,
      selStart = selStart,
      selEnd = selEnd,
    )
    if (caret != null) {
      // Anchor vertical grab offset to the visual line's vertical midpoint (never getLineBottom),
      // so multi-line line-0 handles never jump into line 1 on stationary or horizontal drags.
      dragGrabDx = caret.x - x
      dragGrabDy = caret.midY - y
    } else if (coordinator.fillOverlayGeometry(geomBuf)) {
      val ax = if (hit == 1) geomBuf[3] else geomBuf[9]
      val tipY = if (hit == 1) geomBuf[4] else geomBuf[10]
      val midY = tipY - 12f * density.coerceAtLeast(1f)
      dragGrabDx = ax - x
      dragGrabDy = midY - y
    }
    return hit
  }

  fun onMove(x: Float, y: Float): Boolean {
    if (!draggingHandle) return false
    if (dragAnchorOffset >= 0 && layoutAuthority.cachedText.isNotEmpty()) {
      val probeX = x + dragGrabDx
      val probeY = y + dragGrabDy
      val targetOff = layoutAuthority.closestOffset(probeX, probeY, dragMovingOffset)
      dragMovingOffset = targetOff
      val lo = minOf(dragAnchorOffset, targetOff)
      val hi = maxOf(dragAnchorOffset, targetOff)
      val activeHandleCode = when {
        targetOff < dragAnchorOffset -> 1
        targetOff > dragAnchorOffset -> 2
        else -> dragInitialHandle
      }
      onSelectionChanged(lo, hi)
      if (layoutAuthority.fillSelectionEndCarets(lo, hi, dragCaretsBuf)) {
        coordinator.applyTextDragEndpoints(
          startX = dragCaretsBuf[0],
          startY = dragCaretsBuf[1],
          endX = dragCaretsBuf[2],
          endY = dragCaretsBuf[3],
          lineHeight = dragCaretsBuf[4],
          rtl = dragCaretsBuf[5] >= 0.5f,
          activeHandleCode = activeHandleCode,
        )
        return true
      }
    }
    return false
  }

  fun onUp(viewportWidthPx: Int, density: Float): Boolean {
    if (!draggingHandle) return false
    draggingHandle = false
    dragAnchorOffset = -1
    dragMovingOffset = -1
    dragInitialHandle = 0
    val hasMenu = coordinator.endDrag()
    // Re-apply authoritative layout coordinates so Rust end_drag fallback never overwrites them.
    syncSelectionFromLayout(
      layoutAuthority.cachedText,
      selectionStartProvider(),
      selectionEndProvider(),
      viewportWidthPx,
      density,
    )
    return hasMenu
  }

  fun onCancel(viewportWidthPx: Int, density: Float): Boolean {
    if (!draggingHandle) return false
    draggingHandle = false
    dragAnchorOffset = -1
    dragMovingOffset = -1
    dragInitialHandle = 0
    coordinator.cancelDrag()
    syncSelectionFromLayout(
      layoutAuthority.cachedText,
      selectionStartProvider(),
      selectionEndProvider(),
      viewportWidthPx,
      density,
    )
    return true
  }
}

/**
 * Coordinates strict isolation between Autofill form field editing and the
 * per-route document buffer (`HostDocumentStore` + `HostTextPreviewView`).
 */
class HostDocumentBufferController(
  val documentStore: HostDocumentStore,
  private val imeProvider: () -> AffineImeController,
  private val autofillProvider: () -> AndroidAutofillController?,
  private val onDocumentPreviewUpdated: (String) -> Unit = {},
) {
  private var syncingAutofillFocus: Boolean = false
  private var syncingDocumentSwitch: Boolean = false
  private var autofillDirtiedIme: Boolean = false
  private var docSelectionStart: Int = 0
  private var docSelectionEnd: Int = 0
  var lastPreviewText: String = documentStore.readDocument(documentStore.activeDocumentId)
    private set

  fun isAutofillFocused(): Boolean = autofillProvider()?.focusedFieldId() != null

  fun isFocusedAutofillFieldMasked(): Boolean =
    autofillProvider()?.isFocusedFieldMasked() == true

  fun currentDocumentText(): String = documentStore.readDocument(documentStore.activeDocumentId)

  fun recordDocumentSelection(selStart: Int, selEnd: Int) {
    if (syncingAutofillFocus || syncingDocumentSwitch || isAutofillFocused() || autofillDirtiedIme) {
      return
    }
    docSelectionStart = selStart
    docSelectionEnd = selEnd
  }

  fun onImeTextEdited(text: String) {
    if (syncingAutofillFocus || syncingDocumentSwitch) return
    if (isAutofillFocused()) {
      autofillDirtiedIme = true
      // Strictly isolate form credentials from document storage and HostTextPreviewView.
      autofillProvider()?.onFocusedTextEdited(text)
      return
    }
    if (autofillDirtiedIme) {
      restoreDocumentBufferToIme()
      return
    }
    documentStore.saveCurrent(text)
    lastPreviewText = text
  }

  fun applyAutofillTextToIme(text: String) {
    val ime = imeProvider()
    autofillDirtiedIme = true
    syncingAutofillFocus = true
    try {
      ime.replaceText(0, ime.currentText().length, text, 1)
    } finally {
      syncingAutofillFocus = false
    }
  }

  fun restoreDocumentBufferToIme() {
    val docText = currentDocumentText()
    val lo = docSelectionStart.coerceIn(0, docText.length)
    val hi = docSelectionEnd.coerceIn(lo, docText.length)
    val ime = imeProvider()
    syncingAutofillFocus = true
    try {
      ime.replaceText(0, ime.currentText().length, docText, 1)
      ime.setSelection(lo, hi)
    } finally {
      syncingAutofillFocus = false
    }
    autofillDirtiedIme = false
    lastPreviewText = docText
    onDocumentPreviewUpdated(docText)
  }

  fun onAutofillFocusChanged(nextFieldId: Int?) {
    val af = autofillProvider()
    val prev = af?.focusedFieldId()
    val wasDirty = autofillDirtiedIme
    if (prev == null && nextFieldId != null && !wasDirty) {
      val ime = imeProvider()
      docSelectionStart = ime.selectionStart()
      docSelectionEnd = ime.selectionEnd()
    }
    af?.onFieldFocusChanged(nextFieldId)
    val nowFocused = af?.focusedFieldId() != null
    if (nowFocused) {
      autofillDirtiedIme = true
      onDocumentPreviewUpdated(currentDocumentText())
    } else if (prev != null || wasDirty) {
      restoreDocumentBufferToIme()
    }
  }

  fun commitAutofillSession(): Boolean {
    val needRestore = isAutofillFocused() || autofillDirtiedIme
    val ok = autofillProvider()?.commit() ?: false
    if (needRestore) {
      restoreDocumentBufferToIme()
    }
    return ok
  }

  fun cancelAutofillSession(): Boolean {
    val needRestore = isAutofillFocused() || autofillDirtiedIme
    val ok = autofillProvider()?.cancel() ?: false
    if (needRestore) {
      restoreDocumentBufferToIme()
    }
    return ok
  }

  fun clearAutofillFields() {
    val needRestore = isAutofillFocused() || autofillDirtiedIme
    autofillProvider()?.clearFields()
    if (needRestore) {
      restoreDocumentBufferToIme()
    }
  }

  fun onRouteChanged(nextRoute: String) {
    if (documentStore.activeDocumentId == nextRoute) return
    val wasAutofillFocused = isAutofillFocused()
    val outgoingDocText = if (wasAutofillFocused || autofillDirtiedIme) {
      // Preserve the document's own text and exit Autofill focus before loading the new route.
      autofillProvider()?.onFieldFocusChanged(null)
      currentDocumentText()
    } else {
      imeProvider().currentText()
    }
    autofillDirtiedIme = false
    docSelectionStart = 0
    docSelectionEnd = 0
    val targetText = documentStore.switchTo(nextRoute, outgoingDocText)
    syncingDocumentSwitch = true
    try {
      val ime = imeProvider()
      ime.replaceText(0, ime.currentText().length, targetText, 1)
    } finally {
      syncingDocumentSwitch = false
    }
    lastPreviewText = targetText
    onDocumentPreviewUpdated(targetText)
  }
}

/**
 * Single authoritative Android `StaticLayout` engine cached by `(text, viewportWidthPx, density)`
 * and shared by `HostTextPreviewView` and `AndroidSelectionOverlayView` so body text,
 * selection highlights, teardrop handle tips, hit-testing, and the magnified loupe are
 * 100% pixel-aligned with zero per-frame allocations during handle drags.
 */
class ShapedTextLayout(density: Float) : TextLayoutAuthority {
  val textPaint: TextPaint = TextPaint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG).apply {
    color = Color.rgb(0x14, 0x16, 0x1C)
    textSize = 18f * density.coerceAtLeast(1f)
  }
  var paddingLeftPx: Float = 24f * density.coerceAtLeast(1f)
    private set
  var paddingTopPx: Float = 80f * density.coerceAtLeast(1f)
    private set
  override var cachedText: String = ""
    private set
  var cachedViewportWidthPx: Int = -1
    private set
  var cachedDensity: Float = density.coerceAtLeast(1f)
    private set
  var cachedLayout: StaticLayout? = null
    private set
  private val tmpPath = Path()
  private val tmpBounds = RectF()
  private val breakIterator: BreakIterator = BreakIterator.getCharacterInstance()

  fun applyClearColor(clearColorArgb: Int) {
    textPaint.color = if (isLightClearColor(clearColorArgb)) {
      Color.rgb(0x14, 0x16, 0x1C)
    } else {
      Color.rgb(0xF4, 0xF4, 0xF5)
    }
  }

  override fun ensureLayoutReady(text: String, viewportWidthPx: Int, density: Float): Boolean =
    ensureLayout(text, viewportWidthPx, density) != null

  fun ensureLayout(text: String, viewportWidthPx: Int, density: Float): StaticLayout? {
    val safeDensity = if (density.isFinite() && density > 0f) density else 1f
    val padH = 24f * safeDensity
    val contentW = (viewportWidthPx - (padH * 2f).toInt()).coerceAtLeast(120)
    if (cachedLayout != null &&
      cachedText == text &&
      cachedViewportWidthPx == viewportWidthPx &&
      cachedDensity == safeDensity
    ) {
      return cachedLayout
    }
    paddingLeftPx = padH
    paddingTopPx = 80f * safeDensity
    textPaint.textSize = 18f * safeDensity
    if (cachedText != text) {
      breakIterator.setText(text)
    }
    cachedText = text
    cachedViewportWidthPx = viewportWidthPx
    cachedDensity = safeDensity
    cachedLayout = StaticLayout.Builder.obtain(text, 0, text.length, textPaint, contentW)
      .setAlignment(Layout.Alignment.ALIGN_NORMAL)
      .setTextDirection(TextDirectionHeuristics.FIRSTSTRONG_LTR)
      .setIncludePad(false)
      .build()
    return cachedLayout
  }

  private fun visualLineForOffset(layout: StaticLayout, text: String, off: Int): Int {
    var line = layout.getLineForOffset(off)
    // Soft-wrap boundary offsets belong to the start of the next visual line.
    if (off > 0 &&
      line + 1 < layout.lineCount &&
      layout.getLineStart(line + 1) == off &&
      text[off - 1] != '\n'
    ) {
      line += 1
    }
    return line
  }

  private fun caretHorizontalPx(
    layout: StaticLayout,
    text: String,
    off: Int,
    paraRtl: Boolean,
    isSelectionEnd: Boolean,
    selStart: Int,
    selEnd: Int,
  ): Float {
    var localX = layout.getPrimaryHorizontal(off)
    if (selStart < selEnd) {
      val charIdx = if (isSelectionEnd) {
        (off - 1).coerceIn(selStart, text.length - 1)
      } else {
        off.coerceIn(0, (selEnd - 1).coerceAtLeast(0))
      }
      val charRtl = layout.isRtlCharAt(charIdx)
      if (charRtl != paraRtl) {
        localX = layout.getSecondaryHorizontal(off)
      }
    }
    return paddingLeftPx + localX
  }

  override fun caretBounds(
    utf16Offset: Int,
    isSelectionEnd: Boolean,
    selStart: Int,
    selEnd: Int,
  ): CaretBounds? {
    val layout = cachedLayout ?: return null
    val text = cachedText
    val off = utf16Offset.coerceIn(0, text.length)
    val line = visualLineForOffset(layout, text, off)
    val top = paddingTopPx + layout.getLineTop(line).toFloat()
    val bottom = paddingTopPx + layout.getLineBottom(line).toFloat()
    val paraRtl = layout.getParagraphDirection(line) == Layout.DIR_RIGHT_TO_LEFT
    val x = caretHorizontalPx(layout, text, off, paraRtl, isSelectionEnd, selStart, selEnd)
    return CaretBounds(
      x = x,
      top = top,
      bottom = bottom,
      lineIndex = line,
      isRtlParagraph = paraRtl,
    )
  }

  override fun fillSelectionEndCarets(selStart: Int, selEnd: Int, out: FloatArray): Boolean {
    val layout = cachedLayout ?: return false
    val text = cachedText
    val lo = selStart.coerceIn(0, text.length)
    val hi = selEnd.coerceIn(lo, text.length)
    val startLine = visualLineForOffset(layout, text, lo)
    val endLine = visualLineForOffset(layout, text, hi)
    val startTop = paddingTopPx + layout.getLineTop(startLine).toFloat()
    val startBottom = paddingTopPx + layout.getLineBottom(startLine).toFloat()
    val endBottom = paddingTopPx + layout.getLineBottom(endLine).toFloat()
    var startRtl = layout.getParagraphDirection(startLine) == Layout.DIR_RIGHT_TO_LEFT
    val endRtl = layout.getParagraphDirection(endLine) == Layout.DIR_RIGHT_TO_LEFT
    var startX = caretHorizontalPx(layout, text, lo, startRtl, false, lo, hi)
    var endX = caretHorizontalPx(layout, text, hi, endRtl, true, lo, hi)

    // Guard mixed BiDi single-line spans against degenerate identical X coordinates.
    if (lo < hi && startLine == endLine && kotlin.math.abs(startX - endX) < 0.5f) {
      tmpPath.reset()
      layout.getSelectionPath(lo, hi, tmpPath)
      tmpPath.computeBounds(tmpBounds, true)
      if (!tmpBounds.isEmpty) {
        val leftX = paddingLeftPx + tmpBounds.left
        val rightX = paddingLeftPx + tmpBounds.right
        val charRtl = layout.isRtlCharAt(lo.coerceIn(0, (text.length - 1).coerceAtLeast(0)))
        if (charRtl) {
          startX = rightX
          endX = leftX
          startRtl = true
        } else {
          startX = leftX
          endX = rightX
          startRtl = false
        }
      }
    }
    out[0] = startX
    out[1] = startBottom
    out[2] = endX
    out[3] = endBottom
    out[4] = (startBottom - startTop).coerceAtLeast(1f)
    out[5] = if (startRtl) 1f else 0f
    return true
  }

  override fun selectionEndCarets(selStart: Int, selEnd: Int): Pair<CaretBounds, CaretBounds>? {
    val lo = selStart.coerceIn(0, cachedText.length)
    val hi = selEnd.coerceIn(lo, cachedText.length)
    var start = caretBounds(lo, isSelectionEnd = false, selStart = lo, selEnd = hi) ?: return null
    var end = caretBounds(hi, isSelectionEnd = true, selStart = lo, selEnd = hi) ?: return null
    // Guard mixed BiDi single-line spans against degenerate identical X coordinates.
    if (lo < hi && start.lineIndex == end.lineIndex && kotlin.math.abs(start.x - end.x) < 0.5f) {
      val layout = cachedLayout
      if (layout != null) {
        tmpPath.reset()
        layout.getSelectionPath(lo, hi, tmpPath)
        tmpPath.computeBounds(tmpBounds, true)
        if (!tmpBounds.isEmpty) {
          val leftX = paddingLeftPx + tmpBounds.left
          val rightX = paddingLeftPx + tmpBounds.right
          val charRtl = layout.isRtlCharAt(lo.coerceIn(0, (cachedText.length - 1).coerceAtLeast(0)))
          if (charRtl) {
            start = start.copy(x = rightX, isRtlParagraph = true)
            end = end.copy(x = leftX, isRtlParagraph = true)
          } else {
            start = start.copy(x = leftX, isRtlParagraph = false)
            end = end.copy(x = rightX, isRtlParagraph = false)
          }
        }
      }
    }
    return start to end
  }

  private fun snapToGraphemeStart(text: String, raw: Int): Int {
    if (raw <= 0 || raw >= text.length) return raw
    if (Character.isLowSurrogate(text[raw])) {
      return (raw - 1).coerceAtLeast(0)
    }
    if (breakIterator.isBoundary(raw)) return raw
    val prev = breakIterator.preceding(raw)
    return if (prev != BreakIterator.DONE) prev else raw
  }

  override fun closestOffset(x: Float, y: Float): Int = closestOffset(x, y, -1)

  override fun closestOffset(x: Float, y: Float, preferredOffset: Int): Int {
    val layout = cachedLayout ?: return 0
    val text = cachedText
    if (text.isEmpty()) return 0
    val localX = (x - paddingLeftPx).coerceAtLeast(0f)
    val localY = (y - paddingTopPx).toInt().coerceAtLeast(0)
    val line = layout.getLineForVertical(localY)
    // Preserve the active endpoint at mixed-direction run boundaries where two logical offsets
    // share the same visual X coordinate until the drag moves past the local glyph snap tolerance.
    if (preferredOffset in 0..text.length && visualLineForOffset(layout, text, preferredOffset) == line) {
      val primX = layout.getPrimaryHorizontal(preferredOffset)
      val secX = layout.getSecondaryHorizontal(preferredOffset)
      val lineStart = layout.getLineStart(line)
      val lineEnd = layout.getLineEnd(line)
      var adjAdvance = Float.MAX_VALUE
      if (preferredOffset > lineStart) {
        val prevX = layout.getPrimaryHorizontal(preferredOffset - 1)
        val d1 = kotlin.math.abs(primX - prevX)
        val d2 = kotlin.math.abs(secX - prevX)
        if (d1 > 0.5f && d1 < adjAdvance) adjAdvance = d1
        if (d2 > 0.5f && d2 < adjAdvance) adjAdvance = d2
      }
      if (preferredOffset < lineEnd) {
        val nextX = layout.getPrimaryHorizontal(preferredOffset + 1)
        val d1 = kotlin.math.abs(nextX - primX)
        val d2 = kotlin.math.abs(nextX - secX)
        if (d1 > 0.5f && d1 < adjAdvance) adjAdvance = d1
        if (d2 > 0.5f && d2 < adjAdvance) adjAdvance = d2
      }
      if (adjAdvance == Float.MAX_VALUE) adjAdvance = 4f
      val snapTol = minOf(2.0f * cachedDensity, adjAdvance * 0.35f)
      if (kotlin.math.abs(localX - primX) <= snapTol ||
        kotlin.math.abs(localX - secX) <= snapTol
      ) {
        return snapToGraphemeStart(text, preferredOffset)
      }
    }
    val raw = layout.getOffsetForHorizontal(line, localX).coerceIn(0, text.length)
    return snapToGraphemeStart(text, raw)
  }

  fun fillSelectionPath(selStart: Int, selEnd: Int, outPath: Path): Boolean {
    outPath.reset()
    val layout = cachedLayout ?: return false
    val lo = selStart.coerceIn(0, cachedText.length)
    val hi = selEnd.coerceIn(lo, cachedText.length)
    if (lo >= hi) return false
    layout.getSelectionPath(lo, hi, outPath)
    return true
  }
}

/**
 * In-memory host document store backed by the active destination route stack so
 * `openDocument`, `navigateTo`, and predictive back `Cancel`/`Commit` preserve
 * and restore real per-document text content.
 */
class HostDocumentStore(
  initialRoute: String = "workspace/home",
  initialText: String = "",
) {
  private val documents = linkedMapOf<String, String>(initialRoute to initialText)
  var activeDocumentId: String = initialRoute
    private set

  fun saveCurrent(text: String) {
    documents[activeDocumentId] = text
  }

  fun switchTo(nextRoute: String, outgoingText: String): String {
    documents[activeDocumentId] = outgoingText
    activeDocumentId = nextRoute
    return documents.getOrPut(nextRoute) { "" }
  }

  fun readDocument(route: String): String = documents[route] ?: ""
}

internal const val DEFAULT_SURFACE_CLEAR_COLOR_ARGB: Int = 0xFFFA_FAFC.toInt()

internal fun isLightClearColor(argb: Int): Boolean {
  val r = ((argb ushr 16) and 0xFF) / 255.0
  val g = ((argb ushr 8) and 0xFF) / 255.0
  val b = (argb and 0xFF) / 255.0
  val luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance >= 0.5
}

/**
 * Lightweight transitional text preview layer (until S4 shared editor integration)
 * sharing the exact cached `ShapedTextLayout` with `AndroidSelectionOverlayView` so
 * document text and `getSelectionPath` selection highlights align 1:1 with teardrop
 * handles and the magnified loupe.
 */
class HostTextPreviewView(
  context: Context,
  private val shapedLayout: ShapedTextLayout,
  private val selectionStartProvider: () -> Int,
  private val selectionEndProvider: () -> Int,
) : View(context) {
  private val selectionHighlightPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.argb(56, 30, 150, 235)
    style = Paint.Style.FILL
  }
  private val reusableSelectionPath = Path()

  init {
    setWillNotDraw(false)
    isClickable = false
    isFocusable = false
  }

  fun applyClearColor(clearColorArgb: Int) {
    shapedLayout.applyClearColor(clearColorArgb)
    selectionHighlightPaint.color = if (isLightClearColor(clearColorArgb)) {
      Color.argb(56, 30, 150, 235)
    } else {
      Color.argb(96, 56, 178, 255)
    }
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val layout = shapedLayout.cachedLayout ?: return
    val selStart = selectionStartProvider()
    val selEnd = selectionEndProvider()
    canvas.save()
    canvas.translate(shapedLayout.paddingLeftPx, shapedLayout.paddingTopPx)
    if (shapedLayout.fillSelectionPath(selStart, selEnd, reusableSelectionPath)) {
      canvas.drawPath(reusableSelectionPath, selectionHighlightPaint)
    }
    layout.draw(canvas)
    canvas.restore()
  }
}

/**
 * Pure Android `View` overlay layered above `AffineSurfaceView` and `HostTextPreviewView`
 * in a `FrameLayout` to render teardrop handles, single-authority `ShapedTextLayout`
 * magnified loupe (with `getSelectionPath` highlight and vertically centered focus), and
 * clickable `Copy | Cut | Paste` action menu pills with zero per-frame allocations and
 * without ever calling `SurfaceHolder.lockCanvas`.
 */
class AndroidSelectionOverlayView(
  context: Context,
  private val coordinator: AndroidSelectionCoordinator,
  private val shapedLayout: ShapedTextLayout,
  private val selectionStartProvider: () -> Int = { 0 },
  private val selectionEndProvider: () -> Int = { 0 },
  private val onSelectionChanged: (Int, Int) -> Unit = { _, _ -> },
  private val canPaste: () -> Boolean = { false },
  private val onActionCopy: () -> Unit = {},
  private val onActionCut: () -> Unit = {},
  private val onActionPaste: () -> Unit = {},
  private val isOverlaySuppressed: () -> Boolean = { false },
) : View(context) {
  private val handlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.argb(235, 30, 150, 235)
    style = Paint.Style.FILL
  }
  private val selectionHighlightPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.argb(56, 30, 150, 235)
    style = Paint.Style.FILL
  }
  private val loupeBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.rgb(0xFA, 0xFB, 0xFD)
    style = Paint.Style.FILL
  }
  private val loupeBorderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.argb(235, 30, 150, 235)
    style = Paint.Style.STROKE
    strokeWidth = 3f
  }
  private val menuPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.argb(225, 28, 28, 32)
    style = Paint.Style.FILL
  }
  private val menuDividerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.argb(60, 255, 255, 255)
    style = Paint.Style.FILL
  }
  private val menuTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.WHITE
    textSize = 36f
    textAlign = Paint.Align.CENTER
  }
  private val geometryBuffer = FloatArray(24)
  private val handlePath = Path()
  private val loupeClipPath = Path()
  private val reusableSelectionPath = Path()
  private val loupeRect = RectF()
  private val menuRect = RectF()
  private val gestureController = SelectionGestureController(
    coordinator = coordinator,
    layoutAuthority = shapedLayout,
    selectionStartProvider = selectionStartProvider,
    selectionEndProvider = selectionEndProvider,
    onSelectionChanged = onSelectionChanged,
    onOverlaySynced = { invalidate() },
  )
  private var hasVisibleMenu: Boolean = false
  private var menuHasPaste: Boolean = false

  init {
    setWillNotDraw(false)
    isClickable = false
    isFocusable = false
  }

  fun refreshPasteState() {
    menuHasPaste = canPaste()
  }

  override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
    super.onWindowFocusChanged(hasWindowFocus)
    if (hasWindowFocus) {
      refreshPasteState()
      invalidate()
    }
  }

  fun syncFromShapedLayout(
    text: String,
    selStart: Int,
    selEnd: Int,
    viewportWidthPx: Int,
    density: Float,
  ) {
    val lo = selStart.coerceIn(0, text.length)
    val hi = selEnd.coerceIn(lo, text.length)
    menuHasPaste = if (lo < hi) canPaste() else false
    gestureController.syncSelectionFromLayout(text, lo, hi, viewportWidthPx, density)
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (isOverlaySuppressed()) return false
    val viewportW = if (width > 0) width else resources.displayMetrics.widthPixels
    val density = resources.displayMetrics.density
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        val hit = gestureController.onDown(event.x, event.y, density)
        if (hit != 0) {
          invalidate()
          return true
        }
        if (hasVisibleMenu && menuRect.contains(event.x, event.y)) {
          return true
        }
        return false
      }
      MotionEvent.ACTION_MOVE -> {
        if (!gestureController.draggingHandle) return false
        gestureController.onMove(event.x, event.y)
        invalidate()
        return true
      }
      MotionEvent.ACTION_UP -> {
        if (gestureController.draggingHandle) {
          refreshPasteState()
          gestureController.onUp(viewportW, density)
          invalidate()
          return true
        }
        if (hasVisibleMenu && menuRect.contains(event.x, event.y)) {
          if (menuHasPaste) {
            val third = menuRect.width() / 3f
            when {
              event.x < menuRect.left + third -> onActionCopy()
              event.x < menuRect.left + third * 2f -> onActionCut()
              else -> onActionPaste()
            }
          } else {
            if (event.x < menuRect.centerX()) {
              onActionCopy()
            } else {
              onActionCut()
            }
          }
          refreshPasteState()
          invalidate()
          return true
        }
        return false
      }
      MotionEvent.ACTION_CANCEL -> {
        if (!gestureController.draggingHandle) return false
        refreshPasteState()
        gestureController.onCancel(viewportW, density)
        invalidate()
        return true
      }
      else -> return false
    }
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    if (isOverlaySuppressed()) {
      hasVisibleMenu = false
      return
    }
    val g = geometryBuffer
    if (!coordinator.fillOverlayGeometry(g) || g[0] < 0.5f) {
      hasVisibleMenu = false
      return
    }
    if (g[2] >= 0.5f) {
      drawTeardropHandle(canvas, g[3], g[4], g[5], g[6], g[7], leanLeft = g[5] < g[3])
    }
    if (g[8] >= 0.5f) {
      drawTeardropHandle(canvas, g[9], g[10], g[11], g[12], g[13], leanLeft = g[11] < g[9])
    }
    if (g[14] >= 0.5f) {
      val ax = g[15]
      val ay = g[16]
      val lx = g[17]
      val ly = g[18]
      val density = resources.displayMetrics.density
      val loupeW = 100f * density
      val loupeH = 48f * density
      loupeRect.set(lx - loupeW * 0.5f, ly - loupeH * 0.5f, lx + loupeW * 0.5f, ly + loupeH * 0.5f)
      loupeClipPath.reset()
      loupeClipPath.addRoundRect(loupeRect, loupeH * 0.5f, loupeH * 0.5f, Path.Direction.CW)
      val layout = shapedLayout.cachedLayout
      canvas.save()
      canvas.clipPath(loupeClipPath)
      canvas.drawRect(loupeRect, loupeBgPaint)
      if (layout != null && shapedLayout.cachedText.isNotEmpty()) {
        val selStart = selectionStartProvider()
        val selEnd = selectionEndProvider()
        val halfCaretH = (shapedLayout.textPaint.textSize * 0.65f).coerceAtLeast(12f)
        canvas.scale(1.5f, 1.5f, lx, ly)
        canvas.save()
        canvas.translate(lx - ax + shapedLayout.paddingLeftPx, ly - ay + shapedLayout.paddingTopPx)
        if (shapedLayout.fillSelectionPath(selStart, selEnd, reusableSelectionPath)) {
          canvas.drawPath(reusableSelectionPath, selectionHighlightPaint)
        }
        layout.draw(canvas)
        canvas.restore()
        // Focus caret bar vertically centered on the dragged line midpoint (lx, ly).
        canvas.drawRect(lx - 1.5f, ly - halfCaretH, lx + 1.5f, ly + halfCaretH, handlePaint)
      }
      canvas.restore()
      canvas.drawPath(loupeClipPath, loupeBorderPaint)
    }
    if (g[19] >= 0.5f) {
      val mx = g[20]
      val my = g[21]
      val mw = g[22]
      val mh = g[23]
      val density = resources.displayMetrics.density
      val marginX = 12f * density
      val actualW = if (menuHasPaste) mw * 1.38f else mw
      val maxLeft = (width - marginX - actualW).coerceAtLeast(0f)
      val minLeft = marginX.coerceAtMost(maxLeft)
      val actualX = (mx + (mw - actualW) * 0.5f).coerceIn(minLeft, maxLeft)
      menuRect.set(actualX, my, actualX + actualW, my + mh)
      hasVisibleMenu = true
      canvas.drawRoundRect(menuRect, mh * 0.5f, mh * 0.5f, menuPaint)
      val baselineY = menuRect.centerY() + menuTextPaint.textSize * 0.35f
      if (menuHasPaste) {
        val third = actualW / 3f
        val d1 = actualX + third
        val d2 = actualX + third * 2f
        canvas.drawRect(d1 - 1f, my + mh * 0.22f, d1 + 1f, my + mh * 0.78f, menuDividerPaint)
        canvas.drawRect(d2 - 1f, my + mh * 0.22f, d2 + 1f, my + mh * 0.78f, menuDividerPaint)
        canvas.drawText("Copy", actualX + third * 0.5f, baselineY, menuTextPaint)
        canvas.drawText("Cut", actualX + third * 1.5f, baselineY, menuTextPaint)
        canvas.drawText("Paste", actualX + third * 2.5f, baselineY, menuTextPaint)
      } else {
        val dividerX = actualX + actualW * 0.5f
        canvas.drawRect(dividerX - 1f, my + mh * 0.22f, dividerX + 1f, my + mh * 0.78f, menuDividerPaint)
        canvas.drawText("Copy", actualX + actualW * 0.25f, baselineY, menuTextPaint)
        canvas.drawText("Cut", actualX + actualW * 0.75f, baselineY, menuTextPaint)
      }
    } else {
      hasVisibleMenu = false
    }
  }

  private fun drawTeardropHandle(
    canvas: Canvas,
    tipX: Float,
    tipY: Float,
    centerX: Float,
    centerY: Float,
    radius: Float,
    leanLeft: Boolean,
  ) {
    // Draw vertical selection stem above the tip + teardrop bulb curving into tip.
    val stemHeight = radius * 1.4f
    canvas.drawRect(tipX - 2f, tipY - stemHeight, tipX + 2f, tipY, handlePaint)
    handlePath.reset()
    handlePath.moveTo(tipX, tipY)
    if (leanLeft) {
      handlePath.quadTo(tipX, centerY - radius * 0.4f, centerX + radius, centerY)
    } else {
      handlePath.quadTo(tipX, centerY - radius * 0.4f, centerX - radius, centerY)
    }
    handlePath.addCircle(centerX, centerY, radius, Path.Direction.CW)
    canvas.drawPath(handlePath, handlePaint)
  }
}

data class VirtualAutofillNode(
  val autofillId: Int,
  val kindCode: Int,
  val hint: String,
  val left: Int,
  val top: Int,
  val right: Int,
  val bottom: Int,
  val masked: Boolean,
  val valueLen: Int,
)

interface AutofillPlatformBackend {
  fun notifyViewEntered(autofillId: Int, left: Int, top: Int, right: Int, bottom: Int)
  fun notifyViewExited(autofillId: Int)
  fun notifyValueChanged(autofillId: Int, text: String)
  fun commit()
  fun cancel()
}

@TargetApi(Build.VERSION_CODES.O)
class SystemAutofillPlatformBackend(
  private val hostView: View,
  private val manager: AutofillManager,
) : AutofillPlatformBackend {
  override fun notifyViewEntered(autofillId: Int, left: Int, top: Int, right: Int, bottom: Int) {
    manager.notifyViewEntered(hostView, autofillId, Rect(left, top, right, bottom))
  }

  override fun notifyViewExited(autofillId: Int) {
    manager.notifyViewExited(hostView, autofillId)
  }

  override fun notifyValueChanged(autofillId: Int, text: String) {
    manager.notifyValueChanged(hostView, autofillId, AutofillValue.forText(text))
  }

  override fun commit() {
    manager.commit()
  }

  override fun cancel() {
    manager.cancel()
  }
}

/**
 * API 26+ `AutofillManager` virtual view structure controller.
 * Safely degrades to a no-op on API 24 and 25 without touching API 26 classes.
 */
class AndroidAutofillController(
  private val sdkInt: Int,
  private val handleProvider: () -> Long,
  private val backend: AutofillPlatformBackend? = null,
  private val onMutated: () -> Unit = {},
  private val onValueCommitted: (Int, String) -> Unit = { _, _ -> },
  private val onFocusedFieldTextSync: (Int, String) -> Unit = { _, _ -> },
) {
  private val nodes = linkedMapOf<Int, VirtualAutofillNode>()
  private var focusedId: Int? = null

  val isEnabled: Boolean
    get() = sdkInt >= Build.VERSION_CODES.O && NativeBridge.nativeShouldExposeAutofill(sdkInt)

  fun focusedFieldId(): Int? = if (isEnabled) focusedId else null

  fun isFocusedFieldMasked(): Boolean {
    val id = focusedFieldId() ?: return false
    return nodes[id]?.masked == true
  }

  fun readFormValues(): Map<String, String> {
    if (!isEnabled) return emptyMap()
    val handle = handleProvider()
    if (handle == 0L) return emptyMap()
    val out = linkedMapOf<String, String>()
    NativeBridge.nativeGetAutofillValueByKind(handle, 0)?.let { out["username"] = it }
    NativeBridge.nativeGetAutofillValueByKind(handle, 1)?.let { out["email"] = it }
    NativeBridge.nativeGetAutofillValueByKind(handle, 2)?.let { out["password"] = it }
    NativeBridge.nativeGetAutofillValueByKind(handle, 3)?.let { out["otp"] = it }
    return out
  }

  fun onFocusedTextEdited(text: String): Boolean {
    val active = focusedId ?: return false
    return updateFieldText(active, text)
  }

  init {
    val handle = handleProvider()
    if (handle != 0L) {
      NativeBridge.nativeConfigureAutofillSdk(handle, sdkInt)
    }
  }

  fun registerField(
    autofillId: Int,
    kindCode: Int,
    left: Int,
    top: Int,
    right: Int,
    bottom: Int,
    masked: Boolean,
    valueLen: Int = 0,
  ): Boolean {
    if (!isEnabled) return false
    val handle = handleProvider()
    if (handle == 0L) return false
    val ok = NativeBridge.nativeUpsertAutofillField(
      handle,
      autofillId,
      kindCode,
      left,
      top,
      right,
      bottom,
      masked,
      valueLen,
    )
    if (ok) {
      val hint = when (kindCode) {
        0 -> View.AUTOFILL_HINT_USERNAME
        1 -> View.AUTOFILL_HINT_EMAIL_ADDRESS
        2 -> View.AUTOFILL_HINT_PASSWORD
        else -> "smsOTPCode"
      }
      nodes[autofillId] = VirtualAutofillNode(
        autofillId = autofillId,
        kindCode = kindCode,
        hint = hint,
        left = minOf(left, right),
        top = minOf(top, bottom),
        right = maxOf(left, right),
        bottom = maxOf(top, bottom),
        masked = masked,
        valueLen = valueLen.coerceAtLeast(0),
      )
    }
    return ok
  }

  fun updateFieldText(autofillId: Int, text: String): Boolean {
    if (!isEnabled) return false
    val handle = handleProvider()
    if (handle == 0L) return false
    val ok = NativeBridge.nativeSetAutofillFieldText(handle, autofillId, text)
    if (ok) {
      val existing = nodes[autofillId]
      if (existing != null) {
        nodes[autofillId] = existing.copy(valueLen = text.length)
      }
      backend?.notifyValueChanged(autofillId, text)
    }
    return ok
  }

  fun resolveVirtualFieldValueForStructure(autofillId: Int): String? {
    if (!isEnabled) return null
    val handle = handleProvider()
    if (handle == 0L) return null
    return NativeBridge.nativeGetAutofillValue(handle, autofillId)?.takeIf { it.isNotEmpty() }
  }

  fun onFieldFocusChanged(nextAutofillId: Int?) {
    if (!isEnabled) return
    val handle = handleProvider()
    if (handle == 0L) return
    val validNext = if (nextAutofillId != null && nodes.containsKey(nextAutofillId)) {
      nextAutofillId
    } else {
      null
    }
    if (focusedId == validNext) return
    val prev = focusedId
    focusedId = validNext
    NativeBridge.nativeFocusAutofillField(handle, validNext ?: 0)
    if (prev != null) {
      backend?.notifyViewExited(prev)
    }
    if (validNext != null) {
      val node = nodes[validNext]
      if (node != null) {
        backend?.notifyViewEntered(node.autofillId, node.left, node.top, node.right, node.bottom)
      }
      onFocusedFieldTextSync(validNext, resolveVirtualFieldValueForStructure(validNext) ?: "")
    }
  }

  fun virtualNodesSnapshot(): List<VirtualAutofillNode> =
    if (!isEnabled) emptyList() else nodes.values.toList()

  @TargetApi(Build.VERSION_CODES.O)
  fun populateVirtualStructure(structure: ViewStructure) {
    if (!isEnabled || nodes.isEmpty()) return
    val parentId = structure.autofillId ?: return
    val ordered = nodes.values.toList()
    val baseIndex = structure.addChildCount(ordered.size)
    ordered.forEachIndexed { offset, node ->
      val child = structure.newChild(baseIndex + offset)
      child.setAutofillId(parentId, node.autofillId)
      child.setAutofillType(View.AUTOFILL_TYPE_TEXT)
      child.setAutofillHints(arrayOf(node.hint))
      child.setInputType(
        when (node.kindCode) {
          1 -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
          2 -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
          3 -> InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_NORMAL
          else -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_NORMAL
        },
      )
      child.setDimens(
        node.left,
        node.top,
        0,
        0,
        (node.right - node.left).coerceAtLeast(0),
        (node.bottom - node.top).coerceAtLeast(0),
      )
      val realText = resolveVirtualFieldValueForStructure(node.autofillId)
      if (!realText.isNullOrEmpty()) {
        child.setAutofillValue(AutofillValue.forText(realText))
      }
    }
  }

  fun onAutofillValues(values: Map<Int, String>): Int {
    if (!isEnabled) return 0
    val handle = handleProvider()
    if (handle == 0L) return 0
    var applied = 0
    val activeFocus = focusedId
    for ((id, text) in values) {
      if (NativeBridge.nativeApplyAutofillValue(handle, id, text)) {
        applied += 1
        val existing = nodes[id]
        if (existing != null) {
          nodes[id] = existing.copy(valueLen = text.length)
        }
        if (activeFocus != null && id == activeFocus) {
          onValueCommitted(id, text)
        }
        backend?.notifyValueChanged(id, text)
      }
    }
    if (applied > 0) onMutated()
    return applied
  }

  @TargetApi(Build.VERSION_CODES.O)
  fun onAutofillSparseArray(values: SparseArray<AutofillValue>): Int {
    if (!isEnabled) return 0
    val map = linkedMapOf<Int, String>()
    for (idx in 0 until values.size()) {
      val id = values.keyAt(idx)
      val value = values.valueAt(idx)
      if (value != null && value.isText) {
        map[id] = value.textValue.toString()
      }
    }
    return onAutofillValues(map)
  }

  fun commit(): Boolean {
    if (!isEnabled) return false
    val handle = handleProvider()
    if (handle == 0L) return false
    focusedId = null
    val ok = NativeBridge.nativeCommitAutofill(handle)
    if (ok) backend?.commit()
    return ok
  }

  fun cancel(): Boolean {
    if (!isEnabled) return false
    val handle = handleProvider()
    if (handle == 0L) return false
    focusedId = null
    val ok = NativeBridge.nativeCancelAutofill(handle)
    if (ok) backend?.cancel()
    return ok
  }

  fun clearFields() {
    nodes.clear()
    focusedId = null
    val handle = handleProvider()
    if (handle != 0L) {
      NativeBridge.nativeClearAutofillFields(handle)
    }
  }

  fun virtualStructureJson(): String {
    val handle = handleProvider()
    return if (handle == 0L) "{}" else NativeBridge.nativeGetAutofillStructureJson(handle)
  }
}

/**
 * Four-phase predictive back (API 34+) and legacy single-commit (API 24-33)
 * dispatcher backed by Rust `back_stack_depth`, with re-entrancy protection
 * and full support for standalone API 34+ button/key `onBackInvoked()` calls.
 */
class AndroidBackDispatcher(
  private val sdkInt: Int,
  private val handleProvider: () -> Long,
  private val onMutated: () -> Unit = {},
  private val onDestinationChanged: (String?) -> Unit = {},
  private val onSystemExit: () -> Unit = {},
) {
  val dispatchMode: Int = NativeBridge.nativeBackDispatchMode(sdkInt)
  private var gestureActive: Boolean = false
  private var inDispatch: Boolean = false

  fun pushDestination(route: String): Boolean {
    val handle = handleProvider()
    if (handle == 0L) return false
    val ok = NativeBridge.nativePushDestination(handle, route)
    if (ok) {
      onDestinationChanged(currentDestination())
      onMutated()
    }
    return ok
  }

  fun navigateTo(destination: String): Boolean = pushDestination(destination)

  fun openDocument(docId: String): Boolean {
    val clean = docId.trim().removePrefix("/")
    if (clean.isEmpty()) return false
    val route = if (clean.startsWith("doc/")) clean else "doc/$clean"
    return pushDestination(route)
  }

  fun currentDestination(): String? {
    val handle = handleProvider()
    return if (handle == 0L) null else NativeBridge.nativeGetCurrentDestination(handle)
  }

  fun onBackStarted(progress: Float = 0f): Boolean {
    if (dispatchMode < 2) return false
    val handle = handleProvider()
    if (handle == 0L) return false
    val ok = NativeBridge.nativeOnBackGesturePhase(handle, 0, progress)
    if (ok) {
      gestureActive = true
      onMutated()
    }
    return ok
  }

  fun onBackProgressed(progress: Float): Boolean {
    if (dispatchMode < 2 || !gestureActive) return false
    val handle = handleProvider()
    if (handle == 0L) return false
    val ok = NativeBridge.nativeOnBackGesturePhase(handle, 1, progress)
    if (ok) onMutated()
    return ok
  }

  fun onBackCancelled(): Boolean {
    if (dispatchMode < 2 || !gestureActive) return false
    val handle = handleProvider()
    if (handle == 0L) return false
    gestureActive = false
    val ok = NativeBridge.nativeOnBackGesturePhase(handle, 2, 0f)
    if (ok) onMutated()
    return ok
  }

  fun onBackInvoked(): Boolean {
    if (inDispatch) return false
    inDispatch = true
    try {
      gestureActive = false
      val handle = handleProvider()
      val consumed = handle != 0L && NativeBridge.nativeOnBackGesturePhase(handle, 3, 1f)
      if (consumed) {
        onDestinationChanged(currentDestination())
        onMutated()
      } else {
        onSystemExit()
      }
      return consumed
    } finally {
      inDispatch = false
    }
  }

  fun onLegacyBackPressed(invokeSystemExit: Boolean = true): Boolean {
    if (inDispatch) return false
    inDispatch = true
    try {
      gestureActive = false
      val handle = handleProvider()
      val consumed = handle != 0L && NativeBridge.nativeOnBackGesturePhase(handle, 3, 1f)
      if (consumed) {
        onDestinationChanged(currentDestination())
        onMutated()
      } else if (invokeSystemExit) {
        onSystemExit()
      }
      return consumed
    } finally {
      inDispatch = false
    }
  }
}

interface PdfPageBackend : AutoCloseable {
  fun pageCount(): Int
  fun renderPageArgb(pageIndex: Int, widthPx: Int, heightPx: Int): IntArray
}

data class RenderedPdfPage(
  val cacheKey: String,
  val pageIndex: Int,
  val widthPx: Int,
  val heightPx: Int,
  val rgbaBytes: ByteArray,
)

class SystemPdfRendererBackend(
  private val descriptor: ParcelFileDescriptor,
) : PdfPageBackend {
  private val renderer = PdfRenderer(descriptor)

  override fun pageCount(): Int = renderer.pageCount

  override fun renderPageArgb(pageIndex: Int, widthPx: Int, heightPx: Int): IntArray {
    renderer.openPage(pageIndex).use { page ->
      val bitmap = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888)
      try {
        Canvas(bitmap).drawColor(Color.WHITE)
        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        val pixels = IntArray(widthPx * heightPx)
        bitmap.getPixels(pixels, 0, widthPx, 0, 0, widthPx, heightPx)
        return pixels
      } finally {
        bitmap.recycle()
      }
    }
  }

  override fun close() {
    renderer.close()
    descriptor.close()
  }
}

/**
 * In-place Android `PdfRenderer` page renderer with Rust OOM/bounds validation
 * and deterministic `ARGB_8888 -> RGBA8` conversion.
 */
class AndroidPdfPageRenderer(
  private val docId: String,
  private val backend: PdfPageBackend,
) : AutoCloseable {
  fun renderPageRgba(
    pageIndex: Int,
    widthPx: Int,
    heightPx: Int,
    dpiBucket: Int = 160,
  ): RenderedPdfPage? {
    if (!NativeBridge.nativeValidatePdfPageRequest(pageIndex, backend.pageCount(), widthPx, heightPx)) {
      return null
    }
    val argb = backend.renderPageArgb(pageIndex, widthPx, heightPx)
    val rgba = NativeBridge.nativePdfConvertArgbToRgba(argb, widthPx, heightPx) ?: return null
    val safeDpi = dpiBucket.coerceAtLeast(72)
    val key = NativeBridge.nativePdfPageCacheKey(docId, pageIndex, widthPx, heightPx, safeDpi)
    return RenderedPdfPage(
      cacheKey = key,
      pageIndex = pageIndex,
      widthPx = widthPx,
      heightPx = heightPx,
      rgbaBytes = rgba,
    )
  }

  override fun close() {
    backend.close()
  }
}

internal class AffineSurfaceView(
  context: Context,
  private val handleProvider: () -> Long,
  private val onMutated: () -> Unit = {},
  private val onTextEdited: (String) -> Unit = {},
  private val onContextMenuAction: (Int) -> Boolean = { false },
  private val autofillProvider: () -> AndroidAutofillController? = { null },
) : SurfaceView(context) {
  init {
    isFocusable = true
    isFocusableInTouchMode = true
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      markImportantForAutofillApi26()
    }
  }

  @TargetApi(Build.VERSION_CODES.O)
  private fun markImportantForAutofillApi26() {
    importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_YES
  }

  override fun onCheckIsTextEditor(): Boolean = true

  override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection =
    createInputConnection(handleProvider, outAttrs, onMutated, onTextEdited, onContextMenuAction)

  @TargetApi(Build.VERSION_CODES.O)
  override fun onProvideAutofillVirtualStructure(structure: ViewStructure, flags: Int) {
    super.onProvideAutofillVirtualStructure(structure, flags)
    autofillProvider()?.populateVirtualStructure(structure)
  }

  @TargetApi(Build.VERSION_CODES.O)
  override fun autofill(values: SparseArray<AutofillValue>) {
    autofillProvider()?.onAutofillSparseArray(values)
  }

  companion object {
    internal fun dispatchAutofillBatch(
      controller: AndroidAutofillController,
      values: Map<Int, String>,
    ): Int = controller.onAutofillValues(values)

    internal fun createInputConnection(
      handleProvider: () -> Long,
      outAttrs: EditorInfo? = null,
      onMutated: () -> Unit = {},
      onTextEdited: (String) -> Unit = {},
      onContextMenuAction: (Int) -> Boolean = { false },
    ): InputConnection {
      val ime = AffineImeController(handleProvider, onMutated, onTextEdited)
      if (outAttrs != null) {
        outAttrs.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
        outAttrs.imeOptions = EditorInfo.IME_FLAG_NO_EXTRACT_UI
        outAttrs.initialSelStart = ime.selectionStart()
        outAttrs.initialSelEnd = ime.selectionEnd()
      }
      return AffineInputConnection(ime, onContextMenuAction)
    }
  }
}

class MainActivity : Activity(), SurfaceHolder.Callback, Choreographer.FrameCallback {
  private var nativeHandle: Long = 0L
  private lateinit var surfaceView: AffineSurfaceView
  private lateinit var textPreviewView: HostTextPreviewView
  private lateinit var selectionOverlayView: AndroidSelectionOverlayView
  private lateinit var shapedLayout: ShapedTextLayout
  private lateinit var bootstrapCoordinator: AndroidBootstrapCoordinator
  private lateinit var selectionCoordinator: AndroidSelectionCoordinator
  private lateinit var backDispatcher: AndroidBackDispatcher
  private lateinit var imeController: AffineImeController
  private lateinit var clipboardAdapter: HostClipboard
  private val documentStore = HostDocumentStore()
  private lateinit var documentBufferController: HostDocumentBufferController
  private var autofillController: AndroidAutofillController? = null
  private var syncingOverlay: Boolean = false
  private var lastViewportWidthPx: Int = 0
  private var clearColorArgb: Int = DEFAULT_SURFACE_CLEAR_COLOR_ARGB
  @Volatile
  var lastBootstrapOutcome: BootstrapOutcome? = null
    private set
  @Volatile
  var currentDestination: String = "workspace/home"
    private set
  private var frameLoopActive: Boolean = false
  private var frameCallbackPosted: Boolean = false
  private var surfaceReady: Boolean = false
  private var backCallback: OnBackInvokedCallback? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.setDecorFitsSystemWindows(false)
    }

    nativeHandle = NativeBridge.nativeCreateHost()
    shapedLayout = ShapedTextLayout(resources.displayMetrics.density).apply {
      applyClearColor(clearColorArgb)
    }
    clipboardAdapter = AndroidClipboardAdapter(
      getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager,
    )
    documentBufferController = HostDocumentBufferController(
      documentStore = documentStore,
      imeProvider = { imeController },
      autofillProvider = { autofillController },
      onDocumentPreviewUpdated = { docText ->
        syncShapedLayoutAndOverlay(docText)
      },
    )
    val onImeMutated: () -> Unit = {
      if (!syncingOverlay) {
        if (documentBufferController.isAutofillFocused()) {
          if (::selectionCoordinator.isInitialized) {
            selectionCoordinator.clear()
          }
        } else {
          documentBufferController.recordDocumentSelection(
            imeController.selectionStart(),
            imeController.selectionEnd(),
          )
          syncShapedLayoutAndOverlay(imeController.currentText())
        }
      }
      if (::textPreviewView.isInitialized) {
        textPreviewView.invalidate()
      }
      if (::selectionOverlayView.isInitialized) {
        selectionOverlayView.invalidate()
      }
      requestFrameAndSchedule()
    }
    val onImeTextEdited: (String) -> Unit = { text ->
      documentBufferController.onImeTextEdited(text)
    }
    imeController = AffineImeController(
      handleProvider = { nativeHandle },
      onMutated = onImeMutated,
      onTextEdited = onImeTextEdited,
    )
    selectionCoordinator = AndroidSelectionCoordinator(
      handleProvider = { nativeHandle },
      onMutated = {
        if (::selectionOverlayView.isInitialized) {
          selectionOverlayView.invalidate()
        }
        requestFrameAndSchedule()
      },
    )
    val onContextMenuAction: (Int) -> Boolean = { actionId ->
      if (documentBufferController.isAutofillFocused()) {
        if ((actionId == android.R.id.copy || actionId == android.R.id.cut) &&
          documentBufferController.isFocusedAutofillFieldMasked()
        ) {
          false
        } else {
          val handled = selectionCoordinator.handleContextMenuAction(actionId, imeController, clipboardAdapter)
          selectionCoordinator.clear()
          handled
        }
      } else {
        val handled = selectionCoordinator.handleContextMenuAction(actionId, imeController, clipboardAdapter)
        if (handled) {
          syncShapedLayoutAndOverlay(imeController.currentText())
        }
        handled
      }
    }
    backDispatcher = AndroidBackDispatcher(
      sdkInt = Build.VERSION.SDK_INT,
      handleProvider = { nativeHandle },
      onMutated = { requestFrameAndSchedule() },
      onDestinationChanged = { dest ->
        if (dest != null) {
          currentDestination = dest
          documentBufferController.onRouteChanged(dest)
        }
        requestFrameAndSchedule()
      },
      onSystemExit = { finish() },
    )
    surfaceView = AffineSurfaceView(
      context = this,
      handleProvider = { nativeHandle },
      onMutated = onImeMutated,
      onTextEdited = onImeTextEdited,
      onContextMenuAction = onContextMenuAction,
      autofillProvider = { autofillController },
    ).apply {
      holder.addCallback(this@MainActivity)
    }
    textPreviewView = HostTextPreviewView(
      context = this,
      shapedLayout = shapedLayout,
      selectionStartProvider = {
        if (documentBufferController.isAutofillFocused()) 0 else imeController.selectionStart()
      },
      selectionEndProvider = {
        if (documentBufferController.isAutofillFocused()) 0 else imeController.selectionEnd()
      },
    ).apply {
      applyClearColor(clearColorArgb)
    }
    selectionOverlayView = AndroidSelectionOverlayView(
      context = this,
      coordinator = selectionCoordinator,
      shapedLayout = shapedLayout,
      selectionStartProvider = { imeController.selectionStart() },
      selectionEndProvider = { imeController.selectionEnd() },
      onSelectionChanged = { lo, hi ->
        syncingOverlay = true
        try {
          imeController.setSelection(lo, hi)
        } finally {
          syncingOverlay = false
        }
        if (::textPreviewView.isInitialized) {
          textPreviewView.invalidate()
        }
      },
      canPaste = { clipboardAdapter.hasPlainText() },
      onActionCopy = {
        if (!documentBufferController.isAutofillFocused()) {
          selectionCoordinator.performCopy(imeController, clipboardAdapter)
        }
      },
      onActionCut = {
        if (!documentBufferController.isAutofillFocused()) {
          selectionCoordinator.performCut(imeController, clipboardAdapter)
        }
      },
      onActionPaste = {
        if (!documentBufferController.isAutofillFocused()) {
          selectionCoordinator.performPaste(imeController, clipboardAdapter)
        }
      },
      isOverlaySuppressed = { documentBufferController.isAutofillFocused() },
    )
    val rootContainer = FrameLayout(this).apply {
      setBackgroundColor(clearColorArgb)
      addView(
        surfaceView,
        FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT,
        ),
      )
      addView(
        textPreviewView,
        FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT,
        ),
      )
      addView(
        selectionOverlayView,
        FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT,
        ),
      )
    }
    setContentView(rootContainer)

    installInsetsBridge(rootContainer)
    installPredictiveBackBridge()
    configureAutofillIfSupported()

    bootstrapCoordinator = AndroidBootstrapCoordinator(
      handleProvider = { nativeHandle },
      filesDirProvider = { filesDir.absolutePath },
    )
    bootstrapCoordinator.start(LegacyLocalStorageProbe(this)) { outcome ->
      lastBootstrapOutcome = outcome
      requestFrameAndSchedule()
    }
  }

  fun retryBootstrapIfNeeded(onComplete: (BootstrapOutcome) -> Unit = {}) {
    if (nativeHandle == 0L) return
    val current = lastBootstrapOutcome
    if (current?.isComplete == true) {
      onComplete(current)
      return
    }
    if (current == null || !current.imported) {
      bootstrapCoordinator.start(LegacyLocalStorageProbe(this)) { outcome ->
        lastBootstrapOutcome = outcome
        requestFrameAndSchedule()
        onComplete(outcome)
      }
      return
    }
    val updated = bootstrapCoordinator.retryFailedWorkspaces(current)
    lastBootstrapOutcome = updated
    requestFrameAndSchedule()
    onComplete(updated)
  }

  override fun onStart() {
    super.onStart()
    frameLoopActive = true
    scheduleFrameIfNeeded()
  }

  override fun onStop() {
    frameLoopActive = false
    if (frameCallbackPosted) {
      Choreographer.getInstance().removeFrameCallback(this)
      frameCallbackPosted = false
    }
    if (nativeHandle != 0L) {
      NativeBridge.nativeStorageCheckpointAllPassive(nativeHandle)
    }
    super.onStop()
  }

  override fun onDestroy() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      backCallback?.let { onBackInvokedDispatcher.unregisterOnBackInvokedCallback(it) }
      backCallback = null
    }
    if (nativeHandle != 0L) {
      NativeBridge.nativeDestroyHost(nativeHandle)
      nativeHandle = 0L
    }
    super.onDestroy()
  }

  override fun doFrame(frameTimeNanos: Long) {
    frameCallbackPosted = false
    if (!frameLoopActive || !surfaceReady || nativeHandle == 0L) return
    NativeBridge.nativeOnFrameTick(nativeHandle, frameTimeNanos)
    scheduleFrameIfNeeded()
  }

  override fun surfaceCreated(holder: SurfaceHolder) {
    surfaceReady = true
    if (nativeHandle != 0L) {
      NativeBridge.nativeOnSurfaceCreated(nativeHandle, holder.surface)
      requestFrameAndSchedule()
    }
  }

  override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
    if (nativeHandle != 0L) {
      lastViewportWidthPx = width
      NativeBridge.nativeOnSurfaceChanged(nativeHandle, format, width, height)
      selectionCoordinator.setViewport(
        width.toFloat(),
        height.toFloat(),
        resources.displayMetrics.density,
      )
      val previewText = if (documentBufferController.isAutofillFocused()) {
        documentBufferController.currentDocumentText()
      } else {
        imeController.currentText()
      }
      syncShapedLayoutAndOverlay(previewText)
      if (surfaceReady && width > 0 && height > 0) {
        requestFrameAndSchedule()
      }
    }
  }

  private fun syncShapedLayoutAndOverlay(text: String) {
    if (syncingOverlay) return
    syncingOverlay = true
    try {
      val viewportW = if (lastViewportWidthPx > 0) {
        lastViewportWidthPx
      } else {
        resources.displayMetrics.widthPixels
      }
      val autofillFocused = documentBufferController.isAutofillFocused()
      val safeText = if (autofillFocused) {
        documentBufferController.currentDocumentText()
      } else {
        text
      }
      val selStart = if (autofillFocused) 0 else imeController.selectionStart()
      val selEnd = if (autofillFocused) 0 else imeController.selectionEnd()
      if (::selectionOverlayView.isInitialized) {
        selectionOverlayView.syncFromShapedLayout(
          text = safeText,
          selStart = selStart,
          selEnd = selEnd,
          viewportWidthPx = viewportW,
          density = resources.displayMetrics.density,
        )
      }
      if (::textPreviewView.isInitialized) {
        textPreviewView.invalidate()
      }
    } finally {
      syncingOverlay = false
    }
  }

  override fun surfaceDestroyed(holder: SurfaceHolder) {
    surfaceReady = false
    if (frameCallbackPosted) {
      Choreographer.getInstance().removeFrameCallback(this)
      frameCallbackPosted = false
    }
    if (nativeHandle != 0L) {
      NativeBridge.nativeOnSurfaceDestroyed(nativeHandle)
    }
  }

  private fun requestFrameAndSchedule() {
    if (nativeHandle == 0L) return
    NativeBridge.nativeRequestFrame(nativeHandle)
    scheduleFrameIfNeeded()
  }

  private fun scheduleFrameIfNeeded() {
    if (!frameLoopActive || !surfaceReady || frameCallbackPosted || nativeHandle == 0L) return
    if (NativeBridge.nativeHasPendingFrame(nativeHandle)) {
      frameCallbackPosted = true
      Choreographer.getInstance().postFrameCallback(this)
    }
  }

  @Suppress("DEPRECATION")
  override fun onBackPressed() {
    val consumed = backDispatcher.onLegacyBackPressed(invokeSystemExit = false)
    if (!consumed) {
      super.onBackPressed()
    }
  }

  private fun installInsetsBridge(root: View) {
    root.setOnApplyWindowInsetsListener { _, insets ->
      forwardInsets(insets)
      insets
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      root.setWindowInsetsAnimationCallback(
        object : WindowInsetsAnimation.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
          override fun onProgress(
            insets: WindowInsets,
            runningAnimations: MutableList<WindowInsetsAnimation>,
          ): WindowInsets {
            forwardInsets(insets)
            return insets
          }
        },
      )
    }
  }

  @Suppress("DEPRECATION")
  private fun forwardInsets(insets: WindowInsets) {
    if (nativeHandle == 0L) return
    val density = resources.displayMetrics.density
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val bars = insets.getInsets(
        WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout(),
      )
      val ime = insets.getInsets(WindowInsets.Type.ime())
      NativeBridge.nativeOnSurfaceInsetsPx(
        nativeHandle,
        bars.top,
        bars.right,
        bars.bottom,
        bars.left,
        ime.bottom,
        density,
      )
    } else {
      NativeBridge.nativeOnSurfaceInsetsPx(
        nativeHandle,
        insets.systemWindowInsetTop,
        insets.systemWindowInsetRight,
        insets.systemWindowInsetBottom,
        insets.systemWindowInsetLeft,
        0,
        density,
      )
    }
    requestFrameAndSchedule()
  }

  private fun installPredictiveBackBridge() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val callback = object : OnBackAnimationCallback {
        override fun onBackStarted(backEvent: BackEvent) {
          backDispatcher.onBackStarted(backEvent.progress)
        }

        override fun onBackProgressed(backEvent: BackEvent) {
          backDispatcher.onBackProgressed(backEvent.progress)
        }

        override fun onBackCancelled() {
          backDispatcher.onBackCancelled()
        }

        override fun onBackInvoked() {
          backDispatcher.onBackInvoked()
        }
      }
      backCallback = callback
      onBackInvokedDispatcher.registerOnBackInvokedCallback(
        OnBackInvokedDispatcher.PRIORITY_DEFAULT,
        callback,
      )
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val callback = OnBackInvokedCallback {
        backDispatcher.onLegacyBackPressed()
      }
      backCallback = callback
      onBackInvokedDispatcher.registerOnBackInvokedCallback(
        OnBackInvokedDispatcher.PRIORITY_DEFAULT,
        callback,
      )
    }
  }

  private fun configureAutofillIfSupported() {
    val platformBackend = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      NativeBridge.nativeShouldExposeAutofill(Build.VERSION.SDK_INT)
    ) {
      getSystemService(AutofillManager::class.java)?.let { manager ->
        SystemAutofillPlatformBackend(surfaceView, manager)
      }
    } else {
      null
    }
    autofillController = AndroidAutofillController(
      sdkInt = Build.VERSION.SDK_INT,
      handleProvider = { nativeHandle },
      backend = platformBackend,
      onMutated = { requestFrameAndSchedule() },
      onValueCommitted = { id, text ->
        if (autofillController?.focusedFieldId() == id) {
          applyAutofillTextToIme(text)
        }
      },
      onFocusedFieldTextSync = { _, text -> applyAutofillTextToIme(text) },
    )
  }

  fun navigateTo(destination: String): Boolean = backDispatcher.navigateTo(destination)

  fun openDocument(docId: String): Boolean = backDispatcher.openDocument(docId)

  fun readAutofillFormValues(): Map<String, String> =
    autofillController?.readFormValues() ?: emptyMap()

  private fun applyAutofillTextToIme(text: String) {
    if (nativeHandle == 0L) return
    documentBufferController.applyAutofillTextToIme(text)
  }

  fun registerAutofillField(
    autofillId: Int,
    kindCode: Int,
    left: Int,
    top: Int,
    right: Int,
    bottom: Int,
    masked: Boolean,
    valueLen: Int = 0,
  ): Boolean = autofillController?.registerField(
    autofillId,
    kindCode,
    left,
    top,
    right,
    bottom,
    masked,
    valueLen,
  ) ?: false

  fun focusAutofillField(autofillId: Int?) {
    documentBufferController.onAutofillFocusChanged(autofillId)
  }

  fun commitAutofillSession(): Boolean = documentBufferController.commitAutofillSession()

  fun cancelAutofillSession(): Boolean = documentBufferController.cancelAutofillSession()

  fun clearAutofillFields() {
    documentBufferController.clearAutofillFields()
  }
}
