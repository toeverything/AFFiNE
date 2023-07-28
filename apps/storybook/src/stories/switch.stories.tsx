/* deepscan-disable USELESS_ARROW_FUNC_BIND */
import { Switch } from '@affine/component';
import type { StoryFn } from '@storybook/react';

export default {
  title: 'AFFiNE/Switch',
  component: Switch,
};

export const Basic: StoryFn = () => {
  return <Switch>Switch</Switch>;
};
