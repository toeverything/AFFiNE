import { MarkdownTransformer } from '@blocksuite/affine/blocks/root';
import { Entity } from '@toeverything/infra';

import {
  getAFFiNEWorkspaceSchema,
  type WorkspaceService,
} from '../../workspace';

export class IntegrationWriter extends Entity {
  constructor(private readonly workspaceService: WorkspaceService) {
    super();
  }

  public async writeDoc(options: {
    /**
     * Title of the doc
     */
    title?: string;
    /**
     * Markdown string
     */
    content: string;
    /**
     * Comment of the markdown content
     */
    comment?: string | null;
    /**
     * Doc id, if not provided, a new doc will be created
     */
    docId?: string;
    /**
     * Update strategy, default is `override`
     */
    updateStrategy?: 'override' | 'append';
  }) {
    const {
      title,
      content,
      comment,
      docId,
      updateStrategy = 'override',
    } = options;

    const workspace = this.workspaceService.workspace;
    let markdown = comment ? `${content}\n---\n${comment}` : content;

    if (!docId) {
      const newDocId = await MarkdownTransformer.importMarkdownToDoc({
        collection: workspace.docCollection,
        schema: getAFFiNEWorkspaceSchema(),
        markdown,
        fileName: title,
      });

      return newDocId;
    } else {
      const collection = workspace.docCollection;

      const doc = collection.getDoc(docId);
      if (!doc) throw new Error('Doc not found');

      doc.workspace.meta.setDocMeta(docId, {
        updatedDate: Date.now(),
      });

      if (updateStrategy === 'override') {
        const pageBlock = doc.getBlocksByFlavour('affine:page')[0];
        // remove all children of the page block
        pageBlock.model.children.forEach(child => {
          doc.deleteBlock(child);
        });
        // add a new note block
        const noteBlockId = doc.addBlock('affine:note', {}, pageBlock.id);
        // import the markdown to the note block
        await MarkdownTransformer.importMarkdownToBlock({
          doc,
          blockId: noteBlockId,
          markdown,
        });
      } else if (updateStrategy === 'append') {
        const pageBlockId = doc.getBlocksByFlavour('affine:page')[0]?.id;
        const blockId = doc.addBlock('affine:note', {}, pageBlockId);
        await MarkdownTransformer.importMarkdownToBlock({
          doc,
          blockId,
          markdown: `---\n${markdown}`,
        });
      } else {
        throw new Error('Invalid update strategy');
      }
      return doc.id;
    }
  }
}
