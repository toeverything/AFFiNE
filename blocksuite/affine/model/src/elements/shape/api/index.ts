import type { ShapeType } from '../../../consts/shape.js';
import { actor } from './actor.js';
import { callout } from './callout.js';
import { cloud } from './cloud.js';
import { cube } from './cube.js';
import { cylinder } from './cylinder.js';
import { dataStorage } from './data-storage.js';
import { diamond } from './diamond.js';
import { document } from './document.js';
import { ellipse } from './ellipse.js';
import { hexagon } from './hexagon.js';
import { internalStorage } from './internal-storage.js';
import { logicAnd } from './logic-and.js';
import { logicOr } from './logic-or.js';
import { note } from './note.js';
import { parallelogram } from './parallelogram.js';
import { rect } from './rect.js';
import { step } from './step.js';
import { tape } from './tape.js';
import { trapezoid } from './trapezoid.js';
import { triangle } from './triangle.js';
import { triangleRight } from './triangle-right.js';

export const shapeMethods: Record<ShapeType, typeof rect> = {
  rect,
  triangle,
  ellipse,
  diamond,
  triangleRight,
  hexagon,
  parallelogram,
  trapezoid,
  step,
  cylinder,
  cloud,
  document,
  note,
  cube,
  callout,
  actor,
  dataStorage,
  tape,
  internalStorage,
  logicAnd,
  logicOr,
  container: rect,
  verticalContainer: rect,
  horizontalContainer: rect,
  list: rect,
  mindmapCentralIdea: ellipse,
  mindmapBranch: rect,
  mindmapSubTopic: rect,
  mindmapSquare: rect,
  mindmapOrganization: rect,
  mindmapDivision: rect,
  flowchartProcess: rect,
  flowchartDecision: rect,
  flowchartData: rect,
  flowchartDocument: rect,
  flowchartManualInput: rect,
  flowchartDelay: rect,
  flowchartPredefinedProcess: rect,
  flowchartStoredData: rect,
  flowchartInternalStorage: rect,
  flowchartDatabase: rect,
  flowchartSequentialData: rect,
  flowchartTerminator: rect,
  flowchartPreparation: rect,
  flowchartMerge: rect,
  flowchartPaperTape: rect,
  flowchartAnnotation1: rect,
  flowchartAnnotation2: rect,
  flowchartCard: rect,
  flowchartCollate: rect,
  flowchartDirectData: rect,
  flowchartDisplay: rect,
  flowchartLoopLimit: rect,
  flowchartManualOperation: rect,
  flowchartMultiDocument: rect,
  flowchartOffPageReference: rect,
  flowchartOr: rect,
  flowchartSort: rect,
  flowchartSummingFunction: rect,
  arrowUp: rect,
  arrowDown: rect,
  arrowLeft: rect,
  arrowRight: rect,
  arrowTwoWayHorizontal: rect,
  arrowTwoWayVertical: rect,
  arrowBentLeft: rect,
  arrowBentRight: rect,
  arrowBentUp: rect,
  arrowNotchedSignalIn: rect,
  arrowNotchedRight: rect,
  arrowNotchedStylised: rect,
  arrowCalloutUp: rect,
  arrowCalloutDouble: rect,
  arrowCalloutQuad: rect,
  drawioStencil: rect,
};
