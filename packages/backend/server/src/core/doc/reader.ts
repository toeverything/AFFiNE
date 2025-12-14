import { FactoryProvider, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  applyUpdate,
  diffUpdate,
  Doc as YDoc,
  encodeStateVectorFromUpdate,
} from 'yjs';

import {
  Cache,
  Config,
  CryptoHelper,
  getOrGenRequestId,
  UserFriendlyError,
} from '../../base';
import { Models } from '../../models';
import { WorkspaceBlobStorage } from '../storage';
import {
  type PageDocContent,
  parseDocToMarkdownFromDocSnapshot,
  parsePageDoc,
  parseWorkspaceDoc,
} from '../utils/blocksuite';
import { PgWorkspaceDocStorageAdapter } from './adapters/workspace';
import { type DocDiff, type DocRecord } from './storage';

const DOC_CONTENT_CACHE_7_DAYS = 7 * 24 * 60 * 60 * 1000;

export interface WorkspaceDocInfo {
  id: string;
  name: string;
  avatarKey?: string;
  avatarUrl?: string;
}

export interface DocMarkdown {
  title: string;
  markdown: string;
}

export abstract class DocReader {
  protected readonly logger = new Logger(DocReader.name);

  constructor(
    protected readonly cache: Cache,
    protected readonly models: Models,
    protected readonly blobStorage: WorkspaceBlobStorage
  ) {}

  parseDocContent(bin: Uint8Array, maxSummaryLength = 150) {
    const doc = new YDoc();
    applyUpdate(doc, bin);
    return parsePageDoc(doc, { maxSummaryLength });
  }

  parseWorkspaceContent(bin: Uint8Array) {
    const doc = new YDoc();
    applyUpdate(doc, bin);
    return parseWorkspaceDoc(doc);
  }

  abstract getDoc(
    workspaceId: string,
    docId: string
  ): Promise<DocRecord | null>;

  abstract getDocMarkdown(
    workspaceId: string,
    docId: string,
    aiEditable: boolean
  ): Promise<DocMarkdown | null>;

  abstract getDocDiff(
    spaceId: string,
    docId: string,
    stateVector?: Uint8Array
  ): Promise<DocDiff | null>;

  // TODO(@fengmk2): should remove this method after frontend support doc content update
  async getDocContent(
    workspaceId: string,
    docId: string
  ): Promise<PageDocContent | null> {
    const cacheKey = this.cacheKey(workspaceId, docId);
    const cachedResult = await this.cache.get<PageDocContent>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    const content = await this.getDocContentWithoutCache(workspaceId, docId);
    if (content) {
      await this.cache.set(cacheKey, content, {
        ttl: DOC_CONTENT_CACHE_7_DAYS,
      });
    }
    return content;
  }

  async getFullDocContent(
    workspaceId: string,
    docId: string
  ): Promise<PageDocContent | null> {
    return await this.getDocContentWithoutCache(workspaceId, docId, true);
  }

  /**
   * Get workspace content, try to read from database first.
   * If not exists, read from `getWorkspaceContentWithoutCache()` and save it back to database.
   */
  async getWorkspaceContent(
    workspaceId: string
  ): Promise<WorkspaceDocInfo | null> {
    const workspace = await this.models.workspace.get(workspaceId);
    if (!workspace) {
      return null;
    }
    if (workspace.name) {
      return {
        id: workspaceId,
        name: workspace.name,
        avatarKey: workspace.avatarKey ?? undefined,
        avatarUrl: workspace.avatarKey
          ? this.blobStorage.getAvatarUrl(workspaceId, workspace.avatarKey)
          : undefined,
      };
    }

    const content = await this.getWorkspaceContentWithoutCache(workspaceId);
    if (content) {
      await this.models.workspace.update(workspaceId, {
        name: content.name,
        avatarKey: content.avatarKey,
      });
    } else {
      this.logger.warn(`Workspace ${workspaceId} content not found`);
    }
    return content;
  }

  async markDocContentCacheStale(workspaceId: string, docId: string) {
    await this.cache.delete(this.cacheKey(workspaceId, docId));
  }

  private cacheKey(workspaceId: string, docId: string) {
    return workspaceId === docId
      ? `workspace:${workspaceId}:content`
      : `workspace:${workspaceId}:doc:${docId}:content`;
  }

  protected abstract getDocContentWithoutCache(
    workspaceId: string,
    guid: string,
    fullContent?: boolean
  ): Promise<PageDocContent | null>;

  protected abstract getWorkspaceContentWithoutCache(
    workspaceId: string
  ): Promise<WorkspaceDocInfo | null>;

