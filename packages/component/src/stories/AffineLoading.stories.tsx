import type { StoryFn } from '@storybook/react';

import { AffineLoading } from '../components/affine-loading';

export default {
  title: 'AFFiNE/Loading',
  component: AffineLoading,
};

export const Default: StoryFn = () => <AffineLoading />;
