import { RootBlockModel } from '@blocksuite/affine-model';
import { matchModels } from '@blocksuite/affine-shared/utils';
import { type Command, TextSelection } from '@blocksuite/std';
import type { Text } from '@blocksuite/store';

export const deleteTextCommand: Command<{
  currentTextSelection?: TextSelection;
  textSelection?: TextSelection;
}> = (ctx, next) => {
  const textSelection = ctx.textSelection ?? ctx.currentTextSelection;
  if (!textSelection) return;

  const range = ctx.std.range.textSelectionToRange(textSelection);
  if (!range) return;
  const selectedElements = ctx.std.range.getSelectedBlockComponentsByRange(
    range,
    {
      mode: 'flat',
    }
  );

  const { from, to } = textSelection;

  const fromElement = selectedElements.find(el => from.blockId === el.blockId);
  if (!fromElement) return;

  let fromText: Text | undefined;
  if (matchModels(fromElement.model, [RootBlockModel])) {
    fromText = fromElement.model.props.title;
  } else {
    fromText = fromElement.model.text;
  }
  if (!fromText) return;
  if (!to) {
    fromText.delete(from.index, from.length);
    ctx.std.selection.setGroup('note', [
      ctx.std.selection.create(TextSelection, {
        from: {
          blockId: from.blockId,
          index: from.index,
          length: 0,
        },
        to: null,
      }),
    ]);
    return next();
  }

  const toElement = selectedElements.find(el => to.blockId === el.blockId);
  if (!toElement) return;

  const toText = toElement.model.text;
  if (!toText) return;

  fromText.delete(from.index, from.length);
  toText.delete(0, to.length);

  fromText.join(toText);

  selectedElements
    .filter(el => el.model.id !== fromElement.model.id)
    .forEach(el => {
      ctx.std.store.deleteBlock(el.model, {
        bringChildrenTo:
          el.model.id === toElement.model.id ? fromElement.model : undefined,
      });
    });

  ctx.std.selection.setGroup('note', [
    ctx.std.selection.create(TextSelection, {
      from: {
        blockId: from.blockId,
        index: from.index,
        length: 0,
      },
      to: null,
    }),
  ]);

  next();
};
