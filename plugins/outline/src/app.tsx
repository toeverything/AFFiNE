import { Tooltip } from '@affine/component';
import { deleteLayoutAtom, pushLayoutAtom } from '@affine/sdk/entry';
import { AlignTopIcon } from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';
import { useSetAtom } from 'jotai';
import type { ComponentType, PropsWithChildren } from 'react';
import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';

const Outline = () => {
  return (
    <div>
      <h1>Outline</h1>
    </div>
  );
};

export const HeaderItem = ({
  Provider,
}: {
  Provider: ComponentType<PropsWithChildren>;
}) => {
  const [open, setOpen] = useState(false);
  const pushLayout = useSetAtom(pushLayoutAtom);
  const deleteLayout = useSetAtom(deleteLayoutAtom);
  return (
    <Tooltip content="Plugin Enabled">
      <IconButton
        onClick={useCallback(() => {
          if (!open) {
            setOpen(true);
            pushLayout('@affine/outline-plugin', div => {
              const root = createRoot(div);
              root.render(
                <Provider>
                  <Outline />
                </Provider>
              );
              return () => {
                root.unmount();
              };
            });
          } else {
            setOpen(false);
            deleteLayout('@affine/outline-plugin');
          }
        }, [Provider, deleteLayout, open, pushLayout])}
      >
        <AlignTopIcon />
      </IconButton>
    </Tooltip>
  );
};
