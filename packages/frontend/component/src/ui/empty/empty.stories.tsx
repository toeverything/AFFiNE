import type { Meta, StoryFn } from '@storybook/react';

import type { EmptyContentProps } from './index';
import { Empty } from './index';

export default {
  title: 'UI/Empty',
  component: Empty,
} satisfies Meta<typeof Empty>;

const Template: StoryFn<EmptyContentProps> = args => <Empty {...args} />;

export const Default: StoryFn<EmptyContentProps> = Template.bind(undefined);
Default.args = {
  title: 'No Data',
  description: 'No Data',
};
