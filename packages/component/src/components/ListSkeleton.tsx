import { Skeleton } from '@mui/material';
import { memo } from 'react';

export const ListSkeleton = memo(function ListItemSkeleton() {
  return (
    <>
      <Skeleton animation="wave" height={40} />
      <Skeleton animation="wave" height={40} />
      <Skeleton animation="wave" height={40} />
      <Skeleton animation="wave" height={40} />
    </>
  );
});
