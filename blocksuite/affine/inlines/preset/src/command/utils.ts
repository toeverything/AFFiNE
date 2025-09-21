import {
  getBlockSelectionsCommand,
  getSelectedBlocksCommand,
  getTextSelectionCommand,
} from '@blocksuite/affine-shared/commands';
import type {
  AffineInlineEditor,
  AffineTextAttributes,
} from '@blocksuite/affine-shared/types';
import {
  BLOCK_ID_ATTR,
  type BlockComponent,
  type Chain,
  type InitCommandCtx,
} from '@blocksuite/std';
import {
  INLINE_ROOT_ATTR,
  type InlineEditor,
  type InlineRange,
  type InlineRootElement,
} from '@blocksuite/std/inline';

import {
  FORMAT_BLOCK_SUPPORT_FLAVOURS,
  FORMAT_NATIVE_SUPPORT_FLAVOURS,
  FORMAT_TEXT_SUPPORT_FLAVOURS,
} from './consts.js';

function getCombinedFormatFromInlineEditors(
  inlineEditors: [AffineInlineEditor, InlineRange | null][]
): AffineTextAttributes {
  const formatArr: AffineTextAttributes[] = [];
  inlineEditors.forEach(([inlineEditor, inlineRange]) => {
    if (!inlineRange) return;

    const format = inlineEditor.getFormat(inlineRange);
    formatArr.push(format);
  });

  if (formatArr.length === 0) return {};

  // format will be active only when all inline editors have the same format.
  return formatArr.reduce((acc, cur) => {
    const newFormat: AffineTextAttributes = {};
    for (const key in acc) {
      const typedKey = key as keyof AffineTextAttributes;
      if (acc[typedKey] === cur[typedKey]) {
        // This cast is secure because we have checked that the value of the key is the same.

        newFormat[typedKey] = acc[typedKey] as any;
      }
    }
    return newFormat;
  });
}

function getSelectedInlineEditors(
  blocks: BlockComponent[],
  filter: (
    inlineRoot: InlineRootElement<AffineTextAttributes>
  ) => InlineEditor<AffineTextAttributes> | []
) {
  return blocks.flatMap(el => {
    const inlineRoot = el.querySelector<
      InlineRootElement<AffineTextAttributes>
    >(`[${INLINE_ROOT_ATTR}]`);

    if (inlineRoot) {
      return filter(inlineRoot);
    }
    return [];
  });
}

function handleCurrentSelection(
  chain: Chain<InitCommandCtx>,
  handler: (
    type: 'text' | 'block' | 'native',
    inlineEditors: InlineEditor<AffineTextAttributes>[]
  ) => { textAttributes: AffineTextAttributes } | boolean | void
): Chain<InitCommandCtx & { textAttributes: AffineTextAttributes }> {
  return chain.try(chain => [
    // text selection, corresponding to `formatText` command
    chain
      .pipe(getTextSelectionCommand)
      .pipe(getSelectedBlocksCommand, {
        types: ['text'],
        filter: el => FORMAT_TEXT_SUPPORT_FLAVOURS.includes(el.model.flavour),
      })
      .pipe((ctx, next) => {
        const { selectedBlocks } = ctx;
        if (!selectedBlocks) {
          console.error(
            '`selectedBlocks` is required, you need to pass it in args or use `getSelectedBlocksCommand` command before adding this command to the pipeline.'
          );
          return false;
        }

        const selectedInlineEditors = getSelectedInlineEditors(
          selectedBlocks,
          inlineRoot => {
            const inlineRange = inlineRoot.inlineEditor.getInlineRange();
            if (!inlineRange) return [];
            return inlineRoot.inlineEditor;
          }
        );

        const result = handler('text', selectedInlineEditors);
        if (!result) return false;
        if (result === true) {
          return next();
        }
        return next(result);
      }),
    // block selection, corresponding to `formatBlock` command
    chain
      .pipe(getBlockSelectionsCommand)
      .pipe(getSelectedBlocksCommand, {
        types: ['block'],
        filter: el => FORMAT_BLOCK_SUPPORT_FLAVOURS.includes(el.model.flavour),
      })
      .pipe((ctx, next) => {
        const { selectedBlocks } = ctx;
        if (!selectedBlocks) {
          console.error(
            '`selectedBlocks` is required, you need to pass it in args or use `getSelectedBlocksCommand` command before adding this command to the pipeline.'
          );
          return false;
        }

        const selectedInlineEditors = getSelectedInlineEditors(
          selectedBlocks,
          inlineRoot =>
            inlineRoot.inlineEditor.yTextLength > 0
              ? inlineRoot.inlineEditor
              : []
        );

        const result = handler('block', selectedInlineEditors);
        if (!result) return false;
        if (result === true) {
          return next();
        }
        return next(result);
      }),
    // native selection, corresponding to `formatNative` command
    chain.pipe((ctx, next) => {
      const selectedInlineEditors = Array.from<InlineRootElement>(
        ctx.std.host.querySelectorAll(`[${INLINE_ROOT_ATTR}]`)
      )
        .filter(el => {
          const selection = document.getSelection();
          if (!selection || selection.rangeCount === 0) return false;
          const range = selection.getRangeAt(0);

          return range.intersectsNode(el);
        })
        .filter(el => {
          const block = el.closest<BlockComponent>(`[${BLOCK_ID_ATTR}]`);
          if (block) {
            return FORMAT_NATIVE_SUPPORT_FLAVOURS.includes(block.model.flavour);
          }
          return false;
        })
        .map((el): AffineInlineEditor => el.inlineEditor);

      const result = handler('native', selectedInlineEditors);
      if (!result) return false;
      if (result === true) {
        return next();
      }
      return next(result);
    }),
  ]);
}

export function getCombinedTextAttributes(chain: Chain<InitCommandCtx>) {
  return handleCurrentSelection(chain, (type, inlineEditors) => {
    if (type === 'text') {
      return {
        textAttributes: getCombinedFormatFromInlineEditors(
          inlineEditors.map(e => [e, e.getInlineRange()])
        ),
      };
    }
    if (type === 'block') {
      return {
        textAttributes: getCombinedFormatFromInlineEditors(
          inlineEditors.map(e => [e, { index: 0, length: e.yTextLength }])
        ),
      };
    }
    if (type === 'native') {
      return {
        textAttributes: getCombinedFormatFromInlineEditors(
          inlineEditors.map(e => [e, e.getInlineRange()])
        ),
      };
    }
    return false;
  });
}

export function isFormatSupported(chain: Chain<InitCommandCtx>) {
  return handleCurrentSelection(chain, (_type, inlineEditors) => {
    if (inlineEditors.length === 1) {
      const inlineEditor = inlineEditors[0];
      const inlineRange = inlineEditor.getInlineRange();

      // support block selection
      if (!inlineRange) return true;

      if (inlineRange.length !== 1) return true;

      // skip embed node
      const delta = inlineEditor.getDeltaByRangeIndex(inlineRange.index + 1);
      if (!delta) return true;

      const isEmbed = inlineEditor.isEmbed(delta);
      if (isEmbed) return false;

      return true;
    }
    return inlineEditors.length > 0;
  });
}