  protected docDiff(update: Uint8Array, stateVector?: Uint8Array) {
    const missing = stateVector ? diffUpdate(update, stateVector) : update;
    const state = encodeStateVectorFromUpdate(update);
    return {
      missing,
      state,
    };
  }
}

@Injectable()
export class DatabaseDocReader extends DocReader {
  constructor(
    protected override readonly cache: Cache,
    protected override readonly models: Models,
    protected override readonly blobStorage: WorkspaceBlobStorage,
    protected readonly workspace: PgWorkspaceDocStorageAdapter
  ) {
    super(cache, models, blobStorage);
  }

  async getDoc(workspaceId: string, docId: string): Promise<DocRecord | null> {
    return await this.workspace.getDoc(workspaceId, docId);
  }

  async getDocMarkdown(
    workspaceId: string,
    docId: string,
    aiEditable: boolean
  ): Promise<DocMarkdown | null> {
    const doc = await this.workspace.getDoc(workspaceId, docId);
    if (!doc) {
      return null;
    }
    return parseDocToMarkdownFromDocSnapshot(docId, doc.bin, aiEditable);
  }

  async getDocDiff(
    spaceId: string,
    docId: string,
    stateVector?: Uint8Array
  ): Promise<DocDiff | null> {
    const doc = await this.workspace.getDoc(spaceId, docId);
    if (!doc) {
      return null;
    }
    return {
      ...this.docDiff(doc.bin, stateVector),
      timestamp: doc.timestamp,
    };
  }

  protected override async getDocContentWithoutCache(
    workspaceId: string,
    guid: string,
    fullContent?: boolean
  ): Promise<PageDocContent | null> {
    const docRecord = await this.workspace.getDoc(workspaceId, guid);
    if (!docRecord) {
      return null;
    }
    return this.parseDocContent(docRecord.bin, fullContent ? -1 : 150);
  }

  protected override async getWorkspaceContentWithoutCache(
    workspaceId: string
  ): Promise<WorkspaceDocInfo | null> {
    const docRecord = await this.workspace.getDoc(workspaceId, workspaceId);
    if (!docRecord) {
      return null;
    }
    const content = this.parseWorkspaceContent(docRecord.bin);
    if (!content) {
      return null;
    }
    let avatarUrl: string | undefined;
    if (content.avatarKey) {
      avatarUrl = this.blobStorage.getAvatarUrl(workspaceId, content.avatarKey);
    }
    return {
      id: workspaceId,
      name: content.name,
      avatarKey: content.avatarKey,
      avatarUrl,
    };
  }
}

@Injectable()
export class RpcDocReader extends DatabaseDocReader {
  protected override readonly logger = new Logger(DocReader.name);

  constructor(
    private readonly config: Config,
    private readonly crypto: CryptoHelper,
    protected override readonly cache: Cache,
    protected override readonly models: Models,
    protected override readonly blobStorage: WorkspaceBlobStorage,
    protected override readonly workspace: PgWorkspaceDocStorageAdapter
  ) {
    super(cache, models, blobStorage, workspace);
  }

  private async fetch(
    accessToken: string,
    url: string,
    method: 'GET' | 'POST',
    body?: Uint8Array
  ) {
    const headers: Record<string, string> = {
      'x-access-token': accessToken,
      'x-cloud-trace-context': getOrGenRequestId('rpc'),
    };
    if (body) {
      headers['content-type'] = 'application/octet-stream';
    }
    const requestInit: RequestInit = {
      method,
      headers,
    };
    if (body) {
      requestInit.body = body;
    }
    const res = await fetch(url, requestInit);
    if (!res.ok) {
      if (res.status === 404) {
        return null;
      }
      const body = (await res.json()) as UserFriendlyError;
      throw UserFriendlyError.fromUserFriendlyErrorJSON(body);
    }
    return res;
  }

  override async getDoc(
    workspaceId: string,
    docId: string
  ): Promise<DocRecord | null> {
    const url = `${this.config.docService.endpoint}/rpc/workspaces/${workspaceId}/docs/${docId}`;
    const accessToken = this.crypto.sign(docId);
    try {
      const res = await this.fetch(accessToken, url, 'GET');
      if (!res) {
        return null;
      }
      const timestamp = res.headers.get('x-doc-timestamp') as string;
      const editor = res.headers.get('x-doc-editor-id') ?? undefined;
      const bin = await res.arrayBuffer();
      return {
        spaceId: workspaceId,
        docId,
        bin: Buffer.from(bin),
        timestamp: parseInt(timestamp),
        editor,
      };
    } catch (e) {
      if (e instanceof UserFriendlyError) {
        throw e;
      }
      const err = e as Error;
      // other error
      this.logger.error(
        `Failed to fetch doc ${url}, fallback to database doc reader`,
        err
      );
      // fallback to database doc reader if the error is not user friendly, like network error
      return await super.getDoc(workspaceId, docId);
    }
  }

