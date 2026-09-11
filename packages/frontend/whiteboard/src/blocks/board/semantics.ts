export type BoardTask = {
  text: string;
  done: boolean;
};

export type BoardGroupByAxes = {
  x?: string;
  y?: string;
};

export type BoardWipLimits = Record<string, number>;

export type BoardViewMeta = {
  groupBy?: { columnId?: string; x?: string; y?: string };
  groupByY?: { columnId?: string };
  groupByAxes?: BoardGroupByAxes;
  wipLimits?: BoardWipLimits;
  laneFilter?: string;
};

export function parseTasks(value: unknown): BoardTask[] {
  if (Array.isArray(value)) {
    return value
      .filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === 'object'
      )
      .map(item => ({
        text: typeof item.text === 'string' ? item.text : String(item.text ?? ''),
        done: !!item.done,
      }));
  }
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    return parseTasks(JSON.parse(value));
  } catch {
    return [];
  }
}

export function serializeTasks(tasks: BoardTask[]): string {
  return JSON.stringify(tasks);
}

export function toggleTask(tasks: BoardTask[], index: number): BoardTask[] {
  return tasks.map((task, i) =>
    i === index ? { ...task, done: !task.done } : task
  );
}

export function checklistProgress(tasks: BoardTask[]) {
  const total = tasks.length;
  const done = tasks.filter(task => task.done).length;
  return { done, total };
}

export function isWipExceeded(count: number, limit?: number): boolean {
  return limit != null && limit > 0 && count > limit;
}

export function readGroupByAxes(view?: BoardViewMeta): BoardGroupByAxes {
  if (!view) return {};
  const x =
    view.groupByAxes?.x ??
    view.groupBy?.x ??
    view.groupBy?.columnId;
  const y = view.groupByAxes?.y ?? view.groupBy?.y ?? view.groupByY?.columnId;
  return { x, y };
}

export function laneValue(raw: unknown): string {
  if (Array.isArray(raw)) {
    const first = raw.find(item => typeof item === 'string' && item);
    return typeof first === 'string' ? first : '';
  }
  return typeof raw === 'string' ? raw : '';
}

export function boardCellKey(x: string, y: string) {
  return `${x}\t${y}`;
}

export function formatMinutes(value: unknown): string {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function accumulateMinutes(
  current: unknown,
  startedAt: unknown,
  now = Date.now()
): number {
  const spent = Number(current);
  const base = Number.isFinite(spent) ? spent : 0;
  const started = Number(startedAt);
  if (!Number.isFinite(started) || started <= 0) return base;
  const extra = Math.max(0, Math.round((now - started) / 60000));
  return base + extra;
}

export function attachmentCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

export type BoardCells = Record<
  string,
  Record<string, { columnId?: string; value?: unknown } | unknown>
>;

export function moveCardCells(
  cells: BoardCells,
  rowId: string,
  patch: {
    xPropertyId: string;
    xValue: string;
    yPropertyId?: string;
    yValue?: string;
    yIsMember?: boolean;
  }
): BoardCells {
  const row = { ...(cells[rowId] ?? {}) };
  row[patch.xPropertyId] = {
    columnId: patch.xPropertyId,
    value: patch.xValue || null,
  };
  if (patch.yPropertyId) {
    row[patch.yPropertyId] = {
      columnId: patch.yPropertyId,
      value: patch.yIsMember
        ? patch.yValue
          ? [patch.yValue]
          : []
        : patch.yValue || null,
    };
  }
  return { ...cells, [rowId]: row };
}
