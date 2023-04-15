import { Skeleton } from '@mui/material';
import type { ReactElement } from 'react';
import { memo } from 'react';

export const SidebarSkeleton = memo(function SidebarSkeleton(): ReactElement {
  return (
    <>
      <Skeleton variant="rectangular" height="100vh" />
    </>
  );
});
