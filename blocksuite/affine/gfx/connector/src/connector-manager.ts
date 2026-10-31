import { AStarRunner, Overlay } from '@blocksuite/affine-block-surface';
import {
  type Connection,
  type ConnectorElementModel,
  ConnectorMode,
  GroupElementModel,
  type LocalConnectorElementModel,
} from '@blocksuite/affine-model';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { BlockSuiteError } from '@blocksuite/global/exceptions';
import type { IBound, IVec, IVec3 } from '@blocksuite/global/gfx';
import {
  almostEqual,
  Bound,
  getBezierCurveBoundingBox,
  getBezierParameters,
  getBoundFromPoints,
  getBoundWithRotation,
  getPointFromBoundsWithRotation,
  isOverlap,
  isVecZero,
  lineIntersects,
  PI2,
  PointLocation,
  sign,
  Vec,
} from '@blocksuite/global/gfx';
import type { GfxController, GfxModel } from '@blocksuite/std/gfx';
import { effect } from '@preact/signals-core';
import last from 'lodash-es/last';

import {
  calculateNearestLocation,
  type Connectable,
  ConnectorEndpointLocations,
  ConnectorEndpointLocationsOnActor,
  ConnectorEndpointLocationsOnCallout,
  ConnectorEndpointLocationsOnCloud,
  ConnectorEndpointLocationsOnCube,
  ConnectorEndpointLocationsOnCylinder,
  ConnectorEndpointLocationsOnDataStorage,
  ConnectorEndpointLocationsOnDiamond,
  ConnectorEndpointLocationsOnDocument,
  ConnectorEndpointLocationsOnEllipse,
  ConnectorEndpointLocationsOnHexagon,
  ConnectorEndpointLocationsOnInternalStorage,
  ConnectorEndpointLocationsOnLogicAnd,
  ConnectorEndpointLocationsOnLogicOr,
  ConnectorEndpointLocationsOnNote,
  ConnectorEndpointLocationsOnParallelogram,
  ConnectorEndpointLocationsOnRectangle,
  ConnectorEndpointLocationsOnStep,
  ConnectorEndpointLocationsOnTape,
  ConnectorEndpointLocationsOnTrapezoid,
  ConnectorEndpointLocationsOnTriangle,
  ConnectorEndpointLocationsOnTriangleRight,
  getAnchors,
  getConnectableRelativePosition,
  getConnectionLocationsForElement,
  getNearestConnectableAnchor,
  isConnectorWithLabel,
} from './connector-anchor-utils.js';
import { computePoints } from './connector-routing-points.js';

// Re-export extracted anchor utilities so existing imports from
// `connector-manager` continue to work during/after branch restacks.
export {
  calculateNearestLocation,
  ConnectorEndpointLocations,
  ConnectorEndpointLocationsOnActor,
  ConnectorEndpointLocationsOnCallout,
  ConnectorEndpointLocationsOnCloud,
  ConnectorEndpointLocationsOnCube,
  ConnectorEndpointLocationsOnCylinder,
  ConnectorEndpointLocationsOnDataStorage,
  ConnectorEndpointLocationsOnDiamond,
  ConnectorEndpointLocationsOnDocument,
  ConnectorEndpointLocationsOnEllipse,
  ConnectorEndpointLocationsOnHexagon,
  ConnectorEndpointLocationsOnInternalStorage,
  ConnectorEndpointLocationsOnLogicAnd,
  ConnectorEndpointLocationsOnLogicOr,
  ConnectorEndpointLocationsOnNote,
  ConnectorEndpointLocationsOnParallelogram,
  ConnectorEndpointLocationsOnRectangle,
  ConnectorEndpointLocationsOnStep,
  ConnectorEndpointLocationsOnTape,
  ConnectorEndpointLocationsOnTrapezoid,
  ConnectorEndpointLocationsOnTriangle,
  ConnectorEndpointLocationsOnTriangleRight,
  getAnchors,
  getConnectableRelativePosition,
  getConnectionLocationsForElement,
  getNearestConnectableAnchor,
  isConnectorWithLabel,
};
export type { Connectable };

export type OrthogonalConnectorInput = {
  startBound: Bound | null;
  endBound: Bound | null;
  startPoint: PointLocation;
  endPoint: PointLocation;
};

function rBound(ele: GfxModel, anti = false): IBound {
  const bound = Bound.deserialize(ele.xywh);
  return { ...bound, rotate: anti ? -ele.rotate : ele.rotate };
}

export function isConnectorAndBindingsAllSelected(
  connector: ConnectorElementModel | LocalConnectorElementModel,
  selected: GfxModel[]
) {
  const connectorSelected = selected.find(s => s.id === connector.id);
  if (!connectorSelected) {
    return false;
  }
  const { source, target } = connector;
  const startSelected = selected.find(s => s.id === source?.id);
  const endSelected = selected.find(s => s.id === target?.id);
  if (!source.id && !target.id) {
    return true;
  }
  if (!source.id && endSelected) {
    return true;
  }
  if (!target.id && startSelected) {
    return true;
  }
  if (startSelected && endSelected) {
    return true;
  }
  return false;
}

