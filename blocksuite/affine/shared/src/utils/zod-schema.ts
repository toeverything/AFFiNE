import {
  ColorSchema,
  ConnectorMode,
  DEFAULT_CONNECTOR_CORNER_RADIUS,
  DEFAULT_CONNECTOR_MODE,
  DEFAULT_FRONT_ENDPOINT_STYLE,
  DEFAULT_HIGHLIGHTER_LINE_WIDTH,
  DEFAULT_REAR_ENDPOINT_STYLE,
  DEFAULT_ROUGHNESS,
  DefaultTheme,
  EdgelessTextZodSchema,
  FontFamily,
  FontFamilySchema,
  FontStyle,
  FontStyleSchema,
  FontWeight,
  FontWeightSchema,
  FrameZodSchema,
  GRADIENT_DIRECTIONS,
  HIGHLIGHTER_LINE_WIDTHS,
  LayoutType,
  LineWidth,
  MindmapStyle,
  NoteZodSchema,
  PointStyle,
  ShapeStyle,
  StrokeStyle,
  StrokeStyleSchema,
  TextAlign,
  TextAlignSchema,
  TextVerticalAlign,
} from '@blocksuite/affine-model';
import {
  z,
  ZodDefault,
  ZodIntersection,
  ZodObject,
  type ZodTypeAny,
  ZodUnion,
} from 'zod';

const ConnectorEndpointSchema = z.nativeEnum(PointStyle);
const LineWidthSchema = z.nativeEnum(LineWidth);
const ShapeStyleSchema = z.nativeEnum(ShapeStyle);
const TextVerticalAlignSchema = z.nativeEnum(TextVerticalAlign);
const ConnectorModeSchema = z.nativeEnum(ConnectorMode);
const LayoutTypeSchema = z.nativeEnum(LayoutType);
const MindmapStyleSchema = z.nativeEnum(MindmapStyle);

export const ConnectorSchema = z
  .object({
    frontEndpointStyle: ConnectorEndpointSchema,
    rearEndpointStyle: ConnectorEndpointSchema,
    frontEndpointScale: z.number(),
    rearEndpointScale: z.number(),
    stroke: ColorSchema,
    strokeStyle: StrokeStyleSchema,
    strokeWidth: LineWidthSchema,
    rough: z.boolean(),
    hoverToInitiate: z.boolean(),
    jumpStyle: z.enum(['none', 'arc', 'gap', 'sharp', 'line']),
    jumpSize: z.number(),
    mode: ConnectorModeSchema,
    cornerRadius: z.number(),
    labelStyle: z.object({
      color: ColorSchema,
      fontSize: z.number(),
      fontFamily: FontFamilySchema,
      fontWeight: FontWeightSchema,
      fontStyle: FontStyleSchema,
      textAlign: TextAlignSchema,
    }),
  })
  .default({
    frontEndpointStyle: DEFAULT_FRONT_ENDPOINT_STYLE,
    rearEndpointStyle: DEFAULT_REAR_ENDPOINT_STYLE,
    frontEndpointScale: 100,
    rearEndpointScale: 100,
    stroke: DefaultTheme.connectorColor,
    strokeStyle: StrokeStyle.Solid,
    strokeWidth: LineWidth.Two,
    rough: false,
    hoverToInitiate: true,
    jumpStyle: 'none',
    jumpSize: 10,
    mode: DEFAULT_CONNECTOR_MODE,
    cornerRadius: DEFAULT_CONNECTOR_CORNER_RADIUS,
    labelStyle: {
      color: DefaultTheme.black,
      fontSize: 16,
      fontFamily: FontFamily.Inter,
      fontWeight: FontWeight.Regular,
      fontStyle: FontStyle.Normal,
      textAlign: TextAlign.Center,
    },
  });

export const BrushSchema = z
  .object({
    color: ColorSchema,
    lineWidth: LineWidthSchema,
  })
  .default({
    color: DefaultTheme.black,
    lineWidth: LineWidth.Four,
  });

export const HighlighterSchema = z
  .object({
    color: ColorSchema,
    lineWidth: z
      .number()
      .int()
      .refine(value => HIGHLIGHTER_LINE_WIDTHS.includes(value)),
  })
  .default({
    color: DefaultTheme.hightlighterColor,
    lineWidth: DEFAULT_HIGHLIGHTER_LINE_WIDTH,
  });

