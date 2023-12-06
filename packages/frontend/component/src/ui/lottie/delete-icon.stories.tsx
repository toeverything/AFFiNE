import type { Meta, StoryFn } from '@storybook/react';

import { AnimatedDeleteIcon, type DeleteIconProps } from './delete-icon';

export default {
  title: 'UI/Lottie/Delete Icon',
  component: AnimatedDeleteIcon,
} satisfies Meta<typeof AnimatedDeleteIcon>;

const Template: StoryFn<DeleteIconProps> = args => (
  <AnimatedDeleteIcon {...args} />
);

export const Default: StoryFn<DeleteIconProps> = Template.bind(undefined);
Default.args = {};
