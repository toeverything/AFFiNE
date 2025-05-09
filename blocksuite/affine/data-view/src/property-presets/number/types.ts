import zod from 'zod';

import { NumberFormatSchema } from './utils/formatter.js';

export const NumberPropertySchema = zod.object({
  decimal: zod.number().optional(),
  format: NumberFormatSchema,
});
export type NumberPropertyDataType = zod.infer<typeof NumberPropertySchema>;
