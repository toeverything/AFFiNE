/* deepscan-disable USELESS_ARROW_FUNC_BIND */
import type { StoryFn } from '@storybook/react';

import { Switch } from '..';

export default {
  title: 'AFFiNE/Switch',
  component: Switch,
};

export const Basic: StoryFn = () => {
  return <Switch />;
};
Basic.args = {
  logoSrc: '/imgs/affine-text-logo.png',
};
