import android.view.inputmethod.InputConnection
import app.affine.pro.host.AffineImeController
import app.affine.pro.host.AffineSurfaceView
import app.affine.pro.host.AndroidBootstrapCoordinator
import app.affine.pro.host.AndroidCookieCleaner
import app.affine.pro.host.AuthSessionStore
import app.affine.pro.host.AuthTokenCipher
import app.affine.pro.host.CookieCleaner
import app.affine.pro.host.HttpUrlConnectionRefreshTransport
import app.affine.pro.host.InMemoryAesKeyProvider
import app.affine.pro.host.LegacyLocalStorageProbe
import app.affine.pro.host.NativeBridge
import app.affine.pro.host.RefreshResult
import app.affine.pro.host.RefreshTransport
import app.affine.pro.host.Rfc4648Base64
import app.affine.pro.host.SessionPersistence
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
  checkEq(LegacyLocalStorageProbe.isAllowedKey("affine-flag:enable_ai"), true, "seq12 allow affine-flag")
  checkEq(LegacyLocalStorageProbe.isAllowedKey("affine_theme"), false, "seq12 reject fictional affine_theme")
  checkEq(LegacyLocalStorageProbe.isAllowedKey("affine_server_url"), false, "seq12 reject fictional affine_server_url")

  val captureJs = LegacyLocalStorageProbe.buildCaptureScript()
  checkEq(captureJs.contains("window.indexedDB"), true, "seq12 capture hooks window.indexedDB")
  checkEq(captureJs.contains("'open'"), true, "seq12 capture blocks indexedDB.open")
  checkEq(captureJs.contains("'deleteDatabase'"), true, "seq12 capture blocks indexedDB.deleteDatabase")
  checkEq(captureJs.contains("global-state:serverList"), true, "seq12 capture includes 0.27.5 serverList")
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

    // Genuine fresh install with an unrelated non-allowlisted third-party key (length=1, keys=["__cap_noise__"], entries={}).
    val freshWithNoise = """{"origin":"https://localhost","length":1,"keys":["__cap_noise__"],"entries":{},"idbTouchCount":0}"""
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

    // Mixed 1 allowlisted key + 1 unrelated noise key (length=2, keys.len=2) imports cleanly.
    val mixedNoiseSentinel = """{"origin":"https://localhost","length":2,"keys":["__cap_noise__","affine-local-workspace"],"entries":{"affine-local-workspace":"[\"ws-live\"]"},"idbTouchCount":0}"""
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

      // Empty list -> zero mounts and evicts previously mounted local DB.
      val bootEmpty = coordinator.completeWithProbePayload(deletedAllSentinel)
      checkEq(bootEmpty.imported, true, "seq12b empty list imported")
      checkEq(bootEmpty.connectedWorkspaceKeys.isEmpty(), true, "seq12b empty list zero mounts")
      checkEq(NativeBridge.nativeStorageCheckpointAllPassive(bootHandle), 0, "seq12b evicted old local DB")

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
    checkEq(NativeBridge.nativeLegacyAppDataStoreSetString(tmpDir.absolutePath, "app.affine.proaffine_user_id", "u1"), true, "seq15 seed legacy affine.preferences_pb user_id")
    checkEq(NativeBridge.nativeLegacyAppDataStoreSetString(tmpDir.absolutePath, "app.affine.proaffine_csrf_token", "c1"), true, "seq15 seed legacy affine.preferences_pb csrf")
    checkEq(NativeBridge.nativeLegacyAppDataStoreSetString(tmpDir.absolutePath, "theme", "dark"), true, "seq15 seed legacy affine.preferences_pb theme")
    checkEq(store.storeServerResponse(ep, serverResp, nowMs), true, "seq15 re-seed auth session before clear")
    store.clearSession(ep)
    checkEq(NativeBridge.nativeLegacyAppDataStoreGetString(tmpDir.absolutePath, "app.affine.proaffine_user_id"), null, "seq15 affine.preferences_pb user_id deleted")
    checkEq(NativeBridge.nativeLegacyAppDataStoreGetString(tmpDir.absolutePath, "app.affine.proaffine_csrf_token"), null, "seq15 affine.preferences_pb csrf deleted")
    checkEq(NativeBridge.nativeLegacyAppDataStoreGetString(tmpDir.absolutePath, "theme"), "dark", "seq15 affine.preferences_pb theme preserved")
    checkEq(store.getOrCreateInstallationId("must-still-preserve"), "inst-fixed-0275", "seq15 auth-sessions installationId preserved")

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
    } finally {
      retryDir.deleteRecursively()
    }
  } finally {
    NativeBridge.nativeDestroyHost(s2Handle)
    tmpDir.deleteRecursively()
  }

  println("Kotlin JNI AffineInputConnection + S2 Storage/DataStore/Probe real .so parity check passed (16/16 sequences)")
}
