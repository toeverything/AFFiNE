import { apis, type ClientHandler } from '@affine/electron-api';
import { UserFriendlyError } from '@affine/error';
import {
  type ByokAttachmentKind,
  type ByokAttachmentSource,
  type ByokEndpointKind,
  type ByokModelFeature,
  type ByokModelInput,
  type ByokModelOutput,
  type ByokOpenAiDialect,
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
              credential: provider.credential,
              definition: {
                endpoint: {
                  kind: provider.definition.endpoint.kind as ByokEndpointKind,
                  url: provider.definition.endpoint.url,
                  dialect: provider.definition.endpoint.dialect as
                    | ByokOpenAiDialect
                    | null
                    | undefined,
                },
                models: provider.definition.models.map(model => ({
                  ...model,
                  capabilities: model.capabilities.map(capability => ({
                    input: capability.input as ByokModelInput[],
                    output: capability.output as ByokModelOutput[],
                    features: capability.features as ByokModelFeature[],
                    attachmentKinds:
                      capability.attachmentKinds as ByokAttachmentKind[],
                    attachmentSources:
                      capability.attachmentSources as ByokAttachmentSource[],
                  })),
                })),
              },
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
