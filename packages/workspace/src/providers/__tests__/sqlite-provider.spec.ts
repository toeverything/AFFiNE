import type {
  SQLiteDBDownloadProvider,
  SQLiteProvider,
} from '@affine/env/workspace';
import { getDoc } from '@affine/y-provider';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import type { Y as YType } from '@blocksuite/store';
import { uuidv4, Workspace } from '@blocksuite/store';
import { setTimeout } from 'timers/promises';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  createSQLiteDBDownloadProvider,
  createSQLiteProvider,
} from '../sqlite-providers';

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
      getDocAsUpdates: async (workspaceId, guid) => {
        const subdoc = guid ? getDoc(offlineYdoc, guid) : offlineYdoc;
        if (!subdoc) {
          return false;
        }
        return Y.encodeStateAsUpdate(subdoc);
      },
      applyDocUpdate: async (id, update, subdocId) => {
        const subdoc = subdocId ? getDoc(offlineYdoc, subdocId) : offlineYdoc;
        if (!subdoc) {
          return;
        }
        Y.applyUpdate(subdoc, update, 'sqlite');
      },
      getBlobKeys: async () => {
        // todo: may need to hack the way to get hash keys of blobs
        return [];
      },
      addBlob: mockedAddBlob,
    } as Partial<NonNullable<typeof window.apis>['db']>,
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
  } as Partial<NonNullable<typeof window.events>>,
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
    workspace.doc.getText('text').insert(0, 'mem-hello');

    downloadProvider.sync();
    await downloadProvider.whenReady;

    // depending on the nature of the sync, the data can be sync'ed in either direction
    const options = ['sqlite-hellomem-hello', 'mem-hellosqlite-hello'];
    const synced = options.filter(
      o => o === workspace.doc.getText('text').toString()
    );
    expect(synced.length).toBe(1);
  });

  // there is no updates from sqlite for now
  test.skip('on db update', async () => {
    provider.connect();

    await setTimeout(200);

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
    let handleSubdocs = () => {};
    workspace.doc.on = (event: string, fn: () => void) => {
      if (event === 'update') {
        handleUpdate = fn;
      } else if (event === 'subdocs') {
        handleSubdocs = fn;
      }
    };
    workspace.doc.off = offHandler;
    provider.connect();

    provider.disconnect();

    expect(triggerDBUpdate).toBe(null);
    expect(offHandler).toBeCalledWith('update', handleUpdate);
    expect(offHandler).toBeCalledWith('subdocs', handleSubdocs);
  });
});
