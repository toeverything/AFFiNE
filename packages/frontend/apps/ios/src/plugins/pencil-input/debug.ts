import type { PluginListenerHandle } from '@capacitor/core';

import { PencilInput } from './index';

// Opt-in native touch-classification logger. It is a diagnostic aid, not a
// feature: it lets us confirm the native `UITouch.TouchType` -> web bridge is
// wired up. On a real iPad it prints `pencil` vs `finger` and the contact
// radius; on the Simulator (which has no Pencil) a mouse drag arrives as a
// `finger` touch, which is enough to verify the whole native -> JS chain.
//
// Disabled unless `localStorage['affine:pencil-input-debug'] === '1'`, or until
// `window.__affineStartPencilInputDebug()` is called from the web inspector.

const STORAGE_KEY = 'affine:pencil-input-debug';

let listener: PluginListenerHandle | null = null;

async function startPencilInputDebug(): Promise<void> {
  if (listener) return;
  try {
    await PencilInput.start();
    listener = await PencilInput.addListener('touchClassified', event => {
      for (const touch of event.touches) {
        console.info(
          `[pencil-input] ${touch.phase} ${touch.kind} ` +
            `@(${touch.x.toFixed(1)}, ${touch.y.toFixed(1)}) ` +
            `r=${touch.majorRadius.toFixed(1)}`
        );
      }
    });

    console.info('[pencil-input] debug logging started');
  } catch (err) {
    console.warn('[pencil-input] failed to start debug logging', err);
  }
}

async function stopPencilInputDebug(): Promise<void> {
  await listener?.remove();
  listener = null;
  await PencilInput.stop();

  console.info('[pencil-input] debug logging stopped');
}

export function setupPencilInputDebug(): void {
  Object.assign(window, {
    __affineStartPencilInputDebug: startPencilInputDebug,
    __affineStopPencilInputDebug: stopPencilInputDebug,
  });

  try {
    if (localStorage.getItem(STORAGE_KEY) === '1') {
      startPencilInputDebug().catch(() => {
        // startup logging is best-effort; failures are already logged inside.
      });
    }
  } catch {
    // localStorage may be unavailable; ignore.
  }
}
