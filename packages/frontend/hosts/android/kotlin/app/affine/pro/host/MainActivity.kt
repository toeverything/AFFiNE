package app.affine.pro.host

import android.app.Activity
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.text.InputType
import android.view.Choreographer
import android.view.KeyEvent
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsAnimation
import android.view.autofill.AutofillManager
import android.view.inputmethod.CompletionInfo
import android.view.inputmethod.CorrectionInfo
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.ExtractedText
import android.view.inputmethod.ExtractedTextRequest
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputContentInfo
import android.view.inputmethod.TextAttribute
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
  external fun nativeLegacyAppDataStoreSetString(filesDir: String, key: String, value: String): Boolean
  external fun nativeLegacyAppDataStoreGetString(filesDir: String, key: String): String?
  external fun nativePrepareAuthSessionJson(responseJson: String, nowMs: Long): String?
  external fun nativeValidateAuthSessionJson(storedJson: String): Boolean
  external fun nativeValidateV1Ciphertext(encoded: String): Boolean
  external fun nativeIsPermanentAuthErrorCode(code: String): Boolean
  external fun nativeExtractJsonStringField(json: String, field: String): String?
  external fun nativeJsonStringArrayLen(json: String): Int
  external fun nativeJsonStringArrayGet(json: String, index: Int): String?
}

/**
 * Pure Kotlin IME controller backed directly by `AndroidHostState` over JNI as
 * the single source of truth for text, selection, and composing spans.
 */
class AffineImeController(
  private val handleProvider: () -> Long,
  private val onMutated: () -> Unit,
) {
  constructor(handleProvider: () -> Long) : this(handleProvider, {})
  fun commitText(text: String, newCursorPosition: Int): Boolean {
    val handle = handleProvider()
    if (handle == 0L) return false
    NativeBridge.nativeOnCommitText(handle, text, newCursorPosition)
    onMutated()
    return true
  }

  fun setComposingText(text: String, newCursorPosition: Int): Boolean {
    val handle = handleProvider()
    if (handle == 0L) return false
    NativeBridge.nativeOnSetComposingText(handle, text, newCursorPosition)
    onMutated()
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
    return true
  }

  fun deleteSurroundingTextInCodePoints(beforeLength: Int, afterLength: Int): Boolean {
    val handle = handleProvider()
    if (handle == 0L || beforeLength < 0 || afterLength < 0) return false
    val ok = NativeBridge.nativeOnDeleteSurroundingTextInCodePoints(handle, beforeLength, afterLength)
    if (ok) onMutated()
    return ok
  }

  fun replaceText(start: Int, end: Int, text: String, newCursorPosition: Int): Boolean {
    val handle = handleProvider()
    if (handle == 0L || start < 0 || end < 0) return false
    val ok = NativeBridge.nativeOnReplaceText(handle, start, end, text, newCursorPosition)
    if (ok) onMutated()
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
class AffineInputConnection(private val ime: AffineImeController) : InputConnection {
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

  override fun performContextMenuAction(id: Int): Boolean = false

  override fun performPrivateCommand(action: String?, data: Bundle?): Boolean = false

  override fun sendKeyEvent(event: KeyEvent?): Boolean = false

  override fun clearMetaKeyStates(states: Int): Boolean = false

  override fun reportFullscreenMode(enabled: Boolean): Boolean = false

  override fun requestCursorUpdates(cursorUpdateMode: Int): Boolean = false
}

internal class AffineSurfaceView(
  context: Context,
  private val handleProvider: () -> Long,
  private val onMutated: () -> Unit = {},
) : SurfaceView(context) {
  init {
    isFocusable = true
    isFocusableInTouchMode = true
  }

  override fun onCheckIsTextEditor(): Boolean = true

  override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection =
    createInputConnection(handleProvider, outAttrs, onMutated)

  companion object {
    internal fun createInputConnection(
      handleProvider: () -> Long,
      outAttrs: EditorInfo? = null,
      onMutated: () -> Unit = {},
    ): InputConnection {
      val ime = AffineImeController(handleProvider, onMutated)
      if (outAttrs != null) {
        outAttrs.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
        outAttrs.imeOptions = EditorInfo.IME_FLAG_NO_EXTRACT_UI
        outAttrs.initialSelStart = ime.selectionStart()
        outAttrs.initialSelEnd = ime.selectionEnd()
      }
      return AffineInputConnection(ime)
    }
  }
}

class MainActivity : Activity(), SurfaceHolder.Callback, Choreographer.FrameCallback {
  private var nativeHandle: Long = 0L
  private lateinit var surfaceView: AffineSurfaceView
  private lateinit var bootstrapCoordinator: AndroidBootstrapCoordinator
  @Volatile
  var lastBootstrapOutcome: BootstrapOutcome? = null
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
    surfaceView = AffineSurfaceView(
      context = this,
      handleProvider = { nativeHandle },
      onMutated = { requestFrameAndSchedule() },
    ).apply {
      holder.addCallback(this@MainActivity)
    }
    setContentView(surfaceView)

    installInsetsBridge(surfaceView)
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
      NativeBridge.nativeOnSurfaceChanged(nativeHandle, format, width, height)
      if (surfaceReady && width > 0 && height > 0) {
        requestFrameAndSchedule()
      }
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
    val consumed = nativeHandle != 0L && NativeBridge.nativeOnBackGesturePhase(nativeHandle, 3, 1f)
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
          if (nativeHandle != 0L) {
            NativeBridge.nativeOnBackGesturePhase(nativeHandle, 0, backEvent.progress)
            requestFrameAndSchedule()
          }
        }

        override fun onBackProgressed(backEvent: BackEvent) {
          if (nativeHandle != 0L) {
            NativeBridge.nativeOnBackGesturePhase(nativeHandle, 1, backEvent.progress)
            requestFrameAndSchedule()
          }
        }

        override fun onBackCancelled() {
          if (nativeHandle != 0L) {
            NativeBridge.nativeOnBackGesturePhase(nativeHandle, 2, 0f)
            requestFrameAndSchedule()
          }
        }

        override fun onBackInvoked() {
          val consumed = nativeHandle != 0L && NativeBridge.nativeOnBackGesturePhase(nativeHandle, 3, 1f)
          if (consumed) {
            requestFrameAndSchedule()
          } else {
            finish()
          }
        }
      }
      backCallback = callback
      onBackInvokedDispatcher.registerOnBackInvokedCallback(
        OnBackInvokedDispatcher.PRIORITY_DEFAULT,
        callback,
      )
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val callback = OnBackInvokedCallback {
        val consumed = nativeHandle != 0L && NativeBridge.nativeOnBackGesturePhase(nativeHandle, 3, 1f)
        if (!consumed) {
          finish()
        }
      }
      backCallback = callback
      onBackInvokedDispatcher.registerOnBackInvokedCallback(
        OnBackInvokedDispatcher.PRIORITY_DEFAULT,
        callback,
      )
    }
  }

  private fun configureAutofillIfSupported() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      NativeBridge.nativeShouldExposeAutofill(Build.VERSION.SDK_INT)
    ) {
      getSystemService(AutofillManager::class.java)
    }
  }
}
