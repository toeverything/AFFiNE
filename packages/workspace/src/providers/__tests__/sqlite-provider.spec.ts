import type {
  SQLiteDBDownloadProvider,
  SQLiteProvider,
} from '@affine/env/workspace';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import type { Y as YType } from '@blocksuite/store';
import { uuidv4, Workspace } from '@blocksuite/store';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createSQLiteDBDownloadProvider, createSQLiteProvider } from '../index';

const Y = Workspace.Y;

let id: string;
let workspace: Workspace;
let provider: SQLiteProvider;
let downloadProvider: SQLiteDBDownloadProvider;

let offlineYdoc: YType.Doc;

let triggerDBUpdate:
  | Parameters<typeof window.events.db.onExternalUpdate>[0]
  | null = null;

const mockedAddBlob = vi.fn();

vi.stubGlobal('window', {
  apis: {
    db: {
      getDocAsUpdates: async () => {
        return Y.encodeStateAsUpdate(offlineYdoc);
      },
      applyDocUpdate: async (id: string, update: Uint8Array) => {
        Y.applyUpdate(offlineYdoc, update, 'sqlite');
      },
      getBlobKeys: async () => {
        // todo: may need to hack the way to get hash keys of blobs
        return [];
      },
      addBlob: mockedAddBlob,
    } satisfies Partial<NonNullable<typeof window.apis>['db']>,
  },
  events: {
    db: {
      // @ts-expect-error
      onExternalUpdate: fn => {
        triggerDBUpdate = fn;
        return () => {
          triggerDBUpdate = null;
        };
      },
    },
  } satisfies Partial<NonNullable<typeof window.events>>,
});

vi.stubGlobal('environment', {
  isDesktop: true,
});

beforeEach(() => {
  id = uuidv4();
  workspace = new Workspace({
    id,
    isSSR: true,
  });
  workspace.register(AffineSchemas).register(__unstableSchemas);
  provider = createSQLiteProvider(workspace.id, workspace.doc, {
    awareness: workspace.awarenessStore.awareness,
  }) as SQLiteProvider;
  downloadProvider = createSQLiteDBDownloadProvider(
    workspace.id,
    workspace.doc,
    {
      awareness: workspace.awarenessStore.awareness,
    }
  ) as SQLiteDBDownloadProvider;
  offlineYdoc = new Y.Doc();
  offlineYdoc.getText('text').insert(0, 'sqlite-hello');
});

describe('SQLite download provider', () => {
  test('sync updates', async () => {
    // on connect, the updates from sqlite should be sync'ed to the existing ydoc
    // and ydoc should be sync'ed back to sqlite
    // Workspace.Y.applyUpdate(workspace.doc);
    workspace.doc.getText('text').insert(0, 'mem-hello');

    expect(offlineYdoc.getText('text').toString()).toBe('sqlite-hello');

    downloadProvider.sync();
    await downloadProvider.whenReady;

    // depending on the nature of the sync, the data can be sync'ed in either direction
    const options = ['mem-hellosqlite-hello', 'sqlite-hellomem-hello'];
    const synced = options.filter(
      o => o === offlineYdoc.getText('text').toString()
    );
    expect(synced.length).toBe(1);
    expect(workspace.doc.getText('text').toString()).toBe(synced[0]);

    // workspace.doc.getText('text').insert(0, 'world');

    // // check if the data are sync'ed
    // expect(offlineYdoc.getText('text').toString()).toBe('world' + synced[0]);
  });

  test.fails('blobs will be synced to sqlite on connect', async () => {
    // mock bs.list
    const bin = new Uint8Array([1, 2, 3]);
    const blob = new Blob([bin]);
    workspace.blobs.list = vi.fn(async () => ['blob1']);
    workspace.blobs.get = vi.fn(async () => {
      return blob;
    });

    downloadProvider.sync();
    await downloadProvider.whenReady;
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockedAddBlob).toBeCalledWith(id, 'blob1', bin);
  });

  test('on db update', async () => {
    provider.connect();

    offlineYdoc.getText('text').insert(0, 'sqlite-world');

    // @ts-expect-error
    triggerDBUpdate?.({
      workspaceId: id + '-another-id',
      update: Y.encodeStateAsUpdate(offlineYdoc),
    });

    // not yet updated (because the workspace id is different)
    expect(workspace.doc.getText('text').toString()).toBe('');

    // @ts-expect-error
    triggerDBUpdate?.({
      workspaceId: id,
      update: Y.encodeStateAsUpdate(offlineYdoc),
    });

    expect(workspace.doc.getText('text').toString()).toBe(
      'sqlite-worldsqlite-hello'
    );
  });

  test('disconnect handlers', async () => {
    const offHandler = vi.fn();
    let handleUpdate = () => {};
    workspace.doc.on = (_: string, fn: () => void) => {
      handleUpdate = fn;
    };
    workspace.doc.off = offHandler;
    await provider.connect();

    provider.disconnect();

    expect(triggerDBUpdate).toBe(null);
    expect(offHandler).toBeCalledWith('update', handleUpdate);
  });
});
