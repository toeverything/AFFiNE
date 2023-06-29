/// <reference types="vite/client" />
'use server';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ReactElement } from 'react';
import { lazy } from 'react';

import { Sidebar } from './components/sidebar/index.js';
import { saveFile } from './server-fns.js';

const Editor = lazy(() =>
  import('./components/editor.js').then(({ Editor }) => ({ default: Editor }))
);

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const AppCreator = (pathname: string) =>
  function App(): ReactElement {
    let path = resolve(__dirname, 'pages', 'binary');
    if (!existsSync(path)) {
      path = resolve(__dirname, '..', '..', 'src', 'pages', 'binary');
    }
    const buffer = [...readFileSync(path)];

    return (
      <div className="flex flex-col-reverse sm:flex-row h-screen">
        <nav className="w-full sm:w-64">
          <Sidebar />
        </nav>
        <main className="flex-1 p-6 w-full sm:w-[calc(100%-16rem)] overflow-scroll">
          <Editor
            workspaceId={pathname}
            pageId="1"
            onSave={saveFile}
            binary={buffer}
          />
        </main>
      </div>
    );
  };

export default AppCreator;
