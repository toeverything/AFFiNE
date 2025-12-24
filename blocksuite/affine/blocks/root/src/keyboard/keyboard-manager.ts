import {
  convertSelectedBlocksToLinkedDoc,
  getTitleFromSelectedModels,
  notifyDocCreated,
  promptDocTitle,
} from '@blocksuite/affine-block-embed';
import { ParagraphBlockComponent } from '@blocksuite/affine-block-paragraph';
import { NoteBlockModel, ParagraphBlockModel } from '@blocksuite/affine-model';
import {
  draftSelectedModelsCommand,
  getSelectedModelsCommand,
} from '@blocksuite/affine-shared/commands';
import { matchModels } from '@blocksuite/affine-shared/utils';
import { IS_MAC, IS_WINDOWS } from '@blocksuite/global/env';
import {
  type BlockComponent,
  BlockSelection,
  type UIEventHandler,
} from '@blocksuite/std';
import { toDraftModel } from '@blocksuite/store';

export class PageKeyboardManager {
  private readonly _handleDelete: UIEventHandler = ctx => {
    const event = ctx.get('defaultState').event;
    const blockSelections = this._currentSelection.filter(sel =>
      sel.is(BlockSelection)
    );
    if (blockSelections.length === 0) {
      return;
    }

    event.preventDefault();

    const deletedBlocks: string[] = [];
    blockSelections.forEach(sel => {
      const id = sel.blockId;
      const block = this._doc.getBlock(id);
      if (!block) return;
      const model = block.model;

      if (
        matchModels(model, [ParagraphBlockModel]) &&
        model.props.type.startsWith('h') &&
        model.props.collapsed
      ) {
        const component = this.rootComponent.host.view.getBlock(id);
        if (!(component instanceof ParagraphBlockComponent)) return;
        const collapsedSiblings = component.collapsedSiblings;

        deletedBlocks.push(
          ...[id, ...collapsedSiblings.map(sibling => sibling.id)].filter(
            id => !deletedBlocks.includes(id)
          )
        );
      } else {
        deletedBlocks.push(id);
      }
    });

    this._doc.transact(() => {
      deletedBlocks.forEach(id => {
        const block = this._doc.getBlock(id);
        if (block) {
          this._doc.deleteBlock(block.model);
        }
      });

      this._selection.clear(['block', 'text']);
    });
  };

  private get _currentSelection() {
    return this._selection.value;
  }

  private get _doc() {
    return this.rootComponent.store;
  }

  private get _selection() {
    return this.rootComponent.host.selection;
  }

  constructor(public rootComponent: BlockComponent) {
    this.rootComponent.bindHotKey(
      {
        'Mod-z': ctx => {
          ctx.get('defaultState').event.preventDefault();

          if (this._doc.canUndo) {
            this._doc.undo();
          }
        },
        'Shift-Mod-z': ctx => {
          ctx.get('defaultState').event.preventDefault();
          if (this._doc.canRedo) {
            this._doc.redo();
          }
        },
        'Control-y': ctx => {
          if (!IS_WINDOWS) return;

          ctx.get('defaultState').event.preventDefault();
          if (this._doc.canRedo) {
            this._doc.redo();
          }
        },
        'Mod-Backspace': () => true,
        Backspace: this._handleDelete,
        Delete: this._handleDelete,
        'Control-d': ctx => {
          if (!IS_MAC) return;
          this._handleDelete(ctx);
        },
        'Mod-Shift-l': () => {
          this._createEmbedBlock();
        },
      },
      {
        global: true,
      }
    );
  }

  private _createEmbedBlock() {
    const rootComponent = this.rootComponent;
    const [_, ctx] = this.rootComponent.std.command
      .chain()
      .pipe(getSelectedModelsCommand, {
        types: ['block'],
        mode: 'highest',
      })
      .pipe(draftSelectedModelsCommand)
      .run();
    const selectedModels = ctx.selectedModels?.filter(
      block =>
        !block.flavour.startsWith('affine:embed-') &&
        matchModels(doc.getParent(block), [NoteBlockModel])
    );

    const draftedModels = ctx.draftedModels;
    if (!selectedModels?.length || !draftedModels) {
      return;
    }

    const doc = rootComponent.host.store;
    const autofill = getTitleFromSelectedModels(
      selectedModels.map(toDraftModel)
    );
    promptDocTitle(rootComponent.std, autofill)
      .then(title => {
        if (title === null) return;
        convertSelectedBlocksToLinkedDoc(
          this.rootComponent.std,
          doc,
          draftedModels,
          title
        ).catch(console.error);
        notifyDocCreated(rootComponent.std);
      })
      .catch(console.error);
  }
}
