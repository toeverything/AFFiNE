/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installMobileDebugLogCapture,
  installPointerDebugLogCapture,
  MARKER,
} from '../mobile-debug-log';

describe('installMobileDebugLogCapture', () => {
  let originalConsoleDebug: typeof console.debug;
  let originalFetch: typeof fetch;
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    localStorage.clear();
    originalConsoleDebug = console.debug;
    originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    console.debug = originalConsoleDebug;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('enqueues marker-prefixed console.debug calls and still forwards to the original console.debug', () => {
    const preInstallDebug = vi.fn();
    console.debug = preInstallDebug;

    dispose = installMobileDebugLogCapture();
    console.debug(`${MARKER} keyboard-toolbar-style-bottom`, { foo: 'bar' });

    expect(preInstallDebug).toHaveBeenCalledWith(
      `${MARKER} keyboard-toolbar-style-bottom`,
      { foo: 'bar' }
    );
  });

  it('does not enqueue or fetch for non-marker console.debug calls', () => {
    dispose = installMobileDebugLogCapture();
    console.debug('some unrelated debug line');

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('persists the client id across two installer calls within the same storage', () => {
    dispose = installMobileDebugLogCapture();
    const firstId = localStorage.getItem('affine-mobile-debug-log-client-id');
    dispose();

    dispose = installMobileDebugLogCapture();
    const secondId = localStorage.getItem('affine-mobile-debug-log-client-id');

    expect(firstId).toBeTruthy();
    expect(secondId).toBe(firstId);
  });

  it('fires an immediate POST to /api/mobile-debug-log/collect once MAX_BATCH_SIZE is reached', () => {
    dispose = installMobileDebugLogCapture();
    const clientId = localStorage.getItem('affine-mobile-debug-log-client-id');

    for (let i = 0; i < 50; i++) {
      console.debug(`${MARKER} entry-${i}`);
    }

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('/api/mobile-debug-log/collect');
    const body = JSON.parse(options.body);
    expect(body.clientId).toBe(clientId);
    expect(body.entries).toHaveLength(50);
  });

  it('does not throw or produce an unhandled rejection when the fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('boom'));
    dispose = installMobileDebugLogCapture();

    expect(() => {
      for (let i = 0; i < 50; i++) {
        console.debug(`${MARKER} entry-${i}`);
      }
    }).not.toThrow();

    // let the rejected promise's .catch handler run
    await Promise.resolve();
    await Promise.resolve();
  });
});

// keyboard-focus-tabbar-coordination (round 2): diagnostic tooling to help
// confirm/refute the "clicks sometimes register on the wrong element"
// hypothesis for the keyboard-toggle button. See mobile-debug-log.ts doc
// comment for the full rationale.
describe('installPointerDebugLogCapture', () => {
  let dispose: (() => void) | undefined;
  let originalConsoleDebug: typeof console.debug;
  let originalElementFromPoint: typeof document.elementFromPoint;

  beforeEach(() => {
    originalConsoleDebug = console.debug;
    originalElementFromPoint = document.elementFromPoint;
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    console.debug = originalConsoleDebug;
    document.elementFromPoint = originalElementFromPoint;
    vi.restoreAllMocks();
  });

  it('logs clientX/clientY, the real event target, and the elementFromPoint hit-test for a pointerdown', () => {
    const debugSpy = vi.fn();
    console.debug = debugSpy;

    const button = document.createElement('button');
    button.id = 'keyboard-toggle';
    document.body.append(button);
    document.elementFromPoint = vi.fn().mockReturnValue(button);

    dispose = installPointerDebugLogCapture();

    const event = new MouseEvent('pointerdown', {
      clientX: 42,
      clientY: 84,
      bubbles: true,
    });
    Object.defineProperty(event, 'target', { value: button });
    document.dispatchEvent(event);

    expect(debugSpy).toHaveBeenCalledWith(
      `${MARKER} pointer-event`,
      expect.objectContaining({
        type: 'pointerdown',
        clientX: 42,
        clientY: 84,
        targetTag: 'BUTTON',
        targetId: 'keyboard-toggle',
        elementAtPointTag: 'BUTTON',
        elementAtPointId: 'keyboard-toggle',
      })
    );
  });

  it('captures a divergence between the real target and elementFromPoint -- the "wrong element" signal', () => {
    const debugSpy = vi.fn();
    console.debug = debugSpy;

    const button = document.createElement('button');
    button.id = 'keyboard-toggle';
    const overlay = document.createElement('div');
    overlay.id = 'some-other-overlay';
    document.body.append(button, overlay);
    // Real on-device suspicion: the tap visually lands on the button, but
    // a plain hit-test at that point finds a different element entirely
    // (e.g. a mispositioned overlay from the toolbar creep/lift bug).
    document.elementFromPoint = vi.fn().mockReturnValue(overlay);

    dispose = installPointerDebugLogCapture();

    const event = new MouseEvent('click', {
      clientX: 10,
      clientY: 20,
      bubbles: true,
    });
    Object.defineProperty(event, 'target', { value: button });
    document.dispatchEvent(event);

    expect(debugSpy).toHaveBeenCalledWith(
      `${MARKER} pointer-event`,
      expect.objectContaining({
        targetTag: 'BUTTON',
        targetId: 'keyboard-toggle',
        elementAtPointTag: 'DIV',
        elementAtPointId: 'some-other-overlay',
      })
    );
  });

  it('never calls preventDefault/stopPropagation -- diagnostic only, must not alter real event handling', () => {
    dispose = installPointerDebugLogCapture();

    const event = new MouseEvent('click', {
      clientX: 0,
      clientY: 0,
      bubbles: true,
      cancelable: true,
    });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');
    document.dispatchEvent(event);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
    expect(stopPropagationSpy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('stops logging after disposal', () => {
    const debugSpy = vi.fn();
    console.debug = debugSpy;

    dispose = installPointerDebugLogCapture();
    dispose();
    dispose = undefined;

    document.dispatchEvent(
      new MouseEvent('click', { clientX: 1, clientY: 1, bubbles: true })
    );

    expect(debugSpy).not.toHaveBeenCalled();
  });
});
