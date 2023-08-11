import { setTimeout } from 'node:timers/promises';

import { describe, expect, test, vi } from 'vitest';
import { applyUpdate, Doc, encodeStateAsUpdate } from 'yjs';

import { createLazyProvider } from '../lazy-provider';
import type { DatasourceDocAdapter } from '../types';
import { getDoc } from '../utils';

const createMemoryDatasource = (rootDoc: Doc) => {
  const selfUpdateOrigin = Symbol('self-origin');
  const listeners = new Set<(guid: string, update: Uint8Array) => void>();

  function trackDoc(doc: Doc) {
    doc.on('update', (update, origin) => {
      if (origin === selfUpdateOrigin) {
        return;
      }
      for (const listener of listeners) {
        listener(doc.guid, update);
      }
    });

    doc.on('subdocs', () => {
      for (const subdoc of rootDoc.subdocs) {
        trackDoc(subdoc);
      }
    });
  }

  trackDoc(rootDoc);

  const adapter = {
    queryDocState: async (guid, options) => {
      const subdoc = getDoc(rootDoc, guid);
      if (!subdoc) {
        return false;
      }
      return encodeStateAsUpdate(subdoc, options?.stateVector);
    },
    sendDocUpdate: async (guid, update) => {
      const subdoc = getDoc(rootDoc, guid);
      if (!subdoc) {
        return;
      }
      applyUpdate(subdoc, update, selfUpdateOrigin);
    },
    onDocUpdate: callback => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  } satisfies DatasourceDocAdapter;
  return {
    rootDoc, // expose rootDoc for testing
    ...adapter,
  };
};

describe('y-provider', () => {
  test('should sync a subdoc if it is loaded after connect', async () => {
    const remoteRootDoc = new Doc(); // this is the remote doc lives in remote
    const datasource = createMemoryDatasource(remoteRootDoc);

    const remotesubdoc = new Doc();
    remotesubdoc.getText('text').insert(0, 'test-subdoc-value');
    // populate remote doc with simple data
    remoteRootDoc.getMap('map').set('test-0', 'test-0-value');
    remoteRootDoc.getMap('map').set('subdoc', remotesubdoc);

    const rootDoc = new Doc({ guid: remoteRootDoc.guid }); // this is the doc that we want to sync
    const provider = createLazyProvider(rootDoc, datasource);

    provider.connect();

    await setTimeout(); // wait for the provider to sync

    const subdoc = rootDoc.getMap('map').get('subdoc') as Doc;

    expect(rootDoc.getMap('map').get('test-0')).toBe('test-0-value');
    expect(subdoc.getText('text').toJSON()).toBe('');

    // onload, the provider should sync the subdoc
    subdoc.load();
    await setTimeout();
    expect(subdoc.getText('text').toJSON()).toBe('test-subdoc-value');

    remotesubdoc.getText('text').insert(0, 'prefix-');
    await setTimeout();
    expect(subdoc.getText('text').toJSON()).toBe('prefix-test-subdoc-value');
  });

  test('should sync a shouldLoad=true subdoc on connect', async () => {
    const remoteRootDoc = new Doc(); // this is the remote doc lives in remote
    const datasource = createMemoryDatasource(remoteRootDoc);

    const remotesubdoc = new Doc();
    remotesubdoc.getText('text').insert(0, 'test-subdoc-value');

    // populate remote doc with simple data
    remoteRootDoc.getMap('map').set('test-0', 'test-0-value');
    remoteRootDoc.getMap('map').set('subdoc', remotesubdoc);

    const rootDoc = new Doc({ guid: remoteRootDoc.guid }); // this is the doc that we want to sync
    applyUpdate(rootDoc, encodeStateAsUpdate(remoteRootDoc)); // sync rootDoc with remoteRootDoc

    const subdoc = rootDoc.getMap('map').get('subdoc') as Doc;
    expect(subdoc.getText('text').toJSON()).toBe('');

    subdoc.load();
    const provider = createLazyProvider(rootDoc, datasource);

    provider.connect();
    await setTimeout(); // wait for the provider to sync
    expect(subdoc.getText('text').toJSON()).toBe('test-subdoc-value');
  });

  test('should send existing local update to remote on connect', async () => {
    const remoteRootDoc = new Doc(); // this is the remote doc lives in remote
    const datasource = createMemoryDatasource(remoteRootDoc);

    const rootDoc = new Doc({ guid: remoteRootDoc.guid }); // this is the doc that we want to sync
    applyUpdate(rootDoc, encodeStateAsUpdate(remoteRootDoc)); // sync rootDoc with remoteRootDoc

    rootDoc.getText('text').insert(0, 'test-value');
    const provider = createLazyProvider(rootDoc, datasource);
    provider.connect();
    await setTimeout(); // wait for the provider to sync

    expect(remoteRootDoc.getText('text').toJSON()).toBe('test-value');
  });

  test('should send local update to remote for subdoc after connect', async () => {
    const remoteRootDoc = new Doc(); // this is the remote doc lives in remote
    const datasource = createMemoryDatasource(remoteRootDoc);

    const rootDoc = new Doc({ guid: remoteRootDoc.guid }); // this is the doc that we want to sync
    const provider = createLazyProvider(rootDoc, datasource);

    provider.connect();

    await setTimeout(); // wait for the provider to sync

    const subdoc = new Doc();
    rootDoc.getMap('map').set('subdoc', subdoc);
    subdoc.getText('text').insert(0, 'test-subdoc-value');

    await setTimeout(); // wait for the provider to sync

    const remoteSubdoc = remoteRootDoc.getMap('map').get('subdoc') as Doc;
    expect(remoteSubdoc.getText('text').toJSON()).toBe('test-subdoc-value');
  });

  test('should not send local update to remote for subdoc after disconnect', async () => {
    const remoteRootDoc = new Doc(); // this is the remote doc lives in remote
    const datasource = createMemoryDatasource(remoteRootDoc);

    const rootDoc = new Doc({ guid: remoteRootDoc.guid }); // this is the doc that we want to sync
    const provider = createLazyProvider(rootDoc, datasource);

    provider.connect();

    await setTimeout(); // wait for the provider to sync

    const subdoc = new Doc();
    rootDoc.getMap('map').set('subdoc', subdoc);

    await setTimeout(); // wait for the provider to sync

    const remoteSubdoc = remoteRootDoc.getMap('map').get('subdoc') as Doc;
    expect(remoteSubdoc.getText('text').toJSON()).toBe('');

    provider.disconnect();
    subdoc.getText('text').insert(0, 'test-subdoc-value');
    setTimeout();
    expect(remoteSubdoc.getText('text').toJSON()).toBe('');

    expect(provider.connected).toBe(false);
  });

  test('should not send remote update back', async () => {
    const remoteRootDoc = new Doc(); // this is the remote doc lives in remote
    const datasource = createMemoryDatasource(remoteRootDoc);
    const spy = vi.spyOn(datasource, 'sendDocUpdate');

    const rootDoc = new Doc({ guid: remoteRootDoc.guid }); // this is the doc that we want to sync
    const provider = createLazyProvider(rootDoc, datasource);

    provider.connect();

    remoteRootDoc.getText('text').insert(0, 'test-value');

    expect(spy).not.toBeCalled();
  });
});
