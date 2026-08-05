import {
  type ByokProvider,
  type GraphQLQuery,
  type QueryOptions,
  type QueryResponse,
  type WorkspaceByokSettingsQuery,
} from '@affine/graphql';

export const ByokStorage = {
  server: 'server',
  local: 'local',
} as const;
export type ByokStorage = (typeof ByokStorage)[keyof typeof ByokStorage];

export type ByokDefinition =
  WorkspaceByokSettingsQuery['workspace']['byokSettings']['profiles'][number]['definition'];

type ByokKeyBase = {
  id: string;
  provider: ByokProvider;
  name: string;
  description?: string | null;
  configured: boolean;
  enabled: boolean;
  sortOrder: number;
  definition: ByokDefinition;
  capabilities: string[];
  validation?: WorkspaceByokSettingsQuery['workspace']['byokSettings']['profiles'][number]['validation'];
};

export type ByokKey = ByokKeyBase &
  (
    | { storage: typeof ByokStorage.server; revision: number }
    | { storage: typeof ByokStorage.local; revision?: never }
  );

export type LocalByokKeyInput = Pick<
  ByokKey,
  | 'id'
  | 'provider'
  | 'name'
  | 'description'
  | 'sortOrder'
  | 'enabled'
  | 'definition'
> & { credential: string };

export type ByokSettings = Omit<
  WorkspaceByokSettingsQuery['workspace']['byokSettings'],
  'profiles'
> & {
  keys: ByokKey[];
  localStorageSupported: boolean;
};

export type ByokUsagePoint =
  WorkspaceByokSettingsQuery['workspace']['byokUsage'][number];

export type ByokTestResult = {
  ok: boolean;
  status: string;
  message?: string | null;
};

export type GqlFn = <Query extends GraphQLQuery>(
  input: QueryOptions<Query>
) => Promise<QueryResponse<Query>>;

export type LocalByokPublicKey = Omit<LocalByokKeyInput, 'credential'> & {
  configured?: boolean;
};
