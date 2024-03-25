import type { Meta, StoryFn } from '@storybook/react';

import type { ScrollableContainerProps } from './index';
import { ScrollableContainer } from './index';

export default {
  title: 'UI/Scrollbar',
  component: ScrollableContainer,
} satisfies Meta<typeof ScrollableContainer>;

const Template: StoryFn<ScrollableContainerProps> = args => (
  <div style={{ height: '100px', width: '100%' }}>
    <ScrollableContainer {...args}>
      <ul>
        {Array.from({ length: 100 }).map((_, index) => (
          <li key={index}>item {index}</li>
        ))}
      </ul>
    </ScrollableContainer>
  </div>
);

export const Default: StoryFn<ScrollableContainerProps> =
  Template.bind(undefined);
Default.args = {};
