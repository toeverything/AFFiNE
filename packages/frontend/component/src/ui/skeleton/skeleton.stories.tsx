import type { Meta, StoryFn } from '@storybook/react';

import type { SkeletonProps } from './index';
import { Skeleton } from './index';

export default {
  title: 'UI/Skeleton',
  component: Skeleton,
} satisfies Meta<typeof Skeleton>;

const Template: StoryFn<SkeletonProps> = args => (
  <>
    {Array.from({ length: 4 }).map(i => (
      <div
        key={`${i}`}
        style={{ width: '100%', maxWidth: '300px', marginBottom: '4px' }}
      >
        <Skeleton {...args} />
      </div>
    ))}
  </>
);

export const Default: StoryFn<SkeletonProps> = Template.bind(undefined);
Default.args = {};

export const Circle: StoryFn<SkeletonProps> = Template.bind(undefined);
Circle.args = {
  variant: 'circular',
};

export const Rectangle: StoryFn<SkeletonProps> = Template.bind(undefined);
Rectangle.args = {
  variant: 'rectangular',
};

export const Text: StoryFn<SkeletonProps> = Template.bind(undefined);
Text.args = {
  variant: 'text',
};
