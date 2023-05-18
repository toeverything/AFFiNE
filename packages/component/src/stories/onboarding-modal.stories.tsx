/* deepscan-disable USELESS_ARROW_FUNC_BIND */
import type { StoryFn } from '@storybook/react';

import { TourModal } from '../components/tour-modal';

export default {
  title: 'AFFiNE/TourModal',
  component: TourModal,
};

export const Basic: StoryFn = () => {
  return <TourModal open={true} onClose={() => {}} />;
};
Basic.args = {
  logoSrc: '/imgs/affine-text-logo.png',
};
