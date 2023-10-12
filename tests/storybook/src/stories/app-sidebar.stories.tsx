import {
  AppSidebar,
  AppSidebarFallback,
  appSidebarOpenAtom,
  SidebarSwitch,
} from '@affine/component/app-sidebar';
import { AddPageButton } from '@affine/component/app-sidebar';
import { CategoryDivider } from '@affine/component/app-sidebar';
import { navHeaderStyle } from '@affine/component/app-sidebar';
import { MenuLinkItem } from '@affine/component/app-sidebar';
import { QuickSearchInput } from '@affine/component/app-sidebar';
import {
  SidebarContainer,
  SidebarScrollableContainer,
} from '@affine/component/app-sidebar';
import { DeleteTemporarilyIcon, SettingsIcon } from '@blocksuite/icons';
import type { Meta, StoryFn } from '@storybook/react';
import { useAtom } from 'jotai';
import { type PropsWithChildren, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';

export default {
  title: 'AFFiNE/AppSidebar',
  component: AppSidebar,
} satisfies Meta;

const Container = ({ children }: PropsWithChildren) => (
  <MemoryRouter>
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
      {children}
    </main>
  </MemoryRouter>
);
const Main = () => {
  const [open] = useAtom(appSidebarOpenAtom);
  return (
    <div>
      <div className={navHeaderStyle}>
        <SidebarSwitch show={!open} />
      </div>
    </div>
  );
};

export const Default: StoryFn = () => {
  return (
    <>
      <Container>
        <AppSidebar />
        <Main />
      </Container>
    </>
  );
};

export const Fallback = () => {
  return (
    <Container>
      <AppSidebarFallback />
      <Main />
    </Container>
  );
};

export const WithItems: StoryFn = () => {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <Container>
      <AppSidebar>
        <SidebarContainer>
          <QuickSearchInput />
          <div style={{ height: '20px' }} />
          <MenuLinkItem
            icon={<SettingsIcon />}
            to="/test"
            onClick={() => alert('opened')}
          >
            Settings
          </MenuLinkItem>
          <MenuLinkItem
            icon={<SettingsIcon />}
            to="/test"
            onClick={() => alert('opened')}
          >
            Settings
          </MenuLinkItem>
          <MenuLinkItem
            icon={<SettingsIcon />}
            to="/test"
            onClick={() => alert('opened')}
          >
            Settings
          </MenuLinkItem>
        </SidebarContainer>

        <SidebarScrollableContainer>
          <CategoryDivider label="Favorites" />
          <MenuLinkItem
            collapsed={collapsed}
            onCollapsedChange={setCollapsed}
            icon={<SettingsIcon />}
            to="/test"
            onClick={() => alert('opened')}
          >
            Collapsible Item
          </MenuLinkItem>
          <MenuLinkItem
            collapsed={!collapsed}
            onCollapsedChange={setCollapsed}
            icon={<SettingsIcon />}
            to="/test"
            onClick={() => alert('opened')}
          >
            Collapsible Item
          </MenuLinkItem>
          <MenuLinkItem
            icon={<SettingsIcon />}
            to="/test"
            onClick={() => alert('opened')}
          >
            Settings
          </MenuLinkItem>

          <CategoryDivider label="Others" />
          <MenuLinkItem
            icon={<DeleteTemporarilyIcon />}
            to="/test"
            onClick={() => alert('opened')}
          >
            Trash
          </MenuLinkItem>
        </SidebarScrollableContainer>
        <SidebarContainer>
          <AddPageButton />
        </SidebarContainer>
      </AppSidebar>
      <Main />
    </Container>
  );
};
