import { IconButton } from '@affine/component';
import { SidebarIcon } from '@blocksuite/icons';
import type { Meta, StoryFn } from '@storybook/react';
import { useAtom } from 'jotai';
import { useState } from 'react';

import { AppSidebar, appSidebarOpenAtom, ResizeIndicator } from '.';
import { navHeaderStyle, sidebarButtonStyle } from './index.css';

export default {
  title: 'Components/AppSidebar',
  component: AppSidebar,
} satisfies Meta;

const Footer = () => <div>Add Page</div>;

export const Default: StoryFn = () => {
  const [open, setOpen] = useAtom(appSidebarOpenAtom);
  const [ref, setRef] = useState<HTMLElement | null>(null);
  return (
    <>
      <main
        style={{
          position: 'relative',
          width: '100vw',
          height: '600px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'row',
        }}
      >
        <AppSidebar footer={<Footer />} ref={setRef}>
          Test
        </AppSidebar>
        <ResizeIndicator targetElement={ref} />
        <div>
          <div className={navHeaderStyle}>
            {!open && (
              <IconButton
                className={sidebarButtonStyle}
                onClick={() => {
                  setOpen(true);
                }}
              >
                <SidebarIcon width={24} height={24} />
              </IconButton>
            )}
          </div>
        </div>
      </main>
    </>
  );
};
