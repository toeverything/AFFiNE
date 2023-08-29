/* deepscan-disable USELESS_ARROW_FUNC_BIND */
import { Switch } from '@affine/component';
import type { Meta, StoryFn } from '@storybook/react';

export default {
  title: 'AFFiNE/Switch',
  component: Switch,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta;

export const Basic: StoryFn = () => {
  return <Switch>Switch</Switch>;
};
