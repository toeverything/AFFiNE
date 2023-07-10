import type { PluginBlockSuiteAdapter } from '@toeverything/plugin-infra/type';
import { noop } from 'foxact/noop';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { OutlineUI } from './ui';

export default {
  uiDecorator: editor => {
    if (editor.parentElement) {
      const div = document.createElement('div');
      editor.parentElement.appendChild(div);
      const root = createRoot(div);
      root.render(
        <StrictMode>
          <OutlineUI page={editor.page} />
        </StrictMode>
      );
      return () => {
        root.unmount();
        div.remove();
      };
    } else {
      return noop;
    }
  },
} satisfies Partial<PluginBlockSuiteAdapter>;
