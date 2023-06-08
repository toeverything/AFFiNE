/* deepscan-disable USELESS_ARROW_FUNC_BIND */
import { TourModal } from '@affine/component/tour-modal';
import type { StoryFn } from '@storybook/react';

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
