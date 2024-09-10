import { Injectable } from '@nestjs/common';
import { applyUpdate, Doc } from 'yjs';

import { Cache, type EventPayload, OnEvent } from '../../fundamentals';
import { PgWorkspaceDocStorageAdapter } from '../doc';
import {
  type PageDocContent,
  parsePageDoc,
  parseWorkspaceDoc,
  type WorkspaceDocContent,
} from '../utils/blocksuite';

@Injectable()
export class DocContentService {
  constructor(
    private readonly cache: Cache,
    private readonly workspace: PgWorkspaceDocStorageAdapter
  ) {}

  async getPageContent(
    workspaceId: string,
    guid: string
  ): Promise<PageDocContent | null> {
    const cacheKey = `workspace:${workspaceId}:doc:${guid}:content`;
    const cachedResult = await this.cache.get<PageDocContent>(cacheKey);

    if (cachedResult) {
      return cachedResult;
    }

    const docRecord = await this.workspace.getDoc(workspaceId, guid);
    if (!docRecord) {
      return null;
    }

    const doc = new Doc();
    applyUpdate(doc, docRecord.bin);

    const content = parsePageDoc(doc);

    if (content) {
      await this.cache.set(cacheKey, content, {
        ttl:
          7 *
          24 *
          60 *
          60 *
          1000 /* TODO(@forehalo): we need time constants helper */,
      });
    }
    return content;
  }

  async getWorkspaceContent(
    workspaceId: string
  ): Promise<WorkspaceDocContent | null> {
    const cacheKey = `workspace:${workspaceId}:content`;
    const cachedResult = await this.cache.get<WorkspaceDocContent>(cacheKey);

    if (cachedResult) {
      return cachedResult;
    }

    const docRecord = await this.workspace.getDoc(workspaceId, workspaceId);
    if (!docRecord) {
      return null;
    }

    const doc = new Doc();
    applyUpdate(doc, docRecord.bin);

    const content = parseWorkspaceDoc(doc);

    if (content) {
      await this.cache.set(cacheKey, content);
    }

    return content;
  }

  @OnEvent('snapshot.updated')
  async markDocContentCacheStale({
    workspaceId,
    id,
  }: EventPayload<'snapshot.updated'>) {
    const key =
      workspaceId === id
        ? `workspace:${workspaceId}:content`
        : `workspace:${workspaceId}:doc:${id}:content`;
    await this.cache.delete(key);
  }
}
