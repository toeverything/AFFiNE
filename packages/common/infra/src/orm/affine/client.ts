import { createORMClientType } from '../core';
import { AFFiNE_DB_SCHEMA } from './schema';

export const ORMClient = createORMClientType(AFFiNE_DB_SCHEMA);
