import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { createBlockStdScope } from '@affine/core/blocksuite/manager/view';
import {
  parseSharePreviewBlob,
  type SharePreviewRecord,
} from '@blocksuite/affine/model';
import { Text } from '@blocksuite/affine/store';
import { FileSizeLimitProvider } from '@blocksuite/affine/shared/services';
import { MarkdownTransformer } from '@blocksuite/affine/widgets/linked-doc';
import { Service } from '@toeverything/infra';

import { CollectionService } from '../../collection';
import { DocsService } from '../../doc';
import { GuardService } from '../../permissions';
import { TagService } from '../../tag';
import {
  getAFFiNEWorkspaceSchema,
  type WorkspaceMetadata,
  type WorkspacesService,
} from '../../workspace';
import {
  createShareBlockPlan,
  mergeShareDestinationMetadata,
  reconcileShareTitles,
  shareImportBlockIds,
  type ShareBlockPlanNode,
  validatesStableBlock,
} from './share-block-plan';
import {
  createShareImportReceipt,
  decideShareImportRecovery,
  serializeShareImportReceipt,
  shareImportReceiptPropertyId,
  shouldSynchronizeShareImport,
} from './share-import-receipt';

export interface ShareLinkPreview {
  url: string;
  title?: string;
  siteName?: string;
  description?: string;
  images?: string[];
  favicons?: string[];
  mediaType?: string;
  provider?: 'youtube' | 'x';
  author?: { name: string; handle?: string; avatar?: string };
  publishedAt?: string;
  durationSeconds?: number;
  transcript?: {
    language?: string;
    segments: {
      text: string;
      startSeconds?: number;
      durationSeconds?: number;
      speaker?: string;
    }[];
    chapters?: { title: string; startSeconds: number }[];
    truncated?: boolean;
  };
  authorizeDetailsWrite?: (signal: AbortSignal) => Promise<boolean>;
}

export interface ClipperInput {
  title: string;
  contentMarkdown: string;
  contentHtml: string;
  attachments: Record<string, Blob>;
  workspace?: 'select-by-user' | 'last-open-workspace';
}

export interface ShareImportInput {
  documentId: string;
  importAttemptId: string;
  title: string;
  content: {
    kind: 'url' | 'text' | 'image' | 'pdf';
    url?: string;
    text?: string;
  };
  preview?: ShareLinkPreview;
  attachment?: File;
  tagIds: string[];
  collectionId?: string;
}

export type ShareImportResult =
  | { status: 'imported'; docId: string }
  | { status: 'committed-replay'; docId: string }
  | { status: 'import-conflict' }
  | {
      status:
        | 'workspace-not-found'
        | 'permission-denied'
        | 'destination-not-found'
        | 'offline-confirmation-required'
        | 'attachment-missing'
        | 'attachment-too-large';
      missingTagIds?: string[];
    };

export interface ShareDestinationOptions {
  verification: 'confirmed' | 'unavailable';
  tags: { id: string; name: string; color: string }[];
  collections: { id: string; name: string }[];
}

type WorkspaceVerification = 'confirmed' | 'missing' | 'unavailable';

export const maxShareAttachmentBytes = 64 * 1024 * 1024;
const SHARE_PREVIEW_AUTHORIZATION_TIMEOUT_MS = 1200;

export function createShareMarkdown(input: ShareImportInput) {
  const parts: string[] = [];
  if (input.content.kind === 'image') {
    if (input.content.text) {
      parts.push(escapeMarkdown(input.content.text));
    }
    if (input.content.url) {
      parts.push(`[Source](<${input.content.url}>)`);
    }
  } else if (input.content.kind === 'text' && input.content.text) {
    parts.push(escapeMarkdown(input.content.text));
  }
  return parts.join('\n\n');
}

export function createCompatibilityShareBlockPlan(input: ShareImportInput) {
  const preview = input.preview
    ? { ...input.preview, transcript: undefined }
    : undefined;
  return createShareBlockPlan({ ...input, preview }, null);
}

