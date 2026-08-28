/**
 * @vitest-environment happy-dom
 */

import type * as GlobalEnv from '@blocksuite/global/env';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@blocksuite/global/env', async importOriginal => ({
  ...(await importOriginal<typeof GlobalEnv>()),
  IS_IPAD: true,
}));

import { PointerControl } from '../event/control/pointer.js';

describe('PointerControl iPad Pencil routing', () => {
  function setupPointerControl() {
    const host = document.createElement('div');
    (host as any).std = {
      dnd: {
        monitor: () => ({ dispose: () => {} }),
      },
    };
    document.body.append(host);

    const dispatched: string[] = [];
    const control = new PointerControl({
      host,
      disposables: {
        addFromEvent: (
          target: EventTarget,
          type: string,
          listener: EventListener
        ) => {
          target.addEventListener(type, listener);
        },
        add: () => {},
      },
      run: (name: string) => {
        dispatched.push(name);
      },
    } as any);

    control.listen();
    return { dispatched, host };
  }

  test('keeps a pending Pencil stroke when a second touch lands before dragStart', () => {
    const { dispatched, host } = setupPointerControl();

    host.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'pen',
        isPrimary: true,
        clientX: 10,
        clientY: 10,
      })
    );
    host.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 2,
        pointerType: 'touch',
        isPrimary: false,
        clientX: 12,
        clientY: 12,
      })
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'pen',
        isPrimary: true,
        clientX: 40,
        clientY: 40,
      })
    );
    document.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'pen',
        isPrimary: true,
        clientX: 40,
        clientY: 40,
      })
    );

    expect(dispatched).toContain('dragStart');
    expect(dispatched).toContain('dragEnd');
    host.remove();
  });
});
