import type { StoryFn } from '@storybook/react';

import { AffineLoading } from '../components/affine-loading';

export default {
  title: 'AFFiNE/Loading',
  component: AffineLoading,
};

export const Default: StoryFn = ({ width, loop, autoplay }) => (
  <div
    style={{
      width: width,
      height: width,
    }}
  >
    <AffineLoading loop={loop} autoplay={autoplay} />
  </div>
);
Default.args = {
  width: 100,
  loop: true,
  autoplay: true,
};
