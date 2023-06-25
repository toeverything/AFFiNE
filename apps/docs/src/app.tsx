/// <reference types="vite/client" />
'use server';
import type { ReactElement } from 'react';
import { lazy } from 'react';

import { Sidebar } from './components/sidebar.js';

const Editor = lazy(() =>
  import('./components/editor.js').then(({ Editor }) => ({ default: Editor }))
);

const markdown = `---
title: AFFiNE Developer Documentation
---

## To Shape, not to adapt

---

**Powered by BlockSuite**
`;

const App = (): ReactElement => {
  return (
    <div className="flex flex-col-reverse sm:flex-row">
      <nav className="w-full sm:w-64">
        <Sidebar />
      </nav>
      <main className="flex-1 p-6 w-full sm:w-[calc(100%-16rem)]">
        <Editor text={markdown} />
      </main>
    </div>
  );
};

export default App;
