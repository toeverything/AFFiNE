import { Skeleton } from '@affine/component';

import { AIPlanLayout } from './ai/layout';
import { CloudPlanLayout, PlanLayout } from './layout';
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

const TabsSkeleton = () => (
  // TODO(@catsjuice): height should be `32px` by design
  // but the RadioGroup component is not matching with the design currently
  // set to `24px` for now to avoid blinking
  <Skeleton variant="rounded" width="256px" height="24px" />
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
      ai={
        <AIPlanLayout
          caption={
            <RoundedSkeleton
              variant="rectangular"
              radius={2}
              width="200px"
              height="20px"
            />
          }
          actionButtons={
            <>
              <RoundedSkeleton
                variant="rectangular"
                radius={20}
                width="206px"
                height="37px"
              />
              <RoundedSkeleton
                variant="rectangular"
                radius={20}
                width="193px"
                height="37px"
              />
            </>
          }
        />
      }
      cloud={
        <CloudPlanLayout
          toggle={
            <RoundedSkeleton variant="rounded" width="100%" height="32px" />
          }
          select={<TabsSkeleton />}
          scroll={<ScrollSkeleton />}
        />
      }
    />
  );
};
