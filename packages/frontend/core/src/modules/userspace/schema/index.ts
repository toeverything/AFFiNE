import { type DBSchemaBuilder, f } from '@toeverything/infra';

export const USER_DB_SCHEMA = {
  editorSetting: {
    key: f.string().primaryKey(),
    value: f.string(),
  },
} as const satisfies DBSchemaBuilder;
export type USER_DB_SCHEMA = typeof USER_DB_SCHEMA;
