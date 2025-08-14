import { nanoid } from 'nanoid';

import {
  ContextBlob,
  ContextCategories,
  ContextCategory,
  ContextConfig,
  ContextDoc,
  ContextEmbedStatus,
  ContextFile,
  FileChunkSimilarity,
  Models,
} from '../../../models';
import { EmbeddingClient } from '../embedding';

export class ContextSession implements AsyncDisposable {
  constructor(
    private readonly client: EmbeddingClient | undefined,
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

  get blobs(): ContextBlob[] {
    return this.config.blobs.map(d => ({ ...d }));
  }

  get docs(): ContextDoc[] {
    return this.config.docs.map(d => ({ ...d }));
  }

  get files(): Required<ContextFile>[] {
    return this.config.files.map(f => this.fulfillFile(f));
  }

  get docIds() {
    return Array.from(
      new Set(
        [this.config.docs, this.config.categories.flatMap(c => c.docs)]
          .flat()
          .map(d => d.id)
      )
    );
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

  async addBlobRecord(blobId: string): Promise<ContextBlob | null> {
    const existsBlob = this.config.blobs.find(b => b.id === blobId);
    if (existsBlob) {
      return existsBlob;
    }
    const blob = await this.models.blob.get(this.config.workspaceId, blobId);
    if (!blob) return null;

    const record: ContextBlob = {
      id: blobId,
      createdAt: Date.now(),
      status: ContextEmbedStatus.processing,
    };
    this.config.blobs.push(record);
    await this.save();
    return record;
  }

  async getBlobMetadata() {
    const blobIds = this.blobs.map(b => b.id);
    const blobs = await this.models.blob.list(this.config.workspaceId, {
      where: { key: { in: blobIds } },
      select: { key: true, mime: true },
    });
    const blobChunkSizes = await this.models.copilotWorkspace.getBlobChunkSizes(
      this.config.workspaceId,
      blobIds
    );
    return blobs
      .filter(b => !!blobChunkSizes.get(b.key))
      .map(b => ({
        id: b.key,
        mimeType: b.mime,
        chunkSize: blobChunkSizes.get(b.key),
      }));
  }

  async getBlobContent(
    blobId: string,
    chunk?: number
  ): Promise<string | undefined> {
    return this.models.copilotWorkspace.getBlobContent(
      this.config.workspaceId,
      blobId,
      chunk
    );
  }

  async removeBlobRecord(blobId: string): Promise<boolean> {
    const index = this.config.blobs.findIndex(b => b.id === blobId);
    if (index >= 0) {
      this.config.blobs.splice(index, 1);
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

  private fulfillFile(file: ContextFile): Required<ContextFile> {
    return {
      ...file,
      mimeType: file.mimeType || 'application/octet-stream',
    };
  }

  async addFile(
    blobId: string,
    name: string,
    mimeType: string
  ): Promise<Required<ContextFile>> {
    let fileId = nanoid();
    const existsBlob = this.config.files.find(f => f.blobId === blobId);
    if (existsBlob) {
      // use exists file id if the blob exists
      // we assume that the file content pointed to by the same blobId is consistent.
      if (existsBlob.status === ContextEmbedStatus.finished) {
        return this.fulfillFile(existsBlob);
      }
      fileId = existsBlob.id;
    } else {
      await this.saveFileRecord(fileId, file => ({
        ...file,
        blobId,
        chunkSize: 0,
        name,
        mimeType,
        error: null,
        createdAt: Date.now(),
      }));
    }
    return this.fulfillFile(this.getFile(fileId) as ContextFile);
  }

  getFile(fileId: string): ContextFile | undefined {
    return this.config.files.find(f => f.id === fileId);
  }

  async getFileContent(
    fileId: string,
    chunk?: number
  ): Promise<string | undefined> {
    const file = this.getFile(fileId);
    if (!file) return undefined;
    return this.models.copilotContext.getFileContent(
      this.contextId,
      fileId,
      chunk
    );
  }

  async removeFile(fileId: string): Promise<boolean> {
    await this.models.copilotContext.deleteFileEmbedding(
      this.contextId,
      fileId
    );
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
  async matchFiles(
    content: string,
    topK: number = 5,
    signal?: AbortSignal,
    scopedThreshold: number = 0.85,
    threshold: number = 0.5
  ): Promise<FileChunkSimilarity[]> {
    if (!this.client) return [];
    const embedding = await this.client.getEmbedding(content, signal);
    if (!embedding) return [];

    const [context, workspace] = await Promise.all([
      this.models.copilotContext.matchFileEmbedding(
        embedding,
        this.id,
        topK * 2,
        scopedThreshold
      ),
      this.models.copilotWorkspace.matchFileEmbedding(
        this.workspaceId,
        embedding,
        topK * 2,
        threshold
      ),
    ]);
    const files = new Map(this.files.map(f => [f.id, f]));

    return this.client.reRank(
      content,
      [
        ...context
          .filter(f => files.has(f.fileId))
          .map(c => {
            const { blobId, name, mimeType } = files.get(
              c.fileId
            ) as Required<ContextFile>;
            return { ...c, blobId, name, mimeType };
          }),
        ...workspace,
      ],
      topK,
      signal
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
  async matchWorkspaceDocs(
    content: string,
    topK: number = 5,
    signal?: AbortSignal,
    scopedThreshold: number = 0.85,
    threshold: number = 0.5
  ) {
    if (!this.client) return [];
    const embedding = await this.client.getEmbedding(content, signal);
    if (!embedding) return [];

    const docIds = this.docIds;
    const [inContext, workspace] = await Promise.all([
      this.models.copilotContext.matchWorkspaceEmbedding(
        embedding,
        this.workspaceId,
        topK * 2,
        scopedThreshold,
        docIds
      ),
      this.models.copilotContext.matchWorkspaceEmbedding(
        embedding,
        this.workspaceId,
        topK * 2,
        threshold
      ),
    ]);

    const result = await this.client.reRank(
      content,
      [...inContext, ...workspace],
      topK,
      signal
    );

    // sort result, doc recorded in context first
    const docIdSet = new Set(docIds);
    return result.toSorted(
      (a, b) =>
        (docIdSet.has(a.docId) ? -1 : 1) - (docIdSet.has(b.docId) ? -1 : 1) ||
        (a.distance || Infinity) - (b.distance || Infinity)
    );
  }

  async saveDocRecord(
    docId: string,
    cb: (
      record: Pick<ContextDoc, 'id' | 'status'> &
        Partial<Omit<ContextDoc, 'id' | 'status'>>
    ) => ContextDoc
  ) {
    const docs = [this.config.docs, ...this.config.categories.map(c => c.docs)]
      .flat()
      .filter(d => d.id === docId);
    for (const doc of docs) {
      Object.assign(doc, cb({ ...doc }));
    }

    await this.save();
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
