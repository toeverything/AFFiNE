import { describe, expect, test } from 'vitest';

import {
  AdaptiveCooldownController,
  AdaptiveStrideController,
} from '../snap/adaptive-load-controller.js';

describe('AdaptiveStrideController', () => {
  test('increases stride under heavy cost and respects maxStride', () => {
    const controller = new AdaptiveStrideController({
      heavyCostMs: 6,
      maxStride: 3,
      recoveryCostMs: 2,
    });

    controller.reportCost(10);
    controller.reportCost(12);
    controller.reportCost(15);

    // stride should be capped at 3, so only every 3rd tick runs.
    expect(controller.shouldSkip()).toBe(false);
    expect(controller.shouldSkip()).toBe(true);
    expect(controller.shouldSkip()).toBe(true);
    expect(controller.shouldSkip()).toBe(false);
  });

  test('decreases stride when cost recovers and reset clears state', () => {
    const controller = new AdaptiveStrideController({
      heavyCostMs: 8,
      maxStride: 4,
      recoveryCostMs: 3,
    });

    controller.reportCost(12);
    controller.reportCost(12);
    controller.reportCost(1);

    // From stride 3 recovered to stride 2: run every other tick.
    expect(controller.shouldSkip()).toBe(false);
    expect(controller.shouldSkip()).toBe(true);
    expect(controller.shouldSkip()).toBe(false);

    controller.reset();
    expect(controller.shouldSkip()).toBe(false);
    expect(controller.shouldSkip()).toBe(false);
  });
});

describe('AdaptiveCooldownController', () => {
  test('enters cooldown when cost exceeds threshold', () => {
    const controller = new AdaptiveCooldownController({
      cooldownFrames: 2,
      maxCostMs: 5,
    });

    controller.reportCost(9);
    expect(controller.shouldRun()).toBe(false);
    expect(controller.shouldRun()).toBe(false);
    expect(controller.shouldRun()).toBe(true);
  });

  test('reset exits cooldown immediately', () => {
    const controller = new AdaptiveCooldownController({
      cooldownFrames: 3,
      maxCostMs: 5,
    });

    controller.reportCost(6);
    expect(controller.shouldRun()).toBe(false);
    controller.reset();
    expect(controller.shouldRun()).toBe(true);
  });
});
