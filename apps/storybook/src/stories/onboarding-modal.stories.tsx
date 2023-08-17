/* deepscan-disable USELESS_ARROW_FUNC_BIND */
import { TourModal } from '@affine/component/tour-modal';
import type { Meta, StoryFn } from '@storybook/react';

export default {
  title: 'AFFiNE/TourModal',
  component: TourModal,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta;

export const Basic: StoryFn = () => {
  return <TourModal open={true} onClose={() => {}} />;
};
Basic.args = {
  logoSrc: '/imgs/affine-text-logo.png',
};
