import android.view.inputmethod.InputConnection
import app.affine.pro.host.AffineImeController
import app.affine.pro.host.AffineSurfaceView
import app.affine.pro.host.AndroidAutofillController
import app.affine.pro.host.AndroidBackDispatcher
import app.affine.pro.host.AndroidBootstrapCoordinator
import app.affine.pro.host.AndroidCookieCleaner
import app.affine.pro.host.AndroidPdfPageRenderer
import app.affine.pro.host.AndroidSelectionCoordinator
import app.affine.pro.host.AuthSessionStore
import app.affine.pro.host.AuthTokenCipher
import app.affine.pro.host.AutofillPlatformBackend
import app.affine.pro.host.CaretBounds
import app.affine.pro.host.CookieCleaner
import app.affine.pro.host.HostClipboard
import app.affine.pro.host.HostDocumentBufferController
import app.affine.pro.host.HostDocumentStore
import app.affine.pro.host.HttpUrlConnectionRefreshTransport
import app.affine.pro.host.InMemoryAesKeyProvider
import app.affine.pro.host.LegacyLocalStorageProbe
import app.affine.pro.host.NativeBridge
import app.affine.pro.host.PdfPageBackend
import app.affine.pro.host.RefreshResult
import app.affine.pro.host.RefreshTransport
import app.affine.pro.host.Rfc4648Base64
import app.affine.pro.host.SelectionGestureController
import app.affine.pro.host.SessionPersistence
import app.affine.pro.host.TextLayoutAuthority
import java.io.File
import java.net.ServerSocket
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

private fun checkEq(actual: Any?, expected: Any?, label: String) {
  if (actual != expected) {
    throw AssertionError("$label: expected=<$expected> actual=<$actual>")
  }
}

private fun withHost(block: (InputConnection, AffineImeController) -> Unit) {
  val handle = NativeBridge.nativeCreateHost()
  checkEq(handle != 0L, true, "nativeCreateHost returned non-zero handle")
  try {
    val ic = AffineSurfaceView.createInputConnection({ handle })
    val ime = AffineImeController { handle }
    block(ic, ime)
  } finally {
    NativeBridge.nativeDestroyHost(handle)
  }
}

