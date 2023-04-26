import { IconButton } from '@affine/component';
import { SidebarIcon } from '@blocksuite/icons';
import type { Meta, StoryFn } from '@storybook/react';
import { useAtom } from 'jotai';

import { AppSidebar, appSidebarOpenAtom } from '.';
import { navHeaderStyle, sidebarButtonStyle } from './index.css';
import { appSidebarWidthAtom } from './index.jotai';

export default {
  title: 'Components/AppSidebar',
  component: AppSidebar,
} satisfies Meta;

export const Default: StoryFn = props => {
  const [open, setOpen] = useAtom(appSidebarOpenAtom);
  const [width, setWidth] = useAtom(appSidebarWidthAtom);
  if (props.width !== width) {
    setWidth(props.width ?? 256);
  }
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
        </div>
      </main>
    </>
  );
};

Default.argTypes = {
  width: {
    control: {
      type: 'range',
      min: 256,
      max: 512,
    },
  },
};
