import type { Doc } from 'yjs';
import { Array as YArray, Map as YMap } from 'yjs';

import { diffKeyedRecords, type KeyedRecord } from './diff';
import { formatValue, toPlain } from './plain';

type RootDocMetaExtract = {
  recordsById: Map<string, KeyedRecord>;
  duplicateIds: string[];
};

export function extractRootDocPagesMeta(rootDoc: Doc): RootDocMetaExtract {
  const recordsById = new Map<string, KeyedRecord>();
  const duplicateIds: string[] = [];

  const meta = rootDoc.getMap('meta');
  const pages = meta.get('pages');
  const entries =
    pages instanceof YArray
      ? pages.toArray()
      : Array.isArray(pages)
        ? pages
        : null;
  if (!entries) {
    return { recordsById, duplicateIds };
  }

  for (const entry of entries) {
    let id: string | null = null;
    if (entry instanceof YMap) {
      const idRaw = entry.get('id');
      id =
        typeof idRaw === 'string'
          ? idRaw
          : typeof idRaw?.toString === 'function'
            ? idRaw.toString()
            : null;
    } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const record = entry as Record<string, unknown>;
      id =
        typeof record.id === 'string'
          ? record.id
          : (record.id?.toString?.() ?? null);
    }

    if (!id) {
      continue;
    }

    if (recordsById.has(id)) {
      duplicateIds.push(id);
    }

    const metaPlain = toPlain(entry) as unknown;
    if (
      metaPlain &&
      typeof metaPlain === 'object' &&
      !Array.isArray(metaPlain)
    ) {
      recordsById.set(id, metaPlain as KeyedRecord);
    }
  }

  return { recordsById, duplicateIds };
}

function docLabel(id: string, meta: KeyedRecord) {
  const title = meta.title;
  if (typeof title === 'string' && title.trim()) {
    return `${id} "${title}"`;
  }
  return id;
}

export function printRootDocPairDiff(opts: {
  fromLabel: string;
  toLabel: string;
  fromMeta: RootDocMetaExtract;
  toMeta: RootDocMetaExtract;
}) {
  const diff = diffKeyedRecords(
    opts.fromMeta.recordsById,
    opts.toMeta.recordsById
  );

  console.log(`\n=== ${opts.fromLabel} -> ${opts.toLabel} ===`);
  console.log(
    `Docs: ${opts.fromMeta.recordsById.size} -> ${opts.toMeta.recordsById.size} (+${diff.added.length} / -${diff.removed.length} / ~${diff.changed.length})`
  );

  if (opts.fromMeta.duplicateIds.length) {
    console.log(
      `! Warning: duplicate page ids in FROM: ${Array.from(new Set(opts.fromMeta.duplicateIds)).sort().join(', ')}`
    );
  }
  if (opts.toMeta.duplicateIds.length) {
    console.log(
      `! Warning: duplicate page ids in TO: ${Array.from(new Set(opts.toMeta.duplicateIds)).sort().join(', ')}`
    );
  }

  if (diff.added.length) {
    console.log(`\n+ Added (${diff.added.length})`);
    for (const { id, record } of diff.added) {
      console.log(`  + ${docLabel(id, record)}`);
    }
  }

  if (diff.removed.length) {
    console.log(`\n- Removed (${diff.removed.length})`);
    for (const { id, record } of diff.removed) {
      console.log(`  - ${docLabel(id, record)}`);
    }
  }

  if (diff.changed.length) {
    console.log(`\n~ Changed (${diff.changed.length})`);
    for (const change of diff.changed) {
      const fromTitle = change.fromRecord.title;
      const toTitle = change.toRecord.title;

      let header = `  ~ ${change.id}`;
      if (
        typeof fromTitle === 'string' &&
        typeof toTitle === 'string' &&
        fromTitle !== toTitle
      ) {
        header += ` "${fromTitle}" -> "${toTitle}"`;
      } else if (typeof toTitle === 'string' && toTitle.trim()) {
        header += ` "${toTitle}"`;
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