function getDirectPath(startPoint: IVec, endPoint: IVec): IVec[] {
  if (
    almostEqual(startPoint[0], endPoint[0], 0.02) ||
    almostEqual(startPoint[1], endPoint[1], 0.02)
  ) {
    return [startPoint, endPoint];
  } else {
    const vec = Vec.sub(endPoint, startPoint);
    const mid: IVec = [startPoint[0], startPoint[1] + vec[1]];
    return [startPoint, mid, endPoint];
  }
}

function mergePath(points: IVec[] | IVec3[]) {
  if (points.length === 0) return [];
  const result: IVec[] = [[points[0][0], points[0][1]]];
  for (let i = 1; i < points.length - 1; i++) {
    const cur = points[i];
    const last = points[i - 1];
    const next = points[i + 1];
    if (
      almostEqual(last[0], cur[0], 0.02) &&
      almostEqual(cur[0], next[0], 0.02)
    )
      continue;
    if (
      almostEqual(last[1], cur[1], 0.02) &&
      almostEqual(cur[1], next[1], 0.02)
    )
      continue;
    result.push([cur[0], cur[1]]);
  }
  if (points.length !== 0) {
    result.push([points[points.length - 1][0], points[points.length - 1][1]]);
  }
  for (let i = 0; i < result.length - 1; i++) {
    const cur = result[i];
    const next = result[i + 1];
    const isAlmostEqual =
      almostEqual(cur[0], next[0], 0.02) || almostEqual(cur[1], next[1], 0.02);
    if (!isAlmostEqual) {
      console.warn('Expected equal points');
      console.warn(points);
      console.warn(result);
    }
  }
  return result;
}

function computeOffset(startBound: Bound | null, endBound: Bound | null) {
  const startOffset = [20, 20, 20, 20];
  const endOffset = [20, 20, 20, 20];
  if (!(startBound && endBound)) {
    return [startOffset, endOffset];
  }
  // left, top, right, bottom
  let overlap = isOverlap(startBound.upperLine, endBound.lowerLine, 0, false);
  let dist: number;
  if (overlap && startBound.upperLine[0][1] > endBound.lowerLine[0][1]) {
    dist = Vec.distanceToLineSegment(
      startBound.upperLine[0],
      startBound.upperLine[1],
      endBound.lowerLine[0],
      false
    );
    startOffset[1] = Math.max(Math.min(dist / 2, startOffset[1]), 0);
  }

  overlap = isOverlap(startBound.rightLine, endBound.leftLine, 1, false);
  if (overlap && startBound.rightLine[0][0] < endBound.leftLine[0][0]) {
    dist = Vec.distanceToLineSegment(
      startBound.rightLine[0],
      startBound.rightLine[1],
      endBound.leftLine[0],
      false
    );
    startOffset[2] = Math.max(Math.min(dist / 2, startOffset[2]), 0);
  }

  overlap = isOverlap(startBound.lowerLine, endBound.upperLine, 0, false);
  if (overlap && startBound.lowerLine[0][1] < endBound.upperLine[0][1]) {
    dist = Vec.distanceToLineSegment(
      startBound.lowerLine[0],
      startBound.lowerLine[1],
      endBound.upperLine[0],
      false
    );
    startOffset[3] = Math.max(Math.min(dist / 2, startOffset[3]), 0);
  }

  startOffset[0] = endOffset[2] =
    Math.min(startOffset[0], endOffset[2]) === 0
      ? 20
      : Math.min(startOffset[0], endOffset[2]);
  startOffset[1] = endOffset[3] =
    Math.min(startOffset[1], endOffset[3]) === 0
      ? 20
      : Math.min(startOffset[1], endOffset[3]);
  startOffset[2] = endOffset[0] =
    Math.min(startOffset[2], endOffset[0]) === 0
      ? 20
      : Math.min(startOffset[2], endOffset[0]);
  startOffset[3] = endOffset[1] =
    Math.min(startOffset[3], endOffset[1]) === 0
      ? 20
      : Math.min(startOffset[3], endOffset[1]);

  return [startOffset, endOffset];
}