fun main() {
  // 1. Empty editor: commitText("AB", 1) persists and is readable via getTextBeforeCursor(2, 0).
  withHost { ic, ime ->
    checkEq(ic.commitText("AB", 1), true, "seq1 commitText")
    checkEq(ime.readText(), "AB", "seq1 text")
    checkEq(ic.getTextBeforeCursor(2, 0), "AB", "seq1 getTextBeforeCursor")
    checkEq(ime.selectionStart(), 2, "seq1 selStart")
    checkEq(ime.selectionEnd(), 2, "seq1 selEnd")
    checkEq(ime.composingStart(), -1, "seq1 compStart")
    checkEq(ime.composingEnd(), -1, "seq1 compEnd")
  }

  // 2. Empty editor: setComposingText("ab", 1) -> deleteSurroundingText(1, 0) keeps "ab" & composing (0, 2).
  withHost { ic, ime ->
    checkEq(ic.setComposingText("ab", 1), true, "seq2 setComposingText")
    checkEq(ic.deleteSurroundingText(1, 0), true, "seq2 deleteSurroundingText")
    checkEq(ime.readText(), "ab", "seq2 text")
    checkEq(ic.getTextBeforeCursor(2, 0), "ab", "seq2 getTextBeforeCursor")
    checkEq(ime.selectionStart(), 2, "seq2 selStart")
    checkEq(ime.selectionEnd(), 2, "seq2 selEnd")
    checkEq(ime.composingStart(), 0, "seq2 compStart")
    checkEq(ime.composingEnd(), 2, "seq2 compEnd")
  }

  // 3. "x" + setComposingText("ab", 1) -> deleteSurroundingText(1, 0) -> commitText("中", 1).
  withHost { ic, ime ->
    checkEq(ic.commitText("x", 1), true, "seq3 commit x")
    checkEq(ic.setComposingText("ab", 1), true, "seq3 composing ab")
    checkEq(ic.deleteSurroundingText(1, 0), true, "seq3 delete before composing")
    checkEq(ime.readText(), "ab", "seq3 text after delete")
    checkEq(ime.composingStart(), 0, "seq3 compStart after delete")
    checkEq(ime.composingEnd(), 2, "seq3 compEnd after delete")
    checkEq(ic.commitText("中", 1), true, "seq3 commit 中")
    checkEq(ime.readText(), "中", "seq3 text after commit")
    checkEq(ic.getTextBeforeCursor(1, 0), "中", "seq3 getTextBeforeCursor")
    checkEq(ime.selectionStart(), 1, "seq3 selStart")
    checkEq(ime.selectionEnd(), 1, "seq3 selEnd")
    checkEq(ime.composingStart(), -1, "seq3 compStart")
    checkEq(ime.composingEnd(), -1, "seq3 compEnd")
  }

  // 4. Negative deleteSurroundingText(-1, 1) and (1, -1) on "a😀b" return false with zero mutation.
  withHost { ic, ime ->
    checkEq(ic.commitText("a😀b", 1), true, "seq4 commit emoji")
    checkEq(ic.deleteSurroundingText(-1, 1), false, "seq4 negative before")
    checkEq(ic.deleteSurroundingText(1, -1), false, "seq4 negative after")
    checkEq(ime.readText(), "a😀b", "seq4 unchanged text")
  }

  // 5. Emoji surrogate-pair boundary: "a😀b" -> setSelection(3, 3) -> deleteSurroundingText(1, 0) => "ab".
  withHost { ic, ime ->
    checkEq(ic.commitText("a😀b", 1), true, "seq5 commit emoji")
    checkEq(ic.setSelection(3, 3), true, "seq5 setSelection after emoji")
    checkEq(ic.deleteSurroundingText(1, 0), true, "seq5 delete emoji")
    checkEq(ime.readText(), "ab", "seq5 text")
    checkEq(ic.getTextBeforeCursor(2, 0), "a", "seq5 before cursor")
    checkEq(ic.getTextAfterCursor(2, 0), "b", "seq5 after cursor")
    checkEq(ime.selectionStart(), 1, "seq5 selStart")
    checkEq(ime.selectionEnd(), 1, "seq5 selEnd")
    checkEq(ic.setSelection(0, 1), true, "seq5 select a")
    checkEq(ic.getSelectedText(0), "a", "seq5 getSelectedText")
  }

  // 6. setComposingRegion: mark, commit over region, clear with empty range, normalize reversed range.
  withHost { ic, ime ->
    checkEq(ic.commitText("AB", 1), true, "seq6 commit AB")
    checkEq(ic.setComposingRegion(0, 1), true, "seq6 setComposingRegion(0, 1)")
    checkEq(ime.composingStart(), 0, "seq6 compStart")
    checkEq(ime.composingEnd(), 1, "seq6 compEnd")
    checkEq(ime.selectionStart(), 2, "seq6 selStart unchanged")
    checkEq(ic.commitText("X", 1), true, "seq6 commit X over composing")
    checkEq(ime.readText(), "XB", "seq6 text XB")
    checkEq(ime.selectionStart(), 1, "seq6 cursor 1")
    checkEq(ime.composingStart(), -1, "seq6 composing cleared")
    checkEq(ime.composingEnd(), -1, "seq6 composing end cleared")
    checkEq(ic.setComposingRegion(2, 0), true, "seq6 reversed setComposingRegion(2, 0)")
    checkEq(ime.composingStart(), 0, "seq6 normalized compStart")
    checkEq(ime.composingEnd(), 2, "seq6 normalized compEnd")
    checkEq(ic.setComposingRegion(1, 1), true, "seq6 empty setComposingRegion(1, 1)")
    checkEq(ime.composingStart(), -1, "seq6 cleared compStart")
    checkEq(ime.composingEnd(), -1, "seq6 cleared compEnd")
  }

  // 7. deleteSurroundingTextInCodePoints backward and forward over emoji surrogate pair.
  withHost { ic, ime ->
    checkEq(ic.commitText("a😀b", 1), true, "seq7 commit emoji")
    checkEq(ic.setSelection(3, 3), true, "seq7 setSelection(3, 3)")
    checkEq(ic.deleteSurroundingTextInCodePoints(1, 0), true, "seq7 delete backward code point")
    checkEq(ime.readText(), "ab", "seq7 text after backward delete")
    checkEq(ic.getTextBeforeCursor(2, 0), "a", "seq7 before cursor")
    checkEq(ic.getTextAfterCursor(2, 0), "b", "seq7 after cursor")
    checkEq(ime.selectionStart(), 1, "seq7 selStart")
    checkEq(ime.selectionEnd(), 1, "seq7 selEnd")
  }
  withHost { ic, ime ->
    checkEq(ic.commitText("a😀b", 1), true, "seq7b commit emoji")
    checkEq(ic.setSelection(1, 1), true, "seq7b setSelection(1, 1)")
    checkEq(ic.deleteSurroundingTextInCodePoints(0, 1), true, "seq7b delete forward code point")
    checkEq(ime.readText(), "ab", "seq7b text after forward delete")
    checkEq(ime.selectionStart(), 1, "seq7b selStart")
    checkEq(ime.selectionEnd(), 1, "seq7b selEnd")
  }

  // 8. replaceText clears composing and unsupported write entrypoints return false with zero mutation.
  withHost { ic, ime ->
    checkEq(ic.commitText("hello", 1), true, "seq8 commit hello")
    checkEq(ic.setComposingRegion(0, 2), true, "seq8 setComposingRegion(0, 2)")
    checkEq(ic.replaceText(1, 4, "i", 1, null), true, "seq8 replaceText")
    checkEq(ime.readText(), "hio", "seq8 text hio")
    checkEq(ime.composingStart(), -1, "seq8 composing cleared")
    checkEq(ime.composingEnd(), -1, "seq8 composing end cleared")
    checkEq(ime.selectionStart(), 2, "seq8 selStart 2")
    checkEq(ime.selectionEnd(), 2, "seq8 selEnd 2")
    checkEq(ic.commitCorrection(null), false, "seq8 commitCorrection unsupported")
    checkEq(ic.commitCompletion(null), false, "seq8 commitCompletion unsupported")
    checkEq(ic.performContextMenuAction(0), false, "seq8 performContextMenuAction unsupported")
    checkEq(ic.sendKeyEvent(null), false, "seq8 sendKeyEvent unsupported")
    checkEq(ime.readText(), "hio", "seq8 unchanged text after unsupported calls")
    checkEq(ime.selectionStart(), 2, "seq8 unchanged selStart")
    checkEq(ime.selectionEnd(), 2, "seq8 unchanged selEnd")
  }

  // 9. Int.MAX_VALUE, zero, and negative length cursor queries do not overflow.
  withHost { ic, _ ->
    checkEq(ic.commitText("AB", 1), true, "seq9 commit AB")
    checkEq(ic.setSelection(1, 1), true, "seq9 setSelection(1, 1)")
    checkEq(ic.getTextAfterCursor(Int.MAX_VALUE, 0), "B", "seq9 after Int.MAX_VALUE")
    checkEq(ic.getTextBeforeCursor(Int.MAX_VALUE, 0), "A", "seq9 before Int.MAX_VALUE")
    checkEq(ic.getTextAfterCursor(0, 0), "", "seq9 after 0")
    checkEq(ic.getTextAfterCursor(-5, 0), "", "seq9 after -5")
    checkEq(ic.getTextBeforeCursor(0, 0), "", "seq9 before 0")
    checkEq(ic.getTextBeforeCursor(-5, 0), "", "seq9 before -5")
  }

  // 10. Closing an InputConnection finishes active composing so a reopened connection appends cleanly.
  val reconnectHandle = NativeBridge.nativeCreateHost()
  checkEq(reconnectHandle != 0L, true, "seq10 nativeCreateHost returned non-zero handle")
  try {
    val ime = AffineImeController { reconnectHandle }
    val ic1 = AffineSurfaceView.createInputConnection({ reconnectHandle })
    checkEq(ic1.commitText("AB", 1), true, "seq10 commit AB")
    checkEq(ic1.setComposingRegion(0, 1), true, "seq10 setComposingRegion(0, 1)")
    ic1.closeConnection()
    checkEq(ime.composingStart(), -1, "seq10 compStart after closeConnection")
    checkEq(ime.composingEnd(), -1, "seq10 compEnd after closeConnection")
    checkEq(ime.readText(), "AB", "seq10 text after closeConnection")
    checkEq(ime.selectionStart(), 2, "seq10 selStart after closeConnection")
    checkEq(ime.selectionEnd(), 2, "seq10 selEnd after closeConnection")

    val ic2 = AffineSurfaceView.createInputConnection({ reconnectHandle })
    checkEq(ic2.commitText("X", 1), true, "seq10 commit X on reopened connection")
    checkEq(ime.readText(), "ABX", "seq10 text ABX")
    checkEq(ic2.getTextBeforeCursor(3, 0), "ABX", "seq10 getTextBeforeCursor ABX")
    checkEq(ime.selectionStart(), 3, "seq10 selStart 3")
    checkEq(ime.selectionEnd(), 3, "seq10 selEnd 3")
  } finally {
    NativeBridge.nativeDestroyHost(reconnectHandle)
  }

  // 11. S2 Surface lifecycle: detached ticks return 0, pending frame survives surfaceDestroyed.
  val surfaceHandle = NativeBridge.nativeCreateHost()
  try {
    checkEq(NativeBridge.nativeIsSurfaceReady(surfaceHandle), false, "seq11 initial surface not ready")
    checkEq(NativeBridge.nativeOnFrameTick(surfaceHandle, 16_000_000L), 0, "seq11 detached tick 0")
    NativeBridge.nativeOnSurfaceChanged(surfaceHandle, 1, 1080, 2400)
    checkEq(NativeBridge.nativeIsSurfaceReady(surfaceHandle), false, "seq11 unbound surface not ready")
    NativeBridge.nativeOnSurfaceDestroyed(surfaceHandle)
    checkEq(NativeBridge.nativeHasPendingFrame(surfaceHandle), true, "seq11 pending frame preserved")
  } finally {
    NativeBridge.nativeDestroyHost(surfaceHandle)
  }

  // 12. S2 Legacy localStorage probe scripts actively hook indexedDB.open & deleteDatabase,
  //     use real 0.27.5 allowlist keys, enforce zero-IDB import, allowlist-only SQLite WAL co-storage,
  //     and rollback write-back with both setEntries and removeKeys.
  checkEq(LegacyLocalStorageProbe.isAllowedKey("affine-local-workspace"), true, "seq12 allow affine-local-workspace")
  checkEq(LegacyLocalStorageProbe.isAllowedKey("global-state:serverConfig:self-host"), true, "seq12 allow serverConfig")
  checkEq(LegacyLocalStorageProbe.isAllowedKey("global-state:cloud-auth"), true, "seq12 allow global-state auth")
  checkEq(LegacyLocalStorageProbe.isAllowedKey("global-state:cloud-workspace:acct-1"), true, "seq12 allow cloud-workspace cache")
  checkEq(LegacyLocalStorageProbe.isAllowedKey("global-state:selfhosted-workspace-s1:acct-1"), true, "seq12 allow selfhosted-workspace cache")
  checkEq(LegacyLocalStorageProbe.isAllowedKey("affine-flag:enable_ai"), true, "seq12 allow affine-flag")
  checkEq(LegacyLocalStorageProbe.isAllowedKey("affine_theme"), false, "seq12 reject fictional affine_theme")
  checkEq(LegacyLocalStorageProbe.isAllowedKey("affine_server_url"), false, "seq12 reject fictional affine_server_url")

  val captureJs = LegacyLocalStorageProbe.buildCaptureScript()
  checkEq(captureJs.contains("window.indexedDB"), true, "seq12 capture hooks window.indexedDB")
  checkEq(captureJs.contains("'open'"), true, "seq12 capture blocks indexedDB.open")
  checkEq(captureJs.contains("'deleteDatabase'"), true, "seq12 capture blocks indexedDB.deleteDatabase")
  val writeBackJs = LegacyLocalStorageProbe.buildWriteBackScript(
    setEntries = mapOf("affine-local-workspace" to "[\"ws-live\"]", "theme" to "dark"),
    removeKeys = listOf("last_workspace_id"),
  )
  checkEq(writeBackJs.contains("window.localStorage.setItem"), true, "seq12 writeback uses localStorage.setItem")
  checkEq(writeBackJs.contains("window.localStorage.removeItem"), true, "seq12 writeback uses localStorage.removeItem")
  checkEq(writeBackJs.contains("'deleteDatabase'"), true, "seq12 writeback blocks indexedDB.deleteDatabase")
  checkEq(writeBackJs.contains("AFFINE_WRITEBACK_REMOVE_FORBIDDEN"), true, "seq12 writeback has inline JS allowlist guard")

  // Non-allowlisted removeKeys must throw immediately in buildWriteBackScript before touching localStorage.
  var rejectedRemoveThrew = false
  try {
    LegacyLocalStorageProbe.buildWriteBackScript(
      setEntries = mapOf("theme" to "dark"),
      removeKeys = listOf("unrelated.pref"),
    )
  } catch (_: IllegalArgumentException) {
    rejectedRemoveThrew = true
  }
  checkEq(rejectedRemoveThrew, true, "seq12 non-allowlisted removeKeys rejected by buildWriteBackScript")

  val tmpDir = Files.createTempDirectory("affine-s2-android-parity").toFile()
  val s2Handle = NativeBridge.nativeCreateHost()
  try {
    // Seed a deleted residual .db file on disk (must NEVER be resurrected).
    val residualDir = File(tmpDir, "workspaces/workspace/local")
    residualDir.mkdirs()
    File(residualDir, "ws-deleted.db").writeBytes(byteArrayOf(1, 2, 3))

    // Un-imported host rejects local workspace open and blocks default workspace creation.
    checkEq(
      NativeBridge.nativeConnectWorkspace(s2Handle, tmpDir.absolutePath, "local", "ws-live"),
      null,
      "seq12 un-imported host blocks local workspace open",
    )
    checkEq(NativeBridge.nativeCanCreateDefaultWorkspace(s2Handle), false, "seq12 pending blocks default")
    checkEq(
      NativeBridge.nativeImportLegacyLocalStorageProbe(s2Handle, "null", ""),
      false,
      "seq12 null probe rejected",
    )
    checkEq(NativeBridge.nativeCanCreateDefaultWorkspace(s2Handle), false, "seq12 failed probe blocks default")

    // Any IDB touch, non-allowlisted entry, or missing allowlisted entry is rejected.
    val idbViolated = """{"origin":"https://localhost","length":1,"keys":["affine-local-workspace"],"entries":{"affine-local-workspace":"[\"ws-live\"]"},"idbTouchCount":1}"""
    checkEq(
      NativeBridge.nativeImportLegacyLocalStorageProbe(s2Handle, idbViolated, ""),
      false,
      "seq12 idbTouchCount>0 rejected",
    )
    val badKeySentinel = """{"origin":"https://localhost","length":1,"keys":["affine_theme"],"entries":{"affine_theme":"dark"},"idbTouchCount":0}"""
    checkEq(
      NativeBridge.nativeImportLegacyLocalStorageProbe(s2Handle, badKeySentinel, ""),
      false,
      "seq12 fictional key in entries rejected",
    )
    val missingEntrySentinel = """{"origin":"https://localhost","length":1,"keys":["affine-local-workspace"],"entries":{},"idbTouchCount":0}"""
    checkEq(
      NativeBridge.nativeImportLegacyLocalStorageProbe(s2Handle, missingEntrySentinel, ""),
      false,
      "seq12 allowlisted key missing from entries rejected",
    )

    // Genuine fresh install with unrelated Capacitor/a11y noise keys filtered through Rust JNI.
    val rawFreshWithNoise = """{"origin":"https://localhost","length":2,"keys":["CapacitorStorage.foo","ally-supports-cache"],"entries":{"CapacitorStorage.foo":"bar","ally-supports-cache":"1"},"idbTouchCount":0}"""
    val freshWithNoise = LegacyLocalStorageProbe.filterSnapshotEntries(rawFreshWithNoise)!!
    checkEq(freshWithNoise.contains(""""entries":{}"""), true, "seq12 pure noise entries stripped to {}")
    checkEq(
      NativeBridge.nativeImportLegacyLocalStorageProbe(s2Handle, freshWithNoise, ""),
      true,
      "seq12 fresh sentinel with noise accepted",
    )
    checkEq(NativeBridge.nativeCanCreateDefaultWorkspace(s2Handle), true, "seq12 fresh with noise allows default")

    // Existing user who deleted all local workspaces ("affine-local-workspace": "[]") -> Imported, NOT FreshInstall.
    val deletedAllSentinel = """{"origin":"https://localhost","length":1,"keys":["affine-local-workspace"],"entries":{"affine-local-workspace":"[]"},"idbTouchCount":0}"""
    checkEq(
      NativeBridge.nativeImportLegacyLocalStorageProbe(s2Handle, deletedAllSentinel, ""),
      true,
      "seq12 deleted-all sentinel accepted",
    )
    checkEq(NativeBridge.nativeCanCreateDefaultWorkspace(s2Handle), false, "seq12 deleted-all blocks default")

    // Mixed 1 allowlisted key + 1 unrelated noise key filtered through Rust JNI.
    val rawMixedNoise = """{"origin":"https://localhost","length":2,"keys":["affine-local-workspace","__cap_noise__"],"entries":{"affine-local-workspace":"[\"ws-live\"]","__cap_noise__":"junk"},"idbTouchCount":0}"""
    val mixedNoiseSentinel = LegacyLocalStorageProbe.filterSnapshotEntries(rawMixedNoise)!!
    checkEq(
      NativeBridge.nativeImportLegacyLocalStorageProbe(s2Handle, mixedNoiseSentinel, ""),
      true,
      "seq12 mixed allowlisted+noise sentinel accepted",
    )
    checkEq(
      NativeBridge.nativeGetAllowlistedWorkspaceIdsJson(s2Handle),
      """["ws-live"]""",
      "seq12 mixed sentinel workspace ids",
    )
    val rawReadbackWithNoise = """{"origin":"https://localhost","length":2,"keys":["__cap_noise__","affine-local-workspace"],"entries":{"__cap_noise__":"junk","affine-local-workspace":"[\"ws-live\"]"},"removedKeys":[],"verified":true,"idbTouchCount":0}"""
    val filteredReadback = LegacyLocalStorageProbe.filterSnapshotEntries(rawReadbackWithNoise)!!
    checkEq(
      NativeBridge.nativeVerifyLegacyWriteBack(
        """{"affine-local-workspace":"[\"ws-live\"]"}""",
        "[]",
        filteredReadback,
      ),
      true,
      "seq12 filtered mixed rollback readback verified",
    )

    // Upgrade payload with allowlisted workspace IDs, dynamic keys, and 1 unrelated noise key (length=4, keys.len=4).
    val upgradeSentinel = """{"origin":"https://localhost","length":4,"keys":["__cap_noise__","affine-local-workspace","global-state:serverConfig:self-host","theme"],"entries":{"affine-local-workspace":"[\"ws-live\"]","global-state:serverConfig:self-host":"{\"url\":\"https://self.example\"}","theme":"dark"},"removedKeys":["last_workspace_id"],"idbTouchCount":0}"""
    checkEq(
      NativeBridge.nativeImportLegacyLocalStorageProbe(s2Handle, upgradeSentinel, ""),
      true,
      "seq12 upgrade sentinel accepted",
    )
    checkEq(NativeBridge.nativeCanCreateDefaultWorkspace(s2Handle), false, "seq12 upgrade blocks default")
    checkEq(
      NativeBridge.nativeGetAllowlistedWorkspaceIdsJson(s2Handle),
      """["ws-live"]""",
      "seq12 allowlisted workspace ids",
    )

    // F1: deleted residual .db is rejected; allowlisted workspace & userspace connect in place.
    checkEq(
      NativeBridge.nativeConnectWorkspace(s2Handle, tmpDir.absolutePath, "local", "ws-deleted"),
      null,
      "seq12 deleted workspace rejected (zero resurrection)",
    )
    val wsKey = NativeBridge.nativeConnectWorkspace(s2Handle, tmpDir.absolutePath, "local", "ws-live")
    checkEq(wsKey != null, true, "seq12 allowlisted workspace connected")
    val emptyUpdateB64 = Rfc4648Base64.encode(byteArrayOf(0, 0))
    val pushedTs = NativeBridge.nativeStoragePushUpdateB64(
      s2Handle,
      wsKey!!,
      "doc-1",
      emptyUpdateB64,
      1_795_597_759_000L,
    )
    checkEq(pushedTs >= 1_795_597_759_000L, true, "seq12 sqlite push_update persisted")
    checkEq(NativeBridge.nativeStorageGetDocB64(s2Handle, wsKey, "doc-1"), emptyUpdateB64, "seq12 sqlite get_doc roundtrip")
    checkEq(NativeBridge.nativeStorageCheckpoint(s2Handle, wsKey), true, "seq12 sqlite checkpoint")

    // Cloud workspace (peer != "local") opens directly without membership in affine-local-workspace.
    val cloudWsKey = NativeBridge.nativeConnectWorkspace(
      s2Handle,
      tmpDir.absolutePath,
      "https://app.affine.pro",
      "ws-cloud-99",
    )
    checkEq(cloudWsKey != null, true, "seq12 cloud workspace connected")
    checkEq(
      File(tmpDir, "workspaces/workspace/https_app.affine.pro/ws-cloud-99.db").exists(),
      true,
      "seq12 cloud workspace db path matches 0.27.5 sanitization",
    )

    val userKey = NativeBridge.nativeOpenUserspace(
      s2Handle,
      tmpDir.absolutePath,
      "https://app.affine.pro/",
      "user-1",
    )
    checkEq(userKey != null, true, "seq12 userspace connected")
    checkEq(
      File(tmpDir, "workspaces/userspace/https_app.affine.pro/user-1.db").exists(),
      true,
      "seq12 userspace db path matches 0.27.5 sanitization",
    )
    // Simulate MainActivity.onStop() non-blocking PASSIVE checkpoint across all open DBs.
    checkEq(
      NativeBridge.nativeStorageCheckpointAllPassive(s2Handle),
      3,
      "seq12 checkpointAllPassive covers local + cloud workspace + userspace",
    )
    checkEq(NativeBridge.nativeStorageClose(s2Handle, wsKey), true, "seq12 sqlite close")
    checkEq(NativeBridge.nativeStorageClose(s2Handle, cloudWsKey!!), true, "seq12 cloud ws close")
    checkEq(NativeBridge.nativeStorageClose(s2Handle, userKey!!), true, "seq12 userspace close")

    // 12b. AndroidBootstrapCoordinator end-to-end: mount legacy DB -> read doc -> onStop checkpoint,
    //      plus empty-list zero mounts and corrupt raw string preservation.
    val bootHandle = NativeBridge.nativeCreateHost()
    try {
      val coordinator = AndroidBootstrapCoordinator({ bootHandle }, { tmpDir.absolutePath })
      val bootUpgrade = coordinator.completeWithProbePayload(upgradeSentinel)
      checkEq(bootUpgrade.imported, true, "seq12b bootstrap imported")
      checkEq(bootUpgrade.connectedWorkspaceKeys.size, 1, "seq12b mounted 1 allowlisted workspace")
      val mountedKey = bootUpgrade.connectedWorkspaceKeys[0]
      checkEq(
        NativeBridge.nativeStorageGetDocB64(bootHandle, mountedKey, "doc-1"),
        emptyUpdateB64,
        "seq12b bootstrap read existing doc from mounted DB",
      )
      checkEq(
        NativeBridge.nativeStorageCheckpointAllPassive(bootHandle),
        1,
        "seq12b onStop passive checkpoint hit mounted DB",
      )

      // Empty list -> zero mounts, evicts previously mounted local DB, and rollback emits "[]" (canCreateDefault=false).
      val bootEmpty = coordinator.completeWithProbePayload(deletedAllSentinel)
      checkEq(bootEmpty.imported, true, "seq12b empty list imported")
      checkEq(bootEmpty.connectedWorkspaceKeys.isEmpty(), true, "seq12b empty list zero mounts")
      checkEq(NativeBridge.nativeStorageCheckpointAllPassive(bootHandle), 0, "seq12b evicted old local DB")
      val emptyWriteback = NativeBridge.nativePlanLegacyLocalStorageWriteBack(bootHandle)
      checkEq(emptyWriteback != null && emptyWriteback.contains("\"affine-local-workspace\":\"[]\""), true, "seq12b empty imported list emits []")
      checkEq(NativeBridge.nativeCanCreateDefaultWorkspace(bootHandle), false, "seq12b empty imported list canCreateDefault=false")

      // True FreshInstall (missing affine-local-workspace key) -> rollback emits empty setEntries (canCreateDefault=true preserved).
      val freshEmptySentinel = """{"origin":"https://localhost","length":0,"keys":[],"entries":{},"idbTouchCount":0}"""
      val bootFresh = coordinator.completeWithProbePayload(freshEmptySentinel)
      checkEq(bootFresh.imported, true, "seq12b fresh install imported")
      checkEq(NativeBridge.nativeCanCreateDefaultWorkspace(bootHandle), true, "seq12b fresh install canCreateDefault=true")
      val freshWriteback = NativeBridge.nativePlanLegacyLocalStorageWriteBack(bootHandle)
      checkEq(freshWriteback != null && !freshWriteback.contains("affine-local-workspace"), true, "seq12b fresh install writeback omits affine-local-workspace")

      // Corrupt affine-local-workspace JSON -> zero mounts & preserves raw "{broken" string.
      val corruptWsSentinel = """{"origin":"https://localhost","length":1,"keys":["affine-local-workspace"],"entries":{"affine-local-workspace":"{broken"},"idbTouchCount":0}"""
      val bootCorrupt = coordinator.completeWithProbePayload(corruptWsSentinel)
      checkEq(bootCorrupt.imported, true, "seq12b corrupt list imported safely")
      checkEq(bootCorrupt.connectedWorkspaceKeys.isEmpty(), true, "seq12b corrupt list zero mounts")
      checkEq(bootCorrupt.isComplete, true, "seq12b corrupt list has zero failed allowlist ids")
      checkEq(bootCorrupt.preservedLocalWorkspaceRaw, "{broken", "seq12b corrupt raw string preserved")

      // Partial mount failure: ["ws-ok", "../bad-id"] exposes failedWorkspaceIds,
      // gates rollback write-back, and pruning the allowlist to ["ws-ok"] + retry lifts the gate.
      val partialFailSentinel = """{"origin":"https://localhost","length":1,"keys":["affine-local-workspace"],"entries":{"affine-local-workspace":"[\"ws-ok\",\"../bad-id\"]"},"idbTouchCount":0}"""
      val bootPartial = coordinator.completeWithProbePayload(partialFailSentinel)
      checkEq(bootPartial.imported, true, "seq12b partial failure still imported")
      checkEq(bootPartial.connectedWorkspaceKeys.size, 1, "seq12b healthy ws-ok mounted")
      checkEq(bootPartial.connectedWorkspaceKeys[0].contains("ws-ok"), true, "seq12b mounted key is ws-ok")
      checkEq(bootPartial.failedWorkspaceIds, listOf("../bad-id"), "seq12b failedWorkspaceIds recorded")
      checkEq(bootPartial.isComplete, false, "seq12b partial failure isComplete=false")
      checkEq(
        NativeBridge.nativePlanLegacyLocalStorageWriteBack(bootHandle),
        null,
        "seq12b rollback writeback gated while mount failure unresolved",
      )

      // Update allowlist to ["ws-ok"] and retry: ws-ok stays alive, obsolete ../bad-id pruned, writeback unblocked.
      val fixedAllowlistSentinel = """{"origin":"https://localhost","length":1,"keys":["affine-local-workspace"],"entries":{"affine-local-workspace":"[\"ws-ok\"]"},"idbTouchCount":0}"""
      checkEq(
        NativeBridge.nativeImportLegacyLocalStorageProbe(bootHandle, fixedAllowlistSentinel, ""),
        true,
        "seq12b updated allowlist imported",
      )
      val bootPruned = coordinator.retryFailedWorkspaces(bootPartial)
      checkEq(bootPruned.isComplete, true, "seq12b pruned retry isComplete=true")
      checkEq(bootPruned.failedWorkspaceIds.isEmpty(), true, "seq12b obsolete failed id dropped")
      checkEq(bootPruned.connectedWorkspaceKeys.size, 1, "seq12b ws-ok handle preserved")
      val unblockedPlan = NativeBridge.nativePlanLegacyLocalStorageWriteBack(bootHandle)
      checkEq(unblockedPlan != null && unblockedPlan.contains("ws-ok"), true, "seq12b writeback gate lifted")

      // Retryable mount failure: block ws-retry.db with a directory, fail once, remove dir, retry -> isComplete=true.
      val blockingDbDir = File(tmpDir, "workspaces/workspace/local/ws-retry.db")
      blockingDbDir.mkdirs()
      val retrySentinel = """{"origin":"https://localhost","length":1,"keys":["affine-local-workspace"],"entries":{"affine-local-workspace":"[\"ws-ok\",\"ws-retry\"]"},"idbTouchCount":0}"""
      val bootBeforeRetry = coordinator.completeWithProbePayload(retrySentinel)
      checkEq(bootBeforeRetry.imported, true, "seq12b retryable imported")
      checkEq(bootBeforeRetry.connectedWorkspaceKeys.size, 1, "seq12b ws-ok connected before retry")
      checkEq(bootBeforeRetry.failedWorkspaceIds, listOf("ws-retry"), "seq12b ws-retry failed while blocked")
      checkEq(bootBeforeRetry.isComplete, false, "seq12b before retry isComplete=false")
      checkEq(NativeBridge.nativePlanLegacyLocalStorageWriteBack(bootHandle), null, "seq12b blocked writeback while ws-retry failing")
      blockingDbDir.deleteRecursively()
      val bootAfterRetry = coordinator.retryFailedWorkspaces(bootBeforeRetry)
      checkEq(bootAfterRetry.isComplete, true, "seq12b after retry isComplete=true")
      checkEq(bootAfterRetry.failedWorkspaceIds.isEmpty(), true, "seq12b failedWorkspaceIds empty after retry")
      checkEq(bootAfterRetry.connectedWorkspaceKeys.size, 2, "seq12b both workspaces connected after retry")
      checkEq(NativeBridge.nativePlanLegacyLocalStorageWriteBack(bootHandle) != null, true, "seq12b writeback allowed after retry")
    } finally {
      NativeBridge.nativeDestroyHost(bootHandle)
    }

    // Rollback write-back verification with setEntries + removeKeys (and forbidding removing affine-local-workspace).
    val expectedSet = """{"affine-local-workspace":"[\"ws-live\"]","theme":"dark"}"""
    val expectedRemove = """["last_workspace_id"]"""
    checkEq(
      NativeBridge.nativeVerifyLegacyWriteBack(expectedSet, expectedRemove, upgradeSentinel),
      true,
      "seq12 rollback writeback verified with removeKeys",
    )
    checkEq(
      NativeBridge.nativeVerifyLegacyWriteBack(expectedSet, """["affine-local-workspace"]""", upgradeSentinel),
      false,
      "seq12 forbid removing affine-local-workspace",
    )

    // 13. Pure-Kotlin RFC 4648 Base64 (API 24 + JVM) + DataStore `v1:` AES-GCM +
    //     2-instance single-flight refresh + CookieCleaner on offline logout.
    val sampleBytes = ByteArray(256) { it.toByte() }
    checkEq(Rfc4648Base64.decode(Rfc4648Base64.encode(sampleBytes)).contentEquals(sampleBytes), true, "seq13 base64 0..255 roundtrip")
    checkEq(Rfc4648Base64.encode(byteArrayOf()), "", "seq13 base64 empty")
    checkEq(Rfc4648Base64.encode("f".toByteArray()), "Zg==", "seq13 base64 1-byte")
    checkEq(Rfc4648Base64.encode("fo".toByteArray()), "Zm8=", "seq13 base64 2-byte")
    checkEq(Rfc4648Base64.encode("foo".toByteArray()), "Zm9v", "seq13 base64 3-byte")

    val clearedCookieEndpoints = mutableListOf<String>()
    val recordingCookieCleaner = object : CookieCleaner {
      override fun clearAuthCookies(canonicalEndpoint: String) {
        synchronized(clearedCookieEndpoints) { clearedCookieEndpoints.add(canonicalEndpoint) }
      }
    }
    val sharedKeys = InMemoryAesKeyProvider()
    val cipher1 = AuthTokenCipher(keyProvider = sharedKeys, explicitIvForJvm = true)
    val cipher2 = AuthTokenCipher(keyProvider = sharedKeys, explicitIvForJvm = true)
    val store = AuthSessionStore(tmpDir.absolutePath, cipher1, recordingCookieCleaner)
    val store2 = AuthSessionStore(tmpDir.absolutePath, cipher2, recordingCookieCleaner)

    val instId1 = store.getOrCreateInstallationId("inst-fixed-0275")
    val instId2 = store2.getOrCreateInstallationId("inst-must-not-replace")
    checkEq(instId1, "inst-fixed-0275", "seq13 installationId persisted")
    checkEq(instId2, "inst-fixed-0275", "seq13 installationId reused across instances")

    val serverResp = """{
      "tokenType": "Bearer",
      "accessToken": "acc-s2-token",
      "refreshToken": "ref-s2-token",
      "expiresIn": 3600,
      "refreshExpiresAt": "2027-01-01T00:00:00.000Z",
      "session": { "absoluteExpiresAt": "2027-06-01T00:00:00Z" }
    }"""
    val rotatedResp = """{
      "tokenType": "Bearer",
      "accessToken": "acc-rotated-token",
      "refreshToken": "ref-rotated-token",
      "expiresIn": 3600,
      "refreshExpiresAt": "2027-01-01T00:00:00.000Z",
      "session": { "absoluteExpiresAt": "2027-06-01T00:00:00Z" }
    }"""
    val nowMs = 1_795_597_759_000L
    val ep = "https://app.affine.pro"
    checkEq(
      store.storeServerResponse("https://app.affine.pro:443/graphql", serverResp, nowMs),
      true,
      "seq13 storeServerResponse encrypted and persisted",
    )
    checkEq(
      File(tmpDir, "datastore/auth-sessions.preferences_pb").exists(),
      true,
      "seq13 auth-sessions.preferences_pb written on disk",
    )
    val rawCiphertext = NativeBridge.nativeDataStoreGetString(
      tmpDir.absolutePath,
      "auth-token:$ep",
    )
    checkEq(rawCiphertext != null && rawCiphertext.startsWith("v1:"), true, "seq13 stored ciphertext is v1:")
    checkEq(NativeBridge.nativeValidateV1Ciphertext(rawCiphertext!!), true, "seq13 v1 envelope valid")

    val decrypted = store2.readSessionJson(ep)
    checkEq(decrypted != null && decrypted.contains("\"accessExpiresAt\":${nowMs + 3_600_000L}"), true, "seq13 Unix ms i64 roundtrip")
    checkEq(decrypted!!.contains("acc-s2-token"), true, "seq13 accessToken roundtrip")

    // 2 separate AuthSessionStore instances concurrently call refreshSession -> single-flight fires ONLY 1 transport call.
    val epochBeforeSingleFlight = store.currentEpoch(ep)
    val transportCalls = AtomicInteger(0)
    val enteredTransport = CountDownLatch(1)
    val releaseTransport = CountDownLatch(1)
    val res1 = AtomicReference<Boolean>(false)
    val res2 = AtomicReference<Boolean>(false)
    val t1 = Thread {
      res1.set(
        store.refreshSession(ep) { _, _ ->
          transportCalls.incrementAndGet()
          enteredTransport.countDown()
          releaseTransport.await()
          RefreshResult.Success(rotatedResp, nowMs + 5_000L)
        },
      )
    }
    t1.start()
    enteredTransport.await()
    val t2 = Thread {
      res2.set(
        store2.refreshSession(ep) { _, _ ->
          transportCalls.incrementAndGet()
          RefreshResult.Failure("REFRESH_TOKEN_REUSED")
        },
      )
    }
    t2.start()
    while (t2.state != Thread.State.WAITING) {
      Thread.yield()
    }
    releaseTransport.countDown()
    t1.join()
    t2.join()
    checkEq(transportCalls.get(), 1, "seq13 single-flight coalesced 2 instances into 1 transport call")
    checkEq(res1.get(), true, "seq13 single-flight caller 1 succeeded")
    checkEq(res2.get(), true, "seq13 single-flight caller 2 shared success")
    checkEq(store.readSessionJson(ep)?.contains("acc-rotated-token"), true, "seq13 rotated token persisted")

    // Late stale-epoch REFRESH_TOKEN_REUSED must NEVER delete the newly rotated token.
    checkEq(
      store2.handleRefreshFailureIfEpochMatches(ep, epochBeforeSingleFlight, "REFRESH_TOKEN_REUSED"),
      false,
      "seq13 stale-epoch REFRESH_TOKEN_REUSED ignored",
    )
    checkEq(store.readSessionJson(ep)?.contains("acc-rotated-token"), true, "seq13 rotated token intact")

    // Offline clearSession deletes token AND clears cookies while preserving installationId.
    val epochBeforeLogout = store.currentEpoch(ep)
    checkEq(store.clearSession(ep), true, "seq13 offline clearSession deleted token")
    checkEq(store.readSessionJson(ep), null, "seq13 session empty after clearSession")
    checkEq(clearedCookieEndpoints.contains(ep), true, "seq13 CookieCleaner invoked on clearSession")
    checkEq(
      store2.storeRefreshedSessionIfEpochMatches(ep, epochBeforeLogout, serverResp, nowMs + 10_000L),
      false,
      "seq13 late refresh response rejected after clearSession",
    )
    checkEq(store.readSessionJson(ep), null, "seq13 DataStore remains empty after late refresh")
    checkEq(
      store.getOrCreateInstallationId("must-still-reuse"),
      "inst-fixed-0275",
      "seq13 installationId preserved after logout",
    )

    // Corrupt auth-sessions.preferences_pb must throw on getOrCreateInstallationId (never overwrite).
    val corruptDir = Files.createTempDirectory("affine-s2-corrupt-ds").toFile()
    try {
      val dsFile = File(corruptDir, "datastore/auth-sessions.preferences_pb")
      dsFile.parentFile.mkdirs()
      val badBytes = byteArrayOf(-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1)
      dsFile.writeBytes(badBytes)
      val corruptStore = AuthSessionStore(corruptDir.absolutePath, cipher1, recordingCookieCleaner)
      var threwOnCorrupt = false
      try {
        corruptStore.getOrCreateInstallationId("must-not-overwrite")
      } catch (_: IllegalStateException) {
        threwOnCorrupt = true
      }
      checkEq(threwOnCorrupt, true, "seq13 corrupt datastore throws instead of overwriting installationId")
      checkEq(dsFile.readBytes().contentEquals(badBytes), true, "seq13 corrupt datastore bytes untouched on disk")
    } finally {
      corruptDir.deleteRecursively()
    }

    // 14. Concurrent cold-start getOrCreateInstallationId returns one consistent UUID across racing threads.
    val raceDir = Files.createTempDirectory("affine-s2-inst-race").toFile()
    try {
      val raceStore1 = AuthSessionStore(raceDir.absolutePath, cipher1, recordingCookieCleaner)
      val raceStore2 = AuthSessionStore(raceDir.absolutePath, cipher2, recordingCookieCleaner)
      val ready = CountDownLatch(2)
      val go = CountDownLatch(1)
      val idA = AtomicReference<String?>(null)
      val idB = AtomicReference<String?>(null)
      val rt1 = Thread {
        ready.countDown()
        go.await()
        idA.set(raceStore1.getOrCreateInstallationId("uuid-a"))
      }
      val rt2 = Thread {
        ready.countDown()
        go.await()
        idB.set(raceStore2.getOrCreateInstallationId("uuid-b"))
      }
      rt1.start()
      rt2.start()
      ready.await()
      go.countDown()
      rt1.join()
      rt2.join()
      checkEq(idA.get() != null && idA.get() == idB.get(), true, "seq14 racing threads returned identical installationId")
      checkEq(idA.get() == "uuid-a" || idA.get() == "uuid-b", true, "seq14 installationId is one of the candidates")
      checkEq(
        AuthSessionStore(raceDir.absolutePath, cipher1, recordingCookieCleaner).getOrCreateInstallationId("uuid-c"),
        idA.get(),
        "seq14 persisted installationId matches racing winner",
      )
    } finally {
      raceDir.deleteRecursively()
    }

    // 15. Named 3 auth cookies cleanup preserves non-auth cookies + DataStore cookie keys cleanup +
    //     IPv6 canonicalization + serde_json JNI escape handling + HttpUrlConnectionRefreshTransport.
    val jar = linkedMapOf(
      "affine_session" to "s1",
      "affine_csrf_token" to "c1",
      "theme_pref" to "dark",
    )
    val rawCookieHeader = jar.entries.joinToString("; ") { "${it.key}=${it.value}" }
    val expiredHeaders = AndroidCookieCleaner.filterClearedCookieHeaders(rawCookieHeader)
    checkEq(expiredHeaders.size, 2, "seq15 only 2 present auth cookies expired")
    for (hdr in expiredHeaders) {
      val name = hdr.substringBefore("=")
      checkEq(hdr.contains("Max-Age=0"), true, "seq15 cookie header expires $name")
      jar.remove(name)
    }
    checkEq(jar.containsKey("affine_session"), false, "seq15 affine_session cleared")
    checkEq(jar.containsKey("affine_csrf_token"), false, "seq15 affine_csrf_token cleared")
    checkEq(jar["theme_pref"], "dark", "seq15 non-auth theme_pref preserved")

    // DataStore legacy cookie keys (<host>affine_user_id, <host>affine_csrf_token) in
    // 0.27.5 datastore/affine.preferences_pb are deleted on clearSession while preserving
    // unrelated prefs (theme=dark) and auth-sessions.preferences_pb installationId.
    val absentAppDsDir = Files.createTempDirectory("affine-s2-absent-app-ds").toFile()
    try {
      checkEq(
        NativeBridge.nativeLegacyAppDataStoreDeleteKey(absentAppDsDir.absolutePath, "app.affine.proaffine_user_id"),
        true,
        "seq15 missing affine.preferences_pb delete succeeds",
      )
      checkEq(
        File(absentAppDsDir, "datastore/affine.preferences_pb").exists(),
        false,
        "seq15 missing affine.preferences_pb is not created on delete",
      )
    } finally {
      absentAppDsDir.deleteRecursively()
    }
    val scratchSeedDir = Files.createTempDirectory("affine-s2-seed-legacy-pb").toFile()
    val scratchInspectDir = Files.createTempDirectory("affine-s2-inspect-legacy-pb").toFile()
    try {
      checkEq(NativeBridge.nativeDataStoreSetString(scratchSeedDir.absolutePath, "app.affine.proaffine_user_id", "u1"), true, "seq15 build legacy user_id pb")
      checkEq(NativeBridge.nativeDataStoreSetString(scratchSeedDir.absolutePath, "app.affine.proaffine_csrf_token", "c1"), true, "seq15 build legacy csrf pb")
      checkEq(NativeBridge.nativeDataStoreSetString(scratchSeedDir.absolutePath, "theme", "dark"), true, "seq15 build legacy theme pb")
      val legacyTargetPb = File(tmpDir, "datastore/affine.preferences_pb")
      legacyTargetPb.parentFile.mkdirs()
      File(scratchSeedDir, "datastore/auth-sessions.preferences_pb").copyTo(legacyTargetPb, overwrite = true)

      checkEq(store.storeServerResponse(ep, serverResp, nowMs), true, "seq15 re-seed auth session before clear")

      // Simulate transient legacy file failure (corrupt bytes in affine.preferences_pb) -> clearSession returns false while still clearing auth session.
      val brokenDir = Files.createTempDirectory("affine-s2-broken-legacy-pb").toFile()
      try {
        val brokenStore = AuthSessionStore(
          filesDir = brokenDir.absolutePath,
          cipher = cipher1,
          cookieCleaner = recordingCookieCleaner,
        )
        checkEq(brokenStore.storeServerResponse(ep, serverResp, nowMs), true, "seq15 seed brokenDir auth")
        val brokenLegacyPb = File(brokenDir, "datastore/affine.preferences_pb")
        brokenLegacyPb.parentFile.mkdirs()
        brokenLegacyPb.writeBytes(byteArrayOf(0xFF.toByte(), 0xFF.toByte(), 0x7F))
        checkEq(brokenStore.clearSession(ep), false, "seq15 clearSession surfaces legacy cleanup failure")
        checkEq(brokenStore.readSessionJson(ep), null, "seq15 primary auth session still wiped")
        brokenLegacyPb.delete()
        checkEq(brokenStore.clearSession(ep), true, "seq15 retry clearSession succeeds after legacy file healthy")
      } finally {
        brokenDir.deleteRecursively()
      }

      checkEq(store.clearSession(ep), true, "seq15 clearSession returns true when healthy")
      val inspectTargetPb = File(scratchInspectDir, "datastore/auth-sessions.preferences_pb")
      inspectTargetPb.parentFile.mkdirs()
      legacyTargetPb.copyTo(inspectTargetPb, overwrite = true)
      checkEq(NativeBridge.nativeDataStoreGetString(scratchInspectDir.absolutePath, "app.affine.proaffine_user_id"), null, "seq15 affine.preferences_pb user_id deleted")
      checkEq(NativeBridge.nativeDataStoreGetString(scratchInspectDir.absolutePath, "app.affine.proaffine_csrf_token"), null, "seq15 affine.preferences_pb csrf deleted")
      checkEq(NativeBridge.nativeDataStoreGetString(scratchInspectDir.absolutePath, "theme"), "dark", "seq15 affine.preferences_pb theme preserved")
      checkEq(store.getOrCreateInstallationId("must-still-preserve"), "inst-fixed-0275", "seq15 auth-sessions installationId preserved")
    } finally {
      scratchSeedDir.deleteRecursively()
      scratchInspectDir.deleteRecursively()
    }

    // IPv6 canonicalization and serde_json JNI escape fidelity.
    checkEq(NativeBridge.nativeCanonicalEndpoint("https://[::1]:8443/graphql"), "https://[::1]:8443", "seq15 ipv6 non-default port")
    checkEq(NativeBridge.nativeCanonicalEndpoint("https://[::1]:443/graphql"), "https://[::1]", "seq15 ipv6 default port stripped")
    checkEq(
      NativeBridge.nativeExtractJsonStringField("""{"refreshToken":"tok-\u0041\"\\"}""", "refreshToken"),
      "tok-A\"\\",
      "seq15 serde_json unescapes \\u0041 quote backslash",
    )

    // AndroidManifest.xml declares minSdkVersion=24 and android.permission.INTERNET.
    val manifestFile = listOf(
      File("hosts/android/AndroidManifest.xml"),
      File("packages/frontend/hosts/android/AndroidManifest.xml"),
    ).firstOrNull { it.exists() }
    checkEq(manifestFile != null, true, "seq15 AndroidManifest.xml located")
    val manifestXml = manifestFile!!.readText(StandardCharsets.UTF_8)
    checkEq(manifestXml.contains("""android:minSdkVersion="24""""), true, "seq15 manifest minSdkVersion=24")
    checkEq(manifestXml.contains("""android.permission.INTERNET"""), true, "seq15 manifest declares INTERNET permission")

    // Production default HttpUrlConnectionRefreshTransport against local loopback ServerSocket:
    // MUST NOT send Authorization: Bearer header (prevents 3-segment refreshToken JWT misclassification).
    val capturedRequest = AtomicReference<String>("")
    ServerSocket(0).use { server ->
      val port = server.localPort
      val serverThread = Thread {
        server.accept().use { sock ->
          val reader = sock.getInputStream().bufferedReader(StandardCharsets.UTF_8)
          val reqLines = StringBuilder()
          var contentLength = 0
          while (true) {
            val line = reader.readLine() ?: break
            if (line.isEmpty()) break
            reqLines.append(line).append('\n')
            if (line.lowercase().startsWith("content-length:")) {
              contentLength = line.substringAfter(':').trim().toIntOrNull() ?: 0
            }
          }
          if (contentLength > 0) {
            val bodyChars = CharArray(contentLength)
            reader.read(bodyChars)
            reqLines.append(String(bodyChars))
          }
          capturedRequest.set(reqLines.toString())
          val respBytes = rotatedResp.toByteArray(StandardCharsets.UTF_8)
          val httpResp = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${respBytes.size}\r\nConnection: close\r\n\r\n"
          sock.getOutputStream().write(httpResp.toByteArray(StandardCharsets.UTF_8))
          sock.getOutputStream().write(respBytes)
          sock.getOutputStream().flush()
        }
      }
      serverThread.start()
      val httpTransport = HttpUrlConnectionRefreshTransport(appVersion = "0.27.5")
      val fixedAttemptId = "11111111-2222-3333-4444-555555555555"
      val httpRes = httpTransport.refresh(
        "http://127.0.0.1:$port",
        "aff_rt_v1.idpart.secretpart",
        fixedAttemptId,
      )
      serverThread.join()
      checkEq(httpRes is RefreshResult.Success, true, "seq15 HttpUrlConnectionRefreshTransport succeeded")
      val reqText = capturedRequest.get()
      checkEq(reqText.contains("POST /api/auth/session/refresh"), true, "seq15 HTTP POST refresh path")
      checkEq(reqText.lowercase().contains("authorization:"), false, "seq15 MUST NOT send Authorization header on refresh")
      checkEq(reqText.lowercase().contains("x-affine-client-kind: native"), true, "seq15 x-affine-client-kind sent")
      checkEq(reqText.lowercase().contains("x-affine-version: 0.27.5"), true, "seq15 x-affine-version sent")
      checkEq(reqText.lowercase().contains("x-affine-refresh-attempt: $fixedAttemptId"), true, "seq15 x-affine-refresh-attempt sent")
      checkEq(reqText.contains("aff_rt_v1.idpart.secretpart"), true, "seq15 refreshToken sent in JSON body")
    }

    // 16. Refresh idempotency (reuse x-affine-refresh-attempt across transient retries, fresh UUID after rotation)
    //     + in-memory pendingRotatedSession flush on disk-write failure with 0 network calls on retry.
    val retryDir = Files.createTempDirectory("affine-s2-refresh-retry").toFile()
    try {
      val failNextWrite = AtomicReference(false)
      val flakyPersistence = SessionPersistence { dir, key, enc ->
        if (failNextWrite.getAndSet(false)) {
          false
        } else {
          NativeBridge.nativeDataStoreSetString(dir, key, enc)
        }
      }
      val retryStore = AuthSessionStore(
        filesDir = retryDir.absolutePath,
        cipher = cipher1,
        cookieCleaner = recordingCookieCleaner,
        persistence = flakyPersistence,
      )
      val epRetry = "https://retry.affine.pro"
      checkEq(retryStore.storeServerResponse(epRetry, serverResp, nowMs), true, "seq16 seed initial session")

      // Part A: transient timeout -> retry reuses exact same lowercase UUID attemptId; next rotation uses new UUID.
      val seenAttempts = mutableListOf<String>()
      var callNum = 0
      val attemptTransport = RefreshTransport { _, _, attemptId ->
        seenAttempts.add(attemptId)
        callNum += 1
        when (callNum) {
          1 -> RefreshResult.Failure(null)
          2 -> RefreshResult.Success(rotatedResp, nowMs + 10_000L)
          else -> RefreshResult.Success(serverResp, nowMs + 20_000L)
        }
      }
      checkEq(retryStore.refreshSession(epRetry, attemptTransport), false, "seq16 transient timeout returns false")
      checkEq(retryStore.refreshSession(epRetry, attemptTransport), true, "seq16 retry succeeds")
      checkEq(seenAttempts.size, 2, "seq16 2 attempts recorded")
      checkEq(seenAttempts[0] == seenAttempts[1], true, "seq16 transient retry reused identical x-affine-refresh-attempt")
      checkEq(seenAttempts[0] == seenAttempts[0].lowercase(), true, "seq16 attemptId is lowercase UUID")
      checkEq(retryStore.refreshSession(epRetry, attemptTransport), true, "seq16 subsequent rotation succeeds")
      checkEq(seenAttempts.size, 3, "seq16 3rd attempt recorded")
      checkEq(seenAttempts[2] != seenAttempts[1], true, "seq16 new logical rotation generated fresh attemptId")

      // Part B: 200 OK received but disk write fails -> next refreshSession flushes cached session with 0 network calls.
      val networkCalls = AtomicInteger(0)
      failNextWrite.set(true)
      val writeFailTransport = RefreshTransport { _, _, _ ->
        networkCalls.incrementAndGet()
        RefreshResult.Success(rotatedResp, nowMs + 30_000L)
      }
      checkEq(retryStore.refreshSession(epRetry, writeFailTransport), false, "seq16 disk write failure returns false")
      checkEq(networkCalls.get(), 1, "seq16 1 network call made before disk write failure")
      checkEq(retryStore.refreshSession(epRetry, writeFailTransport), true, "seq16 second refresh flushes cached rotated session")
      checkEq(networkCalls.get(), 1, "seq16 ZERO additional network calls on cached session flush")
      checkEq(retryStore.readSessionJson(epRetry)?.contains("acc-rotated-token"), true, "seq16 flushed rotated token readable from disk")
      // Part C: Cold process restart recovery — copying only disk DataStore to a brand-new filesDir
      // (zero shared in-memory EndpointCoordination!) still reuses the persisted x-affine-refresh-attempt UUID.
      val proc1Dir = Files.createTempDirectory("affine-s2-proc1").toFile()
      val proc2Dir = Files.createTempDirectory("affine-s2-proc2").toFile()
      try {
        val proc1Store = AuthSessionStore(filesDir = proc1Dir.absolutePath, cipher = cipher1, cookieCleaner = recordingCookieCleaner)
        checkEq(proc1Store.storeServerResponse(epRetry, serverResp, nowMs), true, "seq16 proc1 seed")
        var proc1Attempt = ""
        checkEq(
          proc1Store.refreshSession(epRetry, RefreshTransport { _, _, id ->
            proc1Attempt = id
            RefreshResult.Failure(null)
          }),
          false,
          "seq16 proc1 transient failure",
        )
        val proc2Pb = File(proc2Dir, "datastore/auth-sessions.preferences_pb")
        proc2Pb.parentFile.mkdirs()
        File(proc1Dir, "datastore/auth-sessions.preferences_pb").copyTo(proc2Pb, overwrite = true)
        val proc2Store = AuthSessionStore(filesDir = proc2Dir.absolutePath, cipher = cipher1, cookieCleaner = recordingCookieCleaner)
        var proc2Attempt = ""
        checkEq(
          proc2Store.refreshSession(epRetry, RefreshTransport { _, _, id ->
            proc2Attempt = id
            RefreshResult.Success(rotatedResp, nowMs + 40_000L)
          }),
          true,
          "seq16 proc2 cold-restart recovery succeeds",
        )
        checkEq(proc1Attempt.isNotEmpty() && proc1Attempt == proc2Attempt, true, "seq16 cold-restart reused persisted x-affine-refresh-attempt")
      } finally {
        proc1Dir.deleteRecursively()
        proc2Dir.deleteRecursively()
      }
    } finally {
      retryDir.deleteRecursively()
    }
  } finally {
    NativeBridge.nativeDestroyHost(s2Handle)
    tmpDir.deleteRecursively()
  }

  // 17. End-to-end Text <-> SelectionCoordinator/InputConnection: pure-Rust fallback layout
  //     (proportional widths & per-paragraph UAX #9 BiDi), grab-offset 0px drag, vertical drag
  //     beyond 0.5*line_height, slow drag across length==0 coincidence point (10->8->6->5->3),
  //     required HostClipboard Copy/Cut/Paste, InputConnection.performContextMenuAction(cut/paste),
  //     zero-alloc fillOverlayGeometry, and ACTION_CANCEL.
  val selHandle = NativeBridge.nativeCreateHost()
  try {
    var overlayInvalidations = 0
    val ime = AffineImeController({ selHandle }, onMutated = { overlayInvalidations += 1 })
    val sel = AndroidSelectionCoordinator({ selHandle }, onMutated = { overlayInvalidations += 1 })
    sel.setViewport(1080f, 2400f, 3f)

    // Proportional fallback widths: "WWWW" is strictly wider than "iiii".
    checkEq(ime.commitText("iiii", 1), true, "seq17 commit iiii")
    checkEq(ime.setSelection(0, 4), true, "seq17 select iiii")
    val narrowWidth = sel.overlayGeometry()!![9] - sel.overlayGeometry()!![3]
    checkEq(ime.replaceText(0, ime.readText().length, "WWWW", 1), true, "seq17 replace with WWWW")
    checkEq(ime.setSelection(0, 4), true, "seq17 select WWWW")
    val wideWidth = sel.overlayGeometry()!![9] - sel.overlayGeometry()!![3]
    checkEq(wideWidth > narrowWidth * 1.5f, true, "seq17 proportional fallback WWWW wider than iiii")

    // Insert "Hello world" and select [6, 11) ("world") -> handles & action menu auto-appear.
    val invBefore = overlayInvalidations
    checkEq(ime.replaceText(0, ime.readText().length, "Hello world", 1), true, "seq17 commit Hello world")
    checkEq(ime.setSelection(6, 11), true, "seq17 select [6, 11)")
    checkEq(overlayInvalidations > invBefore, true, "seq17 IME mutations trigger overlay invalidation")
    checkEq(ime.getSelectedText(), "world", "seq17 initial selected text")
    val g0 = sel.overlayGeometry()!!
    checkEq(g0.size, 24, "seq17 fixed 24-float overlay geometry")
    checkEq(g0[0], 1f, "seq17 has_selection=1")
    checkEq(g0[1], 0f, "seq17 LTR direction=0")
    checkEq(g0[19], 1f, "seq17 action menu visible before drag")

    // Grab End handle center and apply authoritative endpoints -> tip & selection stay identical.
    val endCx = g0[11]
    val endCy = g0[12]
    val endTipX = g0[9]
    val startTipX = g0[3]
    val startTipY = g0[4]
    val endTipY = g0[10]
    checkEq(sel.beginDrag(endCx, endCy), 2, "seq17 hit End handle")
    sel.applyTextDragEndpoints(startTipX, startTipY, endTipX, endTipY, 60f, false, 2)
    checkEq(ime.getSelectedText(), "world", "seq17 0px drag preserves selection")
    val gDragBuf = FloatArray(24)
    checkEq(sel.fillOverlayGeometry(gDragBuf), true, "seq17 zero-alloc fillOverlayGeometry succeeds")
    checkEq(gDragBuf[14], 1f, "seq17 magnifier visible during drag")
    checkEq(gDragBuf[19], 0f, "seq17 action menu hidden during drag")
    // Magnifier anchor_y must sit at the line vertical midpoint (strictly above tip_y).
    checkEq(gDragBuf[16] < gDragBuf[10], true, "seq17 magnifier focus_y centered on line midpoint")

    // Vertical drag beyond 0.5*line_height on a single line keeps End active and magnifier at right end.
    for (dy in listOf(-43f, -60f, -120f, 0f, 43f, 120f, 0f)) {
      sel.applyTextDragEndpoints(startTipX, startTipY, endTipX, endTipY, 60f, false, 2)
      checkEq(ime.selectionStart(), 6, "seq17 vertical drag dy=$dy keeps start=6")
      checkEq(ime.selectionEnd(), 11, "seq17 vertical drag dy=$dy keeps end=11")
      checkEq(sel.fillOverlayGeometry(gDragBuf), true, "seq17 fillOverlayGeometry at dy=$dy")
      checkEq(
        kotlin.math.abs(gDragBuf[15] - endTipX) < 0.01f,
        true,
        "seq17 magnifier anchor_x stays on right end at dy=$dy",
      )
    }

    // Continuous drag across coincidence point (length==0) -> inverted selection [3, 6) == "lo ".
    checkEq(ime.setSelection(3, 6), true, "seq17 inverted selection [3, 6)")
    sel.applyTextDragEndpoints(startTipX - 80f, startTipY, startTipX, startTipY, 60f, false, 1)
    checkEq(ime.selectionStart(), 3, "seq17 inverted selection start=3")
    checkEq(ime.selectionEnd(), 6, "seq17 inverted selection end=6")
    checkEq(ime.getSelectedText(), "lo ", "seq17 inverted selection text == 'lo '")
    checkEq(sel.endDrag(), true, "seq17 endDrag restores action menu")

    // Real HostClipboard integration: pre-seeded stale value replaced on Copy & Cut,
    // failing clipboard aborts Cut before deleting text, Paste restores Cut text.
    var clipboardStore: String? = "stale-clipboard"
    val mockClipboard = object : HostClipboard {
      override fun setPlainText(label: String, text: String): Boolean {
        clipboardStore = text
        return true
      }
      override fun getPlainText(): String? = clipboardStore
    }
    val failingClipboard = object : HostClipboard {
      override fun setPlainText(label: String, text: String): Boolean = false
      override fun getPlainText(): String? = null
    }
    checkEq(sel.performCopy(ime, mockClipboard), "lo ", "seq17 Copy returns 'lo '")
    checkEq(clipboardStore, "lo ", "seq17 Copy wrote 'lo ' to HostClipboard")

    // ACTION_CANCEL hides magnifier cleanly.
    val gBeforeCancel = sel.overlayGeometry()!!
    checkEq(sel.beginDrag(gBeforeCancel[5], gBeforeCancel[6]) != 0, true, "seq17 begin drag before cancel")
    checkEq(sel.overlayGeometry()!![14], 1f, "seq17 magnifier shown before cancel")
    sel.cancelDrag()
    checkEq(sel.overlayGeometry()!![14], 0f, "seq17 ACTION_CANCEL hides magnifier")

    // Cut with failing clipboard must NOT delete text; Cut with working clipboard writes BEFORE deleting.
    checkEq(sel.performCut(ime, failingClipboard), null, "seq17 Cut aborts when clipboard write fails")
    checkEq(ime.readText(), "Hello world", "seq17 text preserved when clipboard write fails")
    clipboardStore = "stale-before-cut"

    // Real InputConnection.performContextMenuAction(cut / paste / selectAll) round-trip.
    val ctxIc = AffineSurfaceView.createInputConnection(
      handleProvider = { selHandle },
      onContextMenuAction = { actionId ->
        sel.handleContextMenuAction(actionId, ime, mockClipboard)
      },
    )
    checkEq(ctxIc.performContextMenuAction(android.R.id.cut), true, "seq17 IC performContextMenuAction(cut)")
    checkEq(clipboardStore, "lo ", "seq17 IC cut wrote 'lo ' to HostClipboard")
    checkEq(ime.readText(), "Helworld", "seq17 text after IC cut")
    checkEq(sel.overlayGeometry()!![0], 0f, "seq17 collapsed selection auto-hides handles")
    checkEq(ctxIc.performContextMenuAction(android.R.id.paste), true, "seq17 IC performContextMenuAction(paste)")
    checkEq(ime.readText(), "Hello world", "seq17 IC paste restored exact original text")
    checkEq(ime.selectionStart(), 6, "seq17 IC paste placed cursor at end of pasted span")
    checkEq(ime.selectionEnd(), 6, "seq17 IC paste collapsed selection")
    checkEq(ctxIc.performContextMenuAction(android.R.id.selectAll), true, "seq17 IC selectAll")
    checkEq(ime.getSelectedText(), "Hello world", "seq17 IC selectAll selected full text")

    // Per-paragraph ("\n") UAX #9 BiDi: paragraph 0 ("A") is LTR, paragraph 1 ("שלום") is RTL.
    checkEq(ime.replaceText(0, ime.readText().length, "A\nשלום", 1), true, "seq17 insert mixed BiDi paragraphs")
    checkEq(ime.setSelection(0, 1), true, "seq17 select LTR paragraph 0")
    checkEq(sel.overlayGeometry()!![1], 0f, "seq17 paragraph 0 ('A') is LTR")
    checkEq(ime.setSelection(2, 6), true, "seq17 select RTL paragraph 1")
    val gParaRtl = sel.overlayGeometry()!!
    checkEq(gParaRtl[1], 1f, "seq17 paragraph 1 ('שלום') is RTL")
    checkEq(gParaRtl[3] > gParaRtl[9], true, "seq17 paragraph 1 Start tip visually right of End tip")

    // Pure RTL ("שלום עולם"): direction=1, Start handle visually right of End handle, drag updates IME.
    checkEq(ime.replaceText(0, ime.readText().length, "שלום עולם", 1), true, "seq17 insert RTL text")
    checkEq(ime.setSelection(0, 4), true, "seq17 select RTL [0, 4)")
    val gRtl = sel.overlayGeometry()!!
    checkEq(gRtl[1], 1f, "seq17 RTL direction=1")
    checkEq(gRtl[3] > gRtl[9], true, "seq17 RTL Start tip is visually right of End tip")
    checkEq(sel.beginDrag(gRtl[11], gRtl[12]), 2, "seq17 hit RTL End handle")
    checkEq(ime.setSelection(0, 6), true, "seq17 RTL selection [0, 6)")
    sel.applyTextDragEndpoints(gRtl[3], gRtl[4], gRtl[9] - 56.88f, gRtl[10], 60f, true, 2)
    checkEq(ime.selectionStart(), 0, "seq17 RTL selection start=0")
    checkEq(ime.selectionEnd(), 6, "seq17 RTL selection end=6")
    checkEq(sel.endDrag(), true, "seq17 RTL endDrag")
    sel.clear()
    checkEq(sel.overlayGeometry()!![0], 0f, "seq17 clear hides selection")
  } finally {
    NativeBridge.nativeDestroyHost(selHandle)
  }

  // 18. Surface recreation state preservation (DPI, scroll, IME text, texture generation),
  //     nav-bar-deducted effective IME inset, cross-generation readiness guard, and Vulkan -> GLES3 recovery.
  val recHandle = NativeBridge.nativeCreateHost()
  try {
    val ime = AffineImeController { recHandle }
    checkEq(ime.commitText("persist-me", 1), true, "seq18 seed IME text")
    NativeBridge.nativeOnSurfaceInsetsPx(recHandle, 120, 0, 72, 0, 900, 3.0f)
    checkEq(NativeBridge.nativeGetSurfaceDensity(recHandle), 3.0f, "seq18 density preserved")
    checkEq(NativeBridge.nativeGetEffectiveImeBottomDp(recHandle), 276.0f, "seq18 IME inset deducts nav bar bottom")
    NativeBridge.nativeSetSurfaceScrollOffset(recHandle, 0f, 512.5f)

    // Select Vulkan (1), report Vulkan device loss -> downgrades seamlessly to GLES3 (2).
    checkEq(NativeBridge.nativeSelectRenderBackend(recHandle, true, true), 1, "seq18 selected Vulkan")
    checkEq(NativeBridge.nativeReportVulkanDeviceLost(recHandle), 2, "seq18 Vulkan device loss downgrades to GLES3")
    checkEq(NativeBridge.nativeGetRenderBackend(recHandle), 2, "seq18 active backend is GLES3")
    checkEq(NativeBridge.nativeGetTextureGeneration(recHandle) >= 1L, true, "seq18 texture generation advanced")

    // Background destroy & rotation size change preserve scroll, density, and IME text;
    // before surfaceCreated + surfaceChanged pair completes, surface stays not ready.
    NativeBridge.nativeOnSurfaceChanged(recHandle, 1, 1080, 2400)
    NativeBridge.nativeOnSurfaceDestroyed(recHandle)
    checkEq(NativeBridge.nativeIsSurfaceReady(recHandle), false, "seq18 destroyed surface not ready")
    checkEq(NativeBridge.nativeOnFrameTick(recHandle, 20_000_000L), 0, "seq18 detached tick returns 0")
    NativeBridge.nativeOnSurfaceChanged(recHandle, 1, 2400, 1080)
    checkEq(NativeBridge.nativeHasPendingFrame(recHandle), true, "seq18 pending frame set after destroy")
    checkEq(NativeBridge.nativeGetSurfaceScrollY(recHandle), 512.5f, "seq18 scroll offset preserved")
    checkEq(NativeBridge.nativeGetSurfaceDensity(recHandle), 3.0f, "seq18 density preserved after destroy")
    checkEq(ime.readText(), "persist-me", "seq18 IME text preserved across surface destroy")
  } finally {
    NativeBridge.nativeDestroyHost(recHandle)
  }

  // 19. API 26+ AutofillManager virtual view structure bridge vs API 24/25 silent degradation,
  //     zero fake placeholders, IME write-back, and sensitive value wipe on commit/cancel.
  for (legacySdk in listOf(24, 25)) {
    val legacyAfHandle = NativeBridge.nativeCreateHost()
    try {
      val events = mutableListOf<String>()
      val mockBackend = object : AutofillPlatformBackend {
        override fun notifyViewEntered(autofillId: Int, left: Int, top: Int, right: Int, bottom: Int) {
          events.add("enter:$autofillId")
        }
        override fun notifyViewExited(autofillId: Int) { events.add("exit:$autofillId") }
        override fun notifyValueChanged(autofillId: Int, text: String) { events.add("val:$autofillId") }
        override fun commit() { events.add("commit") }
        override fun cancel() { events.add("cancel") }
      }
      val af = AndroidAutofillController(legacySdk, { legacyAfHandle }, mockBackend)
      checkEq(af.isEnabled, false, "seq19 API $legacySdk autofill disabled")
      checkEq(af.registerField(101, 1, 10, 20, 400, 80, false, 0), false, "seq19 API $legacySdk register blocked")
      af.onFieldFocusChanged(101)
      checkEq(af.onAutofillValues(mapOf(101 to "a@b.com")), 0, "seq19 API $legacySdk autofill ignored")
      checkEq(af.commit(), false, "seq19 API $legacySdk commit blocked")
      checkEq(events.isEmpty(), true, "seq19 API $legacySdk zero platform AutofillManager calls")
      checkEq(af.virtualNodesSnapshot().isEmpty(), true, "seq19 API $legacySdk empty virtual nodes")
    } finally {
      NativeBridge.nativeDestroyHost(legacyAfHandle)
    }
  }
  val api26Handle = NativeBridge.nativeCreateHost()
  try {
    val events = mutableListOf<String>()
    val mockBackend = object : AutofillPlatformBackend {
      override fun notifyViewEntered(autofillId: Int, left: Int, top: Int, right: Int, bottom: Int) {
        events.add("enter:$autofillId:$left,$top,$right,$bottom")
      }
      override fun notifyViewExited(autofillId: Int) { events.add("exit:$autofillId") }
      override fun notifyValueChanged(autofillId: Int, text: String) { events.add("val:$autofillId:$text") }
      override fun commit() { events.add("commit") }
      override fun cancel() { events.add("cancel") }
    }
    var syncingFocus = false
    lateinit var af: AndroidAutofillController
    val ime = AffineImeController(
      handleProvider = { api26Handle },
      onMutated = {},
      onTextEdited = { edited ->
        if (!syncingFocus) {
          af.onFocusedTextEdited(edited)
        }
      },
    )
    val afIc = AffineSurfaceView.createInputConnection(
      handleProvider = { api26Handle },
      onMutated = {},
      onTextEdited = { edited ->
        if (!syncingFocus) {
          af.onFocusedTextEdited(edited)
        }
      },
    )
    af = AndroidAutofillController(
      sdkInt = 26,
      handleProvider = { api26Handle },
      backend = mockBackend,
      onValueCommitted = { id, text ->
        if (af.focusedFieldId() == id) {
          syncingFocus = true
          try {
            ime.replaceText(0, ime.readText().length, text, 1)
          } finally {
            syncingFocus = false
          }
        }
      },
      onFocusedFieldTextSync = { _, text ->
        syncingFocus = true
        try {
          ime.replaceText(0, ime.readText().length, text, 1)
        } finally {
          syncingFocus = false
        }
      },
    )
    checkEq(af.isEnabled, true, "seq19 API 26 autofill enabled")
    checkEq(af.registerField(101, 1, 20, 100, 800, 180, false, 0), true, "seq19 register email field")
    checkEq(af.registerField(102, 2, 20, 200, 800, 280, true, 8), true, "seq19 register password field")
    checkEq(af.registerField(103, 3, 20, 300, 800, 380, false, 0), true, "seq19 register OTP field")
    // Empty/unset fields MUST return null (never synthetic "********" or spaces).
    checkEq(af.resolveVirtualFieldValueForStructure(102), null, "seq19 unset password emits null, never fake asterisks")
    checkEq(af.virtualNodesSnapshot().size, 3, "seq19 3 virtual autofill nodes exposed")

    // Pure manual typing without any prior Autofill write-back:
    // focus email (101) -> type "a@b.c" -> switch to password (102) -> switch back to email (101) => "a@b.c" preserved.
    af.onFieldFocusChanged(101)
    checkEq(afIc.commitText("a@b.c", 1), true, "seq19 manual type a@b.c without prior autofill")
    checkEq(af.readFormValues()["email"], "a@b.c", "seq19 manual typed email stored in autofill state")
    af.onFieldFocusChanged(102)
    checkEq(ime.readText(), "", "seq19 switching to empty password clears IME")
    af.onFieldFocusChanged(101)
    checkEq(ime.readText(), "a@b.c", "seq19 returning to email restores manually typed a@b.c")
    checkEq(af.readFormValues()["email"], "a@b.c", "seq19 form email remains a@b.c")

    // Matrix test: 2 focus targets (email vs password) x 2 batch orders ([email, password] vs [password, email]).
    // IME must ALWAYS equal the currently focused field and NEVER be overwritten by another field's password.
    val batchOrders = listOf(
      "email_first" to linkedMapOf(101 to "darksky@affine.pro", 102 to "hunter2!"),
      "password_first" to linkedMapOf(102 to "hunter2!", 101 to "darksky@affine.pro"),
    )
    for ((focusId, expectedIme) in listOf(101 to "darksky@affine.pro", 102 to "hunter2!")) {
      for ((orderName, batch) in batchOrders) {
        af.onFieldFocusChanged(focusId)
        checkEq(
          AffineSurfaceView.dispatchAutofillBatch(af, batch),
          2,
          "seq19 batch $orderName focus=$focusId applied 2 fields",
        )
        checkEq(
          ime.readText(),
          expectedIme,
          "seq19 batch $orderName focus=$focusId keeps IME strictly isolated to focused field",
        )
        val form = af.readFormValues()
        checkEq(form["email"], "darksky@affine.pro", "seq19 form email preserved ($orderName)")
        checkEq(form["password"], "hunter2!", "seq19 form password preserved ($orderName)")
      }
    }

    // Manual IME edit round-trip: focus email (101) -> autofill A -> manual InputConnection edit to B ->
    // switch focus to password (102) -> switch back to email (101) => both IME and form read B (never A).
    af.onFieldFocusChanged(101)
    checkEq(ime.readText(), "darksky@affine.pro", "seq19 email focused starts with autofilled A")
    checkEq(afIc.deleteSurroundingText(18, 0), true, "seq19 manual deleteSurroundingText on email")
    checkEq(afIc.commitText("edited@affine.pro", 1), true, "seq19 manual commitText B on email")
    checkEq(ime.readText(), "edited@affine.pro", "seq19 IME now has manual edit B")
    checkEq(af.readFormValues()["email"], "edited@affine.pro", "seq19 autofill store synced manual edit B")
    af.onFieldFocusChanged(102)
    checkEq(ime.readText(), "hunter2!", "seq19 switching to password loads password")
    af.onFieldFocusChanged(101)
    checkEq(ime.readText(), "edited@affine.pro", "seq19 returning to email preserves manual edit B (never clobbered by A)")
    checkEq(af.readFormValues()["email"], "edited@affine.pro", "seq19 form email remains B after round-trip")

    // Clearing field text to "" must still notify AutofillManager.
    checkEq(af.updateFieldText(102, ""), true, "seq19 clear password text")
    checkEq(events.contains("val:102:"), true, "seq19 empty text still notifies notifyValueChanged")
    checkEq(af.resolveVirtualFieldValueForStructure(102), null, "seq19 cleared password resolves to null")

    // Re-fill and verify structure JSON never leaks plaintext, then commit/cancel/clear wipe memory.
    checkEq(af.updateFieldText(102, "hunter2!"), true, "seq19 restore password")
    val structJson = af.virtualStructureJson()
    checkEq(structJson.contains("\"emailAddress\""), true, "seq19 structure includes emailAddress")
    checkEq(structJson.contains("\"password\""), true, "seq19 structure includes password")
    checkEq(structJson.contains("\"smsOTPCode\""), true, "seq19 structure includes smsOTPCode")
    checkEq(structJson.contains("hunter2!"), false, "seq19 structure JSON never leaks plaintext password")
    checkEq(af.commit(), true, "seq19 autofill commit succeeded")
    checkEq(af.resolveVirtualFieldValueForStructure(102), null, "seq19 commit wiped cached password")
    checkEq(af.updateFieldText(102, "temp-secret"), true, "seq19 updateFieldText updates password")
    checkEq(af.cancel(), true, "seq19 cancel wipes cached password")
    checkEq(af.resolveVirtualFieldValueForStructure(102), null, "seq19 password wiped after cancel")
    af.clearFields()
    checkEq(af.virtualNodesSnapshot().isEmpty(), true, "seq19 clearFields removes all virtual nodes")
    checkEq(events.contains("enter:101:20,100,800,180"), true, "seq19 notified enter 101")
    checkEq(events.contains("exit:101"), true, "seq19 notified exit 101")
    checkEq(events.contains("enter:102:20,200,800,280"), true, "seq19 notified enter 102")
    checkEq(events.contains("commit"), true, "seq19 notified commit")
    checkEq(events.contains("cancel"), true, "seq19 notified cancel")
  } finally {
    NativeBridge.nativeDestroyHost(api26Handle)
  }

  // 20. Four-phase predictive back dispatcher across API levels (24, 33, 34) with real
  //     decrementing back_stack_depth, standalone API 34+ button-back, and re-entrancy guard.
  val backCases = listOf(
    Triple(24, 0, false),
    Triple(32, 0, false),
    Triple(33, 1, false),
    Triple(34, 2, true),
    Triple(35, 2, true),
  )
  for ((sdk, expectedMode, supportsPredictive) in backCases) {
    val backHandle = NativeBridge.nativeCreateHost()
    try {
      var exitCalls = 0
      var reentrantBlocked = false
      var probeReentrantOnNextMutate = false
      val visitedDestinations = mutableListOf<String>()
      val docStore = HostDocumentStore()
      var switchingDoc = false
      val navIme = AffineImeController(
        handleProvider = { backHandle },
        onMutated = {},
        onTextEdited = { text ->
          if (!switchingDoc) {
            docStore.saveCurrent(text)
          }
        },
      )
      lateinit var dispatcher: AndroidBackDispatcher
      dispatcher = AndroidBackDispatcher(
        sdkInt = sdk,
        handleProvider = { backHandle },
        onMutated = {
          // Verify re-entrant commit inside Commit callback is blocked without double-popping.
          if (probeReentrantOnNextMutate) {
            probeReentrantOnNextMutate = false
            if (supportsPredictive) {
              if (!dispatcher.onBackInvoked()) reentrantBlocked = true
            } else {
              if (!dispatcher.onLegacyBackPressed()) reentrantBlocked = true
            }
          }
        },
        onDestinationChanged = { dest ->
          if (dest != null) {
            visitedDestinations.add(dest)
            if (docStore.activeDocumentId != dest) {
              val targetText = docStore.switchTo(dest, navIme.currentText())
              switchingDoc = true
              try {
                navIme.replaceText(0, navIme.currentText().length, targetText, 1)
              } finally {
                switchingDoc = false
              }
            }
          }
        },
        onSystemExit = { exitCalls += 1 },
      )
      checkEq(dispatcher.dispatchMode, expectedMode, "seq20 API $sdk dispatchMode")
      checkEq(dispatcher.currentDestination(), "workspace/home", "seq20 API $sdk starts on root destination")

      if (supportsPredictive) {
        // Case A: 3-page real destination stack ("workspace/home" -> "doc/welcome" -> "doc/settings")
        // driven via real host navigation entrypoints (navigateTo / openDocument),
        // with two consecutive standalone button/key onBackInvoked() WITHOUT onBackStarted().
        checkEq(dispatcher.navigateTo("doc/welcome"), true, "seq20 API $sdk navigateTo doc/welcome")
        checkEq(dispatcher.openDocument("settings"), true, "seq20 API $sdk openDocument settings")
        checkEq(dispatcher.currentDestination(), "doc/settings", "seq20 API $sdk active route doc/settings")
        probeReentrantOnNextMutate = true
        checkEq(dispatcher.onBackInvoked(), true, "seq20 API $sdk standalone back #1 pops to doc/welcome")
        checkEq(dispatcher.currentDestination(), "doc/welcome", "seq20 API $sdk route now doc/welcome")
        checkEq(reentrantBlocked, true, "seq20 API $sdk re-entrant onBackInvoked blocked")
        checkEq(dispatcher.onBackInvoked(), true, "seq20 API $sdk standalone back #2 pops to workspace/home")
        checkEq(dispatcher.currentDestination(), "workspace/home", "seq20 API $sdk route now workspace/home")
        checkEq(exitCalls, 0, "seq20 API $sdk no exit while popping stack")
        checkEq(dispatcher.onBackInvoked(), false, "seq20 API $sdk standalone back #3 at root returns false")
        checkEq(exitCalls, 1, "seq20 API $sdk root delegates to onSystemExit")

        // Case B: Real document content switch (Doc A -> Doc B):
        // Gesture Cancel keeps "Doc B"; Gesture Commit restores "Doc A";
        // follow-up standalone button back pops to workspace/home; root exits.
        checkEq(dispatcher.openDocument("doc-a"), true, "seq20 API $sdk openDocument doc-a")
        checkEq(navIme.commitText("Doc A", 1), true, "seq20 API $sdk write Doc A")
        checkEq(dispatcher.openDocument("doc-b"), true, "seq20 API $sdk openDocument doc-b")
        checkEq(navIme.commitText("Doc B", 1), true, "seq20 API $sdk write Doc B")
        checkEq(docStore.activeDocumentId, "doc/doc-b", "seq20 API $sdk active doc is doc/doc-b")
        checkEq(navIme.currentText(), "Doc B", "seq20 API $sdk IME holds Doc B")
        checkEq(dispatcher.onBackStarted(0f), true, "seq20 API $sdk gesture Start")
        checkEq(dispatcher.onBackProgressed(0.5f), true, "seq20 API $sdk gesture Progress")
        checkEq(dispatcher.onBackCancelled(), true, "seq20 API $sdk gesture Cancel")
        checkEq(dispatcher.currentDestination(), "doc/doc-b", "seq20 API $sdk Cancel keeps doc/doc-b")
        checkEq(navIme.currentText(), "Doc B", "seq20 API $sdk Cancel keeps Doc B content")
        checkEq(dispatcher.onBackStarted(0f), true, "seq20 API $sdk second gesture Start")
        checkEq(dispatcher.onBackProgressed(0.8f), true, "seq20 API $sdk second gesture Progress")
        checkEq(dispatcher.onBackInvoked(), true, "seq20 API $sdk gesture Commit pops to doc/doc-a")
        checkEq(dispatcher.currentDestination(), "doc/doc-a", "seq20 API $sdk route doc/doc-a after gesture")
        checkEq(docStore.activeDocumentId, "doc/doc-a", "seq20 API $sdk activeDocumentId restored to doc/doc-a")
        checkEq(navIme.currentText(), "Doc A", "seq20 API $sdk IME content restored to Doc A")
        checkEq(dispatcher.onBackInvoked(), true, "seq20 API $sdk follow-up button back pops to workspace/home")
        checkEq(dispatcher.currentDestination(), "workspace/home", "seq20 API $sdk route workspace/home after button")
        checkEq(dispatcher.onBackInvoked(), false, "seq20 API $sdk root back returns false")
        checkEq(exitCalls, 2, "seq20 API $sdk second root exit delegated")
        checkEq(visitedDestinations.contains("doc/doc-a"), true, "seq20 API $sdk destination callback fired")
      } else {
        checkEq(dispatcher.navigateTo("doc/welcome"), true, "seq20 API $sdk navigateTo doc/welcome")
        checkEq(dispatcher.openDocument("settings"), true, "seq20 API $sdk openDocument settings")
        checkEq(dispatcher.onBackStarted(0f), false, "seq20 API $sdk predictive Start disabled")
        probeReentrantOnNextMutate = true
        checkEq(dispatcher.onLegacyBackPressed(), true, "seq20 API $sdk legacy #1 pops to doc/welcome")
        checkEq(dispatcher.currentDestination(), "doc/welcome", "seq20 API $sdk legacy route doc/welcome")
        checkEq(reentrantBlocked, true, "seq20 API $sdk re-entrant onLegacyBackPressed blocked")
        checkEq(dispatcher.onLegacyBackPressed(), true, "seq20 API $sdk legacy #2 pops to workspace/home")
        checkEq(dispatcher.currentDestination(), "workspace/home", "seq20 API $sdk legacy route workspace/home")
        checkEq(exitCalls, 0, "seq20 API $sdk no exit while popping stack")
        checkEq(dispatcher.onLegacyBackPressed(), false, "seq20 API $sdk legacy root returns false")
        checkEq(exitCalls, 1, "seq20 API $sdk legacy root delegates to system exit")
      }
    } finally {
      NativeBridge.nativeDestroyHost(backHandle)
    }
  }

  // 21. Native PdfRenderer page bridge: valid ARGB_8888 -> RGBA8, negative dpiBucket clamp,
  //     out-of-bounds & OOM cap rejection, and >4096-pixel multi-chunk streaming conversion.
  var backendRenderCalls = 0
  val fakePdfBackend = object : PdfPageBackend {
    override fun pageCount(): Int = 3
    override fun renderPageArgb(pageIndex: Int, widthPx: Int, heightPx: Int): IntArray {
      backendRenderCalls += 1
      if (widthPx == 2 && heightPx == 2) {
        return intArrayOf(
          0xFF112233.toInt(),
          0x80AABBCC.toInt(),
          0xFFFFFFFF.toInt(),
          0x00010203,
        )
      }
      return IntArray(widthPx * heightPx) { idx ->
        if (idx % 2 == 0) 0xFF102030.toInt() else 0x80405060.toInt()
      }
    }
    override fun close() {}
  }
  AndroidPdfPageRenderer("doc-pdf-1", fakePdfBackend).use { pdf ->
    checkEq(pdf.renderPageRgba(-1, 2, 2), null, "seq21 negative page rejected")
    checkEq(pdf.renderPageRgba(3, 2, 2), null, "seq21 out-of-bounds page rejected")
    checkEq(pdf.renderPageRgba(0, 4097, 2), null, "seq21 OOM width > 4096 rejected")
    checkEq(pdf.renderPageRgba(0, 0, 2), null, "seq21 zero width rejected")
    checkEq(backendRenderCalls, 0, "seq21 invalid requests never invoke PdfRenderer backend")

    val page = pdf.renderPageRgba(1, 2, 2, dpiBucket = 320)
    checkEq(page != null, true, "seq21 valid 2x2 page rendered")
    checkEq(backendRenderCalls, 1, "seq21 backend invoked once for valid page")
    checkEq(page!!.cacheKey, "pdf:doc-pdf-1:p1:2x2@320dpi", "seq21 deterministic cache key")
    val expectedRgba = byteArrayOf(
      0x11, 0x22, 0x33, 0xFF.toByte(),
      0xAA.toByte(), 0xBB.toByte(), 0xCC.toByte(), 0x80.toByte(),
      0xFF.toByte(), 0xFF.toByte(), 0xFF.toByte(), 0xFF.toByte(),
      0x01, 0x02, 0x03, 0x00,
    )
    checkEq(page.rgbaBytes.contentEquals(expectedRgba), true, "seq21 exact ARGB_8888 -> RGBA8 conversion")

    // Negative dpiBucket clamps to 72dpi without NPE.
    checkEq(
      NativeBridge.nativePdfPageCacheKey("doc-pdf-1", 1, 2, 2, -100),
      "pdf:doc-pdf-1:p1:2x2@72dpi",
      "seq21 negative dpiBucket clamped to 72dpi without NPE",
    )
    // Mismatched array length rejected before conversion.
    checkEq(
      NativeBridge.nativePdfConvertArgbToRgba(intArrayOf(1, 2, 3), 2, 2),
      null,
      "seq21 mismatched pixel array length returns null",
    )
    // Multi-chunk streaming conversion (> 4096 pixels: 100 x 50 = 5000 pixels).
    val largePage = pdf.renderPageRgba(2, 100, 50, dpiBucket = -5)
    checkEq(largePage != null, true, "seq21 100x50 multi-chunk streaming page rendered")
    checkEq(largePage!!.cacheKey, "pdf:doc-pdf-1:p2:100x50@72dpi", "seq21 negative dpi clamped via renderer")
    checkEq(largePage.rgbaBytes.size, 5000 * 4, "seq21 5000-pixel RGBA8 byte length")
    checkEq(largePage.rgbaBytes[0], 0x10.toByte(), "seq21 chunk 0 pixel 0 R")
    checkEq(largePage.rgbaBytes[4999 * 4 + 3], 0x80.toByte(), "seq21 chunk 1 last pixel A")
  }

  // 22. Authoritative TextLayoutAuthority selection parity (zero snap-back to Rust estimates on
  //     ACTION_UP/ACTION_CANCEL/selectAll), line-midpoint vertical grab probe on multi-line text,
  //     cross-anchor active_drag flip for loupe tracking, and strict Autofill/Document buffer isolation.
  val layoutParityHandle = NativeBridge.nativeCreateHost()
  try {
    val narrowLayout = object : TextLayoutAuthority {
      override var cachedText: String = ""
      private val originX = 72f
      private val originY = 240f
      private val lineH = 60f

      private fun charWidth(c: Char): Float = when (c) {
        'i' -> 8f
        ' ' -> 14f
        else -> 30f
      }

      override fun ensureLayoutReady(text: String, viewportWidthPx: Int, density: Float): Boolean {
        cachedText = text
        return true
      }

      override fun caretBounds(
        utf16Offset: Int,
        isSelectionEnd: Boolean,
        selStart: Int,
        selEnd: Int,
      ): CaretBounds {
        val off = utf16Offset.coerceIn(0, cachedText.length)
        var line = 0
        var x = originX
        for (idx in 0 until off) {
          val ch = cachedText[idx]
          if (ch == '\n') {
            line += 1
            x = originX
          } else {
            x += charWidth(ch)
          }
        }
        val top = originY + line * lineH
        return CaretBounds(x = x, top = top, bottom = top + lineH, lineIndex = line, isRtlParagraph = false)
      }

      override fun selectionEndCarets(selStart: Int, selEnd: Int): Pair<CaretBounds, CaretBounds> =
        caretBounds(selStart, false, selStart, selEnd) to caretBounds(selEnd, true, selStart, selEnd)

      override fun closestOffset(x: Float, y: Float): Int {
        val lines = cachedText.split('\n')
        val targetLine = if (y < originY) 0 else ((y - originY) / lineH).toInt().coerceIn(0, lines.lastIndex)
        var lineStartOff = 0
        for (l in 0 until targetLine) {
          lineStartOff += lines[l].length + 1
        }
        val lineText = lines[targetLine]
        var bestOff = lineStartOff
        var curX = originX
        var bestDist = kotlin.math.abs(x - curX)
        for (i in lineText.indices) {
          curX += charWidth(lineText[i])
          val d = kotlin.math.abs(x - curX)
          if (d < bestDist) {
            bestDist = d
            bestOff = lineStartOff + i + 1
          }
        }
        return bestOff
      }
    }

    val ime = AffineImeController { layoutParityHandle }
    val sel = AndroidSelectionCoordinator({ layoutParityHandle })
    sel.setViewport(1080f, 2400f, 3f)
    val gesture = SelectionGestureController(
      coordinator = sel,
      layoutAuthority = narrowLayout,
      selectionStartProvider = { ime.selectionStart() },
      selectionEndProvider = { ime.selectionEnd() },
      onSelectionChanged = { lo, hi -> ime.setSelection(lo, hi) },
    )

    // Part A: "iiiiiiiiii world" [11, 16) -> ACTION_DOWN -> ACTION_MOVE -> ACTION_UP & ACTION_CANCEL
    // and performContextMenuAction(selectAll) must keep 0.0px error against TextLayoutAuthority.
    checkEq(ime.commitText("iiiiiiiiii world", 1), true, "seq22 commit narrow-i string")
    checkEq(ime.setSelection(11, 16), true, "seq22 select [11, 16) world")
    gesture.syncSelectionFromLayout(ime.currentText(), 11, 16, 1080, 3f)
    val expectedWorld = narrowLayout.selectionEndCarets(11, 16)
    val gInit = sel.overlayGeometry()!!
    checkEq(gInit[3], expectedWorld.first.x, "seq22 initial start tip matches authoritative layout")
    checkEq(gInit[9], expectedWorld.second.x, "seq22 initial end tip matches authoritative layout")
    checkEq(gesture.onDown(gInit[11], gInit[12], 3f), 2, "seq22 hit End handle on narrow-i string")
    checkEq(gesture.onMove(gInit[11], gInit[12]), true, "seq22 0px drag on narrow-i string")
    checkEq(gesture.onUp(1080, 3f), true, "seq22 ACTION_UP restores menu")
    val gAfterUp = sel.overlayGeometry()!!
    checkEq(gAfterUp[3], expectedWorld.first.x, "seq22 ACTION_UP start tip keeps 0px error (never snaps to Rust estimate)")
    checkEq(gAfterUp[9], expectedWorld.second.x, "seq22 ACTION_UP end tip keeps 0px error (never snaps to Rust estimate)")
    checkEq(gesture.onDown(gAfterUp[11], gAfterUp[12], 3f), 2, "seq22 hit End handle before cancel")
    checkEq(gesture.onCancel(1080, 3f), true, "seq22 ACTION_CANCEL finishes cleanly")
    val gAfterCancel = sel.overlayGeometry()!!
    checkEq(gAfterCancel[3], expectedWorld.first.x, "seq22 ACTION_CANCEL start tip keeps 0px error")
    checkEq(gAfterCancel[9], expectedWorld.second.x, "seq22 ACTION_CANCEL end tip keeps 0px error")

    val dummyClipboard = object : HostClipboard {
      var data: String? = null
      override fun setPlainText(label: String, text: String): Boolean { data = text; return true }
      override fun getPlainText(): String? = data
    }
    val selectAllIc = AffineSurfaceView.createInputConnection(
      handleProvider = { layoutParityHandle },
      onContextMenuAction = { id ->
        val ok = sel.handleContextMenuAction(id, ime, dummyClipboard)
        if (ok) gesture.syncSelectionFromLayout(ime.currentText(), ime.selectionStart(), ime.selectionEnd(), 1080, 3f)
        ok
      },
    )
    checkEq(selectAllIc.performContextMenuAction(android.R.id.selectAll), true, "seq22 IC selectAll")
    val expectedAll = narrowLayout.selectionEndCarets(0, 16)
    val gAll = sel.overlayGeometry()!!
    checkEq(gAll[3], expectedAll.first.x, "seq22 selectAll start tip matches layout")
    checkEq(gAll[9], expectedAll.second.x, "seq22 selectAll end tip matches layout")

    // Part B: Multi-line line-0 handle grab uses line midpoint (never jumps to line 1),
    // and cross-anchor inversion flips Rust active_drag so magnifier follows moving left end.
    checkEq(ime.replaceText(0, ime.currentText().length, "First line\nSecond line", 1), true, "seq22 seed 2-line text")
    checkEq(ime.setSelection(6, 10), true, "seq22 select line-0 'line' [6, 10)")
    gesture.syncSelectionFromLayout(ime.currentText(), 6, 10, 1080, 3f)
    val gMulti = sel.overlayGeometry()!!
    checkEq(gesture.onDown(gMulti[11], gMulti[12], 3f), 2, "seq22 grab line-0 End handle")
    // Stationary / tiny horizontal move must stay on line 0 (never jump to line 1).
    checkEq(gesture.onMove(gMulti[11], gMulti[12]), true, "seq22 stationary move on line 0")
    checkEq(ime.selectionStart(), 6, "seq22 line-0 grab stayed on line 0 start=6")
    checkEq(ime.selectionEnd(), 10, "seq22 line-0 grab stayed on line 0 end=10")
    // Drag right handle left past fixed anchor (offset 6) to offset 2 -> active_drag flips to Start
    // and magnifier.anchor_x tracks moving left end caret(2).x (NOT stationary right anchor caret(6).x).
    val targetLeftX = narrowLayout.caretBounds(2).x
    val endTipInitialX = narrowLayout.caretBounds(10).x
    checkEq(gesture.onMove(gMulti[11] + (targetLeftX - endTipInitialX), gMulti[12]), true, "seq22 cross-anchor drag to offset 2")
    checkEq(ime.selectionStart(), 2, "seq22 cross-anchor inverted start=2")
    checkEq(ime.selectionEnd(), 6, "seq22 cross-anchor inverted end=6")
    val gCross = sel.overlayGeometry()!!
    checkEq(gCross[14], 1f, "seq22 magnifier visible during cross-anchor drag")
    checkEq(kotlin.math.abs(gCross[15] - targetLeftX) < 0.01f, true, "seq22 magnifier anchor_x tracks moving left end")
    checkEq(gesture.onUp(1080, 3f), true, "seq22 release after cross-anchor drag")
    checkEq(ime.selectionStart(), 2, "seq22 post-release inverted start=2")
    checkEq(ime.selectionEnd(), 6, "seq22 post-release inverted end=6")

    // Mixed-BiDi outward teardrop orientation: embedded LTR run ("12", start_x < end_x) inside RTL
    // paragraph and embedded RTL run ("אב", start_x > end_x) inside LTR paragraph both lean outward.
    sel.updateSelection(200f, 300f, 240f, 300f, 60f, rtl = true, hasSelection = true)
    val gMixedLtrInRtl = sel.overlayGeometry()!!
    checkEq(gMixedLtrInRtl[5] < gMixedLtrInRtl[3], true, "seq22 RTL-para LTR-run start bulb leans left")
    checkEq(gMixedLtrInRtl[11] > gMixedLtrInRtl[9], true, "seq22 RTL-para LTR-run end bulb leans right")
    checkEq(gMixedLtrInRtl[11] - gMixedLtrInRtl[5] > gMixedLtrInRtl[7] * 2f, true, "seq22 RTL-para LTR-run bulbs never overlap")

    sel.updateSelection(240f, 300f, 200f, 300f, 60f, rtl = false, hasSelection = true)
    val gMixedRtlInLtr = sel.overlayGeometry()!!
    checkEq(gMixedRtlInLtr[5] > gMixedRtlInLtr[3], true, "seq22 LTR-para RTL-run start bulb leans right")
    checkEq(gMixedRtlInLtr[11] < gMixedRtlInLtr[9], true, "seq22 LTR-para RTL-run end bulb leans left")
    checkEq(gMixedRtlInLtr[5] - gMixedRtlInLtr[11] > gMixedRtlInLtr[7] * 2f, true, "seq22 LTR-para RTL-run bulbs never overlap")

    // Part C: Strict Autofill vs Document buffer isolation across password fill, editing, and route switch.
    val docStore = HostDocumentStore("doc/roadmap", "")
    lateinit var afCtrl: AndroidAutofillController
    lateinit var bufCtrl: HostDocumentBufferController
    val docIme = AffineImeController(
      handleProvider = { layoutParityHandle },
      onMutated = {},
      onTextEdited = { t -> bufCtrl.onImeTextEdited(t) },
    )
    afCtrl = AndroidAutofillController(
      sdkInt = 26,
      handleProvider = { layoutParityHandle },
      onValueCommitted = { id, text ->
        if (afCtrl.focusedFieldId() == id) {
          bufCtrl.applyAutofillTextToIme(text)
        }
      },
      onFocusedFieldTextSync = { _, text -> bufCtrl.applyAutofillTextToIme(text) },
    )
    bufCtrl = HostDocumentBufferController(
      documentStore = docStore,
      imeProvider = { docIme },
      autofillProvider = { afCtrl },
    )
    val nav = AndroidBackDispatcher(
      sdkInt = 34,
      handleProvider = { layoutParityHandle },
      onDestinationChanged = { dest -> if (dest != null) bufCtrl.onRouteChanged(dest) },
    )
    checkEq(nav.openDocument("roadmap"), true, "seq22 open doc/roadmap")
    checkEq(docIme.replaceText(0, docIme.currentText().length, "Project roadmap", 1), true, "seq22 write roadmap text")
    checkEq(bufCtrl.lastPreviewText, "Project roadmap", "seq22 preview shows Project roadmap")

    checkEq(afCtrl.registerField(202, 2, 20, 200, 800, 280, true, 0), true, "seq22 register password field")
    bufCtrl.onAutofillFocusChanged(202)
    checkEq(afCtrl.onAutofillValues(mapOf(202 to "s3cr3t!")), 1, "seq22 autofill password s3cr3t!")
    checkEq(bufCtrl.lastPreviewText.contains("s3cr3t!"), false, "seq22 password NEVER leaks into HostTextPreviewView")
    checkEq(bufCtrl.lastPreviewText, "Project roadmap", "seq22 preview stays Project roadmap while editing password")
    checkEq(docStore.readDocument("doc/roadmap"), "Project roadmap", "seq22 documentStore stays Project roadmap")

    // Switch route to doc B while password was focused, then back to doc A -> roadmap intact, password intact.
    checkEq(nav.openDocument("notes"), true, "seq22 navigate to doc/notes while password focused")
    checkEq(docIme.commitText("Meeting notes", 1), true, "seq22 write notes doc")
    checkEq(nav.onBackInvoked(), true, "seq22 back to doc/roadmap")
    checkEq(docIme.currentText(), "Project roadmap", "seq22 doc/roadmap restored intact")
    checkEq(bufCtrl.lastPreviewText, "Project roadmap", "seq22 preview restored to Project roadmap")
    checkEq(afCtrl.readFormValues()["password"], "s3cr3t!", "seq22 autofill password preserved")

    // Part D: Autofill session exit via commitAutofillSession / cancelAutofillSession / clearAutofillFields
    // must restore the document buffer immediately so subsequent typing and route switches never leak form text.
    val exitModes = listOf("commit", "cancel", "clear")
    for (mode in exitModes) {
      checkEq(afCtrl.registerField(202, 2, 20, 200, 800, 280, true, 0), true, "seq22 ($mode) register password field")
      checkEq(docIme.replaceText(0, docIme.currentText().length, "Doc-$mode", 1), true, "seq22 ($mode) seed doc text")
      bufCtrl.recordDocumentSelection(0, 3)
      bufCtrl.onAutofillFocusChanged(202)
      checkEq(docIme.replaceText(0, docIme.currentText().length, "f0rm-secret-99", 1), true, "seq22 ($mode) type secret in form")
      checkEq(docIme.setSelection(0, 6), true, "seq22 ($mode) select secret in form")
      // Simulated surfaceChanged while Autofill focused must keep currentDocumentText() untouched.
      checkEq(bufCtrl.isAutofillFocused(), true, "seq22 ($mode) autofill focused before resize")
      checkEq(bufCtrl.currentDocumentText(), "Doc-$mode", "seq22 ($mode) currentDocumentText hides form secret")
      checkEq(bufCtrl.lastPreviewText, "Doc-$mode", "seq22 ($mode) preview hides form secret")
      when (mode) {
        "commit" -> checkEq(bufCtrl.commitAutofillSession(), true, "seq22 commitAutofillSession")
        "cancel" -> checkEq(bufCtrl.cancelAutofillSession(), true, "seq22 cancelAutofillSession")
        "clear" -> bufCtrl.clearAutofillFields()
      }
      checkEq(bufCtrl.isAutofillFocused(), false, "seq22 ($mode) autofill unfocused after exit")
      checkEq(docIme.currentText(), "Doc-$mode", "seq22 ($mode) IME immediately restored to doc text")
      checkEq(docIme.setSelection(docIme.currentText().length, docIme.currentText().length), true, "seq22 ($mode) move caret to end")
      checkEq(docIme.commitText("!", 1), true, "seq22 ($mode) first edit after exit appends to doc")
      checkEq(docIme.currentText(), "Doc-$mode!", "seq22 ($mode) post-exit edit preserved doc without form text")
      checkEq(docStore.readDocument("doc/roadmap"), "Doc-$mode!", "seq22 ($mode) store saved clean doc")
      checkEq(nav.openDocument("scratch-$mode"), true, "seq22 ($mode) navigate away after exit")
      checkEq(nav.onBackInvoked(), true, "seq22 ($mode) navigate back after exit")
      checkEq(docIme.currentText(), "Doc-$mode!", "seq22 ($mode) roundtrip route switch kept clean doc")
      checkEq(docIme.currentText().contains("f0rm-secret-99"), false, "seq22 ($mode) no form secret leaked")
    }

    // Masked password field selection must clear document selection overlay while keeping form IME selection,
    // and must block copy/cut from writing masked password plaintext to the system clipboard.
    val maskedClipboard = object : HostClipboard {
      var data: String? = "text copied elsewhere"
      override fun setPlainText(label: String, text: String): Boolean {
        data = text
        return true
      }
      override fun getPlainText(): String? = data
    }
    val maskedSel = AndroidSelectionCoordinator({ layoutParityHandle })
    maskedSel.setViewport(1080f, 2400f, 3f)
    checkEq(afCtrl.registerField(202, 2, 20, 200, 800, 280, true, 0), true, "seq22 masked register password field")
    checkEq(docIme.replaceText(0, docIme.currentText().length, "Hello document", 1), true, "seq22 masked seed doc")
    bufCtrl.onAutofillFocusChanged(202)
    checkEq(bufCtrl.isFocusedAutofillFieldMasked(), true, "seq22 focused password field is masked")
    checkEq(docIme.replaceText(0, docIme.currentText().length, "s3cr3t-pass", 1), true, "seq22 type masked password")
    checkEq(docIme.setSelection(0, 6), true, "seq22 select [0, 6) inside masked password")
    // Mirror MainActivity.onImeMutated suppression when Autofill is focused.
    if (bufCtrl.isAutofillFocused()) {
      maskedSel.clear()
    }
    checkEq(docIme.selectionStart(), 0, "seq22 masked form IME keeps selectionStart=0")
    checkEq(docIme.selectionEnd(), 6, "seq22 masked form IME keeps selectionEnd=6")
    val gMasked = maskedSel.overlayGeometry()!!
    checkEq(gMasked[0], 0f, "seq22 masked password hides document overlay")
    val maskedIc = AffineSurfaceView.createInputConnection(
      handleProvider = { layoutParityHandle },
      onContextMenuAction = { actionId ->
        if (bufCtrl.isAutofillFocused() &&
          (actionId == android.R.id.copy || actionId == android.R.id.cut) &&
          bufCtrl.isFocusedAutofillFieldMasked()
        ) {
          false
        } else {
          val ok = maskedSel.handleContextMenuAction(actionId, docIme, maskedClipboard)
          if (bufCtrl.isAutofillFocused()) maskedSel.clear()
          ok
        }
      },
    )
    checkEq(maskedIc.performContextMenuAction(android.R.id.copy), false, "seq22 masked copy blocked")
    checkEq(maskedIc.performContextMenuAction(android.R.id.cut), false, "seq22 masked cut blocked")
    checkEq(maskedClipboard.data, "text copied elsewhere", "seq22 clipboard untouched by masked copy/cut")
    checkEq(bufCtrl.commitAutofillSession(), true, "seq22 exit masked autofill session")
    checkEq(docIme.currentText(), "Hello document", "seq22 doc restored after masked autofill exit")
    checkEq(docIme.setSelection(0, 5), true, "seq22 select [0, 5) in restored doc")
    checkEq(maskedIc.performContextMenuAction(android.R.id.copy), true, "seq22 doc copy works after exit")
    checkEq(maskedClipboard.data, "Hello", "seq22 doc copy wrote Hello to clipboard")

    // Part E: Mixed-direction run boundary disambiguation ("A אבג B") where RTL start offset 2
    // and LTR start offset 5 share one visual X coordinate.
    val bidiBoundaryLayout = object : TextLayoutAuthority {
      override var cachedText: String = "A \u05d0\u05d1\u05d2 B"
      private val originX = 60f
      private val originY = 200f
      private val lineH = 56f
      private val step = 28f
      // Visual X positions for "A אבג B" (len 7):
      // 0='A'[0..28], 1=' '[28..56], RTL run [2..5) occupies [56..140] (2->140, 3->112, 4->84, 5->56),
      // LTR run [5..7) occupies [140..196] (5->140, 6->168, 7->196).
      // Notice offset 2 (secondary) and offset 5 (primary) share visual X = originX + 140f!
      private fun primX(off: Int): Float = when (off) {
        0 -> 0f
        1 -> step
        2 -> step * 2f
        3 -> step * 4f
        4 -> step * 3f
        5 -> step * 5f
        6 -> step * 6f
        else -> step * 7f
      }
      private fun secX(off: Int): Float = when (off) {
        2 -> step * 5f
        5 -> step * 2f
        else -> primX(off)
      }
      override fun ensureLayoutReady(text: String, viewportWidthPx: Int, density: Float): Boolean {
        cachedText = text
        return true
      }
      override fun caretBounds(
        utf16Offset: Int,
        isSelectionEnd: Boolean,
        selStart: Int,
        selEnd: Int,
      ): CaretBounds {
        val inRtlRun = if (selStart < selEnd) {
          val idx = if (isSelectionEnd) (utf16Offset - 1).coerceIn(selStart, cachedText.length - 1) else utf16Offset
          idx in 2..4
        } else {
          false
        }
        val lx = if (inRtlRun) secX(utf16Offset) else primX(utf16Offset)
        return CaretBounds(originX + lx, originY, originY + lineH, 0, false)
      }
      override fun selectionEndCarets(selStart: Int, selEnd: Int): Pair<CaretBounds, CaretBounds> =
        caretBounds(selStart, false, selStart, selEnd) to caretBounds(selEnd, true, selStart, selEnd)
      override fun closestOffset(x: Float, y: Float): Int = closestOffset(x, y, -1)
      override fun closestOffset(x: Float, y: Float, preferredOffset: Int): Int {
        val localX = x - originX
        val snapTol = minOf(6f, step * 0.35f)
        if (preferredOffset in 0..cachedText.length) {
          if (kotlin.math.abs(localX - primX(preferredOffset)) <= snapTol ||
            kotlin.math.abs(localX - secX(preferredOffset)) <= snapTol
          ) {
            return preferredOffset
          }
        }
        // Ambiguous point at step*5 always returns 5 when preferredOffset is not matched.
        return when {
          localX < step * 0.5f -> 0
          localX < step * 1.5f -> 1
          localX < step * 2.5f -> 2
          localX < step * 3.5f -> 4
          localX < step * 4.5f -> 3
          localX < step * 5.5f -> 5
          localX < step * 6.5f -> 6
          else -> 7
        }
      }
    }
    val bidiGesture = SelectionGestureController(
      coordinator = sel,
      layoutAuthority = bidiBoundaryLayout,
      selectionStartProvider = { ime.selectionStart() },
      selectionEndProvider = { ime.selectionEnd() },
      onSelectionChanged = { lo, hi -> ime.setSelection(lo, hi) },
    )
    checkEq(ime.replaceText(0, ime.currentText().length, "A \u05d0\u05d1\u05d2 B", 1), true, "seq22 seed mixed BiDi boundary text")
    // Case 1: [2, 5) start handle at shared boundary X -> stationary MOVE(0px) stays [2, 5), inward drag shrinks to [3, 5).
    checkEq(ime.setSelection(2, 5), true, "seq22 select RTL [2, 5)")
    bidiGesture.syncSelectionFromLayout(ime.currentText(), 2, 5, 1080, 3f)
    val gRtl = sel.overlayGeometry()!!
    checkEq(bidiGesture.onDown(gRtl[5], gRtl[6], 3f), 1, "seq22 hit RTL [2, 5) start handle")
    checkEq(bidiGesture.onMove(gRtl[5], gRtl[6]), true, "seq22 RTL [2, 5) 0px move")
    checkEq(ime.selectionStart(), 2, "seq22 RTL [2, 5) 0px move preserves start=2")
    checkEq(ime.selectionEnd(), 5, "seq22 RTL [2, 5) 0px move preserves end=5")
    checkEq(bidiGesture.onMove(gRtl[5] - 28f, gRtl[6]), true, "seq22 RTL [2, 5) inward 1-glyph drag")
    checkEq(bidiGesture.onUp(1080, 3f), true, "seq22 RTL [2, 5) release")
    checkEq(ime.selectionStart(), 3, "seq22 RTL [2, 5) inward drag shrinks to start=3")
    checkEq(ime.selectionEnd(), 5, "seq22 RTL [2, 5) inward drag keeps end=5")

    // Case 2: [5, 7) start handle at shared boundary X -> stationary MOVE(0px) stays [5, 7), inward drag shrinks to [6, 7).
    checkEq(ime.setSelection(5, 7), true, "seq22 select LTR [5, 7)")
    bidiGesture.syncSelectionFromLayout(ime.currentText(), 5, 7, 1080, 3f)
    val gLtr = sel.overlayGeometry()!!
    checkEq(bidiGesture.onDown(gLtr[5], gLtr[6], 3f), 1, "seq22 hit LTR [5, 7) start handle")
    checkEq(bidiGesture.onMove(gLtr[5], gLtr[6]), true, "seq22 LTR [5, 7) 0px move")
    checkEq(ime.selectionStart(), 5, "seq22 LTR [5, 7) 0px move preserves start=5")
    checkEq(ime.selectionEnd(), 7, "seq22 LTR [5, 7) 0px move preserves end=7")
    checkEq(bidiGesture.onMove(gLtr[5] + 28f, gLtr[6]), true, "seq22 LTR [5, 7) inward 1-glyph drag")
    checkEq(bidiGesture.onUp(1080, 3f), true, "seq22 LTR [5, 7) release")
    checkEq(ime.selectionStart(), 6, "seq22 LTR [5, 7) inward drag shrinks to start=6")
    checkEq(ime.selectionEnd(), 7, "seq22 LTR [5, 7) inward drag keeps end=7")
  } finally {
    NativeBridge.nativeDestroyHost(layoutParityHandle)
  }

  // Sequence 23: Real JNI parity for [D-1] IPv6 AuthSessionStore single-source DataStore key/alias
  // (verifying internal key/alias unity & rollback readback rule) and [D-2] bare `local-auth`
  // single-key FreshInstall classification with verbatim rollback preservation.
  val seq23Dir = java.nio.file.Files.createTempDirectory("affine-android-seq23-").toFile()
  val seq23Handle = NativeBridge.nativeCreateHost()
  try {
    val seq23Cipher = AuthTokenCipher(
      keyProvider = InMemoryAesKeyProvider(),
      explicitIvForJvm = true,
    )
    val seq23Store = AuthSessionStore(
      filesDir = seq23Dir.absolutePath,
      cipher = seq23Cipher,
      cookieCleaner = object : CookieCleaner {
        override fun clearAuthCookies(canonicalEndpoint: String) {}
      },
    )
    val ipv6Endpoint = "https://[::1]:8443"
    val ipv6ServerResp = """{"tokenType":"Bearer","accessToken":"acc-ipv6-1","expiresIn":3600,"refreshToken":"ref-ipv6-1","refreshExpiresAt":"2027-01-25T00:00:00Z","session":{"id":"sess-ipv6-1","absoluteExpiresAt":"2027-06-25T00:00:00Z"}}"""
    checkEq(
      seq23Store.storeServerResponse(ipv6Endpoint, ipv6ServerResp, 1_700_000_000_000L),
      true,
      "seq23 store IPv6 session",
    )
    checkEq(
      NativeBridge.nativeAuthTokenKey(ipv6Endpoint),
      "auth-token:https://::1:8443",
      "seq23 nativeAuthTokenKey strips IPv6 brackets in parity with keystore alias",
    )
    val rawDisk = NativeBridge.nativeDataStoreReadResult(
      seq23Dir.absolutePath,
      "auth-token:https://::1:8443",
    )
    checkEq(
      rawDisk.startsWith("OK:v1:"),
      true,
      "seq23 DataStore persists encrypted session under auth-token:https://::1:8443",
    )
    val decryptedIpv6 = seq23Store.readSessionJson(ipv6Endpoint)
    checkEq(
      decryptedIpv6 != null &&
        NativeBridge.nativeExtractJsonStringField(decryptedIpv6, "accessToken") == "acc-ipv6-1",
      true,
      "seq23 AuthSessionStore reads back and decrypts IPv6 session via single-source key",
    )

    // Bare `local-auth` single key classifies as FreshInstall (canCreateDefaultWorkspace == true,
    // 0 workspaces mounted) while preserving `"local-auth": "\"tok\""` verbatim in write-back plan.
    val bareAuthPayload = """{"origin":"https://localhost","length":1,"keys":["local-auth"],"entries":{"local-auth":"\"tok\""},"idbTouchCount":0}"""
    checkEq(
      NativeBridge.nativeImportLegacyLocalStorageProbe(seq23Handle, bareAuthPayload, ""),
      true,
      "seq23 bare local-auth probe succeeds",
    )
    checkEq(
      NativeBridge.nativeCanCreateDefaultWorkspace(seq23Handle),
      true,
      "seq23 bare local-auth classifies as FreshInstall (canCreateDefaultWorkspace=true)",
    )
    checkEq(
      NativeBridge.nativeGetAllowlistedWorkspaceIdsJson(seq23Handle),
      "[]",
      "seq23 bare local-auth mounts 0 workspaces",
    )
    val bareWriteback = NativeBridge.nativePlanLegacyLocalStorageWriteBack(seq23Handle)
    checkEq(
      bareWriteback != null && bareWriteback.contains("\"local-auth\":\"\\\"tok\\\"\""),
      true,
      "seq23 bare local-auth preserved verbatim in rollback writeback plan",
    )
  } finally {
    NativeBridge.nativeDestroyHost(seq23Handle)
    seq23Dir.deleteRecursively()
  }

  println("Kotlin JNI Android host parity check passed (23/23 sequences)")
}