async function createSharePreviewDetailsBlob(
  input: ShareImportInput
): Promise<Blob | undefined> {
  if (
    input.content.kind !== 'url' ||
    !input.content.url ||
    !input.preview?.authorizeDetailsWrite
  ) {
    return undefined;
  }
  const preview = input.preview;
  const record: SharePreviewRecord = {
    version: 1,
    sourceUrl: input.content.url,
    title: preview.title,
    description: preview.description,
    image: preview.images?.[0],
    provider: preview.provider,
    durationSeconds: preview.durationSeconds,
    transcript: preview.transcript,
  };
  const blob = new Blob([JSON.stringify(record)], {
    type: 'application/json',
  });
  try {
    await parseSharePreviewBlob(blob);
    return blob;
  } catch {
    return undefined;
  }
}

async function authorizeSharePreviewDetails(
  authorize: NonNullable<ShareLinkPreview['authorizeDetailsWrite']>
) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const authorization = Promise.resolve()
    .then(() => authorize(controller.signal))
    .then(
      authorized => authorized && !controller.signal.aborted,
      () => false
    );
  const expiration = new Promise<false>(resolve => {
    timeout = setTimeout(() => {
      controller.abort();
      resolve(false);
    }, SHARE_PREVIEW_AUTHORIZATION_TIMEOUT_MS);
  });
  try {
    return await Promise.race([authorization, expiration]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function escapeMarkdown(value: string) {
  return value.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&');
}

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
      await workspace.engine.doc.waitForDocReady(workspace.id);
      const rootSynced =
        allowOffline ||
        workspace.meta.flavour === 'local' ||
        (verification === 'confirmed' &&
          (await this.waitForRootSync(workspace)));
      if (!rootSynced && !options.allowOffline) {
        return { status: 'offline-confirmation-required' };
      }

      const docsService = workspace.scope.get(DocsService);
      const shouldSync = shouldSynchronizeShareImport({
        isLocal: workspace.meta.flavour === 'local',
        verification,
        allowOffline,
      });
      workspace.engine.doc.addPriority('db$docProperties', 100);
      await workspace.engine.doc.waitForDocLoaded('db$docProperties');
      if (shouldSync) {
        await workspace.engine.doc.waitForSynced('db$docProperties');
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
      const tags = tagService.tagList.tags$.value;
      const missingTagIds = input.tagIds.filter(
        id => !tags.some(tag => tag.id === id)
      );
      const collectionService = workspace.scope.get(CollectionService);
      if (
        missingTagIds.length > 0 ||
        (input.collectionId &&
          !collectionService.collectionMetas$.value.some(
            collection => collection.id === input.collectionId
          ))
      ) {
        return { status: 'destination-not-found', missingTagIds };
      }

      const isAttachment =
        input.content.kind === 'image' || input.content.kind === 'pdf';
      if (isAttachment && !input.attachment) {
        return { status: 'attachment-missing' };
      }
      if (input.content.kind === 'pdf' && input.attachment) {
        if (input.attachment.size > maxShareAttachmentBytes) {
          return { status: 'attachment-too-large' };
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
        if (shouldSync) {
          await workspace.engine.doc.waitForSynced('db$docProperties');
        }
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
        if (input.content.kind === 'pdf' && input.attachment) {
          const std = this.createShareImportBlockStdScope(doc.blockSuiteDoc);
          try {
            const fileSizeLimit = std.get(FileSizeLimitProvider);
            if (input.attachment.size > fileSizeLimit.maxFileSize) {
              fileSizeLimit.onOverFileSize?.();
              return { status: 'attachment-too-large' };
            }
          } finally {
            std.unmount();
          }
        }
        const ids = shareImportBlockIds(input.importAttemptId);
        if (
          !this.hasOnlyMatchingSkeleton(doc.blockSuiteDoc, ids) ||
          !this.ensureBlock(doc.blockSuiteDoc, ids.page, 'affine:page') ||
          !this.ensureBlock(
            doc.blockSuiteDoc,
            ids.surface,
            'affine:surface',
            ids.page
          ) ||
          !this.ensureBlock(
            doc.blockSuiteDoc,
            ids.note,
            'affine:note',
            ids.page
          )
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

        const leaves = this.shareLeaves(input);
        if (!this.ensurePlan(doc.blockSuiteDoc, leaves, ids.note)) {
          return { status: 'import-conflict' };
        }
        const imageId = ids.image;
        if (
          input.content.kind === 'image' &&
          !this.ensureBlock(
            doc.blockSuiteDoc,
            imageId,
            'affine:image',
            ids.note
          )
        ) {
          return { status: 'import-conflict' };
        }
        const attachmentId = ids.attachment;
        if (
          input.content.kind === 'pdf' &&
          !this.ensureBlock(
            doc.blockSuiteDoc,
            attachmentId,
            'affine:attachment',
            ids.note
          )
        ) {
          return { status: 'import-conflict' };
        }

        let sharePreviewSourceId: string | undefined;
        if (!doc.blockSuiteDoc.getBlock(ids.bookmark)) {
          const detailsBlob = await createSharePreviewDetailsBlob(input);
          if (
            detailsBlob &&
            input.preview?.authorizeDetailsWrite &&
            !doc.blockSuiteDoc.getBlock(ids.bookmark)
          ) {
            const authorized = await authorizeSharePreviewDetails(
              input.preview.authorizeDetailsWrite
            );
            if (authorized && !doc.blockSuiteDoc.getBlock(ids.bookmark)) {
              try {
                sharePreviewSourceId =
                  await workspace.docCollection.blobSync.set(detailsBlob);
              } catch {
                // Blob write failures preserve the ordinary bookmark fallback.
              }
            }
          }
        }

        let imageSourceId: string | undefined;
        if (
          input.content.kind === 'image' &&
          input.attachment &&
          !doc.blockSuiteDoc.getBlock(imageId)
        ) {
          imageSourceId = await workspace.docCollection.blobSync.set(
            input.attachment
          );
        }
        let attachmentSourceId: string | undefined;
        if (
          input.content.kind === 'pdf' &&
          input.attachment &&
          !doc.blockSuiteDoc.getBlock(attachmentId)
        ) {
          attachmentSourceId = await workspace.docCollection.blobSync.set(
            input.attachment
          );
        }
        if (sharePreviewSourceId) {
          const bookmark = leaves.find(node => node.id === ids.bookmark);
          if (bookmark) {
            bookmark.props.sharePreviewSourceId = sharePreviewSourceId;
            bookmark.props.sharePreviewVersion = 1;
          }
        }
        this.addShareBlocks(doc.blockSuiteDoc, ids.note, leaves);
        if (imageSourceId && !doc.blockSuiteDoc.getBlock(imageId)) {
          doc.blockSuiteDoc.addBlock(
            'affine:image',
            {
              id: imageId,
              sourceId: imageSourceId,
              name: input.attachment?.name ?? 'Shared image',
              type: input.attachment?.type ?? '',
              size: input.attachment?.size ?? 0,
            },
            ids.note
          );
        }
        if (attachmentSourceId && !doc.blockSuiteDoc.getBlock(attachmentId)) {
          doc.blockSuiteDoc.addBlock(
            'affine:attachment',
            {
              id: attachmentId,
              sourceId: attachmentSourceId,
              name: input.attachment?.name ?? 'Shared PDF',
              type: input.attachment?.type ?? 'application/pdf',
              size: input.attachment?.size ?? 0,
              embed: false,
            },
            ids.note
          );
        }
        this.reconcileShareTitle(
          record,
          doc.blockSuiteDoc.getBlock(ids.page)?.model,
          input.title
        );
      } finally {
        release();
      }
      const existingTagIds = new Set(record.meta$.value.tags ?? []);
      const metadata = mergeShareDestinationMetadata({
        existingTagIds,
        requestedTagIds: input.tagIds,
        existingCollectionIds: [],
        requestedCollectionId: input.collectionId,
      });
      for (const tagId of metadata.tagIds) {
        if (!existingTagIds.has(tagId)) {
          tagService.tagList.tagByTagId$(tagId).value?.tag(input.documentId);
        }
      }
      if (
        input.collectionId &&
        metadata.collectionIds.has(input.collectionId)
      ) {
        collectionService.addDocToCollection(
          input.collectionId,
          input.documentId
        );
      }

      const syncIds = ['db$docProperties', workspace.id, input.documentId];
      for (const id of syncIds) {
        workspace.engine.doc.addPriority(id, 100);
        await workspace.engine.doc.waitForUpdated(id);
      }
      if (shouldSync) {
        await Promise.all(
          syncIds.map(id => workspace.engine.doc.waitForSynced(id))
        );
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
      for (const id of syncIds) {
        await workspace.engine.doc.waitForUpdated(id);
      }
      if (shouldSync) {
        await Promise.all(
          syncIds.map(id => workspace.engine.doc.waitForSynced(id))
        );
      }
      return { status: 'imported', docId: input.documentId };
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
          (await this.waitForRootSync(workspace)));
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

  protected createShareImportBlockStdScope(
    store: Parameters<typeof createBlockStdScope>[0]
  ) {
    return createBlockStdScope(store);
  }

  private addShareBlocks(
    store: Parameters<typeof createBlockStdScope>[0],
    parentId: string,
    nodes: ShareBlockPlanNode[]
  ) {
    for (const node of nodes) {
      const props = Object.fromEntries(
        Object.entries(node.props)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [
            key,
            key === 'text' ? new Text(value as string) : value,
          ])
      );
      const blockId = store.getBlock(node.id)
        ? node.id
        : store.addBlock(node.flavour, { id: node.id, ...props }, parentId);
      if (node.children) {
        this.addShareBlocks(store, blockId, node.children);
      }
    }
  }

  private shareLeaves(input: ShareImportInput): ShareBlockPlanNode[] {
    if (input.content.kind === 'url') {
      return createCompatibilityShareBlockPlan(input);
    }
    const nodes: ShareBlockPlanNode[] = [];
    const selectedText = input.content.text?.trim();
    if (selectedText) {
      nodes.push({
        id: shareImportBlockIds(input.importAttemptId).selectedText,
        flavour: 'affine:paragraph',
        props: { type: 'quote', text: selectedText },
      });
    }
    if (input.content.url) {
      nodes.push({
        id: shareImportBlockIds(input.importAttemptId).sourceLink,
        flavour: 'affine:bookmark',
        props: {
          url: input.content.url,
          title: input.title.trim() || new URL(input.content.url).hostname,
          style: 'horizontal',
        },
      });
    }
    return nodes;
  }

  private ensurePlan(
    store: Parameters<typeof createBlockStdScope>[0],
    nodes: ShareBlockPlanNode[],
    parentId: string
  ): boolean {
    return nodes.every(node => {
      if (!this.ensureBlock(store, node.id, node.flavour, parentId)) {
        return false;
      }
      return node.children
        ? this.ensurePlan(store, node.children, node.id)
        : true;
    });
  }

  private ensureBlock(
    store: Parameters<typeof createBlockStdScope>[0],
    id: string,
    flavour: string,
    parentId?: string
  ) {
    const existing = store.getBlock(id)?.model;
    return validatesStableBlock(
      existing && {
        flavour: existing.flavour,
        parentId: existing.parent?.id,
      },
      { flavour, parentId }
    );
  }

  private hasOnlyMatchingSkeleton(
    store: Parameters<typeof createBlockStdScope>[0],
    ids: ReturnType<typeof shareImportBlockIds>
  ) {
    return (
      this.hasOnlyBlock(store, 'affine:page', ids.page) &&
      this.hasOnlyBlock(store, 'affine:surface', ids.surface) &&
      this.hasOnlyBlock(store, 'affine:note', ids.note)
    );
  }

  private hasOnlyBlock(
    store: Parameters<typeof createBlockStdScope>[0],
    flavour: string,
    id: string
  ) {
    return store.getBlocksByFlavour(flavour).every(block => block.id === id);
  }

  private reconcileShareTitle(
    record: {
      meta$: { value: { title?: string } };
      setMeta(meta: { title: string }): void;
    },
    page: { props: { title?: Text } } | undefined,
    importTitle: string
  ) {
    if (!page?.props.title) return;
    const rootTitle = record.meta$.value.title ?? '';
    const pageTitle = page.props.title.toString();
    const next = reconcileShareTitles({ rootTitle, pageTitle, importTitle });
    if (next.rootTitle !== rootTitle) record.setMeta({ title: next.rootTitle });
    if (next.pageTitle !== pageTitle) {
      page.props.title.delete(0, page.props.title.length);
      page.props.title.insert(next.pageTitle, 0);
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

  private async waitForRootSync(workspace: {
    id: string;
    engine: { doc: { waitForSynced(id: string): Promise<unknown> } };
  }) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        workspace.engine.doc.waitForSynced(workspace.id),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Sync timed out')), 5000);
        }),
      ]);
      return true;
    } catch {
      return false;
    } finally {
      if (timeout) clearTimeout(timeout);
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
