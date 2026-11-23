import type { Store, Workspace } from '@blocksuite/affine/store';

import { createTestApp } from './app';

export async function prepareTestApp(collection: Workspace) {
  const params = new URLSearchParams(location.search);
  const noInit = params.get('noInit') === 'true';

  const store = await getStore(collection, noInit);
  store.load();
  if (!store.root) {
    await new Promise(resolve => {
      const subscription = store.slots.rootAdded.subscribe(value => {
        subscription.unsubscribe();
        resolve(value);
      });
    });
  }

  await createTestApp(store, collection);
}

async function getStore(
  collection: Workspace,
  noInit: boolean
): Promise<Store> {
  if (!noInit) {
    collection.meta.initialize();
    const doc = collection.createDoc('doc:home').getStore();
    window.doc = doc;
    return doc;
  }

  const doc = collection.docs.values().next().value;
  const firstDoc = doc?.getStore();
  if (firstDoc) {
    window.doc = firstDoc;
    return firstDoc;
  }

  const { resolve, reject, promise } = Promise.withResolvers<Store>();
  collection.slots.docListUpdated.subscribe(() => {
    const doc = collection.docs.values().next().value;
    const firstDoc = doc?.getStore();
    if (!firstDoc) {
      reject(new Error(`Failed to get doc`));
      return;
    }
    window.doc = firstDoc;
    resolve(firstDoc);
  });

  return promise;
}
