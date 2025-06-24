import type { WorkspaceServerService } from '@affine/core/modules/cloud';
import {
  addWorkspaceEmbeddingFilesMutation,
  addWorkspaceEmbeddingIgnoredDocsMutation,
  getAllWorkspaceEmbeddingIgnoredDocsQuery,
  getWorkspaceConfigQuery,
  getWorkspaceEmbeddingFilesQuery,
  getWorkspaceEmbeddingStatusQuery,
  type PaginationInput,
  removeWorkspaceEmbeddingFilesMutation,
  removeWorkspaceEmbeddingIgnoredDocsMutation,
  setEnableDocEmbeddingMutation,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

export class EmbeddingStore extends Store {
  constructor(private readonly workspaceServerService: WorkspaceServerService) {
    super();
  }

  async getEnabled(workspaceId: string, signal?: AbortSignal) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const data = await this.workspaceServerService.server.gql({
      query: getWorkspaceConfigQuery,
      variables: {
        id: workspaceId,
      },
      context: {
        signal,
      },
    });
    return data.workspace.enableDocEmbedding;
  }

  async updateEnabled(
    workspaceId: string,
    enabled: boolean,
    signal?: AbortSignal
  ) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    await this.workspaceServerService.server.gql({
      query: setEnableDocEmbeddingMutation,
      variables: {
        id: workspaceId,
        enableDocEmbedding: enabled,
      },
      context: {
        signal,
      },
    });
  }

  async getIgnoredDocs(workspaceId: string, signal?: AbortSignal) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }

    const data = await this.workspaceServerService.server.gql({
      query: getAllWorkspaceEmbeddingIgnoredDocsQuery,
      variables: {
        workspaceId,
      },
      context: { signal },
    });
    return data.workspace.embedding.allIgnoredDocs;
  }

  async updateIgnoredDocs(
    workspaceId: string,
    add: string[],
    remove: string[],
    signal?: AbortSignal
  ) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }

    await Promise.all([
      this.workspaceServerService.server.gql({
        query: addWorkspaceEmbeddingIgnoredDocsMutation,
        variables: {
          workspaceId,
          add,
        },
        context: { signal },
      }),
      this.workspaceServerService.server.gql({
        query: removeWorkspaceEmbeddingIgnoredDocsMutation,
        variables: {
          workspaceId,
          remove,
        },
        context: { signal },
      }),
    ]);
  }

  async addEmbeddingFile(
    workspaceId: string,
    blob: File,
    signal?: AbortSignal
  ) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }

    await this.workspaceServerService.server.gql({
      query: addWorkspaceEmbeddingFilesMutation,
      variables: {
        workspaceId,
        blob,
      },
      context: { signal },
    });
  }

  async addEmbeddingFiles(
    workspaceId: string,
    files: File[],
    signal?: AbortSignal
  ) {
    for (const file of files) {
      await this.addEmbeddingFile(workspaceId, file, signal);
    }
  }

  async removeEmbeddingFile(
    workspaceId: string,
    fileId: string,
    signal?: AbortSignal
  ) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }

    await this.workspaceServerService.server.gql({
      query: removeWorkspaceEmbeddingFilesMutation,
      variables: {
        workspaceId,
        fileId,
      },
      context: { signal },
    });
  }

  async removeEmbeddingFiles(
    workspaceId: string,
    fileIds: string[],
    signal?: AbortSignal
  ) {
    for (const fileId of fileIds) {
      await this.removeEmbeddingFile(workspaceId, fileId, signal);
    }
  }

  async getEmbeddingFiles(
    workspaceId: string,
    pagination: PaginationInput,
    signal?: AbortSignal
  ) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }

    const data = await this.workspaceServerService.server.gql({
      query: getWorkspaceEmbeddingFilesQuery,
      variables: {
        workspaceId,
        pagination,
      },
      context: { signal },
    });
    return data.workspace.embedding.files;
  }

  async getEmbeddingProgress(workspaceId: string, signal?: AbortSignal) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }

    const data = await this.workspaceServerService.server.gql({
      query: getWorkspaceEmbeddingStatusQuery,
      variables: {
        workspaceId,
      },
      context: { signal },
    });
    return data.queryWorkspaceEmbeddingStatus;
  }
}
