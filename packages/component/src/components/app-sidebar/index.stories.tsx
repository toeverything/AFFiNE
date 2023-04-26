import { IconButton } from '@affine/component';
import { SidebarIcon } from '@blocksuite/icons';
import type { Meta } from '@storybook/react';
import { useAtom } from 'jotai';

import { AppSidebar, appSidebarOpenAtom } from '.';
import { navHeaderStyle, sidebarButtonStyle } from './index.css';

export default {
  title: 'Components/AppSidebar',
  component: AppSidebar,
} satisfies Meta;

export const Default = () => {
  const [open, setOpen] = useAtom(appSidebarOpenAtom);
  return (
    <>
      <main
        style={{
          width: '100vw',
          height: '600px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'row',
        }}
      >
        <AppSidebar footer={<>Footer</>}>Test</AppSidebar>
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
          Container
        </div>
      </main>
    </>
  );
};
