/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import type {
  LocalIndexedDBBackgroundProvider,
  LocalIndexedDBDownloadProvider,
} from '@affine/env/workspace';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Schema, Workspace } from '@blocksuite/store';
import { afterEach, describe, expect, test } from 'vitest';

import {
  createIndexedDBBackgroundProvider,
  createIndexedDBDownloadProvider,
} from '..';

const schema = new Schema();

schema.register(AffineSchemas).register(__unstableSchemas);

afterEach(() => {
  globalThis.localStorage.clear();
  globalThis.indexedDB.deleteDatabase('affine-local');
});

describe('download provider', () => {
  test('basic', async () => {
    let prev: any;
    {
      const workspace = new Workspace({
        id: 'test',
        isSSR: true,
        schema,
      });
      const provider = createIndexedDBBackgroundProvider(
        workspace.id,
        workspace.doc,
        {
          awareness: workspace.awarenessStore.awareness,
        }
      ) as LocalIndexedDBBackgroundProvider;
      provider.connect();
      const page = workspace.createPage({
        id: 'page0',
      });
      await page.waitForLoaded();
      const pageBlockId = page.addBlock('affine:page', {
        title: new page.Text(''),
      });
      page.addBlock('affine:surface', {}, pageBlockId);
      const frameId = page.addBlock('affine:note', {}, pageBlockId);
      page.addBlock('affine:paragraph', {}, frameId);
      await new Promise(resolve => setTimeout(resolve, 1000));
      provider.disconnect();
      prev = workspace.doc.toJSON();
    }

    {
      const workspace = new Workspace({
        id: 'test',
        isSSR: true,
        schema,
      });
      const provider = createIndexedDBDownloadProvider(
        workspace.id,
        workspace.doc,
        {
          awareness: workspace.awarenessStore.awareness,
        }
      ) as LocalIndexedDBDownloadProvider;
      provider.sync();
      await provider.whenReady;
      expect(workspace.doc.toJSON()).toEqual({
        ...prev,
        // download provider only download the root doc
        spaces: {
          'space:page0': {
            blocks: {},
          },
        },
      });
    }
  });
});
