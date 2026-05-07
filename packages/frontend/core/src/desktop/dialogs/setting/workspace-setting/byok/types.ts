import {
  type ByokKeyStorage,
  type ByokKeyTestStatus,
  type ByokProvider,
  type GraphQLQuery,
  type QueryOptions,
  type QueryResponse,
} from '@affine/graphql';

export type ByokStorage = ByokKeyStorage;

export type ByokKey = {
  id: string;
  provider: ByokProvider;
  name: string;
  description?: string | null;
  storage: ByokStorage;
  configured: boolean;
  enabled: boolean;
  endpoint?: string | null;
  endpointEditable: boolean;
  sortOrder: number;
  capabilities: string[];
  testStatus: ByokKeyTestStatus;
  disabledReason?: string | null;
  lastTestedAt?: string | null;
  lastTestError?: string | null;
  lastUsedAt?: string | null;
  lastErrorAt?: string | null;
  lastError?: string | null;
};

export type LocalByokKeyInput = Pick<
  ByokKey,
  | 'id'
  | 'provider'
  | 'name'
  | 'description'
  | 'endpoint'
  | 'sortOrder'
  | 'enabled'
> & {
  apiKey: string;
};

export type ByokSettings = {
  workspaceId: string;
  entitled: boolean;
  serverEntitled: boolean;
  localEntitled: boolean;
  entitlementRequired: string[];
  keys: ByokKey[];
  allowedProviders: ByokProvider[];
  localStorageSupported: boolean;
  customEndpointSupported: boolean;
  hasAiPlan: boolean;
  warnings: Array<{
    featureKind: string;
    reason: string;
    requiredProviders: ByokProvider[];
  }>;
};

export type ByokUsagePoint = {
  date: string;
  featureKind: string;
  totalTokens: number;
};

export type ByokTestResult = {
  ok: boolean;
  status: ByokKey['testStatus'];
  message?: string | null;
};

export type GqlFn = <Query extends GraphQLQuery>(
  input: QueryOptions<Query>
) => Promise<QueryResponse<Query>>;

export type LocalByokPublicKey = {
  id: string;
  provider: ByokProvider;
  name: string;
  description?: string | null;
  endpoint?: string | null;
  endpointEditable?: boolean;
  sortOrder?: number | null;
  enabled?: boolean | null;
  configured?: boolean;
  testStatus?: ByokKey['testStatus'];
};
