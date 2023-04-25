import type { Meta } from '@storybook/react';

import { AppSidebar } from '.';

export default {
  title: 'Components/AppSidebar',
  component: AppSidebar,
} satisfies Meta;

export const Default = () => (
  <>
    <main
      style={{
        width: '100vw',
        height: '600px',
      }}
    >
      <AppSidebar footer={<>Footer</>}>Test</AppSidebar>
    </main>
  </>
);
