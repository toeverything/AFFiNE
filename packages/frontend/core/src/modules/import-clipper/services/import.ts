import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { createBlockStdScope } from '@affine/core/blocksuite/manager/view';
import { EmbedOptionProvider } from '@blocksuite/affine/shared/services';
import { Text } from '@blocksuite/affine/store';
import { MarkdownTransformer } from '@blocksuite/affine/widgets/linked-doc';
import { Service } from '@toeverything/infra';

import { CollectionService } from '../../collection';
import { DocsService } from '../../doc';
import { GuardService } from '../../permissions';
import { TagService } from '../../tag';
import {
  getAFFiNEWorkspaceSchema,
  type Workspace,
  type WorkspaceMetadata,
  type WorkspacesService,
} from '../../workspace';
import { shareImportBlockIds } from './share-block-plan';
import {
  addShareBlocks,
  hasValidSharePlan,
  reconcileShareTitle,
  shareLeaves,
} from './share-blocks';
import {
  createShareImportReceipt,
  decideShareImportRecovery,
  serializeShareImportReceipt,
  shareImportReceiptPropertyId,
} from './share-import-receipt';
import type {
  ClipperInput,
  ShareDestinationOptions,
  ShareImportInput,
  ShareImportResult,
} from './share-import-types';
export type {
  ClipperInput,
  ShareDestinationOptions,
  ShareImportInput,
  ShareImportResult,
} from './share-import-types';

type WorkspaceVerification = 'confirmed' | 'missing' | 'unavailable';

export const maxShareAttachmentBytes = 64 * 1024 * 1024;

export class ImportClipperService extends Service {
  private readonly shareImportTails = new Map<string, Promise<void>>();

  constructor(private readonly workspacesService: WorkspacesService) {
    super();
  }

  async importShareToWorkspace(
    workspaceMetadata: WorkspaceMetadata,
    input: ShareImportInput,
    options: { allowOffline?: boolean } = {}
  ): Promise<ShareImportResult> {
    const key = JSON.stringify([
      workspaceMetadata.flavour,
      workspaceMetadata.id,
      input.documentId,
    ]);
    return this.enqueueShareImport(key, () =>
      this.importShareToWorkspaceUnlocked(workspaceMetadata, input, options)
    );
  }

  private async enqueueShareImport<T>(
    key: string,
    operation: () => Promise<T>
  ) {
    const previous = this.shareImportTails.get(key) ?? Promise.resolve();
    const settledPrevious = previous.catch(() => undefined);
    let releaseCurrent!: () => void;
    const current = new Promise<void>(resolve => {
      releaseCurrent = resolve;
    });
    const tail = settledPrevious.then(() => current);
    this.shareImportTails.set(key, tail);

    await settledPrevious;
    try {
      return await operation();
    } finally {
      releaseCurrent();
      if (this.shareImportTails.get(key) === tail) {
        this.shareImportTails.delete(key);
      }
    }
  }

