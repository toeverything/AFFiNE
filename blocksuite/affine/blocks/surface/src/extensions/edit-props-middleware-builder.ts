import { EditPropsStore } from '@blocksuite/affine-shared/services';
import {
  type SurfaceMiddleware,
  SurfaceMiddlewareBuilder,
} from '@blocksuite/std/gfx';

import { getLastPropsKey } from '../utils';

export class EditPropsMiddlewareBuilder extends SurfaceMiddlewareBuilder {
  static override key = 'editProps';

  middleware: SurfaceMiddleware = ctx => {
    if (ctx.type === 'beforeAdd') {
      const { type, props } = ctx.payload;
      const key = getLastPropsKey(type, props);
      const propsStore = this.std.get(EditPropsStore);
      const nProps = key
        ? propsStore.applyLastProps(key, ctx.payload.props)
        : null;
      const nextProps = nProps ?? props;
      const styledProps =
        type === 'shape'
          ? applyGlobalShapeStyle(propsStore, props, nextProps)
          : nextProps;

      ctx.payload.props = {
        ...styledProps,
        index: props.index ?? this.gfx.layer.generateIndex(),
      };
    }
  };
}

const SHAPE_STYLE_KEYS = [
  'color',
  'fillColor',
  'strokeColor',
  'strokeWidth',
  'strokeStyle',
  'filled',
  'shapeStyle',
  'roughness',
] as const;

function applyGlobalShapeStyle(
  propsStore: EditPropsStore,
  originalProps: Record<string, unknown>,
  nextProps: Record<string, unknown>
) {
  const globalStyle = propsStore.lastProps$.value['shape:rect'];
  const merged = { ...nextProps } as Record<string, unknown>;
  SHAPE_STYLE_KEYS.forEach(key => {
    if (key in originalProps) return;
    const value = (globalStyle as Record<string, unknown>)[key];
    if (value !== undefined) {
      merged[key] = value;
    }
  });
  return merged;
}
