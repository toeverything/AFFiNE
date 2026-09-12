import { applyUpdate, Doc as YDoc } from 'yjs';

import type { CommentStore, DocStore } from '../domain/ports.js';

export interface SearchDocHit {
  docId: string;
  title: string;
  blockId: string;
  highlight: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchNodeHit {
  fields: Record<string, unknown>;
  highlights: Record<string, string> | null;
}

function keywordFromQuery(query: unknown): string {
  if (!query || typeof query !== 'object') {
    return '';
  }
  const record = query as Record<string, unknown>;
  if (typeof record.match === 'string') {
    return record.match;
  }
  if (Array.isArray(record.queries)) {
    for (const nested of record.queries) {
      const found = keywordFromQuery(nested);
      if (found) {
        return found;
      }
    }
  }
  if (record.query) {
    return keywordFromQuery(record.query);
  }
  return '';
}

function yjsText(snapshot: Uint8Array | null, updates: Uint8Array[]): string {
  const doc = new YDoc();
  if (snapshot && snapshot.byteLength > 0) {
    applyUpdate(doc, snapshot);
  }
  for (const update of updates) {
    applyUpdate(doc, update);
  }
  const parts: string[] = [];
  doc.share.forEach((abstract, key) => {
    const typed = abstract as { _map?: Map<unknown, unknown> };
    if (typed._map && typed._map.size > 0) {
      parts.push(JSON.stringify(doc.getMap(key).toJSON()));
      return;
    }
    const text = doc.getText(key).toString();
    parts.push(text.length > 0 ? text : key);
  });
  return parts.join('\n');
}

function snippet(haystack: string, needle: string): string {
  const index = haystack.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) {
    return haystack.slice(0, 160);
  }
  const start = Math.max(0, index - 40);
  return haystack.slice(start, start + 160);
}

export class SearchService {
  constructor(
    private readonly docs: DocStore,
    private readonly comments: CommentStore
  ) {}

  async searchDocs(
    workspaceId: string,
    keyword: string,
    limit = 20
  ): Promise<SearchDocHit[]> {
    const needle = keyword.trim();
    if (!needle) {
      return [];
    }
    const timestamps = await this.docs.listTimestamps('workspace', workspaceId);
    const hits: SearchDocHit[] = [];
    for (const docId of Object.keys(timestamps)) {
      const record = await this.docs.getDocument(
        'workspace',
        workspaceId,
        docId
      );
      if (!record) {
        continue;
      }
      const updates = await this.docs.listUpdates(
        'workspace',
        workspaceId,
        docId
      );
      const text = yjsText(
        record.snapshot,
        updates.map(item => item.payload)
      );
      const comments = await this.comments.listComments(workspaceId, docId);
      const commentText = JSON.stringify(
        comments.items.map(item => item.content)
      );
      const haystack = `${docId}\n${text}\n${commentText}`;
      if (!haystack.toLowerCase().includes(needle.toLowerCase())) {
        continue;
      }
      const updated = new Date(record.timestamp);
      hits.push({
        docId,
        title: docId,
        blockId: '',
        highlight: snippet(haystack, needle),
        createdAt: updated,
        updatedAt: updated,
      });
      if (hits.length >= limit) {
        break;
      }
    }
    return hits;
  }

  async search(
    workspaceId: string,
    input: {
      query?: unknown;
      options?: {
        fields?: string[];
        pagination?: { limit?: number; skip?: number };
      };
    }
  ): Promise<{
    nodes: SearchNodeHit[];
    count: number;
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    const keyword = keywordFromQuery(input.query);
    const limit = Math.min(
      50,
      Math.max(1, input.options?.pagination?.limit ?? 20)
    );
    const skip = Math.max(0, input.options?.pagination?.skip ?? 0);
    const docs = await this.searchDocs(workspaceId, keyword, skip + limit + 1);
    const page = docs.slice(skip, skip + limit);
    const fields = input.options?.fields ?? ['docId', 'title', 'content'];
    const nodes = page.map(hit => {
      const all: Record<string, unknown> = {
        docId: hit.docId,
        title: hit.title,
        content: hit.highlight,
        blockId: hit.blockId,
      };
      const selected: Record<string, unknown> = {};
      for (const field of fields) {
        if (field in all) {
          selected[field] = all[field];
        }
      }
      return {
        fields: Object.keys(selected).length > 0 ? selected : all,
        highlights: { content: hit.highlight },
      };
    });
    return {
      nodes,
      count: nodes.length,
      hasMore: docs.length > skip + limit,
      nextCursor: docs.length > skip + limit ? String(skip + limit) : null,
    };
  }
}