function getNextPoint(
  bound: Bound,
  point: PointLocation,
  offsetX = 10,
  offsetY = 10,
  offsetW = 10,
  offsetH = 10
) {
  const result: IVec = [point[0], point[1]];
  if (almostEqual(bound.x, result[0])) result[0] -= offsetX;
  else if (almostEqual(bound.y, result[1])) result[1] -= offsetY;
  else if (almostEqual(bound.maxX, result[0])) result[0] += offsetW;
  else if (almostEqual(bound.maxY, result[1])) result[1] += offsetH;
  else {
    const direction = Vec.normalize(Vec.sub(result, bound.center));
    const xDirection = direction[0] > 0 ? 1 : -1;
    const yDirection = direction[1] > 0 ? 1 : -1;

    const slope =
      Math.abs(point.tangent[0]) < Math.abs(point.tangent[1]) ? 0 : 1;
    // if the slope is big, use the x direction
    if (slope === 0) {
      if (xDirection > 0) {
        const intersects = lineIntersects(
          bound.rightLine[0],
          bound.rightLine[1],
          result,
          [bound.maxX + 10, result[1]]
        );
        if (!intersects) {
          throw new BlockSuiteError(
            BlockSuiteError.ErrorCode.ValueNotExists,
            'Failed to get line intersections for getNextPoint'
          );
        }
        result[0] = intersects[0] + offsetX;
      } else {
        const intersects = lineIntersects(
          bound.leftLine[0],
          bound.leftLine[1],
          result,
          [bound.x - 10, result[1]]
        );
        if (!intersects) {
          throw new BlockSuiteError(
            BlockSuiteError.ErrorCode.ValueNotExists,
            'Failed to get line intersections for getNextPoint'
          );
        }
        result[0] = intersects[0] - offsetX;
      }
    } else {
      if (yDirection > 0) {
        const intersects = lineIntersects(
          bound.lowerLine[0],
          bound.lowerLine[1],
          result,
          [result[0], bound.maxY + 10]
        );
        if (!intersects) {
          throw new BlockSuiteError(
            BlockSuiteError.ErrorCode.ValueNotExists,
            'Failed to get line intersections for getNextPoint'
          );
        }
        result[1] = intersects[1] + offsetY;
      } else {
        const intersects = lineIntersects(
          bound.upperLine[0],
          bound.upperLine[1],
          result,
          [result[0], bound.y - 10]
        );
        if (!intersects) {
          throw new BlockSuiteError(
            BlockSuiteError.ErrorCode.ValueNotExists,
            'Failed to get line intersections for getNextPoint'
          );
        }
        result[1] = intersects[1] - offsetY;
      }
    }
  }
  return result;
}

function computeNextStartEndpoint(
  startPoint: PointLocation,
  endPoint: PointLocation,
  startBound: Bound | null,
  endBound: Bound | null,
  startOffset: number[] | null,
  endOffset: number[] | null
) {
  const nextStartPoint =
    startBound && startOffset
      ? getNextPoint(
          startBound,
          startPoint,
          startOffset[0],
          startOffset[1],
          startOffset[2],
          startOffset[3]
        )
      : startPoint;
  const lastEndPoint =
    endBound && endOffset
      ? getNextPoint(
          endBound,
          endPoint,
          endOffset[0],
          endOffset[1],
          endOffset[2],
          endOffset[3]
        )
      : endPoint;
  return [nextStartPoint, lastEndPoint];
}

function adjustStartEndPoint(
  startPoint: IVec3,
  endPoint: IVec3,
  startBound: Bound | null = null,
  endBound: Bound | null = null
) {
  if (!endBound) {
    if (
      Math.abs(endPoint[0] - startPoint[0]) >
      Math.abs(endPoint[1] - startPoint[1])
    ) {
      endPoint[0] += sign(endPoint[0] - startPoint[0]) * 20;
    } else {
      endPoint[1] += sign(endPoint[1] - startPoint[1]) * 20;
    }
  }
  if (!startBound) {
    if (
      Math.abs(endPoint[0] - startPoint[0]) >
      Math.abs(endPoint[1] - startPoint[1])
    ) {
      startPoint[0] -= sign(endPoint[0] - startPoint[0]) * 20;
    } else {
      startPoint[1] -= sign(endPoint[1] - startPoint[1]) * 20;
    }
  }
}

function renderRect(
  ctx: CanvasRenderingContext2D,
  bounds: IBound,
  color: string,
  lineWidth: number
) {
  const { x, y, w, h } = bounds;
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([lineWidth * 2, lineWidth * 2]);
  ctx.strokeRect(x, y, w, h);
  ctx.closePath();
  ctx.restore();
}

export class ConnectionOverlay extends Overlay {
  static override overlayName = 'connection';

  private _emphasisColor: string;

  private _themeDisposer: (() => void) | null = null;

  highlightPoint: IVec | null = null;

  points: IVec[] = [];

  sourceBounds: IBound | null = null;

  targetBounds: IBound | null = null;

  constructor(gfx: GfxController) {
    super(gfx);
    this._emphasisColor = this._getEmphasisColor();
    this._setupThemeListener();
  }

  private _findConnectablesInViews() {
    const gfx = this.gfx;
    const bound = gfx.viewport.viewportBounds;
    return gfx.getElementsByBound(bound).filter(ele => ele.connectable);
  }

