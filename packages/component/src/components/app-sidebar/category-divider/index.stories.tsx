import type { Meta, StoryFn } from '@storybook/react';

import { CategoryDivider } from '.';

export default {
  title: 'Components/AppSidebar/CategoryDivider',
  component: CategoryDivider,
} satisfies Meta;

export const Default: StoryFn = () => {
  return (
    <main style={{ width: '240px' }}>
      <CategoryDivider label="Favorites" />
    </main>
  );
};
