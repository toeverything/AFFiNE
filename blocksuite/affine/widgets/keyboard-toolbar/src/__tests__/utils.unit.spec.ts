/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';

import {
  isRootComponentActive,
  isSelectionStaleForFocus,
  panelPaddingBottom,
  scrollIntoViewDelta,
  selectionKey,
  shouldRescrollAfterKeyboardChange,
  shouldScrollForSelectionChange,
} from '../utils';

describe('isRootComponentActive', () => {
  // keyboard-focus-tabbar-coordination (round 2): real on-device capture
  // (affine-dev-MobileDebugLog_debug-plus-1.log) shows the widget's
  // fallback show/hide keyboard actions silently no-op
  // (isActiveElement: false, inputModeBefore/After both "") while editing a
  // Journal Todo row -- because the actually-focused element (the row, or
  // its title cell's inline editor) is a DESCENDANT of rootComponent, never
  // rootComponent itself. See utils.ts doc comment for the full mechanism.

  it('returns false when there is no rootComponent', () => {
    const activeElement = document.createElement('div');
    expect(isRootComponentActive(null, activeElement)).toBe(false);
    expect(isRootComponentActive(undefined, activeElement)).toBe(false);
  });

  it('returns false when nothing is focused (activeElement is null)', () => {
    const rootComponent = document.createElement('div');
    expect(isRootComponentActive(rootComponent, null)).toBe(false);
  });

  it('returns true when rootComponent itself is the active element (legacy exact-match case)', () => {
    const rootComponent = document.createElement('div');
    expect(isRootComponentActive(rootComponent, rootComponent)).toBe(true);
  });

  it('returns true when the active element is a descendant of rootComponent -- e.g. a focused database/Journal Todo row', () => {
    const rootComponent = document.createElement('div');
    const row = document.createElement('div');
    row.tabIndex = 0;
    rootComponent.append(row);

    // real capture shows this is the actual case on-device: the focused
    // row is nested well inside rootComponent's subtree, never
    // rootComponent itself.
    expect(isRootComponentActive(rootComponent, row)).toBe(true);
  });

  it('returns true when the active element is a deeply nested descendant -- e.g. a row title cell inline editor', () => {
    const rootComponent = document.createElement('div');
    const row = document.createElement('div');
    const titleCell = document.createElement('data-view-header-area-text');
    const richText = document.createElement('rich-text');
    rootComponent.append(row);
    row.append(titleCell);
    titleCell.append(richText);

    expect(isRootComponentActive(rootComponent, richText)).toBe(true);
  });

  it('returns false when the active element is outside rootComponent entirely -- e.g. focus landed on an unrelated element', () => {
    const rootComponent = document.createElement('div');
    const unrelated = document.createElement('button');
    document.body.append(rootComponent, unrelated);

    expect(isRootComponentActive(rootComponent, unrelated)).toBe(false);
  });
});

describe('isSelectionStaleForFocus', () => {
  // 999.1 A-2 (db-row-toolbar-scroll): database rows never update
  // std.selection, so after moving from a paragraph into a Journal Todo row
  // the selection still names the paragraph. Tapping the already-focused row
  // re-mounts the toolbar, whose scroll-into-view then scrolled the page to
  // that stale paragraph while focus stayed in the row.
  function editable() {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    return el;
  }

  it('is stale when an editable element outside the selected block has focus (row focused, paragraph selected)', () => {
    const paragraph = document.createElement('div');
    const rowTitle = editable();
    expect(isSelectionStaleForFocus(paragraph, rowTitle)).toBe(true);
  });

  it('is not stale when focus is inside the selected block', () => {
    const paragraph = document.createElement('div');
    const inline = editable();
    paragraph.append(inline);
    expect(isSelectionStaleForFocus(paragraph, inline)).toBe(false);
  });

  it('is not stale when the focused editable root CONTAINS the selected block (ordinary text: activeElement is affine-note)', () => {
    const note = editable();
    const listItem = document.createElement('div');
    note.append(listItem);
    expect(isSelectionStaleForFocus(listItem, note)).toBe(false);
  });

  it('is still stale for a database row title inside the same note (row focused, paragraph selected)', () => {
    const note = document.createElement('div');
    const paragraph = document.createElement('div');
    const rowTitle = editable();
    note.append(paragraph, rowTitle);
    expect(isSelectionStaleForFocus(paragraph, rowTitle)).toBe(true);
  });

  it('is not stale when nothing editable has focus (keeps existing behaviour)', () => {
    const paragraph = document.createElement('div');
    expect(isSelectionStaleForFocus(paragraph, null)).toBe(false);
    expect(isSelectionStaleForFocus(paragraph, document.body)).toBe(false);
    expect(
      isSelectionStaleForFocus(paragraph, document.createElement('button'))
    ).toBe(false);
  });

  it('treats a focused input/textarea outside the block as stale', () => {
    const paragraph = document.createElement('div');
    expect(
      isSelectionStaleForFocus(paragraph, document.createElement('textarea'))
    ).toBe(true);
    expect(
      isSelectionStaleForFocus(paragraph, document.createElement('input'))
    ).toBe(true);
  });
});