  private _getEmphasisColor(): string {
    return getComputedStyle(this.gfx.std.host).getPropertyValue(
      '--affine-text-emphasis-color'
    );
  }

  private _setupThemeListener(): void {
    const themeService = this.gfx.std.get(ThemeProvider);
    this._themeDisposer = effect(() => {
      void themeService.theme$.value;
      this._emphasisColor = this._getEmphasisColor();
    });
  }

  _clearRect() {
    this.points = [];
    this.highlightPoint = null;
    this._renderer?.refresh();
  }

  override clear() {
    this.sourceBounds = null;
    this.targetBounds = null;
    this._clearRect();
  }

  override dispose() {
    this._themeDisposer?.();
    if (!this._renderer) return;
    this._renderer.removeOverlay(this);
    this._renderer = null;
  }

  override render(ctx: CanvasRenderingContext2D): void {
    const zoom = this.gfx.viewport.zoom;
    const radius = 5 / zoom;
    const color = this._emphasisColor;
    ctx.globalAlpha = 0.3; // Reduced from 0.6 to make lighter
    let lineWidth = 1 / zoom;
    if (this.sourceBounds) {
      renderRect(ctx, this.sourceBounds, color, lineWidth);
    }
    if (this.targetBounds) {
      renderRect(ctx, this.targetBounds, color, lineWidth);
    }

    // Keep lineWidth at 1px instead of 2px for thinner strokes
    this.points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p[0], p[1], radius, 0, PI2);
      ctx.fillStyle = 'white';
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth; // Now using 1/zoom instead of 2/zoom
      ctx.fill();
      ctx.stroke();
      ctx.closePath();
    });

    ctx.globalAlpha = 1;
    if (this.highlightPoint) {
      ctx.beginPath();
      ctx.arc(this.highlightPoint[0], this.highlightPoint[1], radius, 0, PI2);
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1 / zoom; // Use 1px stroke for consistency
      ctx.fill();
      ctx.stroke();
      ctx.closePath();
    }
  }

  /**
   * Render the connector at the given point. It will try to find
   * the closest connectable element and render the connector. If the
   * point is not close to any connectable element, it will just render
   * the connector at the given point.
   * @param point the point to render the connector
   * @param excludedIds the ids of the elements that should be excluded
   * @returns the connection result
   */
  renderConnector(point: IVec, excludedIds: string[] = []) {
    const connectables = this._findConnectablesInViews();
    const context = this.gfx;
    const target = [];

    this._clearRect();

    let result: Connection | null = null;
    // oxlint-disable-next-line typescript/prefer-for-of
    for (let i = 0; i < connectables.length; i++) {
      const connectable = connectables[i];
      // first check if in excluedIds
      if (excludedIds.includes(connectable.id)) continue;

      // then check if in expanded bound
      const bound = Bound.deserialize(connectable.xywh);
      const rotateBound = Bound.from(getBoundWithRotation(rBound(connectable)));
      // FIXME: the real path needs to be expanded: diamod, ellipse, trangle.
      if (!rotateBound.expand(10).isPointInBound(point)) continue;

      // then check if closes to anchors
      const anchors = getAnchors(connectable);
      const len = anchors.length;
      const pointerViewCoord = context.viewport.toViewCoord(point[0], point[1]);

      let shortestDistance = Number.POSITIVE_INFINITY;
      let j = 0;

      this.points = anchors.map(a => a.point);

      for (; j < len; j++) {
        const anchor = anchors[j];
        const anchorViewCoord = context.viewport.toViewCoord(
          anchor.point[0],
          anchor.point[1]
        );
        const d = Vec.dist(anchorViewCoord, pointerViewCoord);
        if (d < shortestDistance) {
          shortestDistance = d;
          target.push(connectable);
          this.highlightPoint = anchor.point;
          result = {
            id: connectable.id,
            position: anchor.coord,
          };
        }
      }

      if (shortestDistance < 8 && result) break;

      // if not, check if closes to bound
      const nearestPoint = connectable.getNearestPoint(point);

      if (Vec.dist(nearestPoint, point) < 8) {
        this.highlightPoint = nearestPoint;
        const originPoint = getPointFromBoundsWithRotation(
          rBound(connectable, true),
          nearestPoint
        );
        this._renderer?.refresh();
        target.push(connectable);
        result = {
          id: connectable.id,
          position: Vec.clampV(bound.toRelative(originPoint), 0, 1),
        };
      }

      if (result) continue;

      // if not, check if in inside of the element
      if (
        connectable.includesPoint(
          point[0],
          point[1],
          {
            ignoreTransparent: false,
          },
          this.gfx.std.host
        )
      ) {
        target.push(connectable);
        result = {
          id: connectable.id,
        };
      }
    }

    if (last(target) instanceof GroupElementModel) {
      this.targetBounds = Bound.deserialize(last(target)!.xywh);
    } else {
      this.targetBounds = null;
    }

    // at last, if not, just return the point
    if (!result) {
      result = {
        position: point,
      };
    }

    this._renderer?.refresh();

    return result;
  }
}

