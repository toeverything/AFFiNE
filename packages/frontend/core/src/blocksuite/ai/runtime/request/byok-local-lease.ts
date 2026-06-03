import { apis, type ClientHandler } from '@affine/electron-api';
import { UserFriendlyError } from '@affine/error';
import {
  ByokProvider,
  createWorkspaceByokLocalLeaseMutation,
} from '@affine/graphql';

import type { CopilotClient } from './copilot-client';

function isElectronBuild() {
  return typeof BUILD_CONFIG !== 'undefined' && BUILD_CONFIG.isElectron;
}

function byokStorageApi(): ClientHandler['byokStorage'] | undefined {
  return isElectronBuild() ? apis?.byokStorage : undefined;
}

function toGraphqlByokProvider(provider: string): ByokProvider | null {
  switch (provider) {
    case ByokProvider.openai:
      return ByokProvider.openai;
    case ByokProvider.anthropic:
      return ByokProvider.anthropic;
    case ByokProvider.gemini:
      return ByokProvider.gemini;
    case ByokProvider.fal:
      return ByokProvider.fal;
    default:
      return null;
  }
}

function errorMetadata(error: unknown) {
  if (!error || typeof error !== 'object') {
    return { kind: typeof error };
  }
  const record = error as Record<string, unknown>;
  return {
    name: typeof record.name === 'string' ? record.name : undefined,
    code: typeof record.code === 'string' ? record.code : undefined,
    status:
      typeof record.status === 'number' || typeof record.status === 'string'
        ? record.status
        : undefined,
    type: typeof record.type === 'string' ? record.type : undefined,
  };
}

export async function createWorkspaceByokLocalLease(
  client: CopilotClient,
  workspaceId?: string
) {
  const storage = byokStorageApi();
  if (!workspaceId || !storage) {
    return undefined;
  }

  try {
    if (!(await storage.isSupported())) return undefined;
    const providers = await storage.getWorkspaceLeaseProviders(workspaceId);
    if (!providers.length) return undefined;
    const leaseProviders = providers.flatMap(provider => {
      const gqlProvider = toGraphqlByokProvider(provider.provider);
      return gqlProvider
        ? [
            {
              provider: gqlProvider,
              name: provider.name,
              description: provider.description ?? null,
              apiKey: provider.apiKey,
              endpoint: provider.endpoint ?? null,
              sortOrder: provider.sortOrder ?? 0,
              enabled: provider.enabled ?? true,
            },
          ]
        : [];
    });
    if (!leaseProviders.length) return undefined;

    const result = await client.gql({
      query: createWorkspaceByokLocalLeaseMutation,
      variables: {
        input: {
          workspaceId,
          providers: leaseProviders,
        },
      },
    });
    return result.createWorkspaceByokLocalLease.leaseId;
  } catch (error) {
    console.warn(
      'Failed to create workspace BYOK local lease',
      errorMetadata(error)
    );
    throw UserFriendlyError.fromAny(error);
  }
}
