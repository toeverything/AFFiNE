import type { CreateMcpCredentialMutationVariables } from '@affine/graphql';
import {
  createMcpCredentialMutation,
  mcpCredentialsQuery,
  revokeMcpCredentialMutation,
  rotateMcpCredentialMutation,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { GraphQLService } from '../services/graphql';

export class McpCredentialStore extends Store {
  constructor(private readonly gqlService: GraphQLService) {
    super();
  }

  async list(workspaceId: string, signal?: AbortSignal) {
    const data = await this.gqlService.gql({
      query: mcpCredentialsQuery,
      variables: { workspaceId },
      context: { signal },
    });
    return data;
  }

  async create(input: CreateMcpCredentialMutationVariables['input']) {
    const data = await this.gqlService.gql({
      query: createMcpCredentialMutation,
      variables: {
        input: {
          workspaceId: input.workspaceId,
          name: input.name,
          accessMode: input.accessMode,
          expirationDays: input.expirationDays,
        },
      },
    });
    return data.createMcpCredential;
  }

  async rotate(id: string, workspaceId: string, expirationDays: number) {
    const data = await this.gqlService.gql({
      query: rotateMcpCredentialMutation,
      variables: { id, workspaceId, expirationDays },
    });
    return data.rotateMcpCredential;
  }

  async revoke(id: string, workspaceId: string) {
    const data = await this.gqlService.gql({
      query: revokeMcpCredentialMutation,
      variables: { id, workspaceId },
    });
    return data.revokeMcpCredential;
  }
}
