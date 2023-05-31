import type { PluginBlockSuiteAdapter } from '@toeverything/plugin-infra/type';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { BookMarkUI } from './ui';

export default {
  uiDecorator: editor => {
    if (
      editor.parentElement &&
      editor.page.awarenessStore.getFlag('enable_bookmark_operation')
    ) {
      const div = document.createElement('div');
      editor.parentElement.appendChild(div);
      const root = createRoot(div);
      root.render(
        <StrictMode>
          <BookMarkUI page={editor.page} />
        </StrictMode>
      );
      return () => {
        root.unmount();
        div.remove();
      };
    } else {
      return () => {};
    }
  },
} satisfies Partial<PluginBlockSuiteAdapter>;
