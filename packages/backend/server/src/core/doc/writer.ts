import { Injectable, Logger } from '@nestjs/common';
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
   * Note: Due to y-octo/yjs compatibility issues with delta updates,
   * this method replaces the document entirely rather than applying
   * surgical changes. This means document history is not preserved.
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

    // Verify document exists
    const existingDoc = await this.storage.getDoc(workspaceId, docId);
    if (!existingDoc?.bin) {
      throw new Error(`Document ${docId} not found`);
    }

    // Due to y-octo/yjs compatibility issues, we delete and recreate
    // the document instead of applying a delta update.
    // This loses document history but ensures the update is applied.
    await this.storage.deleteDoc(workspaceId, docId);

    // Create fresh document from markdown with the same docId
    const binary = markdownToDocBinary(markdown, docId);

    // Push the new document
    await this.storage.pushDocUpdates(workspaceId, docId, [binary], editorId);

    return { success: true };
  }
}
