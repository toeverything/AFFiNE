import { nanoid } from 'nanoid';

import { type DBSchemaBuilder, f, type ORMEntity, t } from '../../../orm';

export const AFFiNE_WORKSPACE_DB_SCHEMA = {
  folders: {
    id: f.string().primaryKey().optional().default(nanoid),
    parentId: f.string().optional(),
    data: f.string(),
    type: f.string(),
    index: f.string(),
  },
  docProperties: t.document({
    // { [`custom:{customPropertyId}`]: any }
    id: f.string().primaryKey(),
    primaryMode: f.string().optional(),
    edgelessColorTheme: f.string().optional(),
    journal: f.string().optional(),
  }),
  docCustomPropertyInfo: {
    id: f.string().primaryKey().optional().default(nanoid),
    name: f.string().optional(),
    type: f.string(),
    show: f.string().optional(),
    index: f.string().optional(),
    additionalData: f.json().optional(),
    isDeleted: f.boolean().optional(),
    // we will keep deleted properties in the database, for override legacy data
  },
} as const satisfies DBSchemaBuilder;
export type AFFiNE_WORKSPACE_DB_SCHEMA = typeof AFFiNE_WORKSPACE_DB_SCHEMA;

export type DocProperties = ORMEntity<
  AFFiNE_WORKSPACE_DB_SCHEMA['docProperties']
>;

export type DocCustomPropertyInfo = ORMEntity<
  AFFiNE_WORKSPACE_DB_SCHEMA['docCustomPropertyInfo']
>;

export const AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA = {
  favorite: {
    key: f.string().primaryKey(),
    index: f.string(),
  },
} as const satisfies DBSchemaBuilder;
export type AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA =
  typeof AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA;
