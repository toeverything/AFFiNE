import { Skeleton } from '@mui/material';

import { FlexWrapper } from '../../ui/layout';

export const WorkspaceListItemSkeleton = () => {
  return (
    <FlexWrapper
      alignItems="center"
      style={{ padding: '0 8px', height: 30, marginBottom: 4 }}
    >
      <Skeleton
        variant="circular"
        width={14}
        height={14}
        style={{ marginRight: 10 }}
      />
      <Skeleton variant="rectangular" height={16} style={{ flexGrow: 1 }} />
    </FlexWrapper>
  );
};

export const WorkspaceListSkeleton = () => {
  return (
    <>
      {new Array(5).fill(0).map((_, index) => {
        return <WorkspaceListItemSkeleton key={index} />;
      })}
    </>
  );
};
