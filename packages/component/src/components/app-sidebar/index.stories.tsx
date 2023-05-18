import { IconButton } from '@affine/component';
import {
  DeleteTemporarilyIcon,
  SettingsIcon,
  SidebarIcon,
} from '@blocksuite/icons';
import type { Meta, StoryFn } from '@storybook/react';
import { useAtom } from 'jotai';
import type { PropsWithChildren } from 'react';

import { AppSidebar, AppSidebarFallback, appSidebarOpenAtom } from '.';
import { AddPageButton } from './add-page-button';
import { CategoryDivider } from './category-divider';
import { navHeaderStyle, sidebarButtonStyle } from './index.css';
import { MenuLinkItem } from './menu-item';
import { QuickSearchInput } from './quick-search-input';
import {
  SidebarContainer,
  SidebarScrollableContainer,
} from './sidebar-containers';

export default {
  title: 'Components/AppSidebar',
  component: AppSidebar,
} satisfies Meta;

const Container = ({ children }: PropsWithChildren) => (
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
);
const Main = () => {
  const [open, setOpen] = useAtom(appSidebarOpenAtom);
  return (
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
  return (
    <Container>
      <AppSidebar>
        <SidebarContainer>
          <QuickSearchInput />
          <div style={{ height: '20px' }} />
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
        </SidebarContainer>

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
        <SidebarContainer>
          <AddPageButton />
        </SidebarContainer>
      </AppSidebar>
      <Main />
    </Container>
  );
};
