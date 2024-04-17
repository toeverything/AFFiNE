import { z } from 'zod';

import { FeatureType } from './common';

export const featureUnlimitedCopilot = z.object({
  feature: z.literal(FeatureType.UnlimitedCopilot),
  configs: z.object({}),
});
