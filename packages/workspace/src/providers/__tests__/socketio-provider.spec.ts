/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import type { AffineSocketIOProvider } from '@affine/env/workspace';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Schema, Workspace } from '@blocksuite/store';
import { describe, expect, test } from 'vitest';
import * as awarenessProtocol from 'y-protocols/awareness';
import { Doc } from 'yjs';

import { createAffineSocketIOProvider } from '..';

const schema = new Schema();

schema.register(AffineSchemas).register(__unstableSchemas);

describe('sockio provider', () => {
  test.skip('test storage', async () => {
    const workspaceId = 'test-storage-ws';
    {
      const workspace = new Workspace({
        id: workspaceId,
        isSSR: true,
        schema,
      });
      const provider = createAffineSocketIOProvider(
        workspace.id,
        workspace.doc,
        {
          awareness: workspace.awarenessStore.awareness,
        }
      ) as AffineSocketIOProvider;
      provider.connect();
      const page = workspace.createPage({
        id: 'page',
      });

      await page.waitForLoaded();
      page.addBlock('affine:page', {
        title: new page.Text('123123'),
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    {
      const workspace = new Workspace({
        id: workspaceId,
        isSSR: true,
        schema,
      });
      const provider = createAffineSocketIOProvider(
        workspace.id,
        workspace.doc,
        {
          awareness: workspace.awarenessStore.awareness,
        }
      ) as AffineSocketIOProvider;

      provider.connect();

      await new Promise(resolve => setTimeout(resolve, 1000));
      const page = workspace.getPage('page')!;
      await page.waitForLoaded();
      const block = page.getBlockByFlavour('affine:page');
      expect(block[0].flavour).toEqual('affine:page');
    }
  });

  test.skip('test collaboration', async () => {
    const workspaceId = 'test-collboration-ws';
    {
      const doc = new Doc({ guid: workspaceId });
      const provider = createAffineSocketIOProvider(doc.guid, doc, {
        awareness: new awarenessProtocol.Awareness(doc),
      }) as AffineSocketIOProvider;

      const doc2 = new Doc({ guid: workspaceId });
      const provider2 = createAffineSocketIOProvider(doc2.guid, doc2, {
        awareness: new awarenessProtocol.Awareness(doc2),
      }) as AffineSocketIOProvider;

      provider.connect();
      provider2.connect();

      await new Promise(resolve => setTimeout(resolve, 500));

      const subdoc = new Doc();
      const folder = doc.getMap();
      folder.set('subDoc', subdoc);
      subdoc.getText().insert(0, 'subDoc content');

      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(
        (doc2.getMap().get('subDoc') as Doc).getText().toJSON(),
        'subDoc content'
      );
    }
  });
});
