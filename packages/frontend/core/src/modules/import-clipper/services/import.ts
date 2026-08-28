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
  type WorkspaceMetadata,
  type WorkspacesService,
} from '../../workspace';
import {
  createShareBlockPlan,
  type ShareBlockPlanNode,
} from './share-block-plan';

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
  title: string;
  content: {
    kind: 'url' | 'text' | 'image';
    url?: string;
    text?: string;
  };
  preview?: ShareLinkPreview;
  attachmentUrl?: string;
  tagIds: string[];
  collectionId?: string;
}

export type ShareImportResult =
  | { status: 'imported'; docId: string }
  | {
      status:
        | 'workspace-not-found'
        | 'permission-denied'
        | 'destination-not-found'
        | 'offline-confirmation-required';
      missingTagIds?: string[];
    };

export interface ShareDestinationOptions {
  verification: 'confirmed' | 'unavailable';
  tags: { id: string; name: string; color: string }[];
  collections: { id: string; name: string }[];
}

type WorkspaceVerification = 'confirmed' | 'missing' | 'unavailable';

export function createShareMarkdown(input: ShareImportInput) {
  const parts: string[] = [];
  if (input.content.kind === 'image') {
    if (input.attachmentUrl) {
      parts.push(`![Shared image](<${input.attachmentUrl}>)`);
    }
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

function escapeMarkdown(value: string) {
  return value.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&');
}

export class ImportClipperService extends Service {
  constructor(private readonly workspacesService: WorkspacesService) {
    super();
  }

  async importShareToWorkspace(
    workspaceMetadata: WorkspaceMetadata,
    input: ShareImportInput,
    options: { allowOffline?: boolean } = {}
  ): Promise<ShareImportResult> {
    const verification = await this.revalidateWorkspace(workspaceMetadata);
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
        workspace.meta.flavour === 'local' ||
        (verification === 'confirmed' &&
          (await this.waitForRootSync(workspace)));
      if (!rootSynced && !options.allowOffline) {
        return { status: 'offline-confirmation-required' };
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

      const docsService = workspace.scope.get(DocsService);
      let record = docsService.list.doc$(input.documentId).value;
      if (!record) {
        record = docsService.createDoc({
          id: input.documentId,
          primaryMode: 'page',
        });
      }
      const { doc, release } = docsService.open(record.id);
      try {
        await doc.waitForSyncReady();
        const page = doc.blockSuiteDoc.getBlocksByFlavour('affine:page')[0];
        if (!page) {
          throw new Error('Failed to initialize shared doc');
        }
        page.model.children.forEach(child => {
          doc.blockSuiteDoc.deleteBlock(child);
        });
        const noteId = doc.blockSuiteDoc.addBlock('affine:note', {}, page.id);
        if (input.content.kind === 'url' && input.content.url) {
          const embedOptions = createBlockStdScope(doc.blockSuiteDoc)
            .get(EmbedOptionProvider)
            .getEmbedBlockOptions(input.content.url);
          this.addShareBlocks(
            doc.blockSuiteDoc,
            noteId,
            createShareBlockPlan(input, embedOptions)
          );
        }
        const markdown = createShareMarkdown(input);
        if (markdown) {
          await MarkdownTransformer.importMarkdownToBlock({
            doc: doc.blockSuiteDoc,
            blockId: noteId,
            markdown,
            extensions: getStoreManager().config.init().value.get('store'),
          });
        }
      } finally {
        release();
      }
      await docsService.changeDocTitle(input.documentId, input.title);
      const existingTagIds = new Set(record.meta$.value.tags ?? []);
      const selectedTagIds = new Set(input.tagIds);
      for (const tagId of existingTagIds) {
        if (!selectedTagIds.has(tagId)) {
          tagService.tagList.tagByTagId$(tagId).value?.untag(input.documentId);
        }
      }
      for (const tagId of input.tagIds) {
        if (!existingTagIds.has(tagId)) {
          tagService.tagList.tagByTagId$(tagId).value?.tag(input.documentId);
        }
      }
      for (const collection of collectionService.collections$.value.values()) {
        if (
          collection.id !== input.collectionId &&
          collection.allowList$.value.includes(input.documentId)
        ) {
          collectionService.removeDocFromCollection(
            collection.id,
            input.documentId
          );
        }
      }
      if (input.collectionId) {
        collectionService.addDocToCollection(
          input.collectionId,
          input.documentId
        );
      }

      workspace.engine.doc.addPriority(workspace.id, 100);
      workspace.engine.doc.addPriority(input.documentId, 100);
      await Promise.all([
        workspace.engine.doc.waitForSynced(workspace.id),
        workspace.engine.doc.waitForSynced(input.documentId),
      ]);
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
      const blockId = store.addBlock(node.flavour, props, parentId);
      if (node.children) {
        this.addShareBlocks(store, blockId, node.children);
      }
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
