import { PageDetailSkeleton } from '@affine/component/page-detail-skeleton';
import type { Meta } from '@storybook/react';

export default {
  title: 'AFFiNE/PageDetailSkeleton',
  component: PageDetailSkeleton,
} satisfies Meta<typeof PageDetailSkeleton>;

export const Basic = () => {
  return <PageDetailSkeleton />;
};
