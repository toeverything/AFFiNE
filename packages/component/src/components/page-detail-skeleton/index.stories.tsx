import type { Meta } from '@storybook/react';

import { PageDetailSkeleton } from '.';

export default {
  title: 'AFFiNE/PageDetailSkeleton',
  component: PageDetailSkeleton,
} satisfies Meta<typeof PageDetailSkeleton>;

export const Basic = () => {
  return <PageDetailSkeleton />;
};
