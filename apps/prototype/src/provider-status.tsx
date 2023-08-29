import type { LocalIndexedDBBackgroundProvider } from '@affine/env/workspace';
import { createIndexedDBBackgroundProvider } from '@affine/workspace/providers';
import { assertExists } from '@blocksuite/global/utils';
import { useDataSourceStatus } from '@toeverything/hooks/use-data-source-status';
import React, { useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { Awareness } from 'y-protocols/awareness';
import { Doc } from 'yjs';

const doc = new Doc();
const map = doc.getMap();
const awareness = new Awareness(doc);

const indexeddbProvider = createIndexedDBBackgroundProvider('test', doc, {
  awareness,
}) as LocalIndexedDBBackgroundProvider;
indexeddbProvider.connect();

const App = () => {
  const counterRef = useRef(0);
  const disposeRef = useRef<number>(0);
  const status = useDataSourceStatus(indexeddbProvider);
  return (
    <div>
      <button
        data-testid="start-button"
        onClick={useCallback(() => {
          disposeRef.current = window.setInterval(() => {
            const counter = counterRef.current;
            map.set('counter', counter + 1);
            counterRef.current = counter + 1;
          }, 0);
        }, [])}
      >
        start writing
      </button>
      <button
        data-testid="stop-button"
        onClick={useCallback(() => {
          clearInterval(disposeRef.current);
        }, [])}
      >
        stop writing
      </button>
      <div data-testid="status">{status.type}</div>
    </div>
  );
};

const root = document.getElementById('root');
assertExists(root);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