const DEFAULT_SHAPE = {
  color: DefaultTheme.shapeTextColor,
  fillColor: DefaultTheme.shapeFillColor,
  gradientFinal: undefined,
  gradientDirection: undefined,
  flipX: false,
  flipY: false,
  lockAspectRatio: false,
  textRotate: 0,
  textFlipX: false,
  textFlipY: false,
  strokeColor: DefaultTheme.shapeStrokeColor,
  strokeStyle: StrokeStyle.Solid,
  strokeWidth: LineWidth.Two,
  shapeStyle: ShapeStyle.General,
  filled: true,
  radius: 0,
  fontSize: 20,
  fontFamily: FontFamily.Inter,
  fontWeight: FontWeight.Regular,
  fontStyle: FontStyle.Normal,
  textAlign: TextAlign.Center,
  roughness: DEFAULT_ROUGHNESS,
  collapsed: false,
};

const ShapeObject = {
  color: ColorSchema,
  fillColor: ColorSchema,
  gradientFinal: ColorSchema.optional(),
  gradientDirection: z.enum(GRADIENT_DIRECTIONS).optional(),
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),
  lockAspectRatio: z.boolean().optional(),
  textRotate: z.number().optional(),
  textFlipX: z.boolean().optional(),
  textFlipY: z.boolean().optional(),
  strokeColor: ColorSchema,
  strokeStyle: StrokeStyleSchema,
  strokeWidth: z.number(),
  shapeStyle: ShapeStyleSchema,
  filled: z.boolean(),
  radius: z.number(),
  fontSize: z.number(),
  fontFamily: FontFamilySchema,
  fontWeight: FontWeightSchema,
  fontStyle: FontStyleSchema,
  textAlign: TextAlignSchema,
  textHorizontalAlign: TextAlignSchema.optional(),
  textVerticalAlign: TextVerticalAlignSchema.optional(),
  roughness: z.number(),
  stencilName: z.string().optional(),
  collapsed: z.boolean().optional(),
  collapsedSize: z.tuple([z.number(), z.number()]).optional(),
  expandedSize: z.tuple([z.number(), z.number()]).optional(),
  collapseProxyId: z.string().nullable().optional(),
};

export const ShapeSchema = z.object(ShapeObject).default(DEFAULT_SHAPE);

export const RoundedShapeSchema = z
  .object(ShapeObject)
  .default({ ...DEFAULT_SHAPE, radius: 0.1 });

export const TextSchema = z
  .object({
    color: ColorSchema,
    fontSize: z.number(),
    fontFamily: FontFamilySchema,
    fontWeight: FontWeightSchema,
    fontStyle: FontStyleSchema,
    textAlign: TextAlignSchema,
  })
  .default({
    color: DefaultTheme.textColor,
    fontSize: 24,
    fontFamily: FontFamily.Inter,
    fontWeight: FontWeight.Regular,
    fontStyle: FontStyle.Normal,
    textAlign: TextAlign.Left,
  });

export const MindmapSchema = z
  .object({
    layoutType: LayoutTypeSchema,
    style: MindmapStyleSchema,
  })
  .default({
    layoutType: LayoutType.RIGHT,
    style: MindmapStyle.ONE,
  });

