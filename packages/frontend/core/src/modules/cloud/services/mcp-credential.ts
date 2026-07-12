import type {
  CreateMcpCredentialMutationVariables,
  McpCredentialsQuery,
} from '@affine/graphql';
import { LiveData, Service } from '@toeverything/infra';

import type { McpCredentialStore } from '../stores/mcp-credential';

export type McpCredential = McpCredentialsQuery['mcpCredentials'][number];

export class McpCredentialService extends Service {
  constructor(private readonly store: McpCredentialStore) {
    super();
  }

  credentials$ = new LiveData<McpCredential[] | null>(null);
  loading$ = new LiveData(false);
  error$ = new LiveData<unknown>(null);

  async revalidate(workspaceId: string) {
    this.loading$.value = true;
    try {
      this.credentials$.value = await this.store.list(workspaceId);
      this.error$.value = null;
    } catch (error) {
      this.error$.value = error;
    } finally {
      this.loading$.value = false;
    }
  }

  async create(input: CreateMcpCredentialMutationVariables['input']) {
    const revealed = await this.store.create(input);
    await this.revalidate(input.workspaceId);
    return revealed;
  }

  async rotate(id: string, workspaceId: string, expirationDays: number) {
    const revealed = await this.store.rotate(id, workspaceId, expirationDays);
    await this.revalidate(workspaceId);
    return revealed;
  }

  async revoke(id: string, workspaceId: string) {
    await this.store.revoke(id, workspaceId);
    await this.revalidate(workspaceId);
  }
}
