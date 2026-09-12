export type CommentChangeAction = 'update' | 'delete';

export interface CommentRecord {
  id: string;
  workspaceId: string;
  docId: string;
  userId: string;
  content: unknown;
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommentReplyRecord {
  id: string;
  commentId: string;
  userId: string;
  content: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommentChangeRecord {
  id: string;
  workspaceId: string;
  docId: string;
  action: CommentChangeAction;
  item: unknown;
  commentId: string | null;
  entityId: string;
  createdAt: Date;
}

export interface Pagination {
  first?: number;
  after?: string;
  offset?: number;
}

export interface PageSlice<T> {
  items: T[];
  totalCount: number;
  startCursor: string | null;
  endCursor: string | null;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): { at: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = raw.lastIndexOf('|');
    if (sep <= 0) {
      return null;
    }
    const at = new Date(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (Number.isNaN(at.getTime()) || id.length === 0) {
      return null;
    }
    return { at, id };
  } catch {
    return null;
  }
}

export function paginationLimit(
  pagination: Pagination | undefined,
  fallback = 10
): number {
  const first = pagination?.first;
  if (typeof first === 'number' && Number.isFinite(first) && first > 0) {
    return Math.min(100, Math.floor(first));
  }
  return fallback;
}
