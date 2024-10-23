import {
  deleteBlobMutation,
  gqlFetcherFactory,
  listBlobsQuery,
  releaseDeletedBlobsMutation,
  setBlobMutation,
} from '@affine/graphql';

import {
  type BlobRecord as BlobType,
  BlobStorage,
  type BlobStorageOptions,
  type ListedBlobRecord,
} from '../../storage';

// TODO(@forehalo): websocket?
interface CloudBlobStorageOptions extends BlobStorageOptions {
  endpoint: string;
}

export class CloudBlobStorage extends BlobStorage<CloudBlobStorageOptions> {
  private readonly gql = gqlFetcherFactory(this.options.endpoint + '/graphql');

  override async doConnect() {
    return;
  }

  override async doDisconnect() {
    return;
  }

  override async getBlob(key: string): Promise<BlobType | null> {
    const res = await fetch(
      this.options.endpoint +
        '/api/workspaces/' +
        this.spaceId +
        '/blobs/' +
        key,
      { cache: 'default' }
    );

    if (!res.ok) {
      return null;
    }

    const data = await res.arrayBuffer();

    return {
      key,
      data: new Uint8Array(data),
      mime: res.headers.get('content-type') || '',
      size: data.byteLength,
      createdAt: new Date(
        res.headers.get('last-modified') || Date.now()
      ).getTime(),
    };
  }

  override async setBlob(blob: BlobType): Promise<void> {
    await this.gql({
      query: setBlobMutation,
      variables: {
        workspaceId: this.spaceId,
        blob: new File([blob.data], blob.key, { type: blob.mime }),
      },
    });
  }

  override async deleteBlob(key: string, permanently: boolean): Promise<void> {
    await this.gql({
      query: deleteBlobMutation,
      variables: { workspaceId: this.spaceId, key, permanently },
    });
  }

  override async releaseBlobs(): Promise<void> {
    await this.gql({
      query: releaseDeletedBlobsMutation,
      variables: { workspaceId: this.spaceId },
    });
  }

  override async listBlobs(): Promise<ListedBlobRecord[]> {
    const res = await this.gql({
      query: listBlobsQuery,
      variables: { workspaceId: this.spaceId },
    });

    return res.workspace.blobs.map(blob => ({
      ...blob,
      createdAt: new Date(blob.createdAt).getTime(),
    }));
  }
}
