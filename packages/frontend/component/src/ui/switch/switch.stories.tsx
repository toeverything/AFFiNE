import type { Meta, StoryFn } from '@storybook/react';

import { Switch, type SwitchProps } from '.';

export default {
  title: 'UI/Switch',
  component: Switch,
} satisfies Meta<typeof Switch>;

const Template: StoryFn<SwitchProps> = args => <Switch {...args} />;

export const Default: StoryFn<SwitchProps> = Template.bind(undefined);
Default.args = {};
