/**
 * @vitest-environment happy-dom
 */

import { Bound } from '@blocksuite/global/gfx';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { pointerInputClassifierRuntime } from '../event/control/input-classifier.js';
import { InteractivityManager } from '../gfx/interactivity/manager.js';

function createPointerEvent(
  type: string,
  options: {
    pointerId: number;
    pointerType: string;
    x: number;
    y: number;
  }
) {
  return new PointerEvent(type, {
    bubbles: true,
    clientX: options.x,
    clientY: options.y,
    isPrimary: true,
    pointerId: options.pointerId,
    pointerType: options.pointerType,
  });
}

function setupManager() {
  const host = document.createElement('div');
  document.body.append(host);

  const model = {
    isLocked: () => false,
    xywh: new Bound(0, 0, 10, 10).serialize(),
  };

  const view = {
    model,
    onDragEnd: vi.fn(
      ({ currentBound }: { currentBound: Bound }) =>
        (model.xywh = currentBound.serialize())
    ),
    onDragMove: vi.fn(),
    onDragStart: vi.fn(),
  };

  const manager = new InteractivityManager({
    keyboard: {
      shiftKey$: {
        peek: () => false,
      },
    },
    std: {
      host,
      provider: {
        getAll: () => [],
      },
      store: {
        transact: (fn: () => void) => fn(),
      },
    },
    view: {
      get: () => view,
    },
    viewport: {
      toModelCoordFromClientCoord: ([x, y]: [number, number]) => [x, y],
      viewportMoved: {
        subscribe: () => ({
          unsubscribe: () => {},
        }),
      },
    },
  } as any);

  return { host, manager, model, view };
}

describe('InteractivityManager pointer ownership', () => {
  afterEach(() => {
    pointerInputClassifierRuntime.classifier = null;
  });

  test('ignores move and up events from non-owner pointers', () => {
    const { host, manager, model, view } = setupManager();
    const startEvent = createPointerEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'pen',
      x: 0,
      y: 0,
    });

    manager.handleElementMove({
      event: startEvent,
      movingElements: [model] as any,
    });

    host.dispatchEvent(
      createPointerEvent('pointermove', {
        pointerId: 2,
        pointerType: 'touch',
        x: 100,
        y: 100,
      })
    );
    host.dispatchEvent(
      createPointerEvent('pointerup', {
        pointerId: 2,
        pointerType: 'touch',
        x: 100,
        y: 100,
      })
    );

    expect(view.onDragMove).not.toHaveBeenCalled();
    expect(view.onDragEnd).not.toHaveBeenCalled();

    host.dispatchEvent(
      createPointerEvent('pointerup', {
        pointerId: 1,
        pointerType: 'pen',
        x: 10,
        y: 10,
      })
    );

    expect(view.onDragEnd).toHaveBeenCalledTimes(1);
    expect(model.xywh).toBe(new Bound(10, 10, 10, 10).serialize());
    host.remove();
  });

  test('cleans up cancelled non-Pencil drags without committing coordinates', () => {
    const { host, manager, model, view } = setupManager();
    const onDragEnd = vi.fn();

    manager.handleElementMove({
      event: createPointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'touch',
        x: 0,
        y: 0,
      }),
      movingElements: [model] as any,
      onDragEnd,
    });

    host.dispatchEvent(
      createPointerEvent('pointercancel', {
        pointerId: 1,
        pointerType: 'touch',
        x: 100,
        y: 100,
      })
    );

    expect(view.onDragEnd).not.toHaveBeenCalled();
    expect(onDragEnd).not.toHaveBeenCalled();
    expect(model.xywh).toBe(new Bound(0, 0, 10, 10).serialize());
    host.remove();
  });

  test('keeps iPad Pencil pointercancel compatible with successful release', () => {
    pointerInputClassifierRuntime.classifier = {
      classify: event => (event.pointerType === 'pen' ? 'pencil' : undefined),
      isPencilActive: () => true,
    };

    const { host, manager, model, view } = setupManager();

    manager.handleElementMove({
      event: createPointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'pen',
        x: 0,
        y: 0,
      }),
      movingElements: [model] as any,
    });

    host.dispatchEvent(
      createPointerEvent('pointercancel', {
        pointerId: 1,
        pointerType: 'pen',
        x: 10,
        y: 10,
      })
    );

    expect(view.onDragEnd).toHaveBeenCalledTimes(1);
    expect(model.xywh).toBe(new Bound(10, 10, 10, 10).serialize());
    host.remove();
  });
});
