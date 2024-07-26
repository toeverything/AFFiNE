import { nanoid } from 'nanoid';

import { type DBSchemaBuilder, f } from '../../../orm';

export const AFFiNE_DB_SCHEMA = {
  folders: {
    id: f.string().primaryKey().optional().default(nanoid),
    parentId: f.string().optional(),
    data: f.string(),
    type: f.string(),
    index: f.string(),
  },
} as const satisfies DBSchemaBuilder;
export type AFFiNE_DB_SCHEMA = typeof AFFiNE_DB_SCHEMA;
