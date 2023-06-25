#!/usr/bin/env ts-node-esm
import 'fake-indexeddb/auto';

const map = new Map();
const localStorage = {
  getItem: (key: string) => map.get(key),
  setItem: (key: string, value: string) => map.set(key, value),
  clear: () => map.clear(),
};

// @ts-expect-error
globalThis.localStorage = localStorage;

import { Workspace } from '@blocksuite/store';
import { IndexeddbPersistence } from 'y-indexeddb';

const Y = Workspace.Y;

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { createIndexedDBProvider } from '../dist/index.js';

// @ts-expect-error
globalThis.window = {
  addEventListener: () => void 0,
  removeEventListener: () => void 0,
};

async function yjs_create_persistence(n = 1e3) {
  for (let i = 0; i < n; i++) {
    const yDoc = new Y.Doc();
    const persistence = new IndexeddbPersistence('test', yDoc);
    await persistence.whenSynced;
    persistence.destroy();
  }
}

async function yjs_single_persistence(n = 1e5) {
  const yDoc = new Y.Doc();
  const map = yDoc.getMap();
  for (let i = 0; i < n; i++) {
    map.set(`${i}`, i);
  }
  {
    const persistence = new IndexeddbPersistence('test', yDoc);
    await persistence.whenSynced;
    persistence.destroy();
  }
  {
    const persistence = new IndexeddbPersistence('test', yDoc);
    await persistence.whenSynced;
    persistence.destroy();
  }
}

async function toeverything_create_provider(n = 1e3) {
  for (let i = 0; i < n; i++) {
    const yDoc = new Y.Doc({
      guid: 'test',
    });
    const provider = createIndexedDBProvider(yDoc);
    provider.connect();
    await provider.whenSynced;
    provider.disconnect();
  }
}
async function toeverything_single_persistence(n = 1e5) {
  const yDoc = new Y.Doc({
    guid: 'test',
  });
  const map = yDoc.getMap();
  for (let i = 0; i < n; i++) {
    map.set(`${i}`, i);
  }
  const provider = createIndexedDBProvider(yDoc, 'test');
  provider.connect();
  await provider.whenSynced;
  provider.disconnect();
  provider.connect();
  await provider.whenSynced;
  provider.disconnect();
}

async function main() {
  console.log('create many persistence');
  performance.mark('start');
  await yjs_create_persistence();
  performance.mark('end');
  performance.measure('yjs', 'start', 'end');
  indexedDB.deleteDatabase('test');
  performance.mark('start');
  await toeverything_create_provider();
  performance.mark('end');
  performance.measure('toeverything', 'start', 'end');
  console.log(performance.getEntriesByType('measure'));
  indexedDB.deleteDatabase('test');
  performance.clearMarks();
  performance.clearMeasures();
  localStorage.clear();

  console.log('single persistence with huge updates');
  performance.mark('start');
  await yjs_single_persistence();
  performance.mark('end');
  performance.measure('yjs', 'start', 'end');
  indexedDB.deleteDatabase('test');
  performance.mark('start');
  await toeverything_single_persistence();
  performance.mark('end');
  performance.measure('toeverything', 'start', 'end');
  console.log(performance.getEntriesByType('measure'));
}

main().then();