export const NodePropsSchema = z.object({
  connector: ConnectorSchema,
  brush: BrushSchema,
  highlighter: HighlighterSchema,
  text: TextSchema,
  mindmap: MindmapSchema,
  'affine:edgeless-text': EdgelessTextZodSchema,
  'affine:note': NoteZodSchema,
  'affine:frame': FrameZodSchema,
  // shapes
  'shape:diamond': ShapeSchema,
  'shape:ellipse': ShapeSchema,
  'shape:rect': ShapeSchema,
  'shape:triangle': ShapeSchema,
  'shape:triangleRight': ShapeSchema,
  'shape:hexagon': ShapeSchema,
  'shape:parallelogram': ShapeSchema,
  'shape:trapezoid': ShapeSchema,
  'shape:step': ShapeSchema,
  'shape:cylinder': ShapeSchema,
  'shape:cloud': ShapeSchema,
  'shape:document': ShapeSchema,
  'shape:note': ShapeSchema,
  'shape:cube': ShapeSchema,
  'shape:callout': ShapeSchema,
  'shape:actor': ShapeSchema,
  'shape:dataStorage': ShapeSchema,
  'shape:tape': ShapeSchema,
  'shape:internalStorage': ShapeSchema,
  'shape:logicAnd': ShapeSchema,
  'shape:logicOr': ShapeSchema,
  'shape:flowchartProcess': ShapeSchema,
  'shape:flowchartDecision': ShapeSchema,
  'shape:flowchartData': ShapeSchema,
  'shape:flowchartDocument': ShapeSchema,
  'shape:flowchartManualInput': ShapeSchema,
  'shape:flowchartDelay': ShapeSchema,
  'shape:flowchartPredefinedProcess': ShapeSchema,
  'shape:flowchartStoredData': ShapeSchema,
  'shape:flowchartInternalStorage': ShapeSchema,
  'shape:flowchartDatabase': ShapeSchema,
  'shape:flowchartSequentialData': ShapeSchema,
  'shape:flowchartTerminator': ShapeSchema,
  'shape:flowchartPreparation': ShapeSchema,
  'shape:flowchartMerge': ShapeSchema,
  'shape:flowchartPaperTape': ShapeSchema,
  'shape:flowchartAnnotation1': ShapeSchema,
  'shape:flowchartAnnotation2': ShapeSchema,
  'shape:flowchartCard': ShapeSchema,
  'shape:flowchartCollate': ShapeSchema,
  'shape:flowchartDirectData': ShapeSchema,
  'shape:flowchartDisplay': ShapeSchema,
  'shape:flowchartLoopLimit': ShapeSchema,
  'shape:flowchartManualOperation': ShapeSchema,
  'shape:flowchartMultiDocument': ShapeSchema,
  'shape:flowchartOffPageReference': ShapeSchema,
  'shape:flowchartOr': ShapeSchema,
  'shape:flowchartSort': ShapeSchema,
  'shape:flowchartSummingFunction': ShapeSchema,
  'shape:arrowUp': ShapeSchema,
  'shape:arrowDown': ShapeSchema,
  'shape:arrowLeft': ShapeSchema,
  'shape:arrowRight': ShapeSchema,
  'shape:arrowTwoWayHorizontal': ShapeSchema,
  'shape:arrowTwoWayVertical': ShapeSchema,
  'shape:arrowBentLeft': ShapeSchema,
  'shape:arrowBentRight': ShapeSchema,
  'shape:arrowBentUp': ShapeSchema,
  'shape:arrowNotchedSignalIn': ShapeSchema,
  'shape:arrowNotchedRight': ShapeSchema,
  'shape:arrowNotchedStylised': ShapeSchema,
  'shape:arrowCalloutUp': ShapeSchema,
  'shape:arrowCalloutDouble': ShapeSchema,
  'shape:arrowCalloutQuad': ShapeSchema,
  'shape:container': ShapeSchema,
  'shape:verticalContainer': ShapeSchema,
  'shape:horizontalContainer': ShapeSchema,
  'shape:list': ShapeSchema,
  'shape:mindmapCentralIdea': ShapeSchema,
  'shape:mindmapBranch': ShapeSchema,
  'shape:mindmapSubTopic': ShapeSchema,
  'shape:mindmapSquare': ShapeSchema,
  'shape:mindmapOrganization': ShapeSchema,
  'shape:mindmapDivision': ShapeSchema,
  'shape:drawioStencil': ShapeSchema,
  'shape:roundedRect': RoundedShapeSchema,
});

export type NodeProps = z.infer<typeof NodePropsSchema>;

export function makeDeepOptional(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof ZodDefault) {
    return makeDeepOptional(schema._def.innerType);
  }
  if (schema instanceof ZodObject) {
    const shape = schema.shape;
    const deepOptionalShape = Object.fromEntries(
      Object.entries(shape).map(([key, value]) => {
        return [key, makeDeepOptional(value as ZodTypeAny)];
      })
    );
    return z.object(deepOptionalShape).optional();
  } else if (schema instanceof ZodUnion) {
    return schema.or(z.undefined());
  } else if (schema instanceof ZodIntersection) {
    return z.intersection(
      makeDeepOptional(schema._def.left),
      makeDeepOptional(schema._def.right)
    );
  } else {
    return schema.optional();
  }
}
