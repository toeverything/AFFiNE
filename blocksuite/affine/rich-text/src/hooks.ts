import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { isStrictUrl } from '@blocksuite/affine-shared/utils';
import type {
  BeforeinputHookCtx,
  CompositionEndHookCtx,
  HookContext,
} from '@blocksuite/std/inline';

const EDGE_IGNORED_ATTRIBUTES = ['code', 'link'] as const;
const GLOBAL_IGNORED_ATTRIBUTES = [] as const;

const autoIdentifyLink = (ctx: HookContext<AffineTextAttributes>) => {
  // auto identify link only on pressing space
  if (ctx.data !== ' ') {
    return;
  }

  // space is typed at the end of link, remove the link attribute on typed space
  if (ctx.attributes?.link) {
    if (ctx.inlineRange.index === ctx.inlineEditor.yText.length) {
      delete ctx.attributes['link'];
    }
    return;
  }

  const lineInfo = ctx.inlineEditor.getLine(ctx.inlineRange.index);
  if (!lineInfo) {
    return;
  }
  const { line, lineIndex, rangeIndexRelatedToLine } = lineInfo;

  if (lineIndex !== 0) {
    return;
  }

  const verifyData = line.vTextContent
    .slice(0, rangeIndexRelatedToLine)
    .split(' ');

  const verifyStr = verifyData[verifyData.length - 1];

  const isUrl = isStrictUrl(verifyStr);

  if (!isUrl) {
    return;
  }

  const startIndex = ctx.inlineRange.index - verifyStr.length;

  ctx.inlineEditor.formatText(
    {
      index: startIndex,
      length: verifyStr.length,
    },
    {
      link: verifyStr,
    }
  );
};

function handleExtendedAttributes(
  ctx:
    | BeforeinputHookCtx<AffineTextAttributes>
    | CompositionEndHookCtx<AffineTextAttributes>
) {
  const { data, inlineEditor, inlineRange } = ctx;
  const deltas = inlineEditor.getDeltasByInlineRange(inlineRange);
  // eslint-disable-next-line sonarjs/no-collapsible-if
  if (data && data.length > 0 && data !== '\n') {
    if (
      // cursor is in the between of two deltas
      (deltas.length > 1 ||
        // cursor is in the end of line or in the middle of a delta
        (deltas.length === 1 && inlineRange.index !== 0)) &&
      !inlineEditor.isEmbed(deltas[0][0]) // embeds should not be extended
    ) {
      // each new text inserted by inline editor will not contain any attributes,
      // but we want to keep the attributes of previous text or current text where the cursor is in
      // here are two cases:
      // 1. aaa**b|bb**ccc --input 'd'--> aaa**bdbb**ccc, d should extend the bold attribute
      // 2. aaa**bbb|**ccc --input 'd'--> aaa**bbbd**ccc, d should extend the bold attribute
      const { attributes } = deltas[0][0];
      if (
        deltas.length !== 1 ||
        inlineRange.index === inlineEditor.yText.length
      ) {
        // `EDGE_IGNORED_ATTRIBUTES` is which attributes should be ignored in case 2
        EDGE_IGNORED_ATTRIBUTES.forEach(attr => {
          delete attributes?.[attr];
        });
      }

      // `GLOBAL_IGNORED_ATTRIBUTES` is which attributes should be ignored in case 1, 2
      GLOBAL_IGNORED_ATTRIBUTES.forEach(attr => {
        delete attributes?.[attr];
      });

      ctx.attributes = attributes ?? {};
    }
  }

  return ctx;
}

export const onVBeforeinput = (
  ctx: BeforeinputHookCtx<AffineTextAttributes>
) => {
  handleExtendedAttributes(ctx);
  autoIdentifyLink(ctx);
};

export const onVCompositionEnd = (
  ctx: CompositionEndHookCtx<AffineTextAttributes>
) => {
  handleExtendedAttributes(ctx);
};
