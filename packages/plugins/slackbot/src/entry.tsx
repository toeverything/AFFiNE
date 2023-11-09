import {
  contentLayoutAtom,
  deleteLayoutAtom,
  pushLayoutAtom,
} from '@affine/sdk/entry';
import { Logo1Icon } from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
import { useAtom, useSetAtom } from 'jotai';
import type { ComponentType, PropsWithChildren, ReactElement } from 'react';
import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import { getEditor, useEditor } from './hooks';

export const HeaderButton = ({
  Provider,
}: {
  Provider: ComponentType<PropsWithChildren>;
}): ReactElement => {
  const pushLayout = useSetAtom(pushLayoutAtom);
  const deleteLayout = useSetAtom(deleteLayoutAtom);
  const [layout] = useAtom(contentLayoutAtom);
  const [editor] = useEditor();

  const isSlackOpen = useCallback(() => {
    if (typeof layout === 'string') return false;
    if (
      typeof layout === 'object' &&
      layout.second === '@affine/slackbot-plugin'
    )
      return false;

    return true;
  }, [layout]);
  const clearAndPush = useCallback(() => {
    if (typeof layout === 'string') {
      pushLayout(
        '@affine/slackbot-plugin',
        div => {
          const root = createRoot(div);
          div.style.height = '100%';

          root.render(
            <Provider>
              <App />
            </Provider>
          );

          return () => root.unmount();
        },
        {
          maxWidth: [undefined, 300],
        }
      );
    }
    if (typeof layout === 'object') {
      deleteLayout(layout.second as string);
    }
  }, [Provider, layout, pushLayout, deleteLayout]);

  const openSidebar = useCallback(() => {
    const opened = isSlackOpen();

    if (!opened) {
      if (editor?.root.value?.selection.value) {
        const value = editor?.root.value?.selection.value;
        setTimeout(() => {
          const currentEditor = getEditor();
          currentEditor.root.value?.selection.set(value);
        }, 100);
      }
      clearAndPush();
    } else {
      deleteLayout('@affine/slackbot-plugin');
    }
  }, [editor, isSlackOpen, clearAndPush, deleteLayout]);

  return (
    <Tooltip content="Plugin Enabled">
      <IconButton onClick={openSidebar}>
        <Logo1Icon />
      </IconButton>
    </Tooltip>
  );
};