export class PathGenerator {
  protected _aStarRunner: AStarRunner | null = null;

  protected _prepareOrthogonalConnectorInfo(
    connectorInfo: OrthogonalConnectorInput
  ): [
    IVec,
    IVec,
    IVec,
    IVec,
    Bound | null,
    Bound | null,
    Bound | null,
    Bound | null,
  ] {
    const { startBound, endBound, startPoint, endPoint } = connectorInfo;

    const [startOffset, endOffset] = computeOffset(startBound, endBound);
    const [nextStartPoint, lastEndPoint] = computeNextStartEndpoint(
      startPoint,
      endPoint,
      startBound,
      endBound,
      startOffset,
      endOffset
    );
    const expandStartBound = startBound
      ? startBound.expand(
          startOffset[0],
          startOffset[1],
          startOffset[2],
          startOffset[3]
        )
      : null;
    const expandEndBound = endBound
      ? endBound.expand(endOffset[0], endOffset[1], endOffset[2], endOffset[3])
      : null;

    return [
      startPoint,
      endPoint,
      nextStartPoint,
      lastEndPoint,
      startBound,
      endBound,
      expandStartBound,
      expandEndBound,
    ];
  }

  generateOrthogonalConnectorPath(input: OrthogonalConnectorInput): IVec[] {
    const info = this._prepareOrthogonalConnectorInfo(input);
    const [startPoint, endPoint, nextStartPoint, lastEndPoint] = info;
    const [, , , , startBound, endBound, expandStartBound, expandEndBound] =
      info;
    const blocks = [];
    const expandBlocks = [];
    startBound && blocks.push(startBound.clone());
    endBound && blocks.push(endBound.clone());
    expandStartBound && expandBlocks.push(expandStartBound.clone());
    expandEndBound && expandBlocks.push(expandEndBound.clone());

    // nextStartPoint/lastEndPoint differ from the raw startPoint/endPoint
    // exactly when that end is anchored to a specific bound edge and needs
    // to exit perpendicular to it (see getNextPoint) -- e.g. a connector
    // pinned to a shape's west-face midpoint. The three shortcuts below
    // return a bare straight line between the *raw* points, skipping both
    // anchors entirely: correct when neither end actually needs one, but
    // wrong once a real anchor exists -- confirmed live: two shapes
    // connected west-face-to-west-face collapse to a straight vertical
    // connector instead of keeping the perpendicular "staple" shape once
    // they're dragged close enough to trigger one of these shortcuts. Only
    // take the shortcut when both ends are already anchor-free.
    const noStartAnchor =
      almostEqual(nextStartPoint[0], startPoint[0], 0.02) &&
      almostEqual(nextStartPoint[1], startPoint[1], 0.02);
    const noEndAnchor =
      almostEqual(lastEndPoint[0], endPoint[0], 0.02) &&
      almostEqual(lastEndPoint[1], endPoint[1], 0.02);

    if (noStartAnchor && noEndAnchor) {
      if (
        startBound &&
        endBound &&
        startBound.isPointInBound(endPoint) &&
        endBound.isPointInBound(startPoint)
      ) {
        return getDirectPath(startPoint, endPoint);
      }

      if (startBound && expandStartBound?.isPointInBound(endPoint, 0)) {
        return getDirectPath(startPoint, endPoint);
      }

      if (endBound && expandEndBound?.isPointInBound(startPoint, 0)) {
        return getDirectPath(startPoint, endPoint);
      }
    }

    const points = computePoints(
      startPoint,
      endPoint,
      nextStartPoint,
      lastEndPoint,
      startBound,
      endBound,
      expandStartBound,
      expandEndBound
    );
    const finalPoints = points[0];
    const [, startPointV3, endPointV3, nextStartPointV3, lastEndPointV3] =
      points;

    adjustStartEndPoint(startPointV3, endPointV3, startBound, endBound);
    this._aStarRunner = new AStarRunner(
      finalPoints,
      nextStartPointV3,
      lastEndPointV3,
      startPointV3,
      endPointV3,
      blocks,
      expandBlocks
    );
    this._aStarRunner.run();
    const path = this._aStarRunner.path;
    if (!endBound) path.pop();
    if (!startBound) path.shift();

    return mergePath(path);
  }
}

export class ConnectorPathGenerator extends PathGenerator {
  constructor(
    private readonly options: {
      getElementById: (id: string) => GfxModel | null;
    }
  ) {
    super();
  }

