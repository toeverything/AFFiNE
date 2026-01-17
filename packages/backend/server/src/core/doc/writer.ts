import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { nanoid } from 'nanoid';

import {
  addDocToRootDoc,
  createDocWithMarkdown,
  updateDocTitle,
  updateDocWithMarkdown,
  updateRootDocMetaTitle,
} from '../../native';
import { PgWorkspaceDocStorageAdapter } from './adapters/workspace';

export interface CreateDocResult {
  docId: string;
}

export interface UpdateDocResult {
  success: boolean;
}

@Injectable()
export class DocWriter {
  private readonly logger = new Logger(DocWriter.name);

  constructor(private readonly storage: PgWorkspaceDocStorageAdapter) {}

  /**
   * Creates a new document from markdown content.
   *
   * @param workspaceId - The workspace ID
   * @param title - The document title
   * @param markdown - The markdown content (body only)
   * @param editorId - Optional editor ID for tracking
   * @returns The created document ID
   */
  async createDoc(
    workspaceId: string,
    title: string,
    markdown: string,
    editorId?: string
  ): Promise<CreateDocResult> {
    // Fetch workspace root doc first - reject if not found
    // The root doc (docId = workspaceId) contains meta.pages array
    const rootDoc = await this.storage.getDoc(workspaceId, workspaceId);
    if (!rootDoc?.bin) {
      throw new NotFoundException(
        `Workspace ${workspaceId} not found or has no root document`
      );
    }

    const rootDocBin = Buffer.isBuffer(rootDoc.bin)
      ? rootDoc.bin
      : Buffer.from(
          rootDoc.bin.buffer,
          rootDoc.bin.byteOffset,
          rootDoc.bin.byteLength
        );

    const docId = nanoid();

    this.logger.debug(
      `Creating doc ${docId} in workspace ${workspaceId} from markdown`
    );

    // Convert markdown to y-octo binary using the provided title
    const binary = createDocWithMarkdown(title, markdown, docId);

    // Prepare root doc update to register the new document
    const rootDocUpdate = addDocToRootDoc(rootDocBin, docId, title);

    // Push both updates together - root doc first, then the new doc
    await this.storage.pushDocUpdates(
      workspaceId,
      workspaceId,
      [rootDocUpdate],
      editorId
    );
    await this.storage.pushDocUpdates(workspaceId, docId, [binary], editorId);

    this.logger.debug(
      `Created and registered doc ${docId} in workspace ${workspaceId}`
    );

    return { docId };
  }

  /**
   * Updates an existing document with new markdown content.
   *
   * Uses structural diffing to compute minimal changes between the existing
   * document and new markdown, then applies block-level replacements for
   * changed blocks. This preserves document history and enables proper CRDT
   * merging with concurrent edits.
   * Note: this does not update the document title.
   *
   * @param workspaceId - The workspace ID
   * @param docId - The document ID to update
   * @param markdown - The new markdown content
   * @param editorId - Optional editor ID for tracking
   */
  async updateDoc(
    workspaceId: string,
    docId: string,
    markdown: string,
    editorId?: string
  ): Promise<UpdateDocResult> {
    this.logger.debug(
      `Updating doc ${docId} in workspace ${workspaceId} from markdown`
    );

    // Fetch existing document
    const existingDoc = await this.storage.getDoc(workspaceId, docId);
    if (!existingDoc?.bin) {
      throw new NotFoundException(`Document ${docId} not found`);
    }

    // Compute delta update using structural diff
    // Use zero-copy buffer view when possible for native function
    const existingBinary = Buffer.isBuffer(existingDoc.bin)
      ? existingDoc.bin
      : Buffer.from(
          existingDoc.bin.buffer,
          existingDoc.bin.byteOffset,
          existingDoc.bin.byteLength
        );
    const delta = updateDocWithMarkdown(existingBinary, markdown, docId);

    // Push only the delta changes
    await this.storage.pushDocUpdates(workspaceId, docId, [delta], editorId);

    return { success: true };
  }

  /**
   * Updates document metadata (currently title only).
   *
   * @param workspaceId - The workspace ID
   * @param docId - The document ID to update
   * @param meta - Metadata updates
   * @param editorId - Optional editor ID for tracking
   */
  async updateDocMeta(
    workspaceId: string,
    docId: string,
    meta: { title?: string },
    editorId?: string
  ): Promise<UpdateDocResult> {
    if (meta.title === undefined) {
      throw new Error('No metadata provided');
    }

    this.logger.debug(`Updating doc meta ${docId} in workspace ${workspaceId}`);

    const existingDoc = await this.storage.getDoc(workspaceId, docId);
    if (!existingDoc?.bin) {
      throw new NotFoundException(`Document ${docId} not found`);
    }

    const rootDoc = await this.storage.getDoc(workspaceId, workspaceId);
    if (!rootDoc?.bin) {
      throw new NotFoundException(
        `Workspace ${workspaceId} not found or has no root document`
      );
    }

    const existingBinary = Buffer.isBuffer(existingDoc.bin)
      ? existingDoc.bin
      : Buffer.from(
          existingDoc.bin.buffer,
          existingDoc.bin.byteOffset,
          existingDoc.bin.byteLength
        );
    const rootDocBin = Buffer.isBuffer(rootDoc.bin)
      ? rootDoc.bin
      : Buffer.from(
          rootDoc.bin.buffer,
          rootDoc.bin.byteOffset,
          rootDoc.bin.byteLength
        );

    const titleUpdate = updateDocTitle(existingBinary, meta.title, docId);
    const rootMetaUpdate = updateRootDocMetaTitle(
      rootDocBin,
      docId,
      meta.title
    );

    await this.storage.pushDocUpdates(
      workspaceId,
      workspaceId,
      [rootMetaUpdate],
      editorId
    );
    await this.storage.pushDocUpdates(
      workspaceId,
      docId,
      [titleUpdate],
      editorId
    );

    return { success: true };
  }
}
