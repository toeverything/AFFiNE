import {
  EdgelessCRUDIdentifier,
  TextUtils,
} from '@blocksuite/affine-block-surface';
import { TextElementModel } from '@blocksuite/affine-model';
import { type ToolbarModuleConfig } from '@blocksuite/affine-shared/services';
import { Bound } from '@blocksuite/global/gfx';

import { createTextActions } from './text-common';

export const builtinTextToolbarConfig = {
  actions: createTextActions(TextElementModel, 'text', (ctx, model, props) => {
    // No need to adjust element bounds
    if (props['textAlign']) {
      ctx.std.get(EdgelessCRUDIdentifier).updateElement(model.id, props);
      return;
    }

    const { text: yText, hasMaxWidth } = model;
    const textStyle = {
      fontFamily: model.fontFamily,
      fontStyle: model.fontStyle,
      fontSize: model.fontSize,
      fontWeight: model.fontWeight,
      ...props,
    };

    const { fontFamily, fontStyle, fontSize, fontWeight } = textStyle;

    const bounds = TextUtils.normalizeTextBound(
      {
        yText,
        fontFamily,
        fontStyle,
        fontSize,
        fontWeight,
        hasMaxWidth,
      },
      Bound.fromXYWH(model.deserializedXYWH)
    );

    ctx.std.get(EdgelessCRUDIdentifier).updateElement(model.id, {
      ...textStyle,
      xywh: bounds.serialize(),
    });
  }),

  when: ctx => ctx.getSurfaceModelsByType(TextElementModel).length > 0,
} as const satisfies ToolbarModuleConfig;
