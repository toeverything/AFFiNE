import type { StoryFn } from '@storybook/react';

import type { ContactModalProps } from '../components/contact-modal';
import { ShareMenu } from '../components/share-menu';

export default {
  title: 'AFFiNE/ShareMenu',
  component: ShareMenu,
};

export const Basic: StoryFn<ContactModalProps> = () => {
  return <ShareMenu />;
};
Basic.args = {
  logoSrc: '/imgs/affine-text-logo.png',
};
