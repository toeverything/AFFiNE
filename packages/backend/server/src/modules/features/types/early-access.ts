import { z } from 'zod';

import { FeatureType } from './common';

export const featureEarlyAccess = z.object({
  feature: z.literal(FeatureType.EarlyAccess),
  configs: z.object({}),
});
