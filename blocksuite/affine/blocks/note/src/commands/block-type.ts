import {
  CodeBlockModel,
  ListBlockModel,
  ParagraphBlockModel,
} from '@blocksuite/affine-model';
import {
  asyncSetInlineRange,
  focusTextModel,
  onModelTextUpdated,
} from '@blocksuite/affine-rich-text';
import {
  getBlockSelectionsCommand,
  getSelectedBlocksCommand,
  getTextSelectionCommand,
} from '@blocksuite/affine-shared/commands';
import {
  matchModels,
  mergeToCodeModel,
  transformModel,
} from '@blocksuite/affine-shared/utils';
import {
  type BlockComponent,
  BlockSelection,
  type Command,
  TextSelection,
} from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';

type UpdateBlockConfig = {
  flavour: string;
  props?: Record<string, unknown>;
};

export const updateBlockType: Command<
  UpdateBlockConfig & {
    selectedBlocks?: BlockComponent[];
  },
  {
    updatedBlocks: BlockModel[];
  }
> = (ctx, next) => {
  const { std, flavour, props } = ctx;
  const host = std.host;
  const doc = std.store;

  const getSelectedBlocks = () => {
    let { selectedBlocks } = ctx;

    if (selectedBlocks == null) {
      const [result, ctx] = std.command
        .chain()
        .tryAll(chain => [
          chain.pipe(getTextSelectionCommand),
          chain.pipe(getBlockSelectionsCommand),
        ])
        .pipe(getSelectedBlocksCommand, { types: ['text', 'block'] })
        .run();
      if (result) {
        selectedBlocks = ctx.selectedBlocks;
      }
    }

    return selectedBlocks;
  };

  const selectedBlocks = getSelectedBlocks();
  if (!selectedBlocks || selectedBlocks.length === 0) return false;

  const blockModels = selectedBlocks.map(ele => ele.model);

  const hasSameDoc = selectedBlocks.every(block => block.store === doc);
  if (!hasSameDoc) {
    // doc check
    console.error(
      'Not all models have the same doc instance, the result for update text type may not be correct',
      selectedBlocks
    );
  }

  const mergeToCode: Command<{}, { updatedBlocks: BlockModel[] }> = (
    _,
    next
  ) => {
    if (flavour !== 'affine:code') return;
    const id = mergeToCodeModel(blockModels);
    if (!id) return;
    const model = doc.getModelById(id);
    if (!model) return;
    asyncSetInlineRange(std, model, {
      index: model.text?.length ?? 0,
      length: 0,
    }).catch(console.error);
    return next({ updatedBlocks: [model] });
  };
  const appendDivider: Command<{}, { updatedBlocks: BlockModel[] }> = (
    _,
    next
  ) => {
    if (flavour !== 'affine:divider') {
      return false;
    }
    const model = blockModels.at(-1);
    if (!model) {
      return next({ updatedBlocks: [] });
    }
    const parent = doc.getParent(model);
    if (!parent) {
      return next({ updatedBlocks: [] });
    }
    const index = parent.children.indexOf(model);
    const nextSibling = doc.getNext(model);
    let nextSiblingId = nextSibling?.id as string;
    const id = doc.addBlock('affine:divider', {}, parent, index + 1);
    if (!nextSibling) {
      nextSiblingId = doc.addBlock('affine:paragraph', {}, parent);
    }
    focusTextModel(host.std, nextSiblingId);
    const newModel = doc.getModelById(id);
    if (!newModel) {
      return next({ updatedBlocks: [] });
    }
    return next({ updatedBlocks: [newModel] });
  };
  const transformToCallout: Command<{}, { updatedBlocks: BlockModel[] }> = (
    _,
    next
  ) => {
    if (flavour !== 'affine:callout') return;
    // When flavour IS 'affine:callout', this command MUST always be terminal
    // (always call next, never fall through). The generic transformModel branch
    // that follows unconditionally deletes the source block even when addBlock
    // fails a schema check — falling through would cause data loss.

    const calloutModels: BlockModel[] = [];
    const paragraphModels: BlockModel[] = [];

    blockModels.forEach(model => {
      if (
        !matchModels(model, [
          ParagraphBlockModel,
          ListBlockModel,
          CodeBlockModel,
        ])
      ) {
        return;
      }

      const parent = doc.getParent(model);
      if (!parent) return;

      // [P1a] Callout cannot be nested inside another Callout — skip silently.
      // We still call next() at the end so the chain does NOT fall through to
      // the generic transformModel branch (which would delete the source block).
      if (parent.flavour === 'affine:callout') return;

      const index = parent.children.indexOf(model);
      const textContent = model.text?.clone();

      // Callout is a hub block — its text lives in a child paragraph,
      // not in its own text prop, so we create the callout first,
      // then add a paragraph inside it carrying the original text.
      const calloutId = doc.addBlock('affine:callout', {}, parent, index);
      if (!calloutId) return;

      const calloutModel = doc.getModelById(calloutId);
      if (!calloutModel) return;

      const paragraphId = doc.addBlock(
        'affine:paragraph',
        { text: textContent },
        calloutModel
      );

      const paragraphModel = paragraphId
        ? doc.getModelById(paragraphId)
        : null;

      // [P1b] Re-parent nested children (e.g. indented list items) to the new
      // paragraph so they remain reachable after the source block is removed.
      if (paragraphModel && model.children.length > 0) {
        doc.deleteBlock(model, { bringChildrenTo: paragraphModel });
      } else {
        doc.deleteBlock(model, { deleteChildren: false });
      }

      calloutModels.push(calloutModel);
      if (paragraphModel) {
        paragraphModels.push(paragraphModel);
      }
    });

    // Always terminal for 'affine:callout' — never fall through to
    // genericTransform. If no blocks were converted (e.g. all were inside an
    // existing Callout and skipped), we still call next with empty arrays.
    const updatedBlocks =
      paragraphModels.length > 0 ? paragraphModels : calloutModels;
    return next({ updatedBlocks, calloutModels } as {
      updatedBlocks: BlockModel[];
      calloutModels: BlockModel[];
    });
  };
  const transformToLatex: Command<{}, { updatedBlocks: BlockModel[] }> = (
    _,
    next
  ) => {
    if (flavour !== 'affine:latex') return;

    const newModels: BlockModel[] = [];
    blockModels.forEach(model => {
      if (
        !matchModels(model, [
          ParagraphBlockModel,
          ListBlockModel,
          CodeBlockModel,
        ])
      ) {
        return;
      }

      const latex = model.text?.toString() ?? '';
      const newId = transformModel(model, 'affine:latex', { latex });
      if (!newId) {
        return;
      }
      const newModel = doc.getModelById(newId);
      if (newModel) {
        newModels.push(newModel);
      }
    });

    if (newModels.length === 0) return;
    return next({ updatedBlocks: newModels });
  };

  const focusText: Command<{ updatedBlocks: BlockModel[] }> = (ctx, next) => {
    const { updatedBlocks } = ctx;
    if (!updatedBlocks || updatedBlocks.length === 0) {
      return false;
    }

    const firstNewModel = updatedBlocks[0];
    const lastNewModel = updatedBlocks[updatedBlocks.length - 1];

    const allTextUpdated = updatedBlocks.map(model =>
      onModelTextUpdated(std, model)
    );
    const selectionManager = host.selection;
    const textSelection = selectionManager.find(TextSelection);
    if (!textSelection) {
      return false;
    }
    const newTextSelection = selectionManager.create(TextSelection, {
      from: {
        blockId: firstNewModel.id,
        index: textSelection.from.index,
        length: textSelection.from.length,
      },
      to: textSelection.to
        ? {
            blockId: lastNewModel.id,
            index: textSelection.to.index,
            length: textSelection.to.length,
          }
        : null,
    });

    Promise.all(allTextUpdated)
      .then(() => {
        selectionManager.setGroup('note', [newTextSelection]);
      })
      .catch(console.error);
    return next();
  };

  const focusBlock: Command<{ updatedBlocks: BlockModel[] }> = (ctx, next) => {
    const { updatedBlocks } = ctx;
    if (!updatedBlocks || updatedBlocks.length === 0) {
      return false;
    }

    const selectionManager = host.selection;

    const blockSelections = selectionManager.filter(BlockSelection);
    if (blockSelections.length === 0) {
      return false;
    }

    // [P2] For Callout conversions, select the Callout container rather than
    // the inner paragraph so that an immediate Delete removes the whole block.
    const calloutModels = (ctx as { calloutModels?: BlockModel[] })
      .calloutModels;
    const targetModels =
      calloutModels && calloutModels.length > 0 ? calloutModels : updatedBlocks;

    requestAnimationFrame(() => {
      const selections = targetModels.map(model => {
        return selectionManager.create(BlockSelection, {
          blockId: model.id,
        });
      });

      selectionManager.setGroup('note', selections);
    });
    return next();
  };
  const selectBlocks: Command<{ updatedBlocks: BlockModel[] }> = (
    ctx,
    next
  ) => {
    const { updatedBlocks } = ctx;
    if (!updatedBlocks || updatedBlocks.length === 0) {
      return false;
    }

    requestAnimationFrame(() => {
      host.selection.setGroup(
        'note',
        updatedBlocks.map(model =>
          host.selection.create(BlockSelection, {
            blockId: model.id,
          })
        )
      );
    });
    return next();
  };

  const [result, resultCtx] = std.command
    .chain()
    .pipe((_, next) => {
      doc.captureSync();
      return next();
    })
    // update block type
    .try<{ updatedBlocks: BlockModel[] }>(chain => [
      chain.pipe(mergeToCode),
      chain.pipe(appendDivider),
      chain.pipe(transformToCallout),
      chain.pipe(transformToLatex),
      chain.pipe((_, next) => {
        const newModels: BlockModel[] = [];
        blockModels.forEach(model => {
          if (
            !matchModels(model, [
              ParagraphBlockModel,
              ListBlockModel,
              CodeBlockModel,
            ])
          ) {
            return;
          }
          if (model.flavour === flavour) {
            doc.updateBlock(model, props ?? {});
            newModels.push(model);
            return;
          }
          const newId = transformModel(model, flavour, props);
          if (!newId) {
            return;
          }
          const newModel = doc.getModelById(newId);
          if (newModel) {
            newModels.push(newModel);
          }
        });
        return next({ updatedBlocks: newModels });
      }),
    ])
    // focus
    .try(chain => [
      chain
        .pipe((_, next) => {
          if (flavour === 'affine:latex') {
            return next();
          }
          return false;
        })
        .pipe(selectBlocks),
      chain.pipe((_, next) => {
        if (['affine:code', 'affine:divider'].includes(flavour)) {
          return next();
        }
        return false;
      }),
      chain.pipe(focusText),
      chain.pipe(focusBlock),
      chain.pipe((_, next) => next()),
    ])
    .run();

  if (!result) {
    return false;
  }

  return next({ updatedBlocks: resultCtx.updatedBlocks });
};
