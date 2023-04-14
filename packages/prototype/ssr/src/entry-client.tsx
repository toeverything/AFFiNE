import { createStore } from 'jotai';
import { hydrateRoot } from 'react-dom/client';

import { App } from './App';
import { globalContextAtom } from './globalAtoms';

const clientStore = createStore();

clientStore.set(globalContextAtom, {
  fetch: window.fetch,
});

const root = document.getElementById('app') as HTMLDivElement;
hydrateRoot(root, <App store={clientStore} />, {
  onRecoverableError: error => console.error(error),
});
