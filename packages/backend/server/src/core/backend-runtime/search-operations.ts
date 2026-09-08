import type {
  AuthorizePermissionInputV1,
  CompileScopeInput,
  DomainCommandInputV1,
  DomainCommandOutputV1,
  EmbeddingHealth,
  EnsureWorkspaceBlobArtifactInput,
  MatchEmbeddingCandidatesInput,
  PermissionEvaluationOutputV1,
  PutWorkspaceArtifactInput,
  ReadEmbeddingSourceContentInput,
  RuntimeTurnScopeSnapshot,
  RuntimeWorkspaceArtifact,
  SyncEmbeddingStateInput,
} from '../../native';
import { BackendRuntimeCoreOperations } from './operations';
import {
  type AggregateRequestInput,
  encodeAggregateRequest,
  encodeSearchRequest,
  type SearchRequestInput,
} from './search';

export class BackendRuntimeSearchOperations extends BackendRuntimeCoreOperations {
  async embeddingHealth(): Promise<EmbeddingHealth> {
    return await this.measured('embeddingHealth', runtime =>
      runtime.embeddingHealth()
    );
  }

  async searchAuthorized(
    actorUserId: string,
    workspaceId: string,
    request: SearchRequestInput
  ) {
    return await this.measured('searchAuthorized', runtime =>
      runtime.searchAuthorized(
        actorUserId,
        workspaceId,
        encodeSearchRequest(request)
      )
    );
  }

  async aggregateAuthorized(
    actorUserId: string,
    workspaceId: string,
    request: AggregateRequestInput
  ) {
    return await this.measured('aggregateAuthorized', runtime =>
      runtime.aggregateAuthorized(
        actorUserId,
        workspaceId,
        encodeAggregateRequest(request)
      )
    );
  }

  async reconcileSearchProjection(limit = 100) {
    return await this.measured('reconcileSearchProjection', runtime =>
      runtime.reconcileSearchProjection(limit)
    );
  }

  async authorizePermissionV1(
    input: AuthorizePermissionInputV1
  ): Promise<PermissionEvaluationOutputV1> {
    return await this.measured('authorizePermissionV1', runtime =>
      this.permissionRuntime(runtime).authorizePermissionV1(input)
    );
  }

  async executeDomainCommandV1(
    input: DomainCommandInputV1
  ): Promise<DomainCommandOutputV1> {
    return await this.measured('executeDomainCommandV1', runtime =>
      this.permissionRuntime(runtime).executeDomainCommandV1(input)
    );
  }

  async searchStatus() {
    return await this.measured('searchStatus', runtime =>
      runtime.searchStatus()
    );
  }

  async embeddingQueueCounts() {
    return await this.measured('embeddingQueueCounts', runtime =>
      runtime.embeddingQueueCounts()
    );
  }

  async embeddingWorkspaceProgress(workspaceId: string) {
    return await this.measured('embeddingWorkspaceProgress', runtime =>
      runtime.embeddingWorkspaceProgress(workspaceId)
    );
  }

  async compileTurnScope(
    input: CompileScopeInput
  ): Promise<RuntimeTurnScopeSnapshot> {
    return await this.measured('compileTurnScope', runtime =>
      runtime.compileTurnScope(input)
    );
  }

  async putWorkspaceArtifact(
    input: PutWorkspaceArtifactInput,
    body: Buffer
  ): Promise<RuntimeWorkspaceArtifact> {
    return await this.measured('putWorkspaceArtifact', runtime =>
      runtime.putWorkspaceArtifact(input, body)
    );
  }

  async ensureWorkspaceBlobArtifact(
    input: EnsureWorkspaceBlobArtifactInput
  ): Promise<RuntimeWorkspaceArtifact> {
    return await this.measured('ensureWorkspaceBlobArtifact', runtime =>
      runtime.ensureWorkspaceBlobArtifact(input)
    );
  }

  async syncEmbeddingState(input: SyncEmbeddingStateInput) {
    return await this.measured('syncEmbeddingState', runtime =>
      runtime.syncEmbeddingState(input)
    );
  }

  async readEmbeddingSourceContent(input: ReadEmbeddingSourceContentInput) {
    return await this.measured('readEmbeddingSourceContent', runtime =>
      runtime.readEmbeddingSourceContent(input)
    );
  }

  async matchEmbeddingCandidates(input: MatchEmbeddingCandidatesInput) {
    return await this.measured('matchEmbeddingCandidates', runtime =>
      runtime.matchEmbeddingCandidates(input)
    );
  }

  async cleanupUnreferencedArtifacts(limit: number) {
    return await this.measured('cleanupUnreferencedArtifacts', runtime =>
      runtime.cleanupUnreferencedArtifacts(limit)
    );
  }

  async setArtifactLibraryOwned(
    workspaceId: string,
    artifactId: string,
    libraryOwned: boolean,
    displayName?: string
  ) {
    return await this.measured('setArtifactLibraryOwned', runtime =>
      runtime.setArtifactLibraryOwned(
        workspaceId,
        artifactId,
        libraryOwned,
        displayName
      )
    );
  }

  async cancelEmbeddingCandidateRequest(requestId: string) {
    return await this.measured('cancelEmbeddingCandidateRequest', runtime =>
      runtime.cancelEmbeddingCandidateRequest(requestId)
    );
  }

  async cleanupExpiredSnapshotHistories(limit: number) {
    return await this.measured('cleanupExpiredSnapshotHistories', runtime =>
      runtime.cleanupExpiredSnapshotHistories(limit)
    );
  }
}
