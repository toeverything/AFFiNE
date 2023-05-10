import { IconButton } from '@affine/component';
import {
  DeleteTemporarilyIcon,
  SettingsIcon,
  SidebarIcon,
} from '@blocksuite/icons';
import type { Meta, StoryFn } from '@storybook/react';
import { useAtom } from 'jotai';

import { AppSidebar, appSidebarOpenAtom } from '.';
import { CategoryDivider } from './category-divider';
import { navHeaderStyle, sidebarButtonStyle } from './index.css';
import { MenuLinkItem } from './menu-item';
import { QuickSearchInput } from './quick-search-input';
import {
  SidebarScrollableContainer,
  SidebarTopContainer,
} from './sidebar-containers';

export default {
  title: 'Components/AppSidebar',
  component: AppSidebar,
} satisfies Meta;

const AppSidebarTemplate = (props: { children?: React.ReactNode }) => {
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
        <AppSidebar>{props.children}</AppSidebar>
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

export const EmptyAppSidebar = () => {
  return <AppSidebarTemplate />;
};

export const WithItems: StoryFn = () => {
  return (
    <AppSidebarTemplate>
      <SidebarTopContainer>
        <QuickSearchInput />
        <div style={{ padding: '24px 0' }}>
          <MenuLinkItem
            icon={<SettingsIcon />}
            href="/test"
            onClick={() => alert('opened')}
          >
            Settings
          </MenuLinkItem>
          <MenuLinkItem
            icon={<SettingsIcon />}
            href="/test"
            onClick={() => alert('opened')}
          >
            Settings
          </MenuLinkItem>
          <MenuLinkItem
            icon={<SettingsIcon />}
            href="/test"
            onClick={() => alert('opened')}
          >
            Settings
          </MenuLinkItem>
        </div>
      </SidebarTopContainer>

      <SidebarScrollableContainer>
        <CategoryDivider label="Favorites" />
        <MenuLinkItem
          icon={<SettingsIcon />}
          href="/test"
          onClick={() => alert('opened')}
        >
          Settings
        </MenuLinkItem>
        <MenuLinkItem
          icon={<SettingsIcon />}
          href="/test"
          onClick={() => alert('opened')}
        >
          Settings
        </MenuLinkItem>

        <CategoryDivider label="Others" />
        <MenuLinkItem
          icon={<DeleteTemporarilyIcon />}
          href="/test"
          onClick={() => alert('opened')}
        >
          Trash
        </MenuLinkItem>
      </SidebarScrollableContainer>
    </AppSidebarTemplate>
  );
};
