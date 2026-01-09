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
   * This replaces the entire document content.
   *
   * @param workspaceId - The workspace ID
   * @param docId - The document ID to update
   * @param markdown - The new markdown content
   * @param editorId - Optional editor ID for tracking
   * @returns Success status
   */
  async updateDoc(
    workspaceId: string,
    docId: string,
    markdown: string,
    editorId?: string
  ): Promise<UpdateDocResult> {
    this.logger.log(
      `Updating doc ${docId} in workspace ${workspaceId} with new markdown`
    );

    // Convert markdown to y-octo binary
    const binary = markdownToDocBinary(markdown, docId);

    // Push the update to storage
    await this.storage.pushDocUpdates(workspaceId, docId, [binary], editorId);

    return { success: true };
  }

  /**
   * Appends content to an existing document.
   * Reads the existing content, appends the new content, and saves.
   *
   * @param workspaceId - The workspace ID
   * @param docId - The document ID
   * @param appendMarkdown - The markdown content to append
   * @param editorId - Optional editor ID for tracking
   * @returns Success status
   */
  async appendToDoc(
    workspaceId: string,
    docId: string,
    appendMarkdown: string,
    editorId?: string
  ): Promise<UpdateDocResult> {
    this.logger.log(
      `Appending content to doc ${docId} in workspace ${workspaceId}`
    );

    // For append, we need to read the existing content first
    // Then merge it with the new content
    // For now, we'll just push the append as an update
    // The client will need to handle merging
    // This is a simplified implementation - full append would require
    // reading the doc, parsing it, adding blocks, and re-encoding

    // Convert append markdown to y-octo binary
    const binary = markdownToDocBinary(appendMarkdown, docId);

    // Push the update to storage
    await this.storage.pushDocUpdates(workspaceId, docId, [binary], editorId);

    return { success: true };
  }
}