  static updatePath(
    connector: ConnectorElementModel | LocalConnectorElementModel,
    path: PointLocation[] | null,
    elementGetter?: (id: string) => GfxModel | null
  ) {
    const instance = new ConnectorPathGenerator({
      getElementById: elementGetter ?? (() => null),
    });
    const points = path ?? instance._generateConnectorPath(connector) ?? [];
    // Curve mode uses bezier bounding box, others use simple point bounds
    const bound =
      connector.mode === ConnectorMode.Curve
        ? getBezierCurveBoundingBox(getBezierParameters(points))
        : getBoundFromPoints(points);
    const relativePoints = points.map((p: PointLocation) => {
      return p.setVec(Vec.sub(p, [bound.x, bound.y]));
    });

    connector.updatingPath = true;
    // the property assignment order matters
    connector.xywh = bound.serialize();
    connector.path = relativePoints;

    // Updates Connector's Label position.
    if (isConnectorWithLabel(connector)) {
      const model = connector as ConnectorElementModel;
      const [cx, cy] = model.getPointByOffsetDistance(
        model.labelOffset.distance
      );
      const [, , w, h] = model.labelXYWH!;
      model.labelXYWH = [cx - w / 2, cy - h / 2, w, h];
    }

    connector.updatingPath = false;
  }

  private _computeStartEndPoint(
    connector: ConnectorElementModel | LocalConnectorElementModel
  ) {
    const { source, target } = connector;
    const start = this._getConnectorEndElement(connector, 'source');
    const end = this._getConnectorEndElement(connector, 'target');

    let startPoint: PointLocation | null = null;
    let endPoint: PointLocation | null = null;
    if (
      source.id &&
      !source.position &&
      target.id &&
      !target.position &&
      start &&
      end
    ) {
      const startAnchors = getAnchors(start);
      const endAnchors = getAnchors(end);
      let minDist = Infinity;
      let minStartAnchor = new PointLocation();
      let minEndAnchor = new PointLocation();
      for (const sa of startAnchors) {
        for (const ea of endAnchors) {
          const dist = Vec.dist(sa.point, ea.point);
          if (dist + 0.1 < minDist) {
            minDist = dist;
            minStartAnchor = sa.point;
            minEndAnchor = ea.point;
          }
        }
      }
      startPoint = minStartAnchor;
      endPoint = minEndAnchor;
    } else {
      startPoint = this._getConnectionPoint(connector, 'source');
      endPoint = this._getConnectionPoint(connector, 'target');
    }

    if (!startPoint || !endPoint) return [];

    return [startPoint, endPoint];
  }

  private _generateConnectorPath(
    connector: ConnectorElementModel | LocalConnectorElementModel
  ) {
    const { mode } = connector;
    if (mode === ConnectorMode.Straight) {
      return this._generateStraightConnectorPath(connector);
    } else if (
      mode === ConnectorMode.Orthogonal ||
      mode === ConnectorMode.Rounded
    ) {
      // Rounded uses the same path generation as Orthogonal,
      // the rounded corners are handled during rendering
      const start = this._getConnectorEndElement(connector, 'source');
      const end = this._getConnectorEndElement(connector, 'target');

      const [startPoint, endPoint] = this._computeStartEndPoint(connector);

      const startBound = start
        ? Bound.from(getBoundWithRotation(rBound(start)))
        : null;
      const endBound = end
        ? Bound.from(getBoundWithRotation(rBound(end)))
        : null;

      // Check for user-defined waypoints (only on ConnectorElementModel, not Local)
      const waypoints =
        'waypoints' in connector ? connector.waypoints : undefined;

      if (waypoints && waypoints.length > 0) {
        // Route through waypoints
        return this._generatePathThroughWaypoints(
          startPoint,
          endPoint,
          startBound,
          endBound,
          waypoints
        );
      }

      const path = this.generateOrthogonalConnectorPath({
        startPoint,
        endPoint,
        startBound,
        endBound,
      });
      return path.map(p => new PointLocation(p));
    } else if (mode === ConnectorMode.Curve) {
      return this._generateCurveConnectorPath(connector);
    }
    throw new Error('unknown connector mode');
  }

