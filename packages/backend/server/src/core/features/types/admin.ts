import { z } from 'zod';

import { FeatureType } from './common';

export const featureAdministrator = z.object({
  feature: z.literal(FeatureType.Admin),
  configs: z.object({}),
});
