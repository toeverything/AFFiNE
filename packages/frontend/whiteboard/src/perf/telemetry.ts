import type { L0BackendKind as L0RendererKind } from './l0-renderer';

export type L0BackendKind = L0RendererKind | 'off';

export type WhiteboardPerfSnapshot = {
  frameTime: number;
  liveWidgetCount: number;
  cullRatio: number;
  wsRtt: number;
  l0SpriteCount: number;
  l0Backend: L0BackendKind;
  echartsInitMs: number;
  snapshotAgeS: number;
  droppedFrames: number;
  boardObjectCount: number;
  liveCollaborators: number;
  yjsApplyMs: number;
  wsPayloadBytes: number;
};

type WidgetSample = {
  live: boolean;
  intersecting: boolean;
  kind?: string;
};

/**
 * Latest network round trip to the sync endpoint, in ms.
 *
 * WebSocket frames never reach Resource Timing, so the only sample available
 * from this package is the socket.io HTTP transport: the handshake, plus the
 * long-poll requests used while the server has no websocket upgrade. Returns 0
 * when nothing is measurable, which the HUD renders as "no value".
 */
export function readSocketRttSample() {
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
  echartsInitMs = 0;
  snapshotAgeS = 0;
  droppedFrames = 0;
  boardObjectCount = 0;
  liveCollaborators = 0;
  yjsApplyMs = 0;
  wsPayloadBytes = 0;
  private snapshotAt = 0;

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

  noteL0(sample: { active: boolean; count: number; backend: L0BackendKind }) {
    this.l0SpriteCount = sample.active ? sample.count : 0;
    this.l0Backend = sample.active ? sample.backend : 'off';
  }

  noteEchartsInit(ms: number) {
    if (Number.isFinite(ms) && ms >= 0) this.echartsInitMs = ms;
  }

  noteSnapshotAge(seconds: number) {
    if (Number.isFinite(seconds) && seconds >= 0) this.snapshotAgeS = seconds;
  }

  noteSnapshotWritten(at = Date.now()) {
    this.snapshotAt = at;
    this.snapshotAgeS = 0;
  }

  noteBoardObjects(count: number) {
    if (Number.isFinite(count) && count >= 0) this.boardObjectCount = count;
  }

  noteCollaborators(count: number) {
    if (Number.isFinite(count) && count >= 0) this.liveCollaborators = count;
  }

  noteYjsApply(ms: number) {
    if (Number.isFinite(ms) && ms >= 0) {
      this.yjsApplyMs = this.yjsApplyMs * 0.7 + ms * 0.3;
    }
  }

  noteWsPayload(bytes: number) {
    if (Number.isFinite(bytes) && bytes >= 0) this.wsPayloadBytes = bytes;
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
    if (this.snapshotAt) {
      this.snapshotAgeS = Math.max(0, (Date.now() - this.snapshotAt) / 1000);
    }
    return {
      frameTime: this.frameTime,
      liveWidgetCount: this.liveWidgetCount,
      cullRatio: this.cullRatio,
      wsRtt: this.wsRtt,
      l0SpriteCount: this.l0SpriteCount,
      l0Backend: this.l0Backend,
      echartsInitMs: this.echartsInitMs,
      snapshotAgeS: this.snapshotAgeS,
      droppedFrames: this.droppedFrames,
      boardObjectCount: this.boardObjectCount,
      liveCollaborators: this.liveCollaborators,
      yjsApplyMs: this.yjsApplyMs,
      wsPayloadBytes: this.wsPayloadBytes,
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
      if (dt > 33) this.droppedFrames += 1;
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
    this.echartsInitMs = 0;
    this.snapshotAgeS = 0;
    this.droppedFrames = 0;
    this.boardObjectCount = 0;
    this.liveCollaborators = 0;
    this.yjsApplyMs = 0;
    this.wsPayloadBytes = 0;
    this.snapshotAt = 0;
  }
}

export const whiteboardTelemetry = new WhiteboardTelemetry();

/**
 * Polls a caller-supplied round-trip sampler into `noteWsRtt`. The socket lives
 * outside this package, so the HUD passes whatever it can reach.
 */
export function startRttProbe(
  getRtt: () => number = readSocketRttSample,
  intervalMs = 2000
): () => void {
  const sample = () => {
    const rtt = getRtt();
    if (rtt > 0) whiteboardTelemetry.noteWsRtt(rtt);
  };
  sample();
  if (typeof setInterval === 'undefined') return () => {};
  const timer = setInterval(sample, intervalMs);
  return () => clearInterval(timer);
}
