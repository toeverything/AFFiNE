import { nanoid } from 'nanoid';

import { type DBSchemaBuilder, f } from '../../../orm';

export const AFFiNE_WORKSPACE_DB_SCHEMA = {
  folders: {
    id: f.string().primaryKey().optional().default(nanoid),
    parentId: f.string().optional(),
    data: f.string(),
    type: f.string(),
    index: f.string(),
  },
} as const satisfies DBSchemaBuilder;
export type AFFiNE_WORKSPACE_DB_SCHEMA = typeof AFFiNE_WORKSPACE_DB_SCHEMA;

export const AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA = {
  favorite: {
    key: f.string().primaryKey(),
    index: f.string(),
  },
} as const satisfies DBSchemaBuilder;
export type AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA =
  typeof AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA;
