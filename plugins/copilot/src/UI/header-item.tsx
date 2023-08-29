import { deleteLayoutAtom, pushLayoutAtom } from '@affine/sdk/entry';
import { AiIcon } from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
import { useSetAtom } from 'jotai';
import type { ComponentType, PropsWithChildren, ReactElement } from 'react';
import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { DetailContent } from './detail-content';

export const HeaderItem = ({
  Provider,
}: {
  Provider: ComponentType<PropsWithChildren>;
}): ReactElement => {
  const [open, setOpen] = useState(false);
  const pushLayout = useSetAtom(pushLayoutAtom);
  const deleteLayout = useSetAtom(deleteLayoutAtom);
  return (
    <Tooltip content="Chat with AI" side="bottom">
      <IconButton
        onClick={useCallback(() => {
          if (!open) {
            setOpen(true);
            pushLayout('@affine/copilot-plugin', div => {
              const root = createRoot(div);
              root.render(
                <Provider>
                  <DetailContent />
                </Provider>
              );
              return () => {
                root.unmount();
              };
            });
          } else {
            setOpen(false);
            deleteLayout('@affine/copilot-plugin');
          }
        }, [Provider, deleteLayout, open, pushLayout])}
      >
        <AiIcon />
      </IconButton>
    </Tooltip>
  );
};
