import type { Store } from '@blocksuite/affine/store';

import { mapDatabaseToDataset, mapInlineTable, parseCsv } from './mapping';
import { readDataSource } from './props';
import type { ChartBlockModel } from './model';
import type {
  ChartDataSource,
  ChartDataset,
  DatabaseTableSnapshot,
} from './types';

export type ChartDataResult = {
  dataset: ChartDataset;
  offline: boolean;
  error?: string;
};

const HTTP_CACHE_PREFIX = 'wb-chart-http:';

function isHttpAllowed(url: string, allowlist: string[] = []): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }
  return allowlist.some(host => {
    const normalized = host.trim().toLowerCase();
    if (!normalized) return false;
    return (
      parsed.hostname === normalized ||
      parsed.hostname.endsWith(`.${normalized}`)
    );
  });
}

function snapshotDatabase(store: Store, blockId: string): DatabaseTableSnapshot | null {
  const model = store.getBlock(blockId)?.model;
  if (!model || model.flavour !== 'affine:database') return null;

  const columns = (
    (model.props.columns as Array<{ id: string; name: string; type?: string }>) ??
    []
  ).map(column => ({
    id: column.id,
    name: column.name,
    type: column.type,
  }));

  const cells = (model.props.cells ?? {}) as Record<
    string,
    Record<string, { value?: unknown }>
  >;

  const rows = model.children.map(child => {
    const titleProp = (child.props as { text?: { toString?: () => string } })
      .text;
    return {
      id: child.id,
      title: titleProp?.toString?.() ?? '',
      cells: Object.fromEntries(
        Object.entries(cells[child.id] ?? {}).map(([columnId, cell]) => [
          columnId,
          cell?.value,
        ])
      ),
    };
  });

  return { columns, rows };
}

function resolveStore(model: ChartBlockModel, docId?: string): Store {
  if (!docId || docId === model.store.id) return model.store;
  const doc = model.store.workspace.getDoc(docId);
  return doc?.getStore({ id: docId }) ?? model.store;
}

async function readBlobText(store: Store, blobId: string): Promise<string | null> {
  const blob = await store.blobSync.get(blobId);
  if (!blob) return null;
  return blob.text();
}

async function cacheHttpPayload(
  store: Store,
  url: string,
  payload: string
): Promise<string | undefined> {
  try {
    const blobId = await store.blobSync.set(
      new Blob([payload], { type: 'text/plain' })
    );
    return blobId;
  } catch {
    return `${HTTP_CACHE_PREFIX}${url}`;
  }
}

function datasetFromUnknown(payload: string, source: ChartDataSource): ChartDataset {
  const trimmed = payload.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const json = JSON.parse(trimmed) as
      | { columns?: string[]; rows?: Array<Array<string | number | null>> }
      | Array<Array<string | number | null>>;
    if (Array.isArray(json)) {
      const columns = source.inline?.columns ?? source.mapping.y;
      return mapInlineTable(
        { columns: columns.length ? columns : ['x', ...source.mapping.y], rows: json },
        source.mapping
      );
    }
    return mapInlineTable(
      {
        columns: json.columns ?? source.inline?.columns ?? [],
        rows: json.rows ?? [],
      },
      source.mapping
    );
  }
  return mapInlineTable(parseCsv(payload), source.mapping);
}

export async function resolveChartData(
  model: ChartBlockModel
): Promise<ChartDataResult> {
  const source = readDataSource(model.props.dataSource);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  try {
    if (source.type === 'inline') {
      return {
        dataset: mapInlineTable(source.inline, source.mapping),
        offline,
      };
    }

    if (source.type === 'database') {
      if (!source.blockId) {
        return {
          dataset: { dimensions: [], source: [] },
          offline,
          error: 'missing-database',
        };
      }
      const store = resolveStore(model, source.docId);
      const table = snapshotDatabase(store, source.blockId);
      if (!table) {
        return {
          dataset: { dimensions: [], source: [] },
          offline,
          error: 'missing-database',
        };
      }
      return {
        dataset: mapDatabaseToDataset(table, source.mapping),
        offline,
      };
    }

    if (source.type === 'csv-blob') {
      if (!source.blobId) {
        return {
          dataset: { dimensions: [], source: [] },
          offline,
          error: 'missing-csv',
        };
      }
      const text = await readBlobText(model.store, source.blobId);
      if (text == null) {
        return {
          dataset: { dimensions: [], source: [] },
          offline,
          error: 'missing-csv',
        };
      }
      return {
        dataset: mapInlineTable(parseCsv(text), source.mapping),
        offline,
      };
    }

    if (source.type === 'http') {
      if (!source.url) {
        return {
          dataset: { dimensions: [], source: [] },
          offline,
          error: 'missing-url',
        };
      }
      if (!isHttpAllowed(source.url, source.httpAllowlist)) {
        return {
          dataset: { dimensions: [], source: [] },
          offline,
          error: 'http-blocked',
        };
      }

      if (offline) {
        if (source.blobId) {
          const cached = await readBlobText(model.store, source.blobId);
          if (cached != null) {
            return {
              dataset: datasetFromUnknown(cached, source),
              offline: true,
            };
          }
        }
        return {
          dataset: { dimensions: [], source: [] },
          offline: true,
          error: 'offline',
        };
      }

      const response = await fetch(source.url, { credentials: 'omit' });
      if (!response.ok) {
        throw new Error(`http-${response.status}`);
      }
      const payload = await response.text();
      const blobId = await cacheHttpPayload(model.store, source.url, payload);
      if (blobId && blobId !== source.blobId) {
        const next = { ...source, blobId };
        model.props.dataSource.setValue(next);
      }
      return {
        dataset: datasetFromUnknown(payload, source),
        offline: false,
      };
    }

    return {
      dataset: { dimensions: [], source: [] },
      offline,
      error: 'unknown-source',
    };
  } catch (error) {
    return {
      dataset: { dimensions: [], source: [] },
      offline,
      error: error instanceof Error ? error.message : 'resolve-failed',
    };
  }
}

export function subscribeChartData(
  model: ChartBlockModel,
  onChange: () => void,
  debounceMs = 150
): () => void {
  let timer = 0;
  const schedule = () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = 0;
      onChange();
    }, debounceMs);
  };

  const disposables = [
    model.propsUpdated.subscribe(schedule),
    model.store.slots.blockUpdated.subscribe(payload => {
      const source = readDataSource(model.props.dataSource);
      if (source.type !== 'database' || !source.blockId) return;
      const parent = model.store.getParent(payload.id);
      if (payload.id === source.blockId || parent?.id === source.blockId) {
        schedule();
      }
    }),
  ];

  const source = readDataSource(model.props.dataSource);
  if (source.type === 'http' && source.refreshMs && source.refreshMs > 0) {
    const interval = window.setInterval(schedule, source.refreshMs);
    disposables.push(() => window.clearInterval(interval));
  }

  return () => {
    if (timer) window.clearTimeout(timer);
    disposables.forEach(dispose => {
      if (typeof dispose === 'function') dispose();
      else dispose.unsubscribe();
    });
  };
}