  override async getDocMarkdown(
    workspaceId: string,
    docId: string,
    aiEditable: boolean
  ): Promise<DocMarkdown | null> {
    const url = `${this.config.docService.endpoint}/rpc/workspaces/${workspaceId}/docs/${docId}/markdown?aiEditable=${aiEditable}`;
    const accessToken = this.crypto.sign(docId);
    try {
      const res = await this.fetch(accessToken, url, 'GET');
      if (!res) {
        return null;
      }
      return (await res.json()) as DocMarkdown;
    } catch (e) {
      if (e instanceof UserFriendlyError) {
        throw e;
      }
      const err = e as Error;
      // other error
      this.logger.error(
        `Failed to fetch doc markdown ${url}, fallback to database doc reader`,
        err
      );
      // fallback to database doc reader if the error is not user friendly, like network error
      return await super.getDocMarkdown(workspaceId, docId, aiEditable);
    }
  }

  override async getDocDiff(
    workspaceId: string,
    docId: string,
    stateVector?: Uint8Array
  ): Promise<DocDiff | null> {
    const url = `${this.config.docService.endpoint}/rpc/workspaces/${workspaceId}/docs/${docId}/diff`;
    const accessToken = this.crypto.sign(docId);
    try {
      const res = await this.fetch(accessToken, url, 'POST', stateVector);
      if (!res) {
        return null;
      }
      const timestamp = res.headers.get('x-doc-timestamp') as string;
      // blob missing data offset [0, 123]
      // x-doc-missing-offset: 0,123
      // blob stateVector data offset [124,789]
      // x-doc-state-offset: 124,789
      const missingOffset = res.headers.get('x-doc-missing-offset') as string;
      const [missingStart, missingEnd] = missingOffset.split(',').map(Number);
      const stateOffset = res.headers.get('x-doc-state-offset') as string;
      const [stateStart, stateEnd] = stateOffset.split(',').map(Number);
      const bin = await res.arrayBuffer();
      return {
        missing: new Uint8Array(bin, missingStart, missingEnd - missingStart),
        state: new Uint8Array(bin, stateStart, stateEnd - stateStart),
        timestamp: parseInt(timestamp),
      };
    } catch (e) {
      if (e instanceof UserFriendlyError) {
        throw e;
      }
      const err = e as Error;
      this.logger.error(
        `Failed to fetch doc diff ${url}, fallback to database doc reader`,
        err
      );
      // fallback to database doc reader if the error is not user friendly, like network error
      return await super.getDocDiff(workspaceId, docId, stateVector);
    }
  }

  protected override async getDocContentWithoutCache(
    workspaceId: string,
    docId: string,
    fullContent = false
  ): Promise<PageDocContent | null> {
    const url = `${this.config.docService.endpoint}/rpc/workspaces/${workspaceId}/docs/${docId}/content?full=${fullContent}`;
    const accessToken = this.crypto.sign(docId);
    try {
      const res = await this.fetch(accessToken, url, 'GET');
      if (!res) {
        return null;
      }
      return (await res.json()) as PageDocContent;
    } catch (e) {
      if (e instanceof UserFriendlyError) {
        throw e;
      }
      const err = e as Error;
      this.logger.error(
        `Failed to fetch doc content ${url}, fallback to database doc reader`,
        err
      );
      return await super.getDocContentWithoutCache(
        workspaceId,
        docId,
        fullContent
      );
    }
  }

  protected override async getWorkspaceContentWithoutCache(
    workspaceId: string
  ): Promise<WorkspaceDocInfo | null> {
    const url = `${this.config.docService.endpoint}/rpc/workspaces/${workspaceId}/content`;
    const accessToken = this.crypto.sign(workspaceId);
    try {
      const res = await this.fetch(accessToken, url, 'GET');
      if (!res) {
        return null;
      }
      return (await res.json()) as WorkspaceDocInfo;
    } catch (e) {
      if (e instanceof UserFriendlyError) {
        throw e;
      }
      const err = e as Error;
      this.logger.error(
        `Failed to fetch workspace content ${url}, fallback to database doc reader`,
        err
      );
      return await super.getWorkspaceContentWithoutCache(workspaceId);
    }
  }
}

export const DocReaderProvider: FactoryProvider = {
  provide: DocReader,
  useFactory: (ref: ModuleRef) => {
    if (env.flavors.doc) {
      return ref.create(DatabaseDocReader);
    }
    return ref.create(RpcDocReader);
  },
  inject: [ModuleRef],
};
