/**
 * @vitest-environment happy-dom
 */
import {
  caretKey,
  shouldPlaceCaretAfterTap,
} from '@blocksuite/affine-block-note-ref';
import { describe, expect, it } from 'vitest';

// 999.11 follow-up: inside a linked note (an editable region nested in a
// contenteditable=false island inside the page's editable note), iOS
// delivers an uncancelled tap (touchend/mousedown/mouseup/click, recorded:
// nothing preventDefault'ed) yet does NOT move the caret. Placing it
// programmatically works and sticks (recorded), so a touch tap that did
// not move the caret places it at the tap point.
describe('shouldPlaceCaretAfterTap', () => {
  const down = { x: 100, y: 200, caret: 'a' };

  it('places the caret when a still tap left the caret where it was', () => {
    expect(shouldPlaceCaretAfterTap(down, { x: 102, y: 203 }, 'a')).toBe(true);
  });

  it('leaves it alone when iOS did move the caret', () => {
    expect(shouldPlaceCaretAfterTap(down, { x: 100, y: 200 }, 'b')).toBe(false);
  });

  it('leaves it alone for a drag or scroll gesture (moved > 10px)', () => {
    expect(shouldPlaceCaretAfterTap(down, { x: 100, y: 230 }, 'a')).toBe(false);
  });
});

describe('caretKey', () => {
  it('identifies the caret position by node and offset', () => {
    const p = document.createElement('p');
    p.textContent = 'hello';
    document.body.append(p);
    const sel = document.getSelection()!;
    sel.collapse(p.firstChild, 2);
    const k1 = caretKey(sel);
    sel.collapse(p.firstChild, 3);
    expect(caretKey(sel)).not.toBe(k1);
    sel.collapse(p.firstChild, 2);
    expect(caretKey(sel)).toBe(k1);
  });

  it('handles no selection', () => {
    expect(caretKey(null)).toBe('none');
  });
});
