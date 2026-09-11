import { describe, expect, it } from 'vitest';

import { WhiteboardTelemetry } from './telemetry';

describe('whiteboard telemetry', () => {
  it('computes live_widget_count and cull_ratio', () => {
    const telemetry = new WhiteboardTelemetry();
    telemetry.noteWidget('a', { live: true, intersecting: true });
    telemetry.noteWidget('b', { live: false, intersecting: false });
    telemetry.noteWidget('c', { live: true, intersecting: true });
    telemetry.noteWsRtt(42);
    const snap = telemetry.snapshot();
    expect(snap.liveWidgetCount).toBe(2);
    expect(snap.cullRatio).toBeCloseTo(1 / 3);
    expect(snap.wsRtt).toBe(42);
    expect(snap.l0SpriteCount).toBe(0);
    expect(snap.l0Backend).toBe('off');
    expect(typeof snap.frameTime).toBe('number');
  });

  it('records L0 sprite count and backend while the layer is active', () => {
    const telemetry = new WhiteboardTelemetry();
    telemetry.noteL0({ active: true, count: 12, backend: 'webgl' });
    expect(telemetry.snapshot().l0SpriteCount).toBe(12);
    expect(telemetry.snapshot().l0Backend).toBe('webgl');
    telemetry.noteL0({ active: false, count: 12, backend: 'webgl' });
    expect(telemetry.snapshot().l0SpriteCount).toBe(0);
    expect(telemetry.snapshot().l0Backend).toBe('off');
  });
});
