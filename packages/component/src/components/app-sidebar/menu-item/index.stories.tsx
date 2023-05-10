import { SettingsIcon } from '@blocksuite/icons';
import type { Meta, StoryFn } from '@storybook/react';

import { MenuItem, MenuLinkItem } from '.';

export default {
  title: 'Components/AppSidebar/MenuItem',
  component: MenuItem,
} satisfies Meta;

export const Default: StoryFn = () => {
  return (
    <main style={{ width: '240px' }}>
      <MenuItem icon={<SettingsIcon />} onClick={() => alert('opened')}>
        Settings
      </MenuItem>
      <MenuLinkItem
        icon={<SettingsIcon />}
        href="/test"
        onClick={() => alert('opened')}
      >
        Settings
      </MenuLinkItem>
    </main>
  );
};
