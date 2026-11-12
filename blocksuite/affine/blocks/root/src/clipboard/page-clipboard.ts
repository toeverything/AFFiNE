import { deleteTextCommand } from '@blocksuite/affine-inline-preset';
import {
  pasteMiddleware,
  replaceIdMiddleware,
  surfaceRefToEmbed,
  uploadMiddleware,
} from '@blocksuite/affine-shared/adapters';
import {
  clearAndSelectFirstModelCommand,
  deleteSelectedModelsCommand,
  getBlockSelectionsCommand,
  getImageSelectionsCommand,
  getSelectedModelsCommand,
  getTextSelectionCommand,
  retainFirstModelCommand,
} from '@blocksuite/affine-shared/commands';
import { DisposableGroup } from '@blocksuite/global/disposable';
import type { UIEventHandler } from '@blocksuite/std';
import type { BlockSnapshot, Store } from '@blocksuite/store';

import { ReadOnlyClipboard } from './readonly-clipboard';

/**
 * PageClipboard is a class that provides a clipboard for the page root block.
 * It is supported to copy and paste models in the page root block.
 */
export class PageClipboard extends ReadOnlyClipboard {
  static override key = 'affine-page-clipboard';

  protected _init = () => {
    this._initAdapters();
    const paste = pasteMiddleware(this.std);
    // Use surfaceRefToEmbed middleware to convert surface-ref to embed-linked-doc
    // When pastina a surface-ref block to another doc
    const surfaceRefToEmbedMiddleware = surfaceRefToEmbed(this.std);
    const replaceId = replaceIdMiddleware(this.std.store.workspace.idGenerator);
    const upload = uploadMiddleware(this.std);
    this.std.clipboard.use(paste);
    this.std.clipboard.use(surfaceRefToEmbedMiddleware);
    this.std.clipboard.use(replaceId);
    this.std.clipboard.use(upload);
    this._disposables.add({
      dispose: () => {
        this.std.clipboard.unuse(paste);
        this.std.clipboard.unuse(surfaceRefToEmbedMiddleware);
        this.std.clipboard.unuse(replaceId);
        this.std.clipboard.unuse(upload);
      },
    });
  };

  onBlockSnapshotPaste = async (
    snapshot: BlockSnapshot,
    doc: Store,
    parent?: string,
    index?: number
  ) => {
    const block = await this.std.clipboard.pasteBlockSnapshot(
      snapshot,
      doc,
      parent,
      index
    );
    return block?.id ?? null;
  };

  onPageCut: UIEventHandler = ctx => {
    const e = ctx.get('clipboardState').raw;
    e.preventDefault();

    this._copySelectedInPage(() => {
      this.std.command
        .chain()
        .try<{}>(cmd => [
          cmd.pipe(getTextSelectionCommand).pipe(deleteTextCommand),
          cmd.pipe(getSelectedModelsCommand).pipe(deleteSelectedModelsCommand),
        ])
        .run();
    }).run();
  };

  onPagePaste: UIEventHandler = ctx => {
    const e = ctx.get('clipboardState').raw;
    e.preventDefault();

    if (this.std.store.readonly) return;
    this.std.store.captureSync();
    let hasPasteTarget = false;
    this.std.command
      .chain()
      .try<{}>(cmd => [
        cmd.pipe(getTextSelectionCommand).pipe((ctx, next) => {
          const { currentTextSelection } = ctx;
          if (!currentTextSelection) {
            return;
          }
          const { from, to } = currentTextSelection;
          if (to && from.blockId !== to.blockId) {
            this.std.command.exec(deleteTextCommand, {
              currentTextSelection,
            });
          }
          return next();
        }),
        cmd
          .pipe(getSelectedModelsCommand)
          .pipe(clearAndSelectFirstModelCommand)
          .pipe(retainFirstModelCommand)
          .pipe(deleteSelectedModelsCommand),
      ])
      .try<{ currentSelectionPath: string }>(cmd => [
        cmd.pipe(getTextSelectionCommand).pipe((ctx, next) => {
          const textSelection = ctx.currentTextSelection;
          if (!textSelection) {
            return;
          }
          next({ currentSelectionPath: textSelection.from.blockId });
        }),
        cmd.pipe(getBlockSelectionsCommand).pipe((ctx, next) => {
          const currentBlockSelections = ctx.currentBlockSelections;
          if (!currentBlockSelections) {
            return;
          }
          const blockSelection = currentBlockSelections.at(-1);
          if (!blockSelection) {
            return;
          }
          next({ currentSelectionPath: blockSelection.blockId });
        }),
        cmd.pipe(getImageSelectionsCommand).pipe((ctx, next) => {
          const currentImageSelections = ctx.currentImageSelections;
          if (!currentImageSelections) {
            return;
          }
          const imageSelection = currentImageSelections.at(-1);
          if (!imageSelection) {
            return;
          }
          next({ currentSelectionPath: imageSelection.blockId });
        }),
      ])
      .pipe((ctx, next) => {
        // Resolve the insertion point from the model, not the view: a
        // referenced note's blocks render inside this host while the
        // (edgeless-only) canonical note itself has no block component, so
        // `getBlockIndexCommand`'s `std.view.getBlock(parent)` found nothing
        // and paste fell back to the top of the page.
        const parentModel = this.std.store.getParent(ctx.currentSelectionPath);
        if (!parentModel) {
          return;
        }
        const blockIndex = parentModel.children.findIndex(
          child => child.id === ctx.currentSelectionPath
        );
        hasPasteTarget = true;
        this.std.clipboard
          .paste(e, this.std.store, parentModel.id, blockIndex + 1)
          .catch(console.error);

        return next();
      })
      .run();

    if (hasPasteTarget) return;

    // If no valid selection target exists (for example, stale block selection
    // right after cut), create/focus the default paragraph and paste after it.
    const firstParagraphId = document
      .querySelector('affine-page-root')
      ?.focusFirstParagraph?.()?.id;
    const parentModel = firstParagraphId
      ? this.std.store.getParent(firstParagraphId)
      : null;
    const paragraphIndex =
      firstParagraphId && parentModel
        ? parentModel.children.findIndex(child => child.id === firstParagraphId)
        : -1;
    const insertIndex = paragraphIndex >= 0 ? paragraphIndex + 1 : undefined;

    this.std.clipboard
      .paste(e, this.std.store, parentModel?.id, insertIndex)
      .catch(console.error);
  };

  override mounted() {
    if (!navigator.clipboard) {
      console.error(
        'navigator.clipboard is not supported in current environment.'
      );
      return;
    }
    if (this._disposables.disposed) {
      this._disposables = new DisposableGroup();
    }
    this.std.event.add('copy', this.onPageCopy);
    this.std.event.add('paste', this.onPagePaste);
    this.std.event.add('cut', this.onPageCut);
    this._init();
  }
}
