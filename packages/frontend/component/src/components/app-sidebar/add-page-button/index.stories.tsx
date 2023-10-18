import type { Meta, StoryFn } from '@storybook/react';

import { AddPageButton } from '.';

export default {
  title: 'Components/AppSidebar/AddPageButton',
  component: AddPageButton,
} satisfies Meta;

export const Default: StoryFn = () => {
  return (
    <main style={{ width: '240px' }}>
      <AddPageButton onClick={() => alert('opened')} />
    </main>
  );
};