  /**
   * Generate a path that routes through user-defined waypoints.
   * Waypoints are intermediate turn points that the connector must pass through.
   */
  private _generatePathThroughWaypoints(
    startPoint: PointLocation,
    endPoint: PointLocation,
    _startBound: Bound | null,
    _endBound: Bound | null,
    waypoints: IVec[]
  ): PointLocation[] {
    const [, , nextStartPoint, lastEndPoint] =
      this._prepareOrthogonalConnectorInfo({
        startPoint,
        endPoint,
        startBound: _startBound,
        endBound: _endBound,
      });

    const pointsEqual = (a: IVec | PointLocation, b: IVec | PointLocation) =>
      Math.abs(a[0] - b[0]) < 0.001 && Math.abs(a[1] - b[1]) < 0.001;

    // Build path by connecting: start -> tail anchor -> wp1 -> ... -> tail anchor -> end
    // Waypoints represent intermediate turn points; tail anchors preserve orientation.

    const fullPath: PointLocation[] = [startPoint];

    // For orthogonal connectors, waypoints define the turn points.
    // We build a path through them while keeping tail anchors perpendicular.

    const startAnchor = new PointLocation(nextStartPoint);
    if (!pointsEqual(startPoint, nextStartPoint)) {
      fullPath.push(startAnchor);
    }

    let currentPoint = startAnchor;

    // Small tolerance to avoid creating micro-segments from tiny float drift.
    const axisEpsilon = 0.5;

    waypoints.forEach((wp, index) => {
      // Create orthogonal path from current point to waypoint
      // We need to determine if we should go horizontal-then-vertical
      // or vertical-then-horizontal based on the direction

      const dx = wp[0] - currentPoint[0];
      const dy = wp[1] - currentPoint[1];

      const prevWaypoint = index > 0 ? waypoints[index - 1] : null;
      const isDuplicateWaypoint =
        prevWaypoint &&
        Math.abs(prevWaypoint[0] - wp[0]) <= axisEpsilon &&
        Math.abs(prevWaypoint[1] - wp[1]) <= axisEpsilon;

      // For the first segment from start, prefer to exit based on start bound
      // For subsequent segments, alternate based on previous direction

      // Preserve explicit duplicate waypoints to create a zero-length segment.
      if (
        isDuplicateWaypoint &&
        Math.abs(dx) <= axisEpsilon &&
        Math.abs(dy) <= axisEpsilon
      ) {
        fullPath.push(new PointLocation([currentPoint[0], currentPoint[1]]));
        return;
      }

      // If both axes move beyond tolerance, add an elbow.
      if (Math.abs(dx) > axisEpsilon && Math.abs(dy) > axisEpsilon) {
        // Need a turn - add intermediate point
        // Go horizontal first, then vertical
        const intermediate = new PointLocation([wp[0], currentPoint[1]]);
        fullPath.push(intermediate);
      }

      // Snap near-aligned points to avoid tiny segments.
      const snappedWp: IVec = [
        Math.abs(dx) <= axisEpsilon ? currentPoint[0] : wp[0],
        Math.abs(dy) <= axisEpsilon ? currentPoint[1] : wp[1],
      ];
      // If snapping collapses the point, skip it.
      if (
        Math.abs(snappedWp[0] - currentPoint[0]) <= axisEpsilon &&
        Math.abs(snappedWp[1] - currentPoint[1]) <= axisEpsilon
      ) {
        return;
      }

      const wpPoint = new PointLocation(snappedWp);
      fullPath.push(wpPoint);
      currentPoint = wpPoint;
    });

    // Final segment: last waypoint (or start anchor) to end anchor/end
    const endAnchor = new PointLocation(lastEndPoint);
    const lastPoint = fullPath[fullPath.length - 1];
    const dx = endAnchor[0] - lastPoint[0];
    const dy = endAnchor[1] - lastPoint[1];

    if (Math.abs(dx) > axisEpsilon && Math.abs(dy) > axisEpsilon) {
      // Need a turn to reach end - add intermediate point
      // Go horizontal first to align X, then vertical
      const intermediate = new PointLocation([endAnchor[0], lastPoint[1]]);
      fullPath.push(intermediate);
    }

    if (!pointsEqual(lastPoint, endAnchor)) {
      fullPath.push(endAnchor);
    }

    if (!pointsEqual(endAnchor, endPoint)) {
      fullPath.push(endPoint);
    }

    return fullPath;
  }

