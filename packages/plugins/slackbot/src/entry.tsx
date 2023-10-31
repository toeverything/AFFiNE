import { deleteLayoutAtom, pushLayoutAtom } from '@affine/sdk/entry';
import { Logo1Icon } from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
import { useSetAtom } from 'jotai';
import type { ComponentType, PropsWithChildren, ReactElement } from 'react';
import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';

export const HeaderButton = ({
  Provider,
}: {
  Provider: ComponentType<PropsWithChildren>;
}): ReactElement => {
  const [opened, setOpen] = useState(false);
  const pushLayout = useSetAtom(pushLayoutAtom);
  const deleteLayout = useSetAtom(deleteLayoutAtom);

  const openSidebar = useCallback(() => {
    if (!opened) {
      setOpen(true);
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

          return () => {
            root.unmount();
          };
        },
        {
          maxWidth: [undefined, 300],
        }
      );
    } else {
      setOpen(false);
      deleteLayout('@affine/slackbot-plugin');
    }
  }, [opened, Provider, pushLayout, deleteLayout]);

  return (
    <Tooltip content="Plugin Enabled">
      <IconButton onClick={openSidebar}>
        <Logo1Icon />
      </IconButton>
    </Tooltip>
  );
};
