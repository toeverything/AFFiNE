import android.view.inputmethod.InputConnection
import app.affine.pro.host.AffineImeController
import app.affine.pro.host.AffineSurfaceView
import app.affine.pro.host.NativeBridge

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

  println("Kotlin JNI AffineInputConnection real .so parity check passed (10/10 sequences)")
}