describe('panelPaddingBottom', () => {
  // 999.1 62px floor: the spacer is box-sizing: border-box, so its
  // tab-bar safe-area padding was a hard minimum height. With the keyboard
  // open the real keyboard offset can be < 62px (full scroll), and the
  // toolbar stopped 62px above the keyboard.
  it('drops the tab-bar padding while the keyboard is open and no panel is open', () => {
    expect(panelPaddingBottom(false, true, '62px')).toBe('0px');
  });

  it('keeps the tab-bar padding while the keyboard is closed', () => {
    expect(panelPaddingBottom(false, false, '62px')).toBe('62px');
  });

  it('keeps the tab-bar padding while a "+" panel is open (keyboard hidden behind it)', () => {
    expect(panelPaddingBottom(true, true, '62px')).toBe('62px');
    expect(panelPaddingBottom(true, false, '62px')).toBe('62px');
  });
});

describe('shouldRescrollAfterKeyboardChange', () => {
  // 999.1: tapping text in the lower half left the caret under the toolbar.
  // The toolbar's scroll-into-view ran at tap time (toolbar still at the
  // screen bottom), before the keyboard rose; nothing re-checked once the
  // toolbar reached the keyboard. Re-check on keyboard height changes, but
  // only shortly after the keyboard opened, so a later user scroll (which
  // also settles a new height) is never yanked back to the caret.
  it('re-scrolls for height changes within the window after the keyboard opened', () => {
    expect(shouldRescrollAfterKeyboardChange(true, 1000, 1050)).toBe(true);
    expect(shouldRescrollAfterKeyboardChange(true, 1000, 1999)).toBe(true);
  });

  it('does not re-scroll for height changes long after opening (user scroll settles)', () => {
    expect(shouldRescrollAfterKeyboardChange(true, 1000, 2500)).toBe(false);
  });

  it('does not re-scroll while the keyboard is closed or before it ever opened', () => {
    expect(shouldRescrollAfterKeyboardChange(false, 1000, 1050)).toBe(false);
    expect(shouldRescrollAfterKeyboardChange(true, undefined, 1050)).toBe(
      false
    );
  });
});

describe('scrollIntoViewDelta', () => {
  // toolbarTop 317, gap 8 (on-device values: caret 336-355 under the bar)
  it('scrolls just enough to clear the caret, not the whole block', () => {
    expect(scrollIntoViewDelta(317, 900, 355, 8)).toBe(46);
  });

  it('falls back to the block bottom when there is no caret rect', () => {
    expect(scrollIntoViewDelta(317, 358, null, 8)).toBe(49);
  });

  it('does not scroll when the target is already above the toolbar', () => {
    expect(scrollIntoViewDelta(317, 900, 300, 8)).toBe(0);
    expect(scrollIntoViewDelta(317, 300, null, 8)).toBe(0);
  });
});

describe('selectionKey', () => {
  // 999.11: touching the page to scroll re-emits the SAME selection; the
  // toolbar's selection effect treated every emission as a caret move and
  // scrolled the caret's block (in the linked notes) back into view on every
  // touchstart, so the user could never scroll up to the Journal Todo.
  const text = (blockId: string, index: number, length = 0) => ({
    toJSON: () => ({
      type: 'text',
      from: { blockId, index, length },
      to: null,
    }),
  });

  it('is equal for a re-emitted identical selection', () => {
    expect(selectionKey([text('p1', 3)])).toBe(selectionKey([text('p1', 3)]));
  });

  it('differs when the caret moves or the block changes', () => {
    expect(selectionKey([text('p1', 3)])).not.toBe(
      selectionKey([text('p1', 4)])
    );
    expect(selectionKey([text('p1', 3)])).not.toBe(
      selectionKey([text('p2', 3)])
    );
  });

  it('handles an empty selection', () => {
    expect(selectionKey([])).toBe('[]');
  });
});

describe('shouldScrollForSelectionChange', () => {
  // 999.11: the keyboard toolbar is torn down and re-created on every touch
  // inside a linked note's nested editor (recorded: 19 mounts in a few
  // touches). A per-instance "last selection" was reset by every re-mount,
  // so each new toolbar scrolled the unchanged caret back into view. The
  // memory must outlive the toolbar instance -- keyed by the editor root.
  it('scrolls for the first selection seen for an editor root', () => {
    const memory = new WeakMap<object, string>();
    expect(shouldScrollForSelectionChange(memory, {}, 'k1')).toBe(true);
  });

  it('does not scroll again for the same selection, even from a new toolbar instance', () => {
    const memory = new WeakMap<object, string>();
    const root = {};
    shouldScrollForSelectionChange(memory, root, 'k1');
    // a re-mounted toolbar shares the module-level memory and the same root
    expect(shouldScrollForSelectionChange(memory, root, 'k1')).toBe(false);
  });

  it('scrolls when the selection changes, and tracks editor roots separately', () => {
    const memory = new WeakMap<object, string>();
    const a = {};
    const b = {};
    shouldScrollForSelectionChange(memory, a, 'k1');
    expect(shouldScrollForSelectionChange(memory, a, 'k2')).toBe(true);
    expect(shouldScrollForSelectionChange(memory, b, 'k2')).toBe(true);
  });
});
