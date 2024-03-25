import type { Meta, StoryFn } from '@storybook/react';

import type { DividerProps } from './index';
import { Divider } from './index';

export default {
  title: 'UI/Divider',
  component: Divider,
} satisfies Meta<typeof Divider>;

const Template: StoryFn<DividerProps> = args => (
  <div
    style={{
      height: '100px',
      padding: '0 20px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    }}
  >
    <Divider {...args} />
  </div>
);

export const Default: StoryFn<DividerProps> = Template.bind(undefined);
Default.args = {};
