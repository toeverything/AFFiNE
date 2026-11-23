/**
 * @vitest-environment happy-dom
 */
import { afterEach, expect, test, vi } from 'vitest';

import {
  startScopedViewTransition,
  startViewTransition,
} from '../view-transition';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test.each(['finished', 'skipped', 'update failed'] as const)(
  'view transition: %s',
  async outcome => {
    const error = new Error('DOM update failed');
    const update = vi.fn(() => {
      if (outcome === 'update failed') throw error;
      document.body.textContent = 'Updated';
    });
    const nativeStart = vi.fn((cb: () => void | Promise<void>) => {
      const finished = Promise.resolve().then(cb);
      const ready =
        outcome === 'skipped'
          ? Promise.reject(
              new DOMException('Transition was skipped', 'AbortError')
            )
          : finished;
      return { ready, finished };
    });
    vi.stubGlobal('document', {
      body: document.body,
      startViewTransition: nativeStart,
    });

    if (outcome === 'update failed') {
      await expect(startViewTransition(update)).rejects.toBe(error);
    } else {
      await startViewTransition(update);
      expect(document.body.textContent).toBe('Updated');
    }
    expect(update).toHaveBeenCalledTimes(1);
  }
);

test('scoped transition removes its scope after a skipped animation', async () => {
  vi.stubGlobal('document', {
    body: document.body,
    startViewTransition: (cb: () => void) => ({
      ready: Promise.reject(
        new DOMException('Transition was skipped', 'AbortError')
      ),
      finished: Promise.resolve().then(cb),
    }),
  });
  const update = vi.fn();
  startScopedViewTransition('modal', update);
  expect(document.body.dataset.modal).toBe('');
  await vi.waitFor(() => expect(document.body.dataset.modal).toBeUndefined());
  expect(update).toHaveBeenCalledTimes(1);
});

test('updates without native view transition support', async () => {
  vi.stubGlobal('document', { body: document.body });
  const update = vi.fn();
  await startViewTransition(update);
  expect(update).toHaveBeenCalledTimes(1);
});
