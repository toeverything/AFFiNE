import type { Meta, StoryFn } from '@storybook/react';

import { AppUpdaterButton } from '.';

export default {
  title: 'Components/AppSidebar/AppUpdaterButton',
  component: AppUpdaterButton,
} satisfies Meta;

export const Default: StoryFn = () => {
  return (
    <main style={{ width: '240px' }}>
      <AppUpdaterButton />
    </main>
  );
};
