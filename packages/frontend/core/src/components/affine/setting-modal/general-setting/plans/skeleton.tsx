import { Skeleton } from '@mui/material';

import { PlanLayout } from './layout';
import * as styles from './skeleton.css';

/**
 * Customize Skeleton component with rounded border radius
 * @param param0
 * @returns
 */
const RoundedSkeleton = ({
  radius = 8,
  ...props
}: {
  radius?: number;
} & React.ComponentProps<typeof Skeleton>) => (
  <Skeleton {...props} style={{ borderRadius: `${radius}px` }} />
);

const SubtitleSkeleton = () => (
  <Skeleton variant="text" width="100%" height="20px" />
);

const TabsSkeleton = () => (
  <Skeleton variant="rounded" width="256px" height="32px" />
);

const PlanItemSkeleton = () => (
  <div className={styles.planItemCard}>
    <header className={styles.planItemHeader}>
      <RoundedSkeleton variant="rounded" width="100%" height="60px" />
      <RoundedSkeleton variant="rounded" width="100%" height="28px" />
    </header>

    <main className={styles.planItemContent}>
      <RoundedSkeleton variant="rounded" width="100%" height="100%" />
    </main>
  </div>
);

const ScrollSkeleton = () => (
  <div className={styles.plansWrapper}>
    <PlanItemSkeleton />
    <PlanItemSkeleton />
    <PlanItemSkeleton />
  </div>
);

export const PlansSkeleton = () => {
  return (
    <PlanLayout
      subtitle={<SubtitleSkeleton />}
      tabs={<TabsSkeleton />}
      scroll={<ScrollSkeleton />}
    />
  );
};