  private async importShareToWorkspaceUnlocked(
    workspaceMetadata: WorkspaceMetadata,
    input: ShareImportInput,
    options: { allowOffline?: boolean } = {}
  ): Promise<ShareImportResult> {
    const allowOffline = options.allowOffline === true;
    const verification = allowOffline
      ? this.hasWorkspace(workspaceMetadata)
        ? 'confirmed'
        : 'missing'
      : await this.revalidateWorkspace(workspaceMetadata);
    if (verification === 'missing') {
      return { status: 'workspace-not-found' };
    }
    const currentMetadata = this.workspacesService.list.workspaces$.value.find(
      workspace =>
        workspace.id === workspaceMetadata.id &&
        workspace.flavour === workspaceMetadata.flavour
    );
    if (!currentMetadata) {
      return { status: 'workspace-not-found' };
    }

    const workspaceRef = this.workspacesService.open({
      metadata: currentMetadata,
    });
    if (!workspaceRef) {
      return { status: 'workspace-not-found' };
    }

    try {
      const { workspace } = workspaceRef;
      const docsService = workspace.scope.get(DocsService);
      const releaseReceiptPriority = workspace.engine.doc.addPriority(
        'db$docProperties',
        100
      );
      try {
        await workspace.engine.doc.waitForDocLoaded(workspace.id);
        await workspace.engine.doc.waitForDocLoaded('db$docProperties');
        if (
          !allowOffline &&
          workspace.meta.flavour !== 'local' &&
          (verification !== 'confirmed' ||
            !(await this.waitForInitialSync(workspace, [
              workspace.id,
              'db$docProperties',
            ])))
        ) {
          return { status: 'offline-confirmation-required' };
        }
      } finally {
        releaseReceiptPriority();
      }

      const persistedReceiptValue = docsService.getCustomPropertyById(
        input.documentId,
        shareImportReceiptPropertyId
      );
      const existingRecord = docsService.list.doc$(input.documentId).value;
      const recovery = decideShareImportRecovery({
        receiptValue: persistedReceiptValue,
        expectedAttemptId: input.importAttemptId,
        documentExists: !!existingRecord,
      });
      if (recovery === 'import-conflict') {
        return { status: 'import-conflict' };
      }
      if (recovery === 'committed-replay') {
        return { status: 'committed-replay', docId: input.documentId };
      }

      const guard = workspace.scope.get(GuardService);
      if (!(await guard.can('Workspace_CreateDoc'))) {
        return { status: 'permission-denied' };
      }

      const tagService = workspace.scope.get(TagService);
      const collectionService = workspace.scope.get(CollectionService);
      const validateDestination = () => {
        const tags = tagService.tagList.tags$.value;
        const missingTagIds = input.tagIds.filter(
          id => !tags.some(tag => tag.id === id)
        );
        const collectionMissing =
          !!input.collectionId &&
          !collectionService.collectionMetas$.value.some(
            collection => collection.id === input.collectionId
          );
        return missingTagIds.length > 0 || collectionMissing
          ? ({ status: 'destination-not-found', missingTagIds } as const)
          : undefined;
      };
      const initialDestinationError = validateDestination();
      if (
        initialDestinationError &&
        recovery === 'write-preparing-and-create'
      ) {
        return initialDestinationError;
      }

      const isAttachment =
        input.content.kind === 'image' || input.content.kind === 'pdf';
      if (isAttachment && !input.attachment) {
        return { status: 'attachment-missing' };
      }
      if (
        isAttachment &&
        input.attachment &&
        input.attachment.size > maxShareAttachmentBytes
      ) {
        return { status: 'attachment-too-large' };
      }

      let admittedAttachmentSourceId: string | undefined;
      if (isAttachment && input.attachment && !existingRecord) {
        try {
          admittedAttachmentSourceId =
            await workspace.docCollection.blobSync.set(input.attachment);
        } catch {
          return { status: 'attachment-write-failed' };
        }
      }

      if (recovery === 'write-preparing-and-create') {
        docsService.setCustomPropertyById(
          input.documentId,
          shareImportReceiptPropertyId,
          serializeShareImportReceipt(
            createShareImportReceipt({
              attemptId: input.importAttemptId,
            })
          )
        );
        await workspace.engine.doc.waitForUpdated('db$docProperties');
      }

      const record =
        existingRecord ??
        docsService.createDoc({
          id: input.documentId,
          primaryMode: 'page',
          skipInit: true,
        });
      const { doc, release } = docsService.open(record.id);
      try {
        await doc.waitForSyncReady();
        if (
          existingRecord &&
          !allowOffline &&
          workspace.meta.flavour !== 'local' &&
          !(await this.waitForInitialSync(workspace, [input.documentId]))
        ) {
          return { status: 'offline-confirmation-required' };
        }
        const ids = shareImportBlockIds(input.importAttemptId);
        const embedOptions =
          input.content.kind === 'url' && input.content.url
            ? createBlockStdScope(doc.blockSuiteDoc)
                .get(EmbedOptionProvider)
                .getEmbedBlockOptions(input.content.url)
            : null;
        const leaves = shareLeaves(input, embedOptions);
        if (
          !hasValidSharePlan(doc.blockSuiteDoc, ids, leaves, input.content.kind)
        ) {
          return { status: 'import-conflict' };
        }
        if (!doc.blockSuiteDoc.getBlock(ids.page)) {
          doc.blockSuiteDoc.addBlock('affine:page', {
            id: ids.page,
            title: new Text(''),
          });
        }
        if (!doc.blockSuiteDoc.getBlock(ids.surface)) {
          doc.blockSuiteDoc.addBlock(
            'affine:surface',
            { id: ids.surface },
            ids.page
          );
        }
        if (!doc.blockSuiteDoc.getBlock(ids.note)) {
          doc.blockSuiteDoc.addBlock('affine:note', { id: ids.note }, ids.page);
        }
        await workspace.engine.doc.waitForUpdated(input.documentId);

        if (
          !hasValidSharePlan(doc.blockSuiteDoc, ids, leaves, input.content.kind)
        ) {
          return { status: 'import-conflict' };
        }
        const attachmentId =
          input.content.kind === 'image' ? ids.image : ids.attachment;
        let sourceId = admittedAttachmentSourceId;
        if (
          isAttachment &&
          input.attachment &&
          !doc.blockSuiteDoc.getBlock(attachmentId) &&
          !sourceId
        ) {
          try {
            sourceId = await workspace.docCollection.blobSync.set(
              input.attachment
            );
          } catch {
            return { status: 'attachment-write-failed' };
          }
        }
        if (
          !hasValidSharePlan(doc.blockSuiteDoc, ids, leaves, input.content.kind)
        ) {
          return { status: 'import-conflict' };
        }
        addShareBlocks(doc.blockSuiteDoc, ids.note, leaves);
        if (
          sourceId &&
          input.attachment &&
          !doc.blockSuiteDoc.getBlock(attachmentId)
        ) {
          doc.blockSuiteDoc.addBlock(
            input.content.kind === 'image'
              ? 'affine:image'
              : 'affine:attachment',
            {
              id: attachmentId,
              sourceId,
              name: input.attachment.name,
              type: input.attachment.type,
              size: input.attachment.size,
              ...(input.content.kind === 'pdf'
                ? { embed: true, style: 'pdf' }
                : {}),
            },
            ids.note
          );
        }
        reconcileShareTitle(
          record,
          doc.blockSuiteDoc.getBlock(ids.page)?.model,
          input.title
        );
      } finally {
        release();
      }
      const currentDestinationError = validateDestination();
      const existingTagIds = new Set(record.meta$.value.tags ?? []);
      for (const tagId of new Set(input.tagIds)) {
        if (!existingTagIds.has(tagId)) {
          tagService.tagList.tagByTagId$(tagId).value?.tag(input.documentId);
        }
      }
      if (
        input.collectionId &&
        collectionService.collectionMetas$.value.some(
          collection => collection.id === input.collectionId
        )
      ) {
        collectionService.addDocToCollection(
          input.collectionId,
          input.documentId
        );
      }

      const syncIds = ['db$docProperties', workspace.id, input.documentId];
      for (const id of syncIds) {
        await workspace.engine.doc.waitForUpdated(id);
      }
      docsService.setCustomPropertyById(
        input.documentId,
        shareImportReceiptPropertyId,
        serializeShareImportReceipt(
          createShareImportReceipt({
            attemptId: input.importAttemptId,
            state: 'committed',
          })
        )
      );
      await workspace.engine.doc.waitForUpdated('db$docProperties');
      return {
        status: 'imported',
        docId: input.documentId,
        ...(currentDestinationError
          ? { warning: 'destination-not-found' as const }
          : {}),
      };
    } finally {
      workspaceRef.dispose();
    }
  }

