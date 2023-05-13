import type { Meta, StoryFn } from '@storybook/react';

import { QuickSearchInput } from '.';

export default {
  title: 'Components/AppSidebar/QuickSearchInput',
  component: QuickSearchInput,
} satisfies Meta;

export const Default: StoryFn = () => {
  return (
    <main style={{ width: '240px' }}>
      <QuickSearchInput onClick={() => alert('opened')} />
    </main>
  );
};
