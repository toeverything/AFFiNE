import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { nanoid } from 'nanoid';

import { markdownToDocBinary } from '../../native';
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
   * @param markdown - The markdown content
   * @param editorId - Optional editor ID for tracking
   * @returns The created document ID
   */
  async createDoc(
    workspaceId: string,
    markdown: string,
    editorId?: string
  ): Promise<CreateDocResult> {
    const docId = nanoid();

    this.logger.log(
      `Creating doc ${docId} in workspace ${workspaceId} from markdown`
    );

    // Convert markdown to y-octo binary
    const binary = markdownToDocBinary(markdown, docId);

    // Push the update to storage
    await this.storage.pushDocUpdates(workspaceId, docId, [binary], editorId);

    return { docId };
  }

  /**
   * Updates an existing document with new markdown content.
   *
   * Due to y-octo/Yjs binary format incompatibility, this method deletes
   * the existing document and creates a fresh one with the new content.
   * This replaces the document entirely rather than merging changes.
   *
   * Note: This approach loses document history and concurrent edits.
   * A proper CRDT merge implementation requires Yjs compatibility.
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
    this.logger.log(
      `Updating doc ${docId} in workspace ${workspaceId} from markdown`
    );

    // Verify the document exists
    const existingDoc = await this.storage.getDoc(workspaceId, docId);
    if (!existingDoc?.bin) {
      throw new NotFoundException(`Document ${docId} not found`);
    }

    // Delete the existing document
    // This clears all stored updates and the snapshot
    await this.storage.deleteDoc(workspaceId, docId);

    // Create a fresh document with the new content
    const binary = markdownToDocBinary(markdown, docId);

    // Push as a new document
    await this.storage.pushDocUpdates(workspaceId, docId, [binary], editorId);

    return { success: true };
  }
}
