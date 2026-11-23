import { z, type ZodTypeAny } from 'zod';

export function dynamicSchema<Key extends string, Value extends ZodTypeAny>(
  keyValidator: (key: string) => key is Key,
  valueType: Value
) {
  return z.preprocess(
    record => {
      // check it is a record
      if (typeof record !== 'object' || record === null) {
        return {};
      }

      return Object.entries(record)
        .filter((data): data is [Key, unknown] => keyValidator(data[0]))
        .reduce(
          (acc, [key, value]) => {
            acc[key] = value;
            return acc;
          },
          {} as Record<Key, unknown>
        );
    },
    z.record(z.custom<Key>(keyValidator), valueType)
  );
}
