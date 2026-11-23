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

export type ShapeProps = BaseElementProps & {
  shapeType: ShapeType;
  radius: number;
  filled: boolean;
  fillColor: Color;
  strokeWidth: number;
  strokeColor: Color;
  strokeStyle: StrokeStyle;
  shapeStyle: ShapeStyle;
  // https://github.com/rough-stuff/rough/wiki#roughness
  roughness?: number;

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
  accessor strokeColor: Color = DefaultTheme.shapeStrokeColor;

  @field()
  accessor strokeStyle: StrokeStyle = StrokeStyle.Solid;

  @field()
  accessor strokeWidth: number = 4;

  @field()
  accessor text: Y.Text | undefined = undefined;

  @field(TextAlign.Center as TextAlign)
  accessor textAlign!: TextAlign;

  @local()
  accessor textDisplay: boolean = true;

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
  accessor text: string = '';

  @prop()
  accessor textAlign: TextAlign = TextAlign.Center;

  @prop()
  accessor textVerticalAlign: TextVerticalAlign = TextVerticalAlign.Center;
}
