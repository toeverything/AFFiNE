import type {
  CreateMcpCredentialMutationVariables,
  McpCredentialsQuery,
} from '@affine/graphql';
import { LiveData, Service } from '@toeverything/infra';

import type { McpCredentialStore } from '../stores/mcp-credential';

export type McpCredential = McpCredentialsQuery['mcpCredentials'][number];

export class McpCredentialService extends Service {
  private revalidationId = 0;

  constructor(private readonly store: McpCredentialStore) {
    super();
  }

  credentials$ = new LiveData<McpCredential[] | null>(null);
  readWriteAvailable$ = new LiveData(false);
  loading$ = new LiveData(false);
  error$ = new LiveData<unknown>(null);

  async revalidate(workspaceId: string) {
    const revalidationId = ++this.revalidationId;
    this.loading$.value = true;
    try {
      const result = await this.store.list(workspaceId);
      if (revalidationId !== this.revalidationId) return;
      this.credentials$.value = result.mcpCredentials;
      this.readWriteAvailable$.value = result.mcpCredentialReadWriteAvailable;
      this.error$.value = null;
    } catch (error) {
      if (revalidationId !== this.revalidationId) return;
      this.error$.value = error;
    } finally {
      if (revalidationId === this.revalidationId) {
        this.loading$.value = false;
      }
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
