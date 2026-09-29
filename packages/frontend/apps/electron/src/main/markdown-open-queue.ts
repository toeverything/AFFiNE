import { randomUUID } from 'node:crypto';
import path from 'node:path';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);

export interface MarkdownOpenRequest {
  requestId: string;
  filePath: string;
}

export function isMarkdownFilePath(filePath: string) {
  return (
    path.isAbsolute(filePath) &&
    MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase())
  );
}

export class MarkdownOpenRequestQueue {
  private readonly requests = new Map<string, MarkdownOpenRequest>();
  private readonly requestIdsByPath = new Map<string, string>();

  enqueue(filePath: string): MarkdownOpenRequest | null {
    if (!isMarkdownFilePath(filePath)) {
      return null;
    }

    const normalized = path.resolve(filePath);
    const existingId = this.requestIdsByPath.get(normalized);
    if (existingId) {
      return this.requests.get(existingId) ?? null;
    }

    const request = { requestId: randomUUID(), filePath: normalized };
    this.requests.set(request.requestId, request);
    this.requestIdsByPath.set(normalized, request.requestId);
    return request;
  }

  pending(): MarkdownOpenRequest[] {
    return [...this.requests.values()];
  }

  complete(requestId: string): boolean {
    const request = this.requests.get(requestId);
    if (!request) {
      return false;
    }
    this.requests.delete(requestId);
    this.requestIdsByPath.delete(request.filePath);
    return true;
  }
}
