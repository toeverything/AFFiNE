import { FlexWrapper } from '../../ui/layout';
import { Skeleton } from '../../ui/skeleton';

export const WorkspaceListItemSkeleton = () => {
  return (
    <FlexWrapper
      alignItems="center"
      style={{ padding: '0 24px', height: 30, marginBottom: 4 }}
    >
      <Skeleton
        variant="circular"
        width={14}
        height={14}
        style={{ marginRight: 10 }}
      />
      <Skeleton
        variant="rectangular"
        height={16}
        width={0}
        style={{ flexGrow: 1 }}
      />
    </FlexWrapper>
  );
};

export const WorkspaceListSkeleton = () => {
  return (
    <>
      {Array.from({ length: 5 }, (_, index) => (
        <WorkspaceListItemSkeleton key={index} />
      ))}
    </>
  );
};
