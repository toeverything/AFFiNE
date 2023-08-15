import { Tooltip } from '@affine/component';
import { deleteLayoutAtom, pushLayoutAtom } from '@affine/sdk/entry';
import { TOCNotesPanel } from '@blocksuite/blocks';
import { RightSidebarIcon } from '@blocksuite/icons';
import type { Page } from '@blocksuite/store';
import { IconButton } from '@toeverything/components/button';
import { useAtom, useSetAtom } from 'jotai';
import type { ComponentType, PropsWithChildren } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { blocksuiteRootAtom } from './atom';

const Outline = () => {
  const ref = useRef<HTMLDivElement>(null);
  const tocPanelRef = useRef<TOCNotesPanel | null>(null);
  const [blocksuite] = useAtom(blocksuiteRootAtom);

  if (!tocPanelRef.current) {
    tocPanelRef.current = new TOCNotesPanel();
  }

  if (blocksuite?.page !== tocPanelRef.current?.page) {
    (tocPanelRef.current as TOCNotesPanel).page = blocksuite?.page as Page;
  }

  useEffect(() => {
    if (!ref.current || !tocPanelRef.current) return;

    const container = ref.current;
    const tocPanel = tocPanelRef.current as TOCNotesPanel;

    container.appendChild(tocPanel);

    return () => {
      container.removeChild(tocPanel);
    };
  }, []);

  return (
    <div
      className={`outline-wrapper`}
      style={{
        height: '100%',
        borderLeft: `1px solid var(--affine-border-color)`,
      }}
      ref={ref}
    />
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
            pushLayout(
              '@affine/outline-plugin',
              div => {
                const root = createRoot(div);

                div.style.height = '100%';

                root.render(
                  <Provider>
                    <Outline />
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
            deleteLayout('@affine/outline-plugin');
          }
        }, [Provider, deleteLayout, open, pushLayout])}
      >
        <RightSidebarIcon />
      </IconButton>
    </Tooltip>
  );
};
