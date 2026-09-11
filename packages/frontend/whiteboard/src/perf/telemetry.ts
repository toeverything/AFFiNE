import type { L0BackendKind as L0RendererKind } from './l0-renderer';

export type L0BackendKind = L0RendererKind | 'off';

export type WhiteboardPerfSnapshot = {
  frameTime: number;
  liveWidgetCount: number;
  cullRatio: number;
  wsRtt: number;
  l0SpriteCount: number;
  l0Backend: L0BackendKind;
};

type WidgetSample = {
  live: boolean;
  intersecting: boolean;
  kind?: string;
};

function readWsRttHint() {
  if (typeof performance === 'undefined') return 0;
  const entries = performance.getEntriesByType(
    'resource'
  ) as PerformanceResourceTiming[];
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    const name = entry.name ?? '';
    const socketLike =
      entry.initiatorType === 'websocket' ||
      name.includes('socket.io') ||
      name.includes('/sync') ||
      name.includes('/ws');
    if (!socketLike) continue;
    const rtt = entry.responseEnd - entry.requestStart;
    if (Number.isFinite(rtt) && rtt >= 0) return rtt;
  }
  return 0;
}

/**
 * Cheap in-tab metrics from plan §6.5: frame_time, live_widget_count, cull_ratio, ws_rtt.
 */
export class WhiteboardTelemetry {
  frameTime = 0;
  wsRtt = 0;
  l0SpriteCount = 0;
  l0Backend: L0BackendKind = 'off';

  private readonly widgets = new Map<string, WidgetSample>();
  private raf = 0;
  private lastFrame = 0;
  private listeners = 0;

  noteWidget(id: string, sample: WidgetSample) {
    this.widgets.set(id, sample);
  }

  forgetWidget(id: string) {
    this.widgets.delete(id);
  }

  noteWsRtt(ms: number) {
    if (Number.isFinite(ms) && ms >= 0) this.wsRtt = ms;
  }

  noteL0(sample: {
    active: boolean;
    count: number;
    backend: L0BackendKind;
  }) {
    this.l0SpriteCount = sample.active ? sample.count : 0;
    this.l0Backend = sample.active ? sample.backend : 'off';
  }

  get liveWidgetCount() {
    let count = 0;
    for (const sample of this.widgets.values()) {
      if (sample.live) count += 1;
    }
    return count;
  }

  get cullRatio() {
    const total = this.widgets.size;
    if (!total) return 0;
    let intersecting = 0;
    for (const sample of this.widgets.values()) {
      if (sample.intersecting) intersecting += 1;
    }
    return (total - intersecting) / total;
  }

  snapshot(): WhiteboardPerfSnapshot {
    if (!this.wsRtt) this.wsRtt = readWsRttHint();
    return {
      frameTime: this.frameTime,
      liveWidgetCount: this.liveWidgetCount,
      cullRatio: this.cullRatio,
      wsRtt: this.wsRtt,
      l0SpriteCount: this.l0SpriteCount,
      l0Backend: this.l0Backend,
    };
  }

  start() {
    this.listeners += 1;
    if (this.raf || typeof requestAnimationFrame === 'undefined') return;
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      const dt = now - this.lastFrame;
      this.lastFrame = now;
      this.frameTime = this.frameTime * 0.85 + dt * 0.15;
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.listeners = Math.max(0, this.listeners - 1);
    if (this.listeners || !this.raf) return;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  reset() {
    this.widgets.clear();
    this.frameTime = 0;
    this.wsRtt = 0;
    this.l0SpriteCount = 0;
    this.l0Backend = 'off';
  }
}

export const whiteboardTelemetry = new WhiteboardTelemetry();
