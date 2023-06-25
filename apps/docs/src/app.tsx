'use server';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { ReactElement } from 'react';
import { lazy } from 'react';

const Editor = lazy(() =>
  import('./components/editor.js').then(({ Editor }) => ({ default: Editor }))
);

const markdown = await fs.readFile(path.join('./src/pages/index.md'), {
  encoding: 'utf-8',
});

const App = (): ReactElement => {
  return (
    <div>
      <div className="mt-5">
        <Editor text={markdown} />
      </div>
    </div>
  );
};

export default App;
