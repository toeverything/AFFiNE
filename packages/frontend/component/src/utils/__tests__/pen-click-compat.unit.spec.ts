import { describe, expect, test, vi } from 'vitest';

import {
  createPenClickCompatHandlers,
  isWithinPenTapSlop,
  PEN_TAP_SLOP_SQ,
} from '../pen-click-compat';

const pen = (
  type: 'pointerdown' | 'pointerup',
  partial: Partial<PointerEvent> &
    Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY'>
) =>
  ({
    type,
    pointerType: 'pen',
    button: 0,
    ...partial,
  }) as PointerEvent;

describe('isWithinPenTapSlop', () => {
  test('accepts jitter inside the slop radius', () => {
    expect(
      isWithinPenTapSlop({ x: 0, y: 0 }, { clientX: 10, clientY: 0 })
    ).toBe(true);
    expect(PEN_TAP_SLOP_SQ).toBe(100);
  });

  test('rejects movement beyond the slop radius', () => {
    expect(
      isWithinPenTapSlop({ x: 0, y: 0 }, { clientX: 11, clientY: 0 })
    ).toBe(false);
  });
});

describe('createPenClickCompatHandlers', () => {
  test('activates on pen pointerup within slop and ignores the trailing click', () => {
    const activate = vi.fn();
    const handlers = createPenClickCompatHandlers(activate);

    handlers.onPointerDown(
      pen('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 })
    );
    handlers.onPointerUp(
      pen('pointerup', { pointerId: 1, clientX: 3, clientY: 4 })
    );
    expect(activate).toHaveBeenCalledTimes(1);

    handlers.onClick({} as MouseEvent);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  test('does not activate when pen moves too far', () => {
    const activate = vi.fn();
    const handlers = createPenClickCompatHandlers(activate);

    handlers.onPointerDown(
      pen('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 })
    );
    handlers.onPointerUp(
      pen('pointerup', { pointerId: 1, clientX: 20, clientY: 0 })
    );
    expect(activate).not.toHaveBeenCalled();
  });

  test('finger / mouse still activate via click', () => {
    const activate = vi.fn();
    const handlers = createPenClickCompatHandlers(activate);

    handlers.onPointerDown({
      pointerType: 'touch',
      pointerId: 2,
      clientX: 0,
      clientY: 0,
    } as PointerEvent);
    handlers.onPointerUp({
      pointerType: 'touch',
      pointerId: 2,
      clientX: 0,
      clientY: 0,
    } as PointerEvent);
    expect(activate).not.toHaveBeenCalled();

    handlers.onClick({} as MouseEvent);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  test('pointercancel clears pen down state', () => {
    const activate = vi.fn();
    const handlers = createPenClickCompatHandlers(activate);

    handlers.onPointerDown(
      pen('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 })
    );
    handlers.onPointerCancel();
    handlers.onPointerUp(
      pen('pointerup', { pointerId: 1, clientX: 0, clientY: 0 })
    );
    expect(activate).not.toHaveBeenCalled();
  });
});
