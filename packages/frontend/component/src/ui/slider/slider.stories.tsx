import type { Meta, StoryFn } from '@storybook/react';
import { useState } from 'react';

import type { SliderProps } from './index';
import { Slider } from './index';

export default {
  title: 'UI/Slider',
  component: Slider,
} satisfies Meta<typeof Slider>;

const Template: StoryFn<SliderProps> = args => {
  const [value, setValue] = useState<number[]>([0]);
  return <Slider value={value} onValueChange={setValue} {...args} />;
};

export const Default: StoryFn<SliderProps> = Template.bind(undefined);
Default.args = {
  min: 0,
  max: 10,
  width: 500,
  step: 1,
  nodes: [0, 5, 10],
};
