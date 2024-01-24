import { z } from 'zod';

import { FeatureType } from './common';

export const featureUnlimitedWorkspace = z.object({
  feature: z.literal(FeatureType.UnlimitedWorkspace),
  configs: z.object({}),
});
