import { nanoid } from 'nanoid';

import {
  ContextCategories,
  ContextCategory,
  ContextConfig,
  ContextDoc,
  ContextEmbedStatus,
  ContextFile,
  ContextList,
  Models,
} from '../../../models';
import { EmbeddingClient } from './types';

export class ContextSession implements AsyncDisposable {
  constructor(
    private readonly client: EmbeddingClient,
    private readonly contextId: string,
    private readonly config: ContextConfig,
    private readonly models: Models,
    private readonly dispatcher?: (config: ContextConfig) => Promise<void>
  ) {}

  get id() {
    return this.contextId;
  }

  get workspaceId() {
    return this.config.workspaceId;
  }

  get categories(): ContextCategory[] {
    return this.config.categories.map(c => ({
      ...c,
      docs: c.docs.map(d => ({ ...d })),
    }));
  }

  get tags() {
    const categories = this.config.categories;
    return categories.filter(c => c.type === ContextCategories.Tag);
  }

  get collections() {
    const categories = this.config.categories;
    return categories.filter(c => c.type === ContextCategories.Collection);
  }

  get docs(): ContextDoc[] {
    return this.config.docs.map(d => ({ ...d }));
  }

  get files() {
    return this.config.files.map(f => ({ ...f }));
  }

  get sortedList(): ContextList {
    const { docs, files } = this.config;
    return [...docs, ...files].toSorted(
      (a, b) => a.createdAt - b.createdAt
    ) as ContextList;
  }

  async addCategoryRecord(type: ContextCategories, id: string, docs: string[]) {
    const category = this.config.categories.find(
      c => c.type === type && c.id === id
    );
    if (category) {
      const missingDocs = docs.filter(
        docId => !category.docs.some(d => d.id === docId)
      );
      if (missingDocs.length) {
        category.docs.push(
          ...missingDocs.map(id => ({
            id,
            createdAt: Date.now(),
            status: ContextEmbedStatus.processing,
          }))
        );
        await this.save();
      }

      return category;
    }
    const createdAt = Date.now();
    const record = {
      id,
      type,
      docs: docs.map(id => ({
        id,
        createdAt,
        status: ContextEmbedStatus.processing,
      })),
      createdAt,
    };
    this.config.categories.push(record);
    await this.save();
    return record;
  }

  async removeCategoryRecord(type: ContextCategories, id: string) {
    const index = this.config.categories.findIndex(
      c => c.type === type && c.id === id
    );
    if (index >= 0) {
      this.config.categories.splice(index, 1);
      await this.save();
    }
    return true;
  }

  async addDocRecord(docId: string): Promise<ContextDoc> {
    const doc = this.config.docs.find(f => f.id === docId);
    if (doc) {
      return doc;
    }
    const record = { id: docId, createdAt: Date.now() };
    this.config.docs.push(record);
    await this.save();
    return record;
  }

  async removeDocRecord(docId: string): Promise<boolean> {
    const index = this.config.docs.findIndex(f => f.id === docId);
    if (index >= 0) {
      this.config.docs.splice(index, 1);
      await this.save();
    }
    return true;
  }

  async addFile(blobId: string, name: string): Promise<ContextFile> {
    let fileId = nanoid();
    const existsBlob = this.config.files.find(f => f.blobId === blobId);
    if (existsBlob) {
      // use exists file id if the blob exists
      // we assume that the file content pointed to by the same blobId is consistent.
      if (existsBlob.status === ContextEmbedStatus.finished) {
        return existsBlob;
      }
      fileId = existsBlob.id;
    } else {
      await this.saveFileRecord(fileId, file => ({
        ...file,
        blobId,
        chunkSize: 0,
        name,
        error: null,
        createdAt: Date.now(),
      }));
    }
    return this.getFile(fileId) as ContextFile;
  }

  getFile(fileId: string): ContextFile | undefined {
    return this.config.files.find(f => f.id === fileId);
  }

  async removeFile(fileId: string): Promise<boolean> {
    await this.models.copilotContext.deleteEmbedding(this.contextId, fileId);
    this.config.files = this.config.files.filter(f => f.id !== fileId);
    await this.save();
    return true;
  }

  /**
   * Match the input text with the file chunks
   * @param content input text to match
   * @param topK number of similar chunks to return, default 5
   * @param signal abort signal
   * @param threshold relevance threshold for the similarity score, higher threshold means more similar chunks, default 0.7, good enough based on prior experiments
   * @returns list of similar chunks
   */
  async matchFileChunks(
    content: string,
    topK: number = 5,
    signal?: AbortSignal,
    threshold: number = 0.7
  ) {
    const embedding = await this.client
      .getEmbeddings([content], signal)
      .then(r => r?.[0]?.embedding);
    if (!embedding) return [];

    return this.models.copilotContext.matchContentEmbedding(
      embedding,
      this.id,
      topK,
      threshold
    );
  }

  /**
   * Match the input text with the workspace chunks
   * @param content input text to match
   * @param topK number of similar chunks to return, default 5
   * @param signal abort signal
   * @param threshold relevance threshold for the similarity score, higher threshold means more similar chunks, default 0.7, good enough based on prior experiments
   * @returns list of similar chunks
   */
  async matchWorkspaceChunks(
    content: string,
    topK: number = 5,
    signal?: AbortSignal,
    threshold: number = 0.7
  ) {
    const embedding = await this.client
      .getEmbeddings([content], signal)
      .then(r => r?.[0]?.embedding);
    if (!embedding) return [];

    return this.models.copilotContext.matchWorkspaceEmbedding(
      embedding,
      this.workspaceId,
      topK,
      threshold
    );
  }

  async saveFileRecord(
    fileId: string,
    cb: (
      record: Pick<ContextFile, 'id' | 'status'> &
        Partial<Omit<ContextFile, 'id' | 'status'>>
    ) => ContextFile
  ) {
    const files = this.config.files;
    const file = files.find(f => f.id === fileId);
    if (file) {
      Object.assign(file, cb({ ...file }));
    } else {
      const file = { id: fileId, status: ContextEmbedStatus.processing };
      files.push(cb(file));
    }
    await this.save();
  }

  async save() {
    await this.dispatcher?.(this.config);
  }

  async [Symbol.asyncDispose]() {
    await this.save();
  }
}
