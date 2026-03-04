import type { Doc } from 'yjs';
import { Map as YMap } from 'yjs';

import { diffKeyedRecords, type KeyedRecord } from './diff';
import { formatValue, toPlain } from './plain';

const DELETE_FLAG_KEY = '$$DELETED';

type TableExtract = {
  recordsByKey: Map<string, KeyedRecord>;
  duplicateKeys: string[];
};

function getRecordKey(record: YMap<any>, keyField: string): string | null {
  const keyRaw = record.get(keyField);
  if (typeof keyRaw === 'string') {
    return keyRaw;
  }
  if (typeof keyRaw?.toString === 'function') {
    return keyRaw.toString();
  }
  return null;
}

function isDeletedRecord(record: YMap<any>): boolean {
  return record.get(DELETE_FLAG_KEY) === true || record.size === 0;
}

export function extractYjsTable(doc: Doc, keyField: string): TableExtract {
  const recordsByKey = new Map<string, KeyedRecord>();
  const duplicateKeys: string[] = [];

  for (const sharedKey of doc.share.keys()) {
    let record: unknown;
    try {
      record = doc.getMap(sharedKey);
    } catch {
      // Not a YMap shared type; ignore.
      continue;
    }
    if (!(record instanceof YMap)) {
      continue;
    }

    const key = getRecordKey(record, keyField);
    if (!key) {
      continue;
    }

    if (isDeletedRecord(record)) {
      continue;
    }

    if (recordsByKey.has(key)) {
      duplicateKeys.push(key);
    }

    const recordPlain = toPlain(record) as unknown;
    if (
      recordPlain &&
      typeof recordPlain === 'object' &&
      !Array.isArray(recordPlain)
    ) {
      recordsByKey.set(key, recordPlain as KeyedRecord);
    }
  }

  return { recordsByKey, duplicateKeys };
}

function folderLabel(id: string, record: KeyedRecord) {
  const type = record.type;
  const data = record.data;
  if (type === 'folder') {
    const name = typeof data === 'string' && data.trim() ? `"${data}"` : '';
    return `folder:${id}${name ? ` ${name}` : ''}`;
  }
  if (typeof type === 'string' && typeof data === 'string') {
    return `${type}:${data} (id=${id})`;
  }
  return `id=${id}`;
}

function favoriteLabel(key: string) {
  return key;
}

export function printFolderPairDiff(opts: {
  fromLabel: string;
  toLabel: string;
  fromTable: TableExtract;
  toTable: TableExtract;
}) {
  const diff = diffKeyedRecords(
    opts.fromTable.recordsByKey,
    opts.toTable.recordsByKey
  );

  console.log(`\n=== ${opts.fromLabel} -> ${opts.toLabel} ===`);
  console.log(
    `Rows: ${opts.fromTable.recordsByKey.size} -> ${opts.toTable.recordsByKey.size} (+${diff.added.length} / -${diff.removed.length} / ~${diff.changed.length})`
  );

  if (opts.fromTable.duplicateKeys.length) {
    console.log(
      `! Warning: duplicate keys in FROM: ${Array.from(new Set(opts.fromTable.duplicateKeys)).sort().join(', ')}`
    );
  }
  if (opts.toTable.duplicateKeys.length) {
    console.log(
      `! Warning: duplicate keys in TO: ${Array.from(new Set(opts.toTable.duplicateKeys)).sort().join(', ')}`
    );
  }

  if (diff.added.length) {
    console.log(`\n+ Added (${diff.added.length})`);
    for (const { id, record } of diff.added) {
      const parentId = record.parentId;
      const index = record.index;
      console.log(
        `  + ${folderLabel(id, record)} (parentId=${formatValue('parentId', parentId ?? null)}, index=${formatValue('index', index ?? null)})`
      );
    }
  }

  if (diff.removed.length) {
    console.log(`\n- Removed (${diff.removed.length})`);
    for (const { id, record } of diff.removed) {
      const parentId = record.parentId;
      const index = record.index;
      console.log(
        `  - ${folderLabel(id, record)} (parentId=${formatValue('parentId', parentId ?? null)}, index=${formatValue('index', index ?? null)})`
      );
    }
  }

  if (diff.changed.length) {
    console.log(`\n~ Changed (${diff.changed.length})`);
    for (const change of diff.changed) {
      const fromName =
        change.fromRecord.type === 'folder' ? change.fromRecord.data : null;
      const toName =
        change.toRecord.type === 'folder' ? change.toRecord.data : null;
      let header = `  ~ ${folderLabel(change.id, change.toRecord)}`;
      if (
        typeof fromName === 'string' &&
        typeof toName === 'string' &&
        fromName !== toName
      ) {
        header += ` ("${fromName}" -> "${toName}")`;
      }
      console.log(header);

      for (const field of change.fields) {
        console.log(
          `    - ${field.key}: ${formatValue(field.key, field.from)} -> ${formatValue(field.key, field.to)}`
        );
      }
    }
  }

  if (!diff.added.length && !diff.removed.length && !diff.changed.length) {
    console.log('\n(no changes)');
  }
}

export function printFavoritePairDiff(opts: {
  fromLabel: string;
  toLabel: string;
  fromTable: TableExtract;
  toTable: TableExtract;
}) {
  const diff = diffKeyedRecords(
    opts.fromTable.recordsByKey,
    opts.toTable.recordsByKey
  );

  console.log(`\n=== ${opts.fromLabel} -> ${opts.toLabel} ===`);
  console.log(
    `Rows: ${opts.fromTable.recordsByKey.size} -> ${opts.toTable.recordsByKey.size} (+${diff.added.length} / -${diff.removed.length} / ~${diff.changed.length})`
  );

  if (opts.fromTable.duplicateKeys.length) {
    console.log(
      `! Warning: duplicate keys in FROM: ${Array.from(new Set(opts.fromTable.duplicateKeys)).sort().join(', ')}`
    );
  }
  if (opts.toTable.duplicateKeys.length) {
    console.log(
      `! Warning: duplicate keys in TO: ${Array.from(new Set(opts.toTable.duplicateKeys)).sort().join(', ')}`
    );
  }

  if (diff.added.length) {
    console.log(`\n+ Added (${diff.added.length})`);
    for (const { id, record } of diff.added) {
      console.log(
        `  + ${favoriteLabel(id)} (index=${formatValue('index', record.index ?? null)})`
      );
    }
  }

  if (diff.removed.length) {
    console.log(`\n- Removed (${diff.removed.length})`);
    for (const { id, record } of diff.removed) {
      console.log(
        `  - ${favoriteLabel(id)} (index=${formatValue('index', record.index ?? null)})`
      );
    }
  }

  if (diff.changed.length) {
    console.log(`\n~ Changed (${diff.changed.length})`);
    for (const change of diff.changed) {
      console.log(`  ~ ${favoriteLabel(change.id)}`);
      for (const field of change.fields) {
        console.log(
          `    - ${field.key}: ${formatValue(field.key, field.from)} -> ${formatValue(field.key, field.to)}`
        );
      }
    }
  }

  if (!diff.added.length && !diff.removed.length && !diff.changed.length) {
    console.log('\n(no changes)');
  }
}
