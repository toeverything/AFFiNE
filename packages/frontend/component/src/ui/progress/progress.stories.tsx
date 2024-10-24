import type { Meta, StoryFn } from '@storybook/react';
import { useState } from 'react';

import type { ProgressProps } from './progress';
import { Progress } from './progress';

export default {
  title: 'UI/Progress',
  component: Progress,
} satisfies Meta<typeof Progress>;

const Template: StoryFn<ProgressProps> = () => {
  const [value, setValue] = useState<number>(30);
  return (
    <Progress style={{ width: '200px' }} value={value} onChange={setValue} />
  );
};

export const Default: StoryFn<ProgressProps> = Template.bind(undefined);
