import { WorkbenchService } from '@affine/core/modules/workbench';
import { getSelectedBlocksCommand } from '@blocksuite/affine/shared/commands';
import type { CommentProvider } from '@blocksuite/affine/shared/services';
import { CommentProviderIdentifier } from '@blocksuite/affine/shared/services';
import type { BlockStdScope } from '@blocksuite/affine/std';
import { StdIdentifier } from '@blocksuite/affine/std';
import type { BaseSelection, ExtensionType } from '@blocksuite/affine/store';
import { type Container } from '@blocksuite/global/di';
import { BlockSelection, TextSelection } from '@blocksuite/std';
import type { FrameworkProvider } from '@toeverything/infra';

import { DocCommentManagerService } from '../../../modules/comment/services/doc-comment-manager';

function getPreviewFromSelections(
  std: BlockStdScope,
  selections: BaseSelection[]
): string {
  if (!selections || selections.length === 0) {
    return '';
  }

  const previews: string[] = [];

  for (const selection of selections) {
    if (selection instanceof TextSelection) {
      // Extract text from TextSelection
      const textPreview = extractTextFromSelection(std, selection);
      if (textPreview) {
        previews.push(textPreview);
      }
    } else if (selection instanceof BlockSelection) {
      // Get block flavour for BlockSelection
      const block = std.store.getBlock(selection.blockId);
      if (block?.model) {
        const flavour = block.model.flavour.replace('affine:', '');
        previews.push(`<${flavour}>`);
      }
    } else if (selection.type === 'image') {
      // Return <"Image"> for ImageSelection
      previews.push('<Image>');
    }
    // Skip other types
  }

  return previews.length > 0 ? previews.join(' ') : 'New comment';
}

function extractTextFromSelection(
  std: BlockStdScope,
  selection: TextSelection
): string | null {
  try {
    const [_, ctx] = std.command
      .chain()
      .pipe(getSelectedBlocksCommand, {
        currentTextSelection: selection,
        types: ['text'],
      })
      .run();

    const blocks = ctx.selectedBlocks;
    if (!blocks || blocks.length === 0) return null;

    const { from, to } = selection;
    const quote = blocks.reduce((acc, block, index) => {
      const text = block.model.text;
      if (!text) return acc;

      if (index === 0) {
        // First block: extract from 'from.index' for 'from.length' characters
        const startText = text.yText
          .toString()
          .slice(from.index, from.index + from.length);
        return acc + startText;
      }

      if (index === blocks.length - 1 && to) {
        // Last block: extract from start to 'to.index + to.length'
        const endText = text.yText.toString().slice(0, to.index + to.length);
        return acc + (acc ? ' ' : '') + endText;
      }

      // Middle blocks: get all text
      const blockText = text.yText.toString();
      return acc + (acc ? ' ' : '') + blockText;
    }, '');

    // Trim and limit length for preview
    const trimmed = quote.trim();
    return trimmed.length > 200 ? trimmed.substring(0, 200) + '...' : trimmed;
  } catch (error) {
    console.warn('Failed to extract text from selection:', error);
    return null;
  }
}

class AffineCommentService implements CommentProvider {
  private readonly docCommentManager: DocCommentManagerService;

  constructor(
    private readonly std: BlockStdScope,
    private readonly framework: FrameworkProvider
  ) {
    this.docCommentManager = framework.get(DocCommentManagerService);
  }

  private get currentDocId(): string {
    return this.std.store.id;
  }

  // todo: need to handle resource leak
  private get commentEntityRef() {
    return this.docCommentManager.get(this.currentDocId);
  }

  private get commentEntity() {
    return this.commentEntityRef.obj;
  }

  addComment(selections: BaseSelection[]): void {
    const workbench = this.framework.get(WorkbenchService).workbench;
    workbench.setSidebarOpen(true);
    workbench.activeView$.value.activeSidebarTab('comment');
    const preview = getPreviewFromSelections(this.std, selections);
    this.commentEntity.addComment(selections, preview).catch(console.error);
  }

  resolveComment(id: string): void {
    this.commentEntity.resolveComment(id).catch(console.error);
  }

  highlightComment(id: string | null): void {
    const workbench = this.framework.get(WorkbenchService).workbench;
    workbench.setSidebarOpen(true);
    workbench.activeView$.value.activeSidebarTab('comment');
    this.commentEntity.highlightComment(id);
  }

  getComments(): string[] {
    return this.commentEntity.getComments();
  }

  onCommentAdded(callback: (id: string, selections: BaseSelection[]) => void) {
    return this.commentEntity.onCommentAdded((id, selections) => {
      callback(id, selections);
    });
  }

  onCommentResolved(callback: (id: string) => void) {
    return this.commentEntity.onCommentResolved(callback);
  }

  onCommentDeleted(callback: (id: string) => void) {
    return this.commentEntity.onCommentDeleted(callback);
  }

  onCommentHighlighted(callback: (id: string | null) => void) {
    return this.commentEntity.onCommentHighlighted(callback);
  }
}

export function AffineCommentProvider(
  framework: FrameworkProvider
): ExtensionType {
  return {
    setup: (di: Container) => {
      di.addImpl(
        CommentProviderIdentifier,
        provider =>
          new AffineCommentService(provider.get(StdIdentifier), framework)
      );
    },
  };
}
