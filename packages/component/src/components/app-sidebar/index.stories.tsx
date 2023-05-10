import { IconButton } from '@affine/component';
import { SidebarIcon } from '@blocksuite/icons';
import type { Meta, StoryFn } from '@storybook/react';
import { useAtom } from 'jotai';

import { AppSidebar, appSidebarOpenAtom } from '.';
import { navHeaderStyle, sidebarButtonStyle } from './index.css';

export default {
  title: 'Components/AppSidebar',
  component: AppSidebar,
} satisfies Meta;

const Footer = () => <div>Add Page</div>;

export const Default: StoryFn = () => {
  const [open, setOpen] = useAtom(appSidebarOpenAtom);
  return (
    <>
      <main
        style={{
          position: 'relative',
          width: '100vw',
          height: 'calc(100vh - 40px)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'row',
        }}
      >
        <AppSidebar footer={<Footer />}>Test</AppSidebar>
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
