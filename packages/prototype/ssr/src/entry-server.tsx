import { Writable } from 'node:stream';

import { createStore } from 'jotai';
import { renderToPipeableStream } from 'react-dom/server';

import { App } from './App';
import { globalContextAtom } from './globalAtoms';
import { dataAtom } from './pages';

const serverStore = createStore();

serverStore.set(globalContextAtom, {
  fetch: async function serverFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ) {
    console.log('serverFetch', input, init);
    return globalThis.fetch(input, init);
  },
});

export async function render(path: string) {
  const url = new URL(path, 'http://localhost');
  const pathname = url.pathname;
  if (pathname === '/') {
    // todo
  }
  const chunks: Buffer[] = [];
  const writable = new Writable({
    write: (chunk: Buffer) => chunks.push(chunk),
  });
  // run effects
  await serverStore.get(dataAtom);

  return new Promise<string>(resolve => {
    const stream = renderToPipeableStream(<App store={serverStore} />, {
      onShellReady: async () => {
        stream.pipe(writable);
        resolve(Buffer.concat(chunks).toString('utf8'));
      },
    });
  });
}
