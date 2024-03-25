import type { Meta, StoryFn } from '@storybook/react';

import type { LoadingProps } from './loading';
import { Loading } from './loading';

export default {
  title: 'UI/Loading',
  component: Loading,
} satisfies Meta<typeof Loading>;

const Template: StoryFn<LoadingProps> = args => <Loading {...args} />;

export const Default: StoryFn<LoadingProps> = Template.bind(undefined);
Default.args = {};
