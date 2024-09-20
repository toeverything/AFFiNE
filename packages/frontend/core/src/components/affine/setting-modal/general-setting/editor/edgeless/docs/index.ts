import { AffineSchemas } from '@blocksuite/affine/blocks';
import type { Doc, DocSnapshot } from '@blocksuite/affine/store';
import { DocCollection, Job, Schema } from '@blocksuite/affine/store';

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
  | 'flow'
  | 'text'
  | 'connector'
  | 'mindmap';

const docMap = new Map<DocName, Promise<Doc | undefined>>();

async function loadNote() {
  return (await import('./note.json')).default;
}

async function loadPen() {
  return (await import('./pen.json')).default;
}

async function loadShape() {
  return (await import('./shape.json')).default;
}

async function loadFlow() {
  return (await import('./flow.json')).default;
}

async function loadText() {
  return (await import('./text.json')).default;
}

async function loadConnector() {
  return (await import('./connector.json')).default;
}

async function loadMindmap() {
  return (await import('./mindmap.json')).default;
}

const loaders = {
  note: loadNote,
  pen: loadPen,
  shape: loadShape,
  flow: loadFlow,
  text: loadText,
  connector: loadConnector,
  mindmap: loadMindmap,
};

export async function getDocByName(name: DocName) {
  if (docMap.get(name)) {
    return docMap.get(name);
  }

  const promise = initDoc(name);
  docMap.set(name, promise);
  return promise;
}

async function initDoc(name: DocName) {
  const snapshot = (await loaders[name]()) as DocSnapshot;
  const collection = await getCollection();
  const job = new Job({
    collection,
    middlewares: [],
  });

  return await job.snapshotToDoc(snapshot);
}
