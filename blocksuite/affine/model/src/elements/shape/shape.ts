import type {
  Bound,
  IBound,
  IVec,
  PointLocation,
  SerializedXYWH,
} from '@blocksuite/global/gfx';
import type { BaseElementProps, PointTestOptions } from '@blocksuite/std/gfx';
import {
  field,
  GfxLocalElementModel,
  GfxPrimitiveElementModel,
  local,
  prop,
} from '@blocksuite/std/gfx';
import * as Y from 'yjs';

import {
  DEFAULT_ROUGHNESS,
  FontFamily,
  FontStyle,
  FontWeight,
  type GradientDirection,
  ShapeStyle,
  ShapeTextFontSize,
  ShapeType,
  StrokeStyle,
  TextAlign,
  TextResizing,
  type TextStyleProps,
  TextVerticalAlign,
} from '../../consts/index.js';
import { type Color, DefaultTheme } from '../../themes/index.js';
import { shapeMethods } from './api/index.js';

// Mirrors `StencilShapeData` in
// blocksuite/affine/gfx/shape/src/drawio/stencil-utils.ts structurally.
// Cannot import that type directly: @blocksuite/affine-gfx-shape depends on
// @blocksuite/affine-model, not the other way around.
export type ShapeStencilCommand =
  | { cmd: 'M'; x: number; y: number }
  | { cmd: 'L'; x: number; y: number }
  | {
      cmd: 'C';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x: number;
      y: number;
    }
  | { cmd: 'Q'; x1: number; y1: number; x: number; y: number }
  | {
      cmd: 'A';
      rx: number;
      ry: number;
      xAxisRotation: number;
      largeArcFlag: number;
      sweepFlag: number;
      x: number;
      y: number;
    }
  | { cmd: 'Z' };

export type ShapeStencilData = {
  width: number;
  height: number;
  paths: ReadonlyArray<ReadonlyArray<ShapeStencilCommand>>;
  strokes: ReadonlyArray<ReadonlyArray<ShapeStencilCommand>>;
  constraints: ReadonlyArray<{
    x: number;
    y: number;
    perimeter: string;
    name: string;
  }>;
};

export type ShapeProps = BaseElementProps & {
  shapeType: ShapeType;
  radius: number;
  filled: boolean;
  fillColor: Color;
  gradientFinal?: Color;
  gradientDirection?: GradientDirection;
  flipX?: boolean;
  flipY?: boolean;
  lockAspectRatio?: boolean;
  textRotate?: number;
  textFlipX?: boolean;
  textFlipY?: boolean;
  strokeWidth: number;
  strokeColor: Color;
  strokeStyle: StrokeStyle;
  shapeStyle: ShapeStyle;
  // https://github.com/rough-stuff/rough/wiki#roughness
  roughness?: number;
  stencilName?: string;
  // Resolved geometry for a library shape, embedded at insertion time so
  // rendering never has to load the (large, lazily-loaded) drawio library.
  // Absent on legacy shapes created before this field existed — those fall
  // back to a lazy library lookup by stencilName and get backfilled here on
  // first successful load. See stencilData accessor below and the render
  // path in @blocksuite/affine-gfx-shape's element-renderer for how this is
  // consumed.
  stencilData?: ShapeStencilData;
  collapsed?: boolean;
  collapsedSize?: [number, number];
  expandedSize?: [number, number];
  collapseProxyId?: string | null;

  text?: Y.Text;
  textHorizontalAlign?: TextAlign;
  textVerticalAlign?: TextVerticalAlign;
  textResizing?: TextResizing;
  maxWidth?: false | number;
} & Partial<TextStyleProps>;

export const SHAPE_TEXT_PADDING = 20;
export const SHAPE_TEXT_VERTICAL_PADDING = 10;

export class ShapeElementModel extends GfxPrimitiveElementModel<ShapeProps> {
  /**
   * The bound of the text content.
   */
  textBound: IBound | null = null;

  get type() {
    return 'shape';
  }

  static propsToY(props: ShapeProps) {
    if (typeof props.text === 'string') {
      props.text = new Y.Text(props.text);
    }

    return props;
  }

  override containsBound(bounds: Bound) {
    return shapeMethods[this.shapeType].containsBound(bounds, this);
  }

  override getLineIntersections(start: IVec, end: IVec) {
    return shapeMethods[this.shapeType].getLineIntersections(start, end, this);
  }

  override getNearestPoint(point: IVec): IVec {
    return shapeMethods[this.shapeType].getNearestPoint(point, this) as IVec;
  }

  override getRelativePointLocation(point: IVec): PointLocation {
    return shapeMethods[this.shapeType].getRelativePointLocation(point, this);
  }

  override includesPoint(x: number, y: number, options: PointTestOptions) {
    return shapeMethods[this.shapeType].includesPoint.call(this, x, y, {
      ...options,
      ignoreTransparent: options.ignoreTransparent ?? true,
    });
  }

  @field(DefaultTheme.shapeTextColor)
  accessor color!: Color;

  @field()
  accessor fillColor: Color = DefaultTheme.shapeFillColor;

  @field()
  accessor gradientFinal: Color | undefined = undefined;

  @field()
  accessor gradientDirection: GradientDirection | undefined = undefined;

  @field()
  accessor flipX: boolean = false;

