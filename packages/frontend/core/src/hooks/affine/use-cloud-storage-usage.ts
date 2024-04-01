import { allBlobSizesQuery, SubscriptionPlan } from '@affine/graphql';
import { cssVar } from '@toeverything/theme';
import bytes from 'bytes';
import { useMemo } from 'react';

import { useQuery } from '../use-query';
import { useUserQuota } from '../use-quota';
import { useUserSubscription } from '../use-subscription';

/**
 * Hook to get currentUser's cloud storage usage information.
 */
export const useCloudStorageUsage = () => {
  const { data } = useQuery({
    query: allBlobSizesQuery,
  });

  const quota = useUserQuota();
  const [subscription] = useUserSubscription();

  const plan = subscription?.plan ?? SubscriptionPlan.Free;

  const maxLimit = useMemo(() => {
    if (quota) {
      return quota.storageQuota;
    }
    return bytes.parse(plan === SubscriptionPlan.Free ? '10GB' : '100GB');
  }, [plan, quota]);

  const used = data?.collectAllBlobSizes?.size ?? 0;
  const percent = Math.min(
    100,
    Math.max(0.5, Number(((used / maxLimit) * 100).toFixed(4)))
  );
  const color = percent > 80 ? cssVar('errorColor') : cssVar('processingColor');

  const usedText = bytes.format(used);
  const maxLimitText = bytes.format(maxLimit);

  return {
    /** Current subscription plan of logged in user */
    plan,
    /** Used storage in bytes */
    used,
    /** Formatted used storage */
    usedText,
    /** CSS variable name for progress bar color */
    color,
    /** Percentage of storage used */
    percent,
    /** Maximum storage limit in bytes */
    maxLimit,
    /** Formatted maximum storage limit */
    maxLimitText,
  };
};
