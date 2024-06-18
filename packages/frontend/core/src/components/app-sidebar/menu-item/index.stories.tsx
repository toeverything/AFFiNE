import { SettingsIcon } from '@blocksuite/icons/rc';
import type { Meta, StoryFn } from '@storybook/react';
import { useState } from 'react';

import { MenuItem, MenuLinkItem } from './index';

export default {
  title: 'Components/AppSidebar/MenuItem',
  component: MenuItem,
} satisfies Meta;

export const Default: StoryFn = () => {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <main style={{ width: '240px' }}>
      <MenuItem icon={<SettingsIcon />} onClick={() => alert('opened')}>
        Normal Item
      </MenuItem>
      <MenuLinkItem
        icon={<SettingsIcon />}
        to="/test"
        onClick={() => alert('opened')}
      >
        Normal Link Item
      </MenuLinkItem>
      <MenuLinkItem
        active
        icon={<SettingsIcon />}
        to="/test"
        onClick={() => alert('opened')}
      >
        Primary Item
      </MenuLinkItem>
      <MenuItem
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        icon={<SettingsIcon />}
        onClick={() => alert('opened')}
      >
        Collapsible Item
      </MenuItem>
    </main>
  );
};
