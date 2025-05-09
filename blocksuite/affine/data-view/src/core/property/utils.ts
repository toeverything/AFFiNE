import type { DataSource } from '../data-source/base';
import type { PropertyConfig } from './types';

export const fromJson = <Data, RawValue, JsonValue>(
  config: PropertyConfig<Data, RawValue, JsonValue>,
  {
    value,
    data,
    dataSource,
  }: {
    value: unknown;
    data: Data;
    dataSource: DataSource;
  }
): RawValue | undefined => {
  const fromJson = config.rawValue.fromJson;
  const jsonSchema = config.jsonValue.schema;
  if (!fromJson || !jsonSchema) {
    return;
  }
  const jsonResult = jsonSchema.safeParse(value);
  if (!jsonResult.success) {
    return;
  }
  return fromJson({
    value: jsonResult.data,
    data,
    dataSource,
  });
};
