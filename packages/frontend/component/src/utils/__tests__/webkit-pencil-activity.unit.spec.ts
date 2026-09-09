import {
  classifyPointerInput,
  createWebKitPencilActivityTracker,
  isPencilInputActive,
  pointerInputClassifierRuntime,
  WEBKIT_PENCIL_ACTIVE_GRACE_MS,
} from '@blocksuite/affine/std';
import { afterEach, describe, expect, test } from 'vitest';

afterEach(() => {
  pointerInputClassifierRuntime.classifier = null;
});

describe('pointerInputClassifierRuntime', () => {
  test('classifyPointerInput is undefined without a classifier', () => {
    expect(
      classifyPointerInput({ pointerType: 'touch' } as PointerEvent)
    ).toBeUndefined();
  });

  test('isPencilInputActive is false without a classifier', () => {
    expect(isPencilInputActive()).toBe(false);
  });

  test('delegates to the injected classifier', () => {
    pointerInputClassifierRuntime.classifier = {
      classify: () => 'palm',
      isPencilActive: () => true,
    };
    expect(classifyPointerInput({ pointerType: 'touch' } as PointerEvent)).toBe(
      'palm'
    );
    expect(isPencilInputActive()).toBe(true);
  });
});

describe('createWebKitPencilActivityTracker', () => {
  test('does not classify palm/finger', () => {
    const tracker = createWebKitPencilActivityTracker();
    expect(
      tracker.classify({ pointerType: 'touch' } as PointerEvent)
    ).toBeUndefined();
  });

  test('isPencilActive follows pen notes and grace window', () => {
    let t = 1000;
    const tracker = createWebKitPencilActivityTracker({ graceMs: 700 });
    tracker.setNow(() => t);

    expect(tracker.isPencilActive()).toBe(false);
    tracker.note({ pointerType: 'touch' });
    expect(tracker.isPencilActive()).toBe(false);

    tracker.note({ pointerType: 'pen' });
    expect(tracker.isPencilActive()).toBe(true);

    t += 699;
    expect(tracker.isPencilActive()).toBe(true);

    t += 2;
    expect(tracker.isPencilActive()).toBe(false);
  });

  test('default grace matches WEBKIT_PENCIL_ACTIVE_GRACE_MS', () => {
    let t = 0;
    const tracker = createWebKitPencilActivityTracker();
    tracker.setNow(() => t);
    tracker.note({ pointerType: 'pen' });
    t = WEBKIT_PENCIL_ACTIVE_GRACE_MS;
    expect(tracker.isPencilActive()).toBe(true);
    t = WEBKIT_PENCIL_ACTIVE_GRACE_MS + 1;
    expect(tracker.isPencilActive()).toBe(false);
  });

  test('wires into runtime for isPencilInputActive', () => {
    const tracker = createWebKitPencilActivityTracker({ graceMs: 100 });
    let t = 0;
    tracker.setNow(() => t);
    pointerInputClassifierRuntime.classifier = tracker;

    tracker.note({ pointerType: 'pen' });
    expect(isPencilInputActive()).toBe(true);
    t = 101;
    expect(isPencilInputActive()).toBe(false);
  });
});
