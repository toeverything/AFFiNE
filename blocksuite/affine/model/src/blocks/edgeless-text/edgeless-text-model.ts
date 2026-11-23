import type {
  GfxCommonBlockProps,
  GfxElementGeometry,
} from '@blocksuite/std/gfx';
import { GfxCompatible } from '@blocksuite/std/gfx';
import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';
import { z } from 'zod';

import {
  FontFamily,
  FontFamilySchema,
  FontStyle,
  FontStyleSchema,
  FontWeight,
  FontWeightSchema,
  TextAlign,
  TextAlignSchema,
  type TextStyleProps,
} from '../../consts/index';
import { ColorSchema } from '../../themes/color';
import { DefaultTheme } from '../../themes/default';

type EdgelessTextProps = {
  hasMaxWidth: boolean;
  comments?: Record<string, boolean>;
} & Omit<TextStyleProps, 'fontSize'> &
  GfxCommonBlockProps;

export const EdgelessTextZodSchema = z
  .object({
    color: ColorSchema,
    fontFamily: FontFamilySchema,
    fontStyle: FontStyleSchema,
    fontWeight: FontWeightSchema,
    textAlign: TextAlignSchema,
  })
  .default({
    color: DefaultTheme.textColor,
    fontFamily: FontFamily.Inter,
    fontStyle: FontStyle.Normal,
    fontWeight: FontWeight.Regular,
    textAlign: TextAlign.Left,
  });

export const EdgelessTextBlockSchema = defineBlockSchema({
  flavour: 'affine:edgeless-text',
  props: (): EdgelessTextProps => ({
    xywh: '[0,0,16,16]',
    index: 'a0',
    lockedBySelf: false,
    scale: 1,
    rotate: 0,
    hasMaxWidth: false,
    comments: undefined,
    ...EdgelessTextZodSchema.parse(undefined),
  }),
  metadata: {
    version: 1,
    role: 'hub',
    parent: ['affine:surface'],
    children: [
      'affine:paragraph',
      'affine:list',
      'affine:code',
      'affine:image',
      'affine:bookmark',
      'affine:attachment',
      'affine:embed-!(synced-doc)',
      'affine:latex',
    ],
  },
  toModel: () => new EdgelessTextBlockModel(),
});

export const EdgelessTextBlockSchemaExtension = BlockSchemaExtension(
  EdgelessTextBlockSchema
);

export class EdgelessTextBlockModel
  extends GfxCompatible<EdgelessTextProps>(BlockModel)
  implements GfxElementGeometry
{
  get color() {
    return this.props.color;
  }

  set color(color: EdgelessTextProps['color']) {
    this.props.color = color;
  }
}
