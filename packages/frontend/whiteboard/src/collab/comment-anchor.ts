export type WhiteboardCommentAnchor = {
  blockId: string;
  point?: [number, number];
  rowId?: string;
};

export type CommentPin = {
  commentId: string;
  blockId: string;
  x: number;
  y: number;
  rowId?: string;
};

export function parseCommentIds(comments?: Record<string, boolean> | null) {
  if (!comments) return [];
  return Object.entries(comments)
    .filter(([, on]) => on)
    .map(([id]) => id);
}

export function primaryCommentId(comments?: Record<string, boolean> | null) {
  return parseCommentIds(comments)[0];
}

export function parseCommentAnchor(
  value: unknown
): WhiteboardCommentAnchor | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<WhiteboardCommentAnchor>;
  if (typeof raw.blockId !== 'string' || !raw.blockId) return undefined;
  const point =
    Array.isArray(raw.point) &&
    raw.point.length >= 2 &&
    Number.isFinite(raw.point[0]) &&
    Number.isFinite(raw.point[1])
      ? ([raw.point[0], raw.point[1]] as [number, number])
      : undefined;
  return {
    blockId: raw.blockId,
    point,
    rowId: typeof raw.rowId === 'string' ? raw.rowId : undefined,
  };
}

export function pinPosition(
  xywh: { x: number; y: number; w: number; h: number },
  point?: [number, number]
) {
  if (point) {
    return { x: xywh.x + point[0], y: xywh.y + point[1] };
  }
  return { x: xywh.x + xywh.w, y: xywh.y };
}

/**
 * `resolveAnchor` lets each comment sit at its own recorded point; comments
 * without an anchor fall back to the block's top-right corner.
 */
export function pinsForBlock(
  blockId: string,
  xywh: { x: number; y: number; w: number; h: number },
  comments?: Record<string, boolean> | null,
  resolveAnchor?: (commentId: string) => WhiteboardCommentAnchor | undefined
): CommentPin[] {
  return parseCommentIds(comments).map(commentId => {
    const anchor = resolveAnchor?.(commentId);
    const { x, y } = pinPosition(xywh, anchor?.point);
    return { commentId, blockId, x, y, rowId: anchor?.rowId };
  });
}

export function anchorFromSelection(input: {
  blockId?: string;
  elementIds?: string[];
  rowId?: string;
  point?: [number, number];
}): WhiteboardCommentAnchor | undefined {
  const blockId = input.blockId || input.elementIds?.[0] || input.rowId;
  if (!blockId) return undefined;
  return {
    blockId,
    point: input.point,
    rowId: input.rowId,
  };
}
