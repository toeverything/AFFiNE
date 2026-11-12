export const DEFAULT_ROUGHNESS = 1.4;

// TODO: need to check the default central area ratio
export const DEFAULT_CENTRAL_AREA_RATIO = 0.3;

export enum ShapeTextFontSize {
  LARGE = 28,
  MEDIUM = 20,
  SMALL = 12,
  XLARGE = 36,
}

export enum ShapeType {
  Rect = 'rect',
  Ellipse = 'ellipse',
  Diamond = 'diamond',
  Triangle = 'triangle',
  TriangleRight = 'triangleRight',
  Hexagon = 'hexagon',
  Parallelogram = 'parallelogram',
  Trapezoid = 'trapezoid',
  Step = 'step',
  Cylinder = 'cylinder',
  Cloud = 'cloud',
  Document = 'document',
  Note = 'note',
  Cube = 'cube',
  Callout = 'callout',
  Actor = 'actor',
  DataStorage = 'dataStorage',
  Tape = 'tape',
  InternalStorage = 'internalStorage',
  LogicAnd = 'logicAnd',
  LogicOr = 'logicOr',
  Container = 'container',
  VerticalContainer = 'verticalContainer',
  HorizontalContainer = 'horizontalContainer',
  List = 'list',
  MindmapCentralIdea = 'mindmapCentralIdea',
  MindmapBranch = 'mindmapBranch',
  MindmapSubTopic = 'mindmapSubTopic',
  MindmapSquare = 'mindmapSquare',
  MindmapOrganization = 'mindmapOrganization',
  MindmapDivision = 'mindmapDivision',
  FlowchartProcess = 'flowchartProcess',
  FlowchartDecision = 'flowchartDecision',
  FlowchartData = 'flowchartData',
  FlowchartDocument = 'flowchartDocument',
  FlowchartManualInput = 'flowchartManualInput',
  FlowchartDelay = 'flowchartDelay',
  FlowchartPredefinedProcess = 'flowchartPredefinedProcess',
  FlowchartStoredData = 'flowchartStoredData',
  FlowchartInternalStorage = 'flowchartInternalStorage',
  FlowchartDatabase = 'flowchartDatabase',
  FlowchartSequentialData = 'flowchartSequentialData',
  FlowchartTerminator = 'flowchartTerminator',
  FlowchartPreparation = 'flowchartPreparation',
  FlowchartMerge = 'flowchartMerge',
  FlowchartPaperTape = 'flowchartPaperTape',
  FlowchartAnnotation1 = 'flowchartAnnotation1',
  FlowchartAnnotation2 = 'flowchartAnnotation2',
  FlowchartCard = 'flowchartCard',
  FlowchartCollate = 'flowchartCollate',
  FlowchartDirectData = 'flowchartDirectData',
  FlowchartDisplay = 'flowchartDisplay',
  FlowchartLoopLimit = 'flowchartLoopLimit',
  FlowchartManualOperation = 'flowchartManualOperation',
  FlowchartMultiDocument = 'flowchartMultiDocument',
  FlowchartOffPageReference = 'flowchartOffPageReference',
  FlowchartOr = 'flowchartOr',
  FlowchartSort = 'flowchartSort',
  FlowchartSummingFunction = 'flowchartSummingFunction',
  ArrowUp = 'arrowUp',
  ArrowDown = 'arrowDown',
  ArrowLeft = 'arrowLeft',
  ArrowRight = 'arrowRight',
  ArrowTwoWayHorizontal = 'arrowTwoWayHorizontal',
  ArrowTwoWayVertical = 'arrowTwoWayVertical',
  ArrowBentLeft = 'arrowBentLeft',
  ArrowBentRight = 'arrowBentRight',
  ArrowBentUp = 'arrowBentUp',
  ArrowNotchedSignalIn = 'arrowNotchedSignalIn',
  ArrowNotchedRight = 'arrowNotchedRight',
  ArrowNotchedStylised = 'arrowNotchedStylised',
  ArrowCalloutUp = 'arrowCalloutUp',
  ArrowCalloutDouble = 'arrowCalloutDouble',
  ArrowCalloutQuad = 'arrowCalloutQuad',
  DrawioStencil = 'drawioStencil',
}

export const COLLAPSIBLE_CONTAINER_SHAPES = new Set<ShapeType>([
  ShapeType.Container,
  ShapeType.VerticalContainer,
  ShapeType.HorizontalContainer,
  ShapeType.List,
]);

export const CONNECTOR_TREE_SHAPES = new Set<ShapeType>([
  ShapeType.MindmapCentralIdea,
  ShapeType.MindmapBranch,
  ShapeType.MindmapSubTopic,
  ShapeType.MindmapSquare,
  ShapeType.MindmapOrganization,
  ShapeType.MindmapDivision,
]);

export const CONTAINER_TITLE_SIZE = 32;

export type ShapeName = ShapeType | 'roundedRect';

export function getShapeName(type: ShapeType, radius: number): ShapeName {
  if (type === ShapeType.Rect && radius > 0) {
    return 'roundedRect';
  }
  return type;
}

export function getShapeType(name: ShapeName): ShapeType {
  if (name === 'roundedRect') {
    return ShapeType.Rect;
  }
  return name;
}

export function getShapeRadius(name: ShapeName): number {
  if (name === 'roundedRect') {
    return 0.1;
  }
  return 0;
}

export enum ShapeStyle {
  General = 'General',
  Scribbled = 'Scribbled',
}

export const GRADIENT_DIRECTIONS = [
  'S',
  'W',
  'N',
  'E',
  'SE',
  'SW',
  'NE',
  'NW',
] as const;

export type GradientDirection = (typeof GRADIENT_DIRECTIONS)[number];
