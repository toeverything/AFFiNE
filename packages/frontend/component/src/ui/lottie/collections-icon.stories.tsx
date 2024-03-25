import type { Meta, StoryFn } from '@storybook/react';

import type { CollectionsIconProps } from './collections-icon';
import { AnimatedCollectionsIcon } from './collections-icon';

export default {
  title: 'UI/Lottie/Collection Icons',
  component: AnimatedCollectionsIcon,
} satisfies Meta<typeof AnimatedCollectionsIcon>;

const Template: StoryFn<CollectionsIconProps> = args => (
  <AnimatedCollectionsIcon {...args} />
);

export const Default: StoryFn<CollectionsIconProps> = Template.bind(undefined);
Default.args = {};
