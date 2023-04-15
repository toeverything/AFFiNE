import type { Meta } from '@storybook/react';

import { ListSkeleton } from '../components/ListSkeleton';
import { SidebarSkeleton } from '../components/sidebar-skeleton';

export default {
  title: 'Component/Skeleton',
} satisfies Meta;

export const List = () => <ListSkeleton />;
export const Sidebar = () => (
  <div style={{ height: '100px' }}>
    <SidebarSkeleton />
  </div>
);
