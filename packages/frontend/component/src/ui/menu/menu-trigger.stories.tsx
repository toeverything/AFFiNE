import type { Meta, StoryFn } from '@storybook/react';

import type { MenuTriggerProps } from './index';
import { MenuTrigger } from './index';

export default {
  title: 'UI/MenuTrigger',
  component: MenuTrigger,
} satisfies Meta<typeof MenuTrigger>;

const Template: StoryFn<MenuTriggerProps> = args => (
  <div style={{ width: '50%' }}>
    <MenuTrigger {...args}>This is a menu trigger</MenuTrigger>
  </div>
);

export const Default: StoryFn<MenuTriggerProps> = Template.bind(undefined);
Default.args = {};
