import type { Options } from '@blocksuite/affine-block-surface';
import { type ShapeStyle, ShapeType } from '@blocksuite/affine-model';
import type { XYWH } from '@blocksuite/global/gfx';

import { DRAWIO_STENCIL_SHAPE_MAP } from '../drawio/stencil-map.js';
import { getStencilShapeData } from '../drawio/stencil-utils.js';
import {
  buildActorPath,
  buildCalloutPath,
  buildCloudPath,
  buildCubePath,
  buildCylinderPath,
  buildDataStoragePath,
  buildDocumentPath,
  buildInternalStoragePath,
  buildLogicAndPath,
  buildLogicOrPath,
  buildNotePath,
  buildTapePath,
} from '../element-renderer/shape/paths';
import { DiamondShape } from './diamond';
import { EllipseShape } from './ellipse';
import { HexagonShape } from './hexagon';
import { ParallelogramShape } from './parallelogram';
import { PathShape } from './path-shape';
import { RectShape } from './rect';
import { RoundedRectShape } from './rounded-rect';
import type { Shape } from './shape';
import { StencilShape } from './stencil-shape';
import { StepShape } from './step';
import { TrapezoidShape } from './trapezoid';
import { TriangleShape } from './triangle';
import { TriangleRightShape } from './triangle-right';

export class ShapeFactory {
  static createShape(
    xywh: XYWH,
    type: string,
    options: Options,
    shapeStyle: ShapeStyle
  ): Shape {
    const stencilName =
      type === ShapeType.Document
        ? undefined
        : DRAWIO_STENCIL_SHAPE_MAP[type as ShapeType];
    if (stencilName) {
      const stencil = getStencilShapeData(stencilName);
      if (stencil) {
        return new StencilShape(xywh, type, options, shapeStyle, stencil);
      }
    }
    switch (type) {
      case 'rect':
        return new RectShape(xywh, type, options, shapeStyle);
      case 'triangle':
        return new TriangleShape(xywh, type, options, shapeStyle);
      case 'diamond':
        return new DiamondShape(xywh, type, options, shapeStyle);
      case 'ellipse':
        return new EllipseShape(xywh, type, options, shapeStyle);
      case 'triangleRight':
        return new TriangleRightShape(xywh, type, options, shapeStyle);
      case 'hexagon':
        return new HexagonShape(xywh, type, options, shapeStyle);
      case 'parallelogram':
        return new ParallelogramShape(xywh, type, options, shapeStyle);
      case 'trapezoid':
        return new TrapezoidShape(xywh, type, options, shapeStyle);
      case 'step':
        return new StepShape(xywh, type, options, shapeStyle);
      case 'cylinder':
        return new PathShape(
          xywh,
          type,
          options,
          shapeStyle,
          buildCylinderPath
        );
      case 'cloud':
        return new PathShape(xywh, type, options, shapeStyle, buildCloudPath);
      case 'document':
        return new PathShape(
          xywh,
          type,
          options,
          shapeStyle,
          buildDocumentPath
        );
      case 'note':
        return new PathShape(xywh, type, options, shapeStyle, buildNotePath);
      case 'cube':
        return new PathShape(xywh, type, options, shapeStyle, buildCubePath);
      case 'callout':
        return new PathShape(xywh, type, options, shapeStyle, buildCalloutPath);
      case 'actor':
        return new PathShape(xywh, type, options, shapeStyle, buildActorPath);
      case 'dataStorage':
        return new PathShape(
          xywh,
          type,
          options,
          shapeStyle,
          buildDataStoragePath
        );
      case 'tape':
        return new PathShape(xywh, type, options, shapeStyle, buildTapePath);
      case 'internalStorage':
        return new PathShape(
          xywh,
          type,
          options,
          shapeStyle,
          buildInternalStoragePath
        );
      case 'logicAnd':
        return new PathShape(
          xywh,
          type,
          options,
          shapeStyle,
          buildLogicAndPath
        );
      case 'logicOr':
        return new PathShape(xywh, type, options, shapeStyle, buildLogicOrPath);
      case 'roundedRect':
        return new RoundedRectShape(xywh, type, options, shapeStyle);
      default:
        throw new Error(`Unknown shape type: ${type}`);
    }
  }
}
