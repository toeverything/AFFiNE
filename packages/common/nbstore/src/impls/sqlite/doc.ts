import { share } from '../../connection';
import {
  type BlockInfo,
  type CrawlResult,
  type DocClocks,
  type DocRecord,
  DocStorageBase,
  type DocUpdate,
} from '../../storage';
import { NativeDBConnection, type SqliteNativeDBOptions } from './db';

export class SqliteDocStorage extends DocStorageBase<SqliteNativeDBOptions> {
  static readonly identifier = 'SqliteDocStorage';
  override connection = share(new NativeDBConnection(this.options));

  get db() {
    return this.connection.apis;
  }

  override async pushDocUpdate(update: DocUpdate, origin?: string) {
    const timestamp = await this.db.pushUpdate(update.docId, update.bin);

    this.emit(
      'update',
      {
        docId: update.docId,
        bin: update.bin,
        timestamp,
        editor: update.editor,
      },
      origin
    );

    return { docId: update.docId, timestamp };
  }

  override async deleteDoc(docId: string) {
    await this.db.deleteDoc(docId);
  }

  override async getDocTimestamps(after?: Date) {
    const clocks = await this.db.getDocClocks(after);

    return clocks.reduce((ret, cur) => {
      ret[cur.docId] = cur.timestamp;
      return ret;
    }, {} as DocClocks);
  }

  override async getDocTimestamp(docId: string) {
    return this.db.getDocClock(docId);
  }

  protected override async getDocSnapshot(docId: string) {
    const snapshot = await this.db.getDocSnapshot(docId);

    if (!snapshot) {
      return null;
    }

    return snapshot;
  }

  protected override async setDocSnapshot(
    snapshot: DocRecord
  ): Promise<boolean> {
    return this.db.setDocSnapshot({
      docId: snapshot.docId,
      bin: snapshot.bin,
      timestamp: snapshot.timestamp,
    });
  }

  protected override async getDocUpdates(docId: string) {
    return this.db.getDocUpdates(docId);
  }

  protected override markUpdatesMerged(docId: string, updates: DocRecord[]) {
    return this.db.markUpdatesMerged(
      docId,
      updates.map(update => update.timestamp)
    );
  }

  override async crawlDocData(docId: string): Promise<CrawlResult | null> {
    const result = await this.db.crawlDocData(docId);
    return normalizeNativeCrawlResult(result);
  }
}

function normalizeNativeCrawlResult(result: unknown): CrawlResult | null {
  if (!isRecord(result)) {
    console.warn('[nbstore] crawlDocData returned non-object result');
    return null;
  }

  if (
    typeof result.title !== 'string' ||
    typeof result.summary !== 'string' ||
    !Array.isArray(result.blocks)
  ) {
    console.warn('[nbstore] crawlDocData result missing basic fields');
    return null;
  }

  const { title, summary } = result as { title: string; summary: string };
  const rawBlocks = result.blocks as unknown[];

  const blocks: BlockInfo[] = [];
  for (const block of rawBlocks) {
    const normalized = normalizeBlock(block);
    if (normalized) {
      blocks.push(normalized);
    }
  }

  if (blocks.length === 0) {
    console.warn('[nbstore] crawlDocData has no valid blocks');
    return null;
  }

  return {
    blocks,
    title,
    summary,
  };
}

function normalizeBlock(block: unknown): BlockInfo | null {
  if (!isRecord(block)) {
    return null;
  }

  const blockId = readStringField(block, 'blockId');
  const flavour = readStringField(block, 'flavour');

  if (!blockId || !flavour) {
    return null;
  }

  return {
    blockId,
    flavour,
    content: readStringArrayField(block, 'content'),
    blob: readStringArrayField(block, 'blob'),
    refDocId: readStringArrayField(block, 'refDocId'),
    refInfo: readStringArrayField(block, 'refInfo'),
    parentFlavour: readStringField(block, 'parentFlavour'),
    parentBlockId: readStringField(block, 'parentBlockId'),
    additional: safeAdditionalField(block),
  };
}

function readStringField(
  target: Record<string, unknown>,
  key: string
): string | undefined {
  const value = readField(target, key);
  return typeof value === 'string' && value ? value : undefined;
}

function readStringArrayField(
  target: Record<string, unknown>,
  key: string
): string[] | undefined {
  const value = readField(target, key);
  if (Array.isArray(value)) {
    const filtered = value.filter(
      (item): item is string => typeof item === 'string' && item.length > 0
    );
    return filtered.length ? filtered : undefined;
  }
  if (typeof value === 'string' && value.length > 0) {
    return [value];
  }
  return undefined;
}

function safeAdditionalField(
  target: Record<string, unknown>
): string | undefined {
  const value = readField(target, 'additional');
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    return JSON.stringify(parsed);
  } catch {
    console.warn(
      '[nbstore] ignore invalid additional payload in crawlDocData block'
    );
    return undefined;
  }
}

function readField(target: Record<string, unknown>, key: string) {
  return target[key] ?? target[toSnakeCase(key)];
}

function toSnakeCase(key: string) {
  return key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
