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
  isInsideBlockByFlavour,
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

type UpdateBlockResult = {
  updatedBlocks: BlockModel[];
  textTargetBlocks?: BlockModel[];
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
  const transformToCallout: Command<{}, UpdateBlockResult> = (_, next) => {
    if (flavour !== 'affine:callout') return;

    const selectedIds = new Set(blockModels.map(model => model.id));
    const sourceModels = blockModels.filter(model => {
      let parent = doc.getParent(model);
      while (parent) {
        if (selectedIds.has(parent.id)) return false;
        parent = doc.getParent(parent);
      }
      return true;
    });

    const plans = sourceModels.flatMap(model => {
      if (
        !matchModels(model, [
          ParagraphBlockModel,
          ListBlockModel,
          CodeBlockModel,
        ]) ||
        isInsideBlockByFlavour(doc, model, 'affine:callout')
      ) {
        return [];
      }

      const parent = doc.getParent(model);
      if (
        !parent ||
        parent.children.indexOf(model) === -1 ||
        !doc.schema.isValid('affine:callout', parent.flavour) ||
        !model.children.every(child =>
          doc.schema.isValid(child.flavour, 'affine:paragraph')
        )
      ) {
        return [];
      }

      return [{ model, parent, text: model.text?.clone() }];
    });

    if (plans.length === 0 || plans.length !== sourceModels.length) {
      return next({ updatedBlocks: [] });
    }

    const conversions: Array<{
      source: BlockModel;
      callout: BlockModel;
      paragraph: BlockModel;
    }> = [];

    for (const { model, parent, text } of plans) {
      const index = parent.children.indexOf(model);
      const calloutId = doc.addBlock('affine:callout', {}, parent, index);
      const callout = doc.getModelById(calloutId);
      if (!callout) {
        conversions.forEach(({ callout }) => doc.deleteBlock(callout));
        return next({ updatedBlocks: [] });
      }

      const paragraphId = doc.addBlock('affine:paragraph', { text }, callout);
      const paragraph = doc.getModelById(paragraphId);
      if (!paragraph) {
        doc.deleteBlock(callout);
        conversions.forEach(({ callout }) => doc.deleteBlock(callout));
        return next({ updatedBlocks: [] });
      }

      conversions.push({ source: model, callout, paragraph });
    }

    conversions.forEach(({ source, paragraph }) => {
      doc.deleteBlock(
        source,
        source.children.length > 0
          ? { bringChildrenTo: paragraph }
          : { deleteChildren: false }
      );
    });

    return next({
      updatedBlocks: conversions.map(({ callout }) => callout),
      textTargetBlocks: conversions.map(({ paragraph }) => paragraph),
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

  const focusText: Command<UpdateBlockResult> = (ctx, next) => {
    const targetBlocks = ctx.textTargetBlocks ?? ctx.updatedBlocks;
    if (!targetBlocks || targetBlocks.length === 0) {
      return false;
    }

    const firstNewModel = targetBlocks[0];
    const lastNewModel = targetBlocks[targetBlocks.length - 1];

    const allTextUpdated = targetBlocks.map(model =>
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

  const focusBlock: Command<UpdateBlockResult> = (ctx, next) => {
    const { updatedBlocks } = ctx;
    if (!updatedBlocks || updatedBlocks.length === 0) {
      return false;
    }

    const selectionManager = host.selection;

    const blockSelections = selectionManager.filter(BlockSelection);
    if (blockSelections.length === 0) {
      return false;
    }

    requestAnimationFrame(() => {
      const selections = updatedBlocks.map(model => {
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
    .try<UpdateBlockResult>(chain => [
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