  private _generateCurveConnectorPath(
    connector: ConnectorElementModel | LocalConnectorElementModel
  ) {
    const { source, target } = connector;
    const startElement = source.id
      ? this._getConnectorEndElement(connector, 'source')
      : null;
    const endElement = target.id
      ? this._getConnectorEndElement(connector, 'target')
      : null;
    let startPoint: PointLocation | null = null;
    let endPoint: PointLocation | null = null;

    if (source.id || target.id) {
      if (!source.position && !target.position) {
        const start = this._getConnectorEndElement(
          connector,
          'source'
        ) as Connectable;
        const end = this._getConnectorEndElement(
          connector,
          'target'
        ) as Connectable;
        const sb = Bound.deserialize(start.xywh);
        const eb = Bound.deserialize(end.xywh);
        startPoint = getNearestConnectableAnchor(start, eb.center);
        endPoint = getNearestConnectableAnchor(end, sb.center);
      } else {
        startPoint = this._getConnectionPoint(connector, 'source');
        endPoint = this._getConnectionPoint(connector, 'target');
      }

      if (!startPoint || !endPoint) return [];

      if (source.id) {
        const startTangentVertical = this._resolveTangentVertical(
          startPoint,
          startElement
        );
        startPoint.out = isVecZero(startTangentVertical)
          ? Vec.mul(Vec.per(Vec.normalize(Vec.sub(startPoint, endPoint))), 20)
          : Vec.mul(
              startTangentVertical,
              Math.max(
                100,
                Math.abs(
                  Vec.pry(Vec.sub(endPoint, startPoint), startTangentVertical)
                ) / 3
              )
            );
      }
      if (target.id) {
        const endTangentVertical = this._resolveTangentVertical(
          endPoint,
          endElement
        );
        endPoint.in = isVecZero(endTangentVertical)
          ? Vec.mul(Vec.per(Vec.normalize(Vec.sub(endPoint, startPoint))), 20)
          : Vec.mul(
              endTangentVertical,
              Math.max(
                100,
                Math.abs(
                  Vec.pry(Vec.sub(startPoint, endPoint), endTangentVertical)
                ) / 3
              )
            );
      }
      return [startPoint, endPoint];
    } else {
      startPoint = this._getConnectionPoint(connector, 'source');
      endPoint = this._getConnectionPoint(connector, 'target');

      if (!startPoint || !endPoint) return [];

      if (
        Math.abs(endPoint[0] - startPoint[0]) >
        Math.abs(endPoint[1] - startPoint[1])
      ) {
        startPoint.out = [Vec.mul(Vec.sub(endPoint, startPoint), 2 / 3)[0], 0];
        endPoint.in = [Vec.mul(Vec.sub(startPoint, endPoint), 2 / 3)[0], 0];
      } else {
        startPoint.out = [0, Vec.mul(Vec.sub(endPoint, startPoint), 2 / 3)[1]];
        endPoint.in = [0, Vec.mul(Vec.sub(startPoint, endPoint), 2 / 3)[1]];
      }
      return [startPoint, endPoint];
    }
  }

  private _generateStraightConnectorPath(
    connector: ConnectorElementModel | LocalConnectorElementModel
  ) {
    const { source, target } = connector;
    if (source.id && !source.position && target.id && !target.position) {
      const start = this._getConnectorEndElement(
        connector,
        'source'
      ) as Connectable;
      const end = this._getConnectorEndElement(
        connector,
        'target'
      ) as Connectable;
      const sb = Bound.deserialize(start.xywh);
      const eb = Bound.deserialize(end.xywh);
      const startPoint = getNearestConnectableAnchor(start, eb.center);
      const endPoint = getNearestConnectableAnchor(end, sb.center);
      return (startPoint && endPoint && [startPoint, endPoint]) ?? [];
    } else {
      const endPoint = this._getConnectionPoint(connector, 'target');
      const startPoint = this._getConnectionPoint(connector, 'source');
      return (startPoint && endPoint && [startPoint, endPoint]) ?? [];
    }
  }

  private _getConnectionPoint(
    connector: ConnectorElementModel | LocalConnectorElementModel,
    type: 'source' | 'target'
  ): PointLocation | null {
    const connection = connector[type];

    if (!connection) return null;

    const connectable = this._getConnectorEndElement(connector, type);

    if (!connectable && connection.position) {
      return PointLocation.fromVec(connection.position);
    }

    if (!connectable) return null;

    let point: PointLocation | null = null;

    if (connection.position) {
      point = getConnectableRelativePosition(connectable, connection.position);
    } else {
      const anotherType = type === 'source' ? 'target' : 'source';
      const otherPoint = this._getConnectionPoint(connector, anotherType);
      if (otherPoint) {
        point = getNearestConnectableAnchor(connectable, otherPoint);
      }
    }

    return point;
  }

  private _resolveTangentVertical(
    point: PointLocation,
    element: Connectable | null
  ) {
    let tangentVertical = Vec.rot(point.tangent, -Math.PI / 2);
    if (!element || isVecZero(tangentVertical)) {
      return tangentVertical;
    }

    const center = Bound.deserialize(element.xywh).center;
    const centerToAnchor = Vec.sub(point, center);
    if (
      tangentVertical[0] * centerToAnchor[0] +
        tangentVertical[1] * centerToAnchor[1] <
      0
    ) {
      tangentVertical = Vec.mul(tangentVertical, -1);
    }

    return tangentVertical;
  }

  private _getConnectorEndElement(
    connector: ConnectorElementModel | LocalConnectorElementModel,
    type: 'source' | 'target'
  ): Connectable | null {
    const id = connector[type].id;

    if (id) {
      const element = this.options.getElementById(id) as Connectable | null;
      if (!element) return null;
      if (
        'hidden' in element &&
        element.hidden &&
        'collapseProxyId' in element &&
        typeof element.collapseProxyId === 'string'
      ) {
        const proxy = this.options.getElementById(
          element.collapseProxyId
        ) as Connectable | null;
        if (proxy) return proxy;
      }
      return element;
    }

    return null;
  }

  hasRelatedElement(
    connecter: ConnectorElementModel | LocalConnectorElementModel
  ) {
    const { source, target } = connecter;
    if (
      (source.id && !this.options.getElementById(source.id)) ||
      (target.id && !this.options.getElementById(target.id))
    ) {
      return false;
    }

    return true;
  }
}
