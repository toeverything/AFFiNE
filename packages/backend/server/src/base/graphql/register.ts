import { Field, FieldOptions, ObjectType } from '@nestjs/graphql';

import { ApplyType } from '../utils/types';

export function registerObjectType<T>(
  fields: Record<
    string,
    {
      type: () => any;
      options?: FieldOptions;
    }
  >,
  options: {
    name: string;
  }
) {
  const Inner = ApplyType<T>();
  for (const [key, { type, options }] of Object.entries(fields)) {
    Field(type, options)(Inner.prototype, key);
  }

  ObjectType(options.name)(Inner);

  return Inner;
}
