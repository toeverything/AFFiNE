import { AffineSchemas } from '@blocksuite/blocks';
import type { Doc, DocSnapshot } from '@blocksuite/store';
import { DocCollection, Job, Schema } from '@blocksuite/store';

const getCollection = (() => {
  let collection: DocCollection | null = null;
  return async function () {
    if (collection) {
      return collection;
    }
    const schema = new Schema();
    schema.register(AffineSchemas);
    collection = new DocCollection({ schema });
    collection.meta.initialize();
    return collection;
  };
})();

export type DocName =
  | 'note'
  | 'pen'
  | 'shape'
  | 'text'
  | 'connector'
  | 'mindmap';

const docMap = new Map<DocName, Promise<Doc | undefined>>();

export async function getDocByName(name: DocName) {
  const rawData: Record<DocName, any> = {
    note: (await import('./note.json')).default,
    pen: (await import('./pen.json')).default,
    shape: (await import('./shape.json')).default,
    text: (await import('./text.json')).default,
    connector: (await import('./connector.json')).default,
    mindmap: (await import('./mindmap.json')).default,
  };
  if (docMap.get(name)) {
    return docMap.get(name);
  }
  const snapshot = rawData[name] as DocSnapshot;
  const promiseDoc = initDocFromSnapshot(snapshot);
  docMap.set(name, promiseDoc);
  return promiseDoc;
}

async function initDocFromSnapshot(snapshot: DocSnapshot) {
  const collection = await getCollection();
  const job = new Job({
    collection,
    middlewares: [],
  });

  return await job.snapshotToDoc(snapshot);
}
