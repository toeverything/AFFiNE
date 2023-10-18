import { PageDetailSkeleton } from '@affine/component/page-detail-skeleton';
import type { Meta } from '@storybook/react';

export default {
  title: 'AFFiNE/PageDetailSkeleton',
  component: PageDetailSkeleton,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta<typeof PageDetailSkeleton>;

export const Basic = () => {
  return <PageDetailSkeleton />;
};