  async getShareDestinationOptions(
    workspaceMetadata: WorkspaceMetadata
  ): Promise<ShareDestinationOptions | null> {
    const verification = await this.revalidateWorkspace(workspaceMetadata);
    if (verification === 'missing') return null;
    const currentMetadata = this.workspacesService.list.workspaces$.value.find(
      workspace =>
        workspace.id === workspaceMetadata.id &&
        workspace.flavour === workspaceMetadata.flavour
    );
    if (!currentMetadata) return null;

    const workspaceRef = this.workspacesService.open({
      metadata: currentMetadata,
    });
    if (!workspaceRef) return null;
    try {
      const { workspace } = workspaceRef;
      await workspace.engine.doc.waitForDocReady(workspace.id);
      const rootConfirmed =
        workspace.meta.flavour === 'local' ||
        (verification === 'confirmed' &&
          (await this.waitForInitialSync(workspace)));
      return {
        verification: rootConfirmed ? 'confirmed' : 'unavailable',
        tags: workspace.scope
          .get(TagService)
          .tagList.tagMetas$.value.map(tag => ({
            id: tag.id,
            name: tag.name,
            color: tag.color,
          })),
        collections: workspace.scope
          .get(CollectionService)
          .collectionMetas$.value.map(collection => ({
            id: collection.id,
            name: collection.name,
          })),
      };
    } finally {
      workspaceRef.dispose();
    }
  }

