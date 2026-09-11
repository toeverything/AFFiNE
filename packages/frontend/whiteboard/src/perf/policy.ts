import { WHITEBOARD_FLAVOURS, WHITEBOARD_LOD } from '../const';
import { whiteboardTelemetry } from './telemetry';

export type WidgetLodLevel = 'l0' | 'l1' | 'l2';
export type LiveWidgetKind = 'chart' | 'kanban' | 'sketch';

export type LiveCandidate = {
  id: string;
  kind: LiveWidgetKind;
  selected: boolean;
  hovered: boolean;
  intersecting: boolean;
  distanceToCenter: number;
  exempt?: boolean;
};

export type RankedBudget = {
  acquire: (
    id: string,
    liveBudgetExempt?: boolean,
    opts?: boolean | { steal?: boolean; score?: number }
  ) => boolean;
  release: (id: string) => void;
};

/** Shared LOD from the whiteboard plan §5.4 / §6.5. */
export function getWidgetLodLevel(
  zoom: number,
  selected: boolean,
  hovered: boolean
): WidgetLodLevel {
  if (selected || (hovered && zoom > WHITEBOARD_LOD.z1)) return 'l2';
  if (zoom < WHITEBOARD_LOD.z0) return 'l0';
  return 'l1';
}

/**
 * selected > hover > center-of-viewport.
 * Larger score wins a live slot.
 */
export function livePriorityScore(input: {
  selected: boolean;
  hovered: boolean;
  distanceToCenter: number;
}): number {
  const near = Number.isFinite(input.distanceToCenter)
    ? Math.max(0, 100_000 - input.distanceToCenter)
    : 0;
  if (input.selected) return 1_000_000 + near;
  if (input.hovered) return 500_000 + near;
  return near;
}

export function pickLiveIds(
  candidates: readonly LiveCandidate[],
  maxLive: number
): Set<string> {
  const exempt = candidates.filter(item => item.exempt).map(item => item.id);
  const ranked = candidates
    .filter(item => !item.exempt)
    .slice()
    .sort(
      (a, b) =>
        livePriorityScore(b) - livePriorityScore(a) || a.id.localeCompare(b.id)
    );
  return new Set([...exempt, ...ranked.slice(0, Math.max(0, maxLive)).map(item => item.id)]);
}

export function parseXywhCenter(xywh?: string) {
  if (!xywh) return null;
  try {
    const parsed = JSON.parse(xywh) as unknown;
    if (!Array.isArray(parsed) || parsed.length < 4) return null;
    const [x, y, w, h] = parsed as number[];
    return { x: x + w / 2, y: y + h / 2 };
  } catch {
    return null;
  }
}

export function xywhCenterDistance(
  xywh: string | undefined,
  cx: number,
  cy: number
) {
  const center = parseXywhCenter(xywh);
  if (!center) return Number.POSITIVE_INFINITY;
  return Math.hypot(center.x - cx, center.y - cy);
}

export function maxLiveForKind(kind: LiveWidgetKind) {
  if (kind === 'chart') return WHITEBOARD_LOD.maxLiveCharts;
  if (kind === 'kanban') return WHITEBOARD_LOD.maxLiveKanban;
  return WHITEBOARD_LOD.maxLiveSketches;
}

export class WhiteboardPerfPolicy {
  readonly z0 = WHITEBOARD_LOD.z0;
  readonly z1 = WHITEBOARD_LOD.z1;
  readonly flavours = WHITEBOARD_FLAVOURS;

  private readonly candidates = new Map<string, LiveCandidate>();

  touch(candidate: LiveCandidate) {
    this.candidates.set(candidate.id, candidate);
  }

  forget(id: string) {
    this.candidates.delete(id);
  }

  list(kind?: LiveWidgetKind) {
    const all = [...this.candidates.values()];
    return kind ? all.filter(item => item.kind === kind) : all;
  }

  pickedIds(kind: LiveWidgetKind) {
    return pickLiveIds(this.list(kind), maxLiveForKind(kind));
  }

  isPicked(id: string, kind: LiveWidgetKind) {
    return this.pickedIds(kind).has(id);
  }

  reset() {
    this.candidates.clear();
  }
}

export const whiteboardPerfPolicy = new WhiteboardPerfPolicy();

export function tryLive(budget: RankedBudget, candidate: LiveCandidate) {
  whiteboardPerfPolicy.touch(candidate);
  const score = livePriorityScore(candidate);
  const picked = whiteboardPerfPolicy.isPicked(candidate.id, candidate.kind);
  if (!picked) {
    budget.release(candidate.id);
    whiteboardTelemetry.noteWidget(candidate.id, {
      live: false,
      intersecting: candidate.intersecting,
      kind: candidate.kind,
    });
    return false;
  }
  const ok = budget.acquire(candidate.id, !!candidate.exempt, {
    steal: candidate.selected || candidate.hovered,
    score,
  });
  whiteboardTelemetry.noteWidget(candidate.id, {
    live: ok,
    intersecting: candidate.intersecting,
    kind: candidate.kind,
  });
  return ok;
}
