import type { DBSchemaBuilder } from '../core';
// import { f } from './core';

export const AFFiNE_DB_SCHEMA = {
  // demo: {
  //   id: f.string().primaryKey().optional().default(nanoid),
  //   name: f.string(),
  //   // v1
  //   // color: f.string(),
  //   // v2, without data level breaking change
  //   /**
  //    * @deprecated use [colors]
  //    */
  //   color: f.string().optional(), // <= mark as optional since new created record might only have [colors] field
  //   colors: f.json<string[]>().optional(), // <= mark as optional since old records might only have [color] field
  // },
} as const satisfies DBSchemaBuilder;