  @field()
  accessor flipY: boolean = false;

  @field()
  accessor lockAspectRatio: boolean = false;

  @field()
  accessor textRotate: number = 0;

  @field()
  accessor textFlipX: boolean = false;

  @field()
  accessor textFlipY: boolean = false;

  @field()
  accessor filled: boolean = false;

  @field(FontFamily.Inter as string)
  accessor fontFamily!: string;

  @field(ShapeTextFontSize.MEDIUM)
  accessor fontSize!: number;

  @field(FontStyle.Normal as FontStyle)
  accessor fontStyle!: FontStyle;

  @field(FontWeight.Regular as FontWeight)
  accessor fontWeight!: FontWeight;

  @field(false as false | number)
  accessor maxWidth: false | number = false;

  @field([SHAPE_TEXT_VERTICAL_PADDING, SHAPE_TEXT_PADDING])
  accessor padding: [number, number] = [
    SHAPE_TEXT_VERTICAL_PADDING,
    SHAPE_TEXT_PADDING,
  ];

  @field()
  accessor radius: number = 0;

  @field(0)
  accessor rotate: number = 0;

  @field(DEFAULT_ROUGHNESS)
  accessor roughness: number = DEFAULT_ROUGHNESS;

  @field()
  accessor shadow: {
    /**
     * @deprecated Since the shadow blur will reduce the performance of canvas rendering,
     * we already disable the shadow blur rendering by default, so set this field will not take effect.
     * You can enable it by setting the flag `enable_shape_shadow_blur` in the awareness store.
     * https://web.dev/articles/canvas-performance#avoid_shadowblur
     */
    blur: number;
    offsetX: number;
    offsetY: number;
    color: Color;
  } | null = null;

  @field()
  accessor shapeStyle: ShapeStyle = ShapeStyle.General;

  @field()
  accessor shapeType: ShapeType = ShapeType.Rect;

  @field()
  accessor stencilName: string | undefined = undefined;

  @field()
  accessor stencilData: ShapeStencilData | undefined = undefined;

  @field()
  accessor strokeColor: Color = DefaultTheme.shapeStrokeColor;

  @field()
  accessor strokeStyle: StrokeStyle = StrokeStyle.Solid;

  @field()
  accessor strokeWidth: number = 4;

  @field(false)
  accessor collapsed: boolean = false;

  @field()
  accessor collapsedSize: [number, number] | undefined = undefined;

  @field()
  accessor expandedSize: [number, number] | undefined = undefined;

  @field()
  accessor text: Y.Text | undefined = undefined;

  @field(TextAlign.Center as TextAlign)
  accessor textAlign!: TextAlign;

  @local()
  accessor textDisplay: boolean = true;

  @field()
  accessor collapseProxyId: string | null = null;

  @field(TextAlign.Center as TextAlign)
  accessor textHorizontalAlign!: TextAlign;

  @field(TextResizing.AUTO_HEIGHT as TextResizing)
  accessor textResizing: TextResizing = TextResizing.AUTO_HEIGHT;

  @field(TextVerticalAlign.Center as TextVerticalAlign)
  accessor textVerticalAlign!: TextVerticalAlign;

  @field()
  accessor xywh: SerializedXYWH = '[0,0,100,100]';
}

export class LocalShapeElementModel extends GfxLocalElementModel {
  roughness: number = DEFAULT_ROUGHNESS;

  textBound: Bound | null = null;

  textDisplay: boolean = true;

  get type() {
    return 'shape';
  }

  @prop()
  accessor color: Color = DefaultTheme.shapeTextColor;

  @prop()
  accessor fillColor: Color = DefaultTheme.shapeFillColor;

  @prop()
  accessor filled: boolean = false;

  @prop()
  accessor flipX: boolean = false;

  @prop()
  accessor flipY: boolean = false;

  @prop()
  accessor fontFamily: string = FontFamily.Inter;

  @prop()
  accessor fontSize: number = 16;

  @prop()
  accessor fontStyle: FontStyle = FontStyle.Normal;

  @prop()
  accessor fontWeight: FontWeight = FontWeight.Regular;

  @prop()
  accessor padding: [number, number] = [
    SHAPE_TEXT_VERTICAL_PADDING,
    SHAPE_TEXT_PADDING,
  ];

  @prop()
  accessor radius: number = 0;

  @prop()
  accessor shadow: {
    blur: number;
    offsetX: number;
    offsetY: number;
    color: Color;
  } | null = null;

  @prop()
  accessor shapeStyle: ShapeStyle = ShapeStyle.General;

  @prop()
  accessor shapeType: ShapeType = ShapeType.Rect;

  @prop()
  accessor strokeColor: Color = DefaultTheme.shapeStrokeColor;

  @prop()
  accessor strokeStyle: StrokeStyle = StrokeStyle.Solid;

  @prop()
  accessor strokeWidth: number = 4;

  @prop()
  accessor lockAspectRatio: boolean = false;

  @prop()
  accessor textRotate: number = 0;

  @prop()
  accessor textFlipX: boolean = false;

  @prop()
  accessor textFlipY: boolean = false;

  @prop()
  accessor text: string = '';

  @prop()
  accessor textAlign: TextAlign = TextAlign.Center;

  @prop()
  accessor textVerticalAlign: TextVerticalAlign = TextVerticalAlign.Center;
}
