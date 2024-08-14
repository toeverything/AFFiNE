import type { Meta, StoryFn } from '@storybook/react';

import type { SliderProps } from './index';
import { Slider } from './index';

export default {
  title: 'UI/Slider',
  component: Slider,
} satisfies Meta<typeof Slider>;

const Template: StoryFn<SliderProps> = args => <Slider {...args} />;

export const Default: StoryFn<SliderProps> = Template.bind(undefined);
Default.args = {};
