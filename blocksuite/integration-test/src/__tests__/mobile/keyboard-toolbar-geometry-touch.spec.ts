import { FeatureFlagService } from '@blocksuite/affine/shared/services';
import { TextSelection } from '@blocksuite/std';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';
import { createStubVirtualKeyboardExtension } from './utils.js';

// keyboard-toolbar-y-jump: geometry regression suite.
//
// Why this exists alongside `keyboard-toolbar-position-touch.spec.ts`:
// that spec asserts only `toolbar.style.bottom`, i.e. the single property
// commit `d6c2537e40` changed. It therefore cannot observe whether the icon
// bar actually LANDS on the keyboard's top edge, which is the thing the user
// sees and the thing that was broken. This file asserts rendered geometry
// instead -- where `.keyboard-toolbar` (the row of +/format/undo icons)
// physically sits relative to the bottom of the fixed-positioning viewport.
//
// The measured invariant, in all three states:
//
//   distance(viewport bottom -> icon bar's bottom edge) === the offset that
//   state is supposed to reserve at the bottom of the screen
//
//     * keyboard visible          -> keyboard.height$
//     * keyboard hidden, panel up -> keyboard.staticHeight$
//     * keyboard hidden, no panel -> keyboard.appTabSafeArea$
//
// `affine-keyboard-toolbar` is `position: fixed; display: block` (styles.ts)
// and stacks two block children: the 46px `.keyboard-toolbar` bar, then
// `<affine-keyboard-tool-panel>` carrying an inline `height: ${panelHeight}`.
// `keyboard-tool-panel.ts`'s `render()` returns `nothing` when `config` is
// null, but the element keeps `display: block` + that explicit height, so it
// always occupies `panelHeight` px -- it is a SPACER that lifts the icon bar
// by exactly the reserved offset. Any *additional* `bottom` on the host is
// therefore added on top of an offset that is already accounted for.
describe('keyboard-toolbar rendered geometry (keyboard-toolbar-y-jump)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page', [
      createStubVirtualKeyboardExtension(),
    ]);
    return cleanup;
  });

  /**
   * Measures the bottom edge of the fixed-positioning viewport by probing it
   * with a throwaway `position: fixed; bottom: 0` element, rather than
   * trusting `window.innerHeight` / `documentElement.clientHeight` -- the
   * test body runs inside Vitest's browser-mode iframe, and only a real
   * fixed-positioned element reports the same containing block the widget
   * itself resolves against.
   */
  function measureFixedViewportBottom() {
    const probe = document.createElement('div');
    probe.style.position = 'fixed';
    probe.style.left = '0';
    probe.style.bottom = '0';
    probe.style.width = '1px';
    probe.style.height = '1px';
    probe.style.pointerEvents = 'none';
    document.body.append(probe);
    const { bottom } = probe.getBoundingClientRect();
    probe.remove();
    return bottom;
  }

  async function mountToolbar() {
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

    const host = document.querySelector<HTMLElement>('affine-keyboard-toolbar');
    expect(host).toBeTruthy();

    const bar = host!.querySelector<HTMLElement>('.keyboard-toolbar');
    expect(bar).toBeTruthy();

    const keyboard = (
      host as unknown as {
        keyboard: {
          visible$: { value: boolean };
          height$: { value: number };
          staticHeight$: { value: number };
          appTabSafeArea$: { value: string };
        };
      }
    ).keyboard;

    return { host: host!, bar: bar!, keyboard };
  }

  /** Gap between the bottom of the screen and the icon bar's bottom edge. */
  function reservedBottomGap(bar: HTMLElement) {
    return measureFixedViewportBottom() - bar.getBoundingClientRect().bottom;
  }

  test('icon bar sits exactly on the keyboard top edge while the keyboard is visible', async () => {
    const { bar, keyboard } = await mountToolbar();

    const keyboardHeight = 300;
    keyboard.appTabSafeArea$.value = '60px';
    keyboard.visible$.value = true;
    keyboard.height$.value = keyboardHeight;
    await wait();

    // The icon bar must be reachable *immediately* above the keyboard. A gap
    // of 2 x keyboardHeight is the double-count symptom the user reported as
    // "floats well above the keyboard".
    expect(reservedBottomGap(bar)).toBeCloseTo(keyboardHeight, 0);
  });

  test('icon bar sits exactly above the app tab safe area while the keyboard is hidden', async () => {
    const { bar, keyboard } = await mountToolbar();

    const safeArea = 60;
    keyboard.appTabSafeArea$.value = `${safeArea}px`;
    keyboard.visible$.value = false;
    keyboard.height$.value = 0;
    await wait();

    expect(reservedBottomGap(bar)).toBeCloseTo(safeArea, 0);
  });

  test('icon bar tracks a changing keyboard height without accumulating offset', async () => {
    const { bar, keyboard } = await mountToolbar();

    keyboard.appTabSafeArea$.value = '60px';
    keyboard.visible$.value = true;

    // Mirrors an iOS keyboard show animation: several intermediate heights
    // before settling. Each frame must place the bar at exactly that frame's
    // height -- never a multiple of it.
    for (const height of [80, 190, 260, 300, 300]) {
      keyboard.height$.value = height;
      await wait();
      expect(reservedBottomGap(bar)).toBeCloseTo(height, 0);
    }
  });
});