  private async revalidateWorkspace(
    metadata: WorkspaceMetadata
  ): Promise<WorkspaceVerification> {
    if (metadata.flavour === 'local') {
      return this.hasWorkspace(metadata) ? 'confirmed' : 'missing';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await this.workspacesService.list.waitForRevalidation(controller.signal);
      if (!this.hasWorkspace(metadata)) return 'missing';

      const provider =
        this.workspacesService.getWorkspaceFlavourProvider(metadata);
      if (!provider) return 'unavailable';
      const profile = await provider.getWorkspaceProfile(
        metadata.id,
        controller.signal
      );
      return profile ? 'confirmed' : 'missing';
    } catch {
      return this.hasWorkspace(metadata) ? 'unavailable' : 'missing';
    } finally {
      clearTimeout(timeout);
    }
  }

  private hasWorkspace(metadata: WorkspaceMetadata) {
    return this.workspacesService.list.workspaces$.value.some(
      workspace =>
        workspace.id === metadata.id && workspace.flavour === metadata.flavour
    );
  }

  private async waitForInitialSync(
    workspace: Workspace,
    docIds = [workspace.id]
  ) {
    const signal = AbortSignal.timeout(5000);
    const releasePriorities = docIds.map(id =>
      workspace.engine.doc.addPriority(id, 100)
    );
    try {
      await Promise.all(
        docIds.map(id => workspace.engine.doc.waitForSynced(id, signal))
      );
      return true;
    } catch {
      return false;
    } finally {
      for (const release of releasePriorities) release();
    }
  }

  async importToWorkspace(
    workspaceMetadata: WorkspaceMetadata,
    clipperInput: ClipperInput
  ) {
    const { workspace, dispose: disposeWorkspace } =
      this.workspacesService.open({
        metadata: workspaceMetadata,
      });
    await workspace.engine.doc.waitForDocReady(workspace.id); // wait for root doc ready
    const docId = await MarkdownTransformer.importMarkdownToDoc({
      collection: workspace.docCollection,
      schema: getAFFiNEWorkspaceSchema(),
      markdown: clipperInput.contentMarkdown,
      extensions: getStoreManager().config.init().value.get('store'),
    });
    const docsService = workspace.scope.get(DocsService);
    if (docId) {
      // only support page mode for now
      await docsService.changeDocTitle(docId, clipperInput.title);
      docsService.list.setPrimaryMode(docId, 'page');
      workspace.engine.doc.addPriority(workspace.id, 100);
      workspace.engine.doc.addPriority(docId, 100);
      await workspace.engine.doc.waitForSynced(workspace.id);
      await workspace.engine.doc.waitForSynced(docId);
      disposeWorkspace();
      return docId;
    } else {
      throw new Error('Failed to import doc');
    }
  }

  async importToNewWorkspace(
    flavour: string,
    workspaceName: string,
    clipperInput: ClipperInput
  ) {
    // oxlint-disable-next-line typescript/no-non-null-assertion
    let docId: string | undefined;
    const { id: workspaceId } = await this.workspacesService.create(
      flavour,
      async docCollection => {
        docCollection.meta.initialize();
        docCollection.doc.getMap('meta').set('name', workspaceName);
        docId = await MarkdownTransformer.importMarkdownToDoc({
          collection: docCollection,
          schema: getAFFiNEWorkspaceSchema(),
          markdown: clipperInput.contentMarkdown,
          extensions: getStoreManager().config.init().value.get('store'),
        });
      }
    );

    if (!docId) {
      throw new Error('Failed to import doc');
    }
    return { workspaceId, docId };
  }
}
