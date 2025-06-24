import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { MarkdownTransformer } from '@blocksuite/affine/widgets/linked-doc';
import { Service } from '@toeverything/infra';

import { DocsService } from '../../doc';
import {
  getAFFiNEWorkspaceSchema,
  type WorkspaceMetadata,
  type WorkspacesService,
} from '../../workspace';

export interface ClipperInput {
  title: string;
  contentMarkdown: string;
  contentHtml: string;
  attachments: Record<string, Blob>;
  workspace?: 'select-by-user' | 'last-open-workspace';
}

export class ImportClipperService extends Service {
  constructor(private readonly workspacesService: WorkspacesService) {
    super();
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
    // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion
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
