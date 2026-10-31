import { FeatureFlagService } from '@blocksuite/affine/shared/services';
import { TextSelection } from '@blocksuite/std';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';
import { createStubVirtualKeyboardExtension } from './utils.js';

// Phase 4 (MOBILE-15, Bug B, D-09): proves `AffineKeyboardToolbar`'s bottom
// offset reactively tracks the stub `VirtualKeyboardProvider`'s
// `visible$`/`height$`/`appTabSafeArea$` signals -- the exact same signal
// chain the real app bridges from `app.tsx`'s existing `visualViewport`
// listener via `KeyboardToolbarExtension` (packages/frontend/core).
//
// FALSE-CONFIDENCE RECORD (keyboard-toolbar-y-jump, 2026-09-28): this spec
// originally asserted `toolbar.style.bottom` directly, because commit
// d6c2537e40 had added a `this.style.bottom = ...` write to the widget and
// the spec was written to cover that write. It passed, yet the toolbar was
// visibly wrong on-device: the reserved offset was ALSO supplied by the
// `<affine-keyboard-tool-panel>` spacer's inline height, so the icon bar
// rendered at 2 x the offset. Asserting the property a fix touches cannot
// detect double-counting by a second mechanism -- only rendered geometry
// can. The assertions below therefore measure the spacer that actually
// produces the offset; the absolute placement invariant lives in
// `keyboard-toolbar-geometry-touch.spec.ts`.
describe('keyboard-toolbar bottom position touch reachability (Phase 4, MOBILE-15)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page', [
      createStubVirtualKeyboardExtension(),
    ]);
    return cleanup;
  });

  async function focusFreshParagraph() {
    // The widget only renders when `enable_mobile_keyboard_toolbar` is on
    // (default false, matching `enableMobileDatabaseEditing`'s established
    // opt-in pattern in this same directory's utils.ts) and the dispatcher
    // is active for this scope (`std.event.active$`, mirrored by the
    // widget's own `_show$`).
    doc.get(FeatureFlagService).setFlag('enable_mobile_keyboard_toolbar', true);

    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);

    const selection = editor.std.selection.create(TextSelection, {
      from: { blockId: paragraphId, index: 0, length: 0 },
      to: null,
    });
    editor.std.selection.setGroup('note', [selection]);
    editor.std.event.active = true;
    await wait();

    return { paragraphId };
  }

  test('reserved bottom offset reactively tracks keyboard.height$/visible$/appTabSafeArea$', async () => {
    await focusFreshParagraph();

    const toolbar = document.querySelector<HTMLElement>(
      'affine-keyboard-toolbar'
    );
    expect(toolbar).toBeTruthy();

    // The spacer whose height IS the reserved bottom offset. Measuring its
    // rendered height (not a style string) is what makes this a real
    // geometry assertion.
    const spacer = toolbar!.querySelector<HTMLElement>(
      'affine-keyboard-tool-panel'
    );
    expect(spacer).toBeTruthy();

    const keyboard = (
      toolbar as unknown as {
        keyboard: {
          visible$: { value: boolean };
          height$: { value: number };
          appTabSafeArea$: { value: string };
        };
      }
    ).keyboard;

    keyboard.appTabSafeArea$.value = '60px';

    // (1) keyboard hidden: the offset falls back to appTabSafeArea$.
    keyboard.visible$.value = false;
    keyboard.height$.value = 0;
    await wait();
    expect(spacer!.getBoundingClientRect().height).toBeCloseTo(60, 0);

    // (2) keyboard visible with a live height: the offset updates
    // reactively, proving this is a live binding, not a one-time read.
    keyboard.visible$.value = true;
    keyboard.height$.value = 300;
    await wait();
    expect(spacer!.getBoundingClientRect().height).toBeCloseTo(300, 0);

    // (3) The host itself must contribute NO offset of its own -- otherwise
    // (2)'s offset is applied twice. This is the regression guard for
    // keyboard-toolbar-y-jump.
    expect(getComputedStyle(toolbar!).bottom).toBe('0px');
  });
});
