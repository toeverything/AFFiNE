import { Injectable, Logger } from '@nestjs/common';
import { diffUpdate, encodeStateVectorFromUpdate } from 'yjs';

import { Cache } from '../../base';
import { Models } from '../../models';
import { WorkspaceBlobStorage } from '../storage';
import {
  type CanvasProjectionV1,
  type PageDocContent,
  parseDocToMarkdownFromDocSnapshot,
  parsePageDoc,
  parseWorkspaceDoc,
  projectDocCanvas,
  type WorkspaceDocContent,
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
  revision: string;
  knownUnsupportedBlocks: string[];
  unknownBlocks: string[];
}

export abstract class DocReader {
  protected readonly logger = new Logger(DocReader.name);

  constructor(
    protected readonly cache: Cache,
    protected readonly models: Models,
    protected readonly blobStorage: WorkspaceBlobStorage
  ) {}

  // keep methods to allow test mocking
  parseDocContent(bin: Uint8Array, maxSummaryLength = 150) {
    return parsePageDoc(bin, { maxSummaryLength });
  }

  // keep methods to allow test mocking
  parseWorkspaceContent(bin: Uint8Array) {
    return parseWorkspaceDoc(bin);
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

  abstract getDocCanvas(
    workspaceId: string,
    docId: string
  ): Promise<CanvasProjectionV1 | null>;

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
    try {
      const markdown = parseDocToMarkdownFromDocSnapshot(
        workspaceId,
        docId,
        doc.bin,
        aiEditable
      );

      const unknownBlocks = markdown.unknownBlocks ?? [];
      if (unknownBlocks.length > 0) {
        this.logger.warn(
          `Unknown blocks found when parsing markdown for ${workspaceId}/${docId}.`,
          { unknownBlocks }
        );
      }

      return { ...markdown, revision: doc.timestamp.toString() };
    } catch (error) {
      this.logger.error(`Failed to parse ${workspaceId}/${docId}.`, error);
      throw error;
    }
  }

  async getDocCanvas(
    workspaceId: string,
    docId: string
  ): Promise<CanvasProjectionV1 | null> {
    const doc = await this.workspace.getDoc(workspaceId, docId);
    if (!doc) {
      return null;
    }
    return projectDocCanvas(doc.bin, docId, doc.timestamp.toString());
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
    const docBinary = await this.workspace.getDocBinNative(workspaceId, guid);
    if (!docBinary) return null;
    return this.parseDocContent(docBinary, fullContent ? -1 : 150);
  }

  protected override async getWorkspaceContentWithoutCache(
    workspaceId: string
  ): Promise<WorkspaceDocInfo | null> {
    const docRecord = await this.workspace.getDoc(workspaceId, workspaceId);
    if (!docRecord) {
      return null;
    }
    let content: WorkspaceDocContent | null;
    try {
      content = this.parseWorkspaceContent(docRecord.bin);
    } catch (error) {
      this.logger.warn(
        `Failed to parse workspace ${workspaceId} content`,
        error as Error
      );
      return null;
    }
    if (!content) return null;
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

export const DocReaderProvider = {
  provide: DocReader,
  useExisting: DatabaseDocReader,
};
