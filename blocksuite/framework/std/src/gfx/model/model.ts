import type { GfxGroupCompatibleInterface } from './base.js';
import type { GfxBlockElementModel } from './gfx-block-model.js';
import {
  type GfxGroupLikeElementModel,
  GfxPrimitiveElementModel,
} from './surface/element-model.js';

export type GfxModel = GfxBlockElementModel | GfxPrimitiveElementModel;

export type GfxGroupModel =
  | (GfxGroupCompatibleInterface & GfxBlockElementModel)
  | GfxGroupLikeElementModel;

export const isPrimitiveModel = (
  model: GfxModel
): model is GfxPrimitiveElementModel => {
  return model instanceof GfxPrimitiveElementModel;
};
