export * from './fetcher';
export * from './graphql';
export * from './schema';
export * from './utils';
import '@affine/env/global';

import { gqlFetcherFactory } from './fetcher';

export const fetcher = gqlFetcherFactory('/graphql');
