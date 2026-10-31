/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';

import { isEventOwnedByNestedHost } from '../event/utils.js';

// 999.11 follow-up: with a linked note (note-ref) on the page there are
// nested editor hosts. pointerdown/click/focusin bubble from the inner host
// to the outer one and each host activated itself, so the outer page editor
// stole activation back on every tap: the inner editor's keyboard toolbar
// was torn down and re-created before every pointerdown (recorded:
// toolbar -/+/-/+ per tap), and iOS -- seeing content change under the
// finger -- withheld the click, so no caret was placed until a scroll.
describe('isEventOwnedByNestedHost', () => {
  const build = () => {
    const outer = document.createElement('editor-host');
    const inner = document.createElement('editor-host');
    const outerText = document.createElement('span');
    const innerText = document.createElement('span');
    outer.append(outerText, inner);
    inner.append(innerText);
    document.body.append(outer);
    return { outer, inner, outerText, innerText };
  };

  it('is true for the outer host when the event came from inside a nested host', () => {
    const { outer, innerText } = build();
    expect(isEventOwnedByNestedHost(outer, innerText)).toBe(true);
  });

  it('is false for the innermost host itself', () => {
    const { inner, innerText } = build();
    expect(isEventOwnedByNestedHost(inner, innerText)).toBe(false);
  });

  it('is false for the outer host for its own content', () => {
    const { outer, outerText } = build();
    expect(isEventOwnedByNestedHost(outer, outerText)).toBe(false);
  });

  it('is false for a non-node or text-node target handled via its parent', () => {
    const { outer, innerText } = build();
    expect(isEventOwnedByNestedHost(outer, null)).toBe(false);
    const text = document.createTextNode('x');
    innerText.append(text);
    expect(isEventOwnedByNestedHost(outer, text)).toBe(true);
  });
});
