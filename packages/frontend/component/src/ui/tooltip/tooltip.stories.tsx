import type { Meta, StoryFn } from '@storybook/react';

import { Button } from '../button';
import type { TooltipProps } from './index';
import Tooltip from './index';

export default {
  title: 'UI/Tooltip',
  component: Tooltip,
} satisfies Meta<typeof Tooltip>;

const Template: StoryFn<TooltipProps> = args => (
  <Tooltip content="This is a tooltip" {...args}>
    <Button>Show tooltip</Button>
  </Tooltip>
);

export const Default: StoryFn<TooltipProps> = Template.bind(undefined);
Default.args = {};

export const WithCustomContent: StoryFn<TooltipProps> = args => (
  <Tooltip
    content={
      <ul>
        <li>This is a tooltip</li>
        <li style={{ color: 'red' }}>With custom content</li>
      </ul>
    }
    {...args}
  >
    <Button>Show tooltip</Button>
  </Tooltip>
);
