import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { nanoid } from 'nanoid';

import { EventBus, metrics, Mutex } from '../../base';
import {
  addDocToRootDoc,
  createDocWithMarkdown,
  extractDocRecoveryFacts,
  isOrdinaryWorkspaceDoc,
  mergeUpdates,
  migrateRootDocPages,
  updateDocProperties,
  updateDocTitle,
  updateDocWithMarkdown,
  updateExistingRootDocMetaTitle,
} from '../../native';
import {
  backendRuntimeErrorCode,
  BackendRuntimeProvider,
} from '../backend-runtime';
import { PgWorkspaceDocStorageAdapter } from './adapters/workspace';
import type { DocRecord } from './storage';

export interface CreateDocResult {
  docId: string;
}

export class DocCreateIncompleteError extends Error {
  readonly docId: string;

  constructor(docId: string, cause: unknown) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    super(
      `Document ${docId} created, but workspace registration failed: ${causeMessage}; retry with docId="${docId}" to finish registration`,
      { cause }
    );
    this.name = 'DocCreateIncompleteError';
    this.docId = docId;
  }
}

export interface UpdateDocResult {
  success: boolean;
}

declare global {
  interface Events {
    'doc.updates.pushed': {
      spaceType: 'workspace' | 'userspace';
      spaceId: string;
      docId: string;
      updates: Uint8Array[];
      timestamp: number;
      editor?: string;
    };
  }
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isRevisionConflict = (error: unknown) =>
  backendRuntimeErrorCode(error) === 'doc_revision_conflict' ||
  errorMessage(error).includes('doc_revision_conflict');

const sleepBackoff = (attempt: number) =>
  new Promise<void>(resolve =>
    setTimeout(resolve, 10 + attempt * 15 + Math.floor(Math.random() * 20))
  );

@Injectable()
export class DocWriter {
  private readonly logger = new Logger(DocWriter.name);

  constructor(
    private readonly storage: PgWorkspaceDocStorageAdapter,
    private readonly event: EventBus,
    private readonly runtime: BackendRuntimeProvider,
    @Optional() private readonly mutex?: Mutex
  ) {}

  /**
   * Creates a new document from markdown content.
   *
   * @param workspaceId - The workspace ID
   * @param title - The document title
   * @param markdown - The markdown content (body only)
   * @param editorId - Actor user ID
   * @returns The created document ID
   */
  async createDoc(
    workspaceId: string,
    title: string,
    markdown: string,
    editorId: string
  ): Promise<CreateDocResult> {
    const docId = nanoid();

    this.logger.debug(
      `Creating doc ${docId} in workspace ${workspaceId} from markdown`
    );

    // Convert markdown to y-octo binary using the provided title
    const binary = createDocWithMarkdown(title, markdown, docId, {
      actorUserId: editorId,
      timestampMs: Date.now(),
    });

    const { timestamp: docTimestamp } = await this.storage.pushDocUpdates(
      workspaceId,
      docId,
      [binary],
      editorId,
      undefined,
      'create_doc'
    );
    this.emitDocUpdatesPushed({
      spaceId: workspaceId,
      docId,
      updates: [binary],
      timestamp: docTimestamp,
      editor: editorId,
    });

    try {
      await this.updateDocProperties(
        workspaceId,
        docId,
        {
          createdBy: editorId,
          updatedBy: editorId,
        },
        editorId
      );

      if (!(await this.runtime.getWorkspaceLifecycleActiveV1())) {
        await this.registerDocInRootDoc(workspaceId, docId, title, editorId);
      }
    } catch (error) {
      throw new DocCreateIncompleteError(docId, error);
    }

    this.logger.debug(`Created doc ${docId} in workspace ${workspaceId}`);

    return { docId };
  }

  /**
   * Idempotently completes properties & root-doc registration for an already-persisted
   * document whose creation failed partway through. Never creates new document content
   * and never overwrites existing `createdBy` / `updatedBy` metadata.
   */
  async recoverDocCreation(
    workspaceId: string,
    docId: string,
    fallbackTitle: string,
    actorUserId: string
  ): Promise<CreateDocResult> {
    const normalizedId = docId.trim();
    if (!normalizedId || !isOrdinaryWorkspaceDoc(workspaceId, normalizedId)) {
      throw new BadRequestException(`Invalid document ID: ${docId}`);
    }

    const existing = await this.storage.getDoc(workspaceId, normalizedId);
    if (!existing?.bin || this.storage.isEmptyBin(existing.bin)) {
      throw new NotFoundException(`Document ${normalizedId} not found`);
    }

    const toBuffer = (bin: Uint8Array) =>
      Buffer.isBuffer(bin)
        ? bin
        : Buffer.from(bin.buffer, bin.byteOffset, bin.byteLength);

    const docBuffer = toBuffer(existing.bin);
    const propertiesDocId = `db$${workspaceId}$docProperties`;
    const traceableCreator =
      existing.creator ??
      (await this.runtime.getWorkspaceDocCreatorV1?.(
        workspaceId,
        normalizedId
      )) ??
      undefined;
    const maxAttempts = 16;

    try {
      let persistedTitle = '';
      let propertiesSynced = false;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const propertiesDoc = await this.storage.getDoc(
          workspaceId,
          propertiesDocId
        );
        const expectedPropsTs = propertiesDoc?.timestamp ?? 0;
        const facts = extractDocRecoveryFacts(
          docBuffer,
          propertiesDoc?.bin ? toBuffer(propertiesDoc.bin) : undefined,
          normalizedId
        );
        persistedTitle = facts.title;

        const missingCreatedBy = facts.existingCreatedBy
          ? undefined
          : traceableCreator;
        const missingUpdatedBy = facts.existingUpdatedBy
          ? undefined
          : (existing.editor ?? traceableCreator);

        if (!missingCreatedBy && !missingUpdatedBy) {
          propertiesSynced = true;
          break;
        }

        try {
          await this.updateDocProperties(
            workspaceId,
            normalizedId,
            {
              createdBy: missingCreatedBy,
              updatedBy: missingUpdatedBy,
            },
            actorUserId,
            propertiesDoc,
            expectedPropsTs
          );
          propertiesSynced = true;
          break;
        } catch (error) {
          if (isRevisionConflict(error)) {
            await sleepBackoff(attempt);
            continue;
          }
          throw error;
        }
      }

      if (!propertiesSynced) {
        throw new Error(
          `Failed to update properties for doc ${normalizedId} in workspace ${workspaceId} after ${maxAttempts} CAS attempts`
        );
      }

      if (!(await this.runtime.getWorkspaceLifecycleActiveV1())) {
        await this.registerDocInRootDoc(
          workspaceId,
          normalizedId,
          persistedTitle || fallbackTitle,
          actorUserId
        );
      }
    } catch (error) {
      throw new DocCreateIncompleteError(normalizedId, error);
    }

    return { docId: normalizedId };
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
   * @param editorId - Actor user ID
   */
  async updateDoc(
    workspaceId: string,
    docId: string,
    markdown: string,
    editorId: string
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
    const delta = updateDocWithMarkdown(existingBinary, markdown, docId, {
      actorUserId: editorId,
      timestampMs: Date.now(),
    });

    // Push only the delta changes
    const { timestamp } = await this.storage.pushDocUpdates(
      workspaceId,
      docId,
      [delta],
      editorId
    );
    this.emitDocUpdatesPushed({
      spaceId: workspaceId,
      docId,
      updates: [delta],
      timestamp,
      editor: editorId,
    });

    await this.updateDocProperties(
      workspaceId,
      docId,
      { updatedBy: editorId },
      editorId
    );

    return { success: true };
  }

  /**
   * Updates document metadata (currently title only).
   *
   * @param workspaceId - The workspace ID
   * @param docId - The document ID to update
   * @param meta - Metadata updates
   * @param editorId - Actor user ID
   */
  async updateDocMeta(
    workspaceId: string,
    docId: string,
    meta: { title?: string },
    editorId: string
  ): Promise<UpdateDocResult> {
    if (meta.title === undefined) {
      throw new Error('No metadata provided');
    }

    this.logger.debug(`Updating doc meta ${docId} in workspace ${workspaceId}`);

    const existingDoc = await this.storage.getDoc(workspaceId, docId);
    if (!existingDoc?.bin) {
      throw new NotFoundException(`Document ${docId} not found`);
    }

    const existingBinary = Buffer.isBuffer(existingDoc.bin)
      ? existingDoc.bin
      : Buffer.from(
          existingDoc.bin.buffer,
          existingDoc.bin.byteOffset,
          existingDoc.bin.byteLength
        );
    const titleUpdate = updateDocTitle(existingBinary, meta.title, docId);
    if (!this.storage.isEmptyBin(titleUpdate)) {
      const { timestamp: docTimestamp } = await this.storage.pushDocUpdates(
        workspaceId,
        docId,
        [titleUpdate],
        editorId
      );
      this.emitDocUpdatesPushed({
        spaceId: workspaceId,
        docId,
        updates: [titleUpdate],
        timestamp: docTimestamp,
        editor: editorId,
      });
    }

    await this.updateDocProperties(
      workspaceId,
      docId,
      { updatedBy: editorId },
      editorId
    );

    if (!(await this.runtime.getWorkspaceLifecycleActiveV1())) {
      const root = await this.storage.getDoc(workspaceId, workspaceId);
      if (root) {
        const update = updateExistingRootDocMetaTitle(
          Buffer.from(
            root.bin.buffer,
            root.bin.byteOffset,
            root.bin.byteLength
          ),
          docId,
          meta.title
        );
        if (update && !this.storage.isEmptyBin(update)) {
          const { timestamp } = await this.storage.pushDocUpdates(
            workspaceId,
            workspaceId,
            [update],
            editorId
          );
          this.emitDocUpdatesPushed({
            spaceId: workspaceId,
            docId: workspaceId,
            updates: [update],
            timestamp,
            editor: editorId,
          });
        }
      }
    }

    return { success: true };
  }

  async registerDocInRootDoc(
    workspaceId: string,
    docId: string,
    title: string,
    editorId: string
  ) {
    const toRootBuffer = (bin?: Uint8Array) =>
      bin
        ? Buffer.from(bin.buffer, bin.byteOffset, bin.byteLength)
        : Buffer.from([0, 0]);

    const maxAttempts = 16;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const root = await this.storage.getDoc(workspaceId, workspaceId);
      const expectedTs = root?.timestamp ?? 0;
      const rootBin = toRootBuffer(root?.bin);

      let directUpdate: Uint8Array | null = null;
      let needsMigration = false;
      try {
        directUpdate = addDocToRootDoc(rootBin, docId, title);
      } catch (error) {
        if (!errorMessage(error).includes('invalid_root_shape')) {
          throw error;
        }
        needsMigration = true;
      }

      if (!needsMigration) {
        if (!directUpdate || this.storage.isEmptyBin(directUpdate)) {
          return;
        }
        try {
          const { timestamp } = await this.storage.pushDocUpdates(
            workspaceId,
            workspaceId,
            [directUpdate],
            editorId,
            undefined,
            'update_doc',
            undefined,
            expectedTs
          );
          this.emitDocUpdatesPushed({
            spaceId: workspaceId,
            docId: workspaceId,
            updates: [directUpdate],
            timestamp,
            editor: editorId,
          });
          return;
        } catch (error) {
          if (isRevisionConflict(error)) {
            await sleepBackoff(attempt);
            continue;
          }
          throw error;
        }
      }

      const executeMigration = async (): Promise<'done' | 'retry'> => {
        const latestRoot = await this.storage.getDoc(workspaceId, workspaceId);
        const latestExpectedTs = latestRoot?.timestamp ?? 0;
        const latestBin = toRootBuffer(latestRoot?.bin);

        let batch: Uint8Array[];
        try {
          const migrationUpdate = latestRoot?.bin
            ? migrateRootDocPages(latestBin)
            : null;
          const effectiveMigration =
            migrationUpdate && !this.storage.isEmptyBin(migrationUpdate)
              ? migrationUpdate
              : null;
          const postMigrationBin = effectiveMigration
            ? mergeUpdates([latestBin, effectiveMigration])
            : latestBin;
          const addUpdate = addDocToRootDoc(postMigrationBin, docId, title);
          batch = [
            ...(effectiveMigration ? [effectiveMigration] : []),
            ...(this.storage.isEmptyBin(addUpdate) ? [] : [addUpdate]),
          ];
        } catch (migrationError) {
          const msg = errorMessage(migrationError);
          if (!msg.includes('invalid_root_shape')) {
            throw migrationError;
          }
          metrics.doc.counter('root_doc_register_skipped').add(1);
          this.logger.warn(
            `Skipped registering doc ${docId} in root doc for workspace ${workspaceId} after migration fallback failed: ${msg}`
          );
          return 'done';
        }

        if (batch.length === 0) {
          return 'done';
        }

        try {
          const { timestamp } = await this.storage.pushDocUpdates(
            workspaceId,
            workspaceId,
            batch,
            editorId,
            undefined,
            'update_doc',
            undefined,
            latestExpectedTs
          );
          this.emitDocUpdatesPushed({
            spaceId: workspaceId,
            docId: workspaceId,
            updates: batch,
            timestamp,
            editor: editorId,
          });
          return 'done';
        } catch (pushError) {
          if (isRevisionConflict(pushError)) {
            return 'retry';
          }
          throw pushError;
        }
      };

      let outcome: 'done' | 'retry';
      if (this.mutex) {
        await using lock = await this.mutex.acquire(
          `doc:root-migration:${workspaceId}`
        );
        if (!lock) {
          await sleepBackoff(attempt);
          continue;
        }
        outcome = await executeMigration();
      } else {
        outcome = await executeMigration();
      }
      if (outcome === 'done') {
        return;
      }
      await sleepBackoff(attempt);
    }

    throw new Error(
      `Failed to register doc ${docId} in root doc for workspace ${workspaceId} after ${maxAttempts} CAS attempts`
    );
  }

  private emitDocUpdatesPushed(payload: {
    spaceId: string;
    docId: string;
    updates: Uint8Array[];
    timestamp: number;
    editor?: string;
  }) {
    this.event.emit('doc.updates.pushed', {
      spaceType: 'workspace',
      spaceId: payload.spaceId,
      docId: payload.docId,
      updates: payload.updates,
      timestamp: payload.timestamp,
      editor: payload.editor,
    });
  }

  private async updateDocProperties(
    workspaceId: string,
    docId: string,
    props: { createdBy?: string; updatedBy?: string },
    editorId: string,
    preloadedPropertiesDoc?: DocRecord | null,
    expectedCurrentTimestamp?: number
  ) {
    if (!isOrdinaryWorkspaceDoc(workspaceId, docId)) {
      return;
    }
    if (!props.createdBy && !props.updatedBy) {
      return;
    }

    const propertiesDocId = `db$${workspaceId}$docProperties`;
    const existingDoc =
      preloadedPropertiesDoc !== undefined
        ? preloadedPropertiesDoc
        : await this.storage.getDoc(workspaceId, propertiesDocId);
    const existingBinary = existingDoc?.bin
      ? Buffer.isBuffer(existingDoc.bin)
        ? existingDoc.bin
        : Buffer.from(
            existingDoc.bin.buffer,
            existingDoc.bin.byteOffset,
            existingDoc.bin.byteLength
          )
      : Buffer.alloc(0);

    const update = updateDocProperties(
      existingBinary,
      propertiesDocId,
      docId,
      props.createdBy,
      props.updatedBy
    );
    if (this.storage.isEmptyBin(update)) {
      return;
    }

    const timestamp = await this.storage.pushDocUpdatesTrusted(
      workspaceId,
      propertiesDocId,
      [update],
      editorId,
      expectedCurrentTimestamp
    );
    this.emitDocUpdatesPushed({
      spaceId: workspaceId,
      docId: propertiesDocId,
      updates: [update],
      timestamp,
      editor: editorId,
    });
  }
}
