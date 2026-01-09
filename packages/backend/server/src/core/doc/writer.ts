import { Injectable, Logger } from '@nestjs/common';
import { nanoid } from 'nanoid';

import { markdownToDocBinary, updateDocWithMarkdown } from '../../native';
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
   * Uses structural and text-level diffing to apply minimal changes,
   * preserving collaborative editing history.
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

    // Fetch the existing document binary
    const existingDoc = await this.storage.getDoc(workspaceId, docId);
    if (!existingDoc || !existingDoc.bin) {
      throw new Error(
        `Document ${docId} not found in workspace ${workspaceId}`
      );
    }

    // Compute and apply the diff, getting only the delta
    const delta = updateDocWithMarkdown(
      Buffer.from(existingDoc.bin),
      markdown,
      docId
    );

    // Push only the delta to storage
    await this.storage.pushDocUpdates(workspaceId, docId, [delta], editorId);

    return { success: true };
  }
}
