import type { StoryFn } from '@storybook/react';

import { ShareMenu } from '../components/share-menu';

export default {
  title: 'AFFiNE/ShareMenu',
  component: ShareMenu,
};

export const Basic: StoryFn = () => {
  return <ShareMenu />;
};
Basic.args = {
  logoSrc: '/imgs/affine-text-logo.png',
};
