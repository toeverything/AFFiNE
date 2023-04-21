import type { SQLiteProvider } from '@affine/workspace/type';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import type { Y as YType } from '@blocksuite/store';
import { uuidv4, Workspace } from '@blocksuite/store';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createSQLiteProvider } from '../index';

const Y = Workspace.Y;

let id: string;
let workspace: Workspace;
let provider: SQLiteProvider;

let offlineYdoc: YType.Doc;

vi.stubGlobal('window', {
  apis: {
    db: {
      getDoc: async (id: string) => {
        return Y.encodeStateAsUpdate(offlineYdoc);
      },
      applyDocUpdate: async (id: string, update: Uint8Array) => {
        Y.applyUpdate(offlineYdoc, update, 'sqlite');
      },
      getPersistedBlobs: async (id: string) => {
        return [];
      },
    } satisfies Partial<typeof window.apis.db>,
  },
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
  provider = createSQLiteProvider(workspace);
  offlineYdoc = new Y.Doc();
  offlineYdoc.getText('text').insert(0, '');
});

describe('SQLite provider', () => {
  test('connect', async () => {
    // on connect, the updates from sqlite should be sync'ed to the existing ydoc
    // and ydoc should be sync'ed back to sqlite
    // Workspace.Y.applyUpdate(workspace.doc);
    workspace.doc.getText('text').insert(0, 'mem-hello');

    expect(offlineYdoc.getText('text').toString()).toBe('');

    await provider.connect();

    expect(offlineYdoc.getText('text').toString()).toBe('mem-hello');
    expect(workspace.doc.getText('text').toString()).toBe('mem-hello');

    workspace.doc.getText('text').insert(0, 'world');

    // check if the data are sync'ed
    expect(offlineYdoc.getText('text').toString()).toBe('worldmem-hello');
  });

  // todo: test disconnect
  // todo: test blob sync
});
