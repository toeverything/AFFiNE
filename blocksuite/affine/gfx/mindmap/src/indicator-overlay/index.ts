import { Overlay } from '@blocksuite/affine-block-surface';
import { PathGenerator } from '@blocksuite/affine-gfx-connector';
import {
  ConnectorMode,
  LayoutType,
  type MindmapElementModel,
  type MindmapNode,
} from '@blocksuite/affine-model';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import {
  type Bound,
  isVecZero,
  type IVec,
  PointLocation,
  toRadian,
  Vec,
} from '@blocksuite/global/gfx';
import last from 'lodash-es/last';

import { NODE_HORIZONTAL_SPACING, NODE_VERTICAL_SPACING } from '../view/layout';

export class MindMapIndicatorOverlay extends Overlay {
  static INDICATOR_SIZE = [48, 22];

  static override overlayName: string = 'mindmap-indicator';

  currentDragPos: IVec | null = null;

  direction: LayoutType.LEFT | LayoutType.RIGHT = LayoutType.RIGHT;

  dragNodeImage: HTMLCanvasElement | null = null;

  dragNodePos: IVec = [0, 0];

  mode: ConnectorMode = ConnectorMode.Straight;

  parentBound: Bound | null = null;

  pathGen = new PathGenerator();

  targetBound: Bound | null = null;

  get themeService() {
    return this.gfx.std.get(ThemeProvider);
  }

  private _generatePath() {
    const startRelativePos =
      this.direction === LayoutType.RIGHT
        ? PointLocation.fromVec([1, 0.5])
        : PointLocation.fromVec([0, 0.5]);
    const endRelativePos =
      this.direction === LayoutType.RIGHT
        ? PointLocation.fromVec([0, 0.5])
        : PointLocation.fromVec([1, 0.5]);
    const { parentBound, targetBound: newPosBound } = this;

    if (this.mode === ConnectorMode.Orthogonal) {
      return this.pathGen
        .generateOrthogonalConnectorPath({
          startPoint: this._getRelativePoint(parentBound!, startRelativePos),
          endPoint: this._getRelativePoint(newPosBound!, endRelativePos),
          startBound: parentBound,
          endBound: newPosBound,
        })
        .map(p => new PointLocation(p));
    } else if (this.mode === ConnectorMode.Curve) {
      const startPoint = this._getRelativePoint(
        this.parentBound!,
        startRelativePos
      );
      const endPoint = this._getRelativePoint(
        this.targetBound!,
        endRelativePos
      );

      const startTangentVertical = Vec.rot(startPoint.tangent, -Math.PI / 2);
      startPoint.out = Vec.mul(
        startTangentVertical,
        Math.max(
          100,
          Math.abs(
            Vec.pry(Vec.sub(endPoint, startPoint), startTangentVertical)
          ) / 3
        )
      );

      const endTangentVertical = Vec.rot(endPoint.tangent, -Math.PI / 2);
      endPoint.in = Vec.mul(
        endTangentVertical,
        Math.max(
          100,
          Math.abs(Vec.pry(Vec.sub(startPoint, endPoint), endTangentVertical)) /
            3
        )
      );

      return [startPoint, endPoint];
    } else {
      const startPoint = new PointLocation(
        this.parentBound!.getRelativePoint(startRelativePos)
      );
      const endPoint = new PointLocation(
        this.targetBound!.getRelativePoint(endRelativePos)
      );

      return [startPoint, endPoint];
    }
  }

  private _getRelativePoint(bound: Bound, position: IVec) {
    const location = new PointLocation(
      bound.getRelativePoint(position as IVec)
    );

    if (isVecZero(Vec.sub(position, [0, 0.5])))
      location.tangent = Vec.rot([0, -1], toRadian(0));
    else if (isVecZero(Vec.sub(position, [1, 0.5])))
      location.tangent = Vec.rot([0, 1], toRadian(0));
    else if (isVecZero(Vec.sub(position, [0.5, 0])))
      location.tangent = Vec.rot([1, 0], toRadian(0));
    else if (isVecZero(Vec.sub(position, [0.5, 1])))
      location.tangent = Vec.rot([-1, 0], toRadian(0));

    return location;
  }

  /**
   * Use to calculate the position of the indicator given its sibling's bound
   * @param siblingBound
   * @param direction
   */
  private _moveRelativeToBound(
    siblingBound: Bound,
    direction: 'up' | 'down',
    layoutDir: Exclude<LayoutType, LayoutType.BALANCE>
  ) {
    const isLeftLayout = layoutDir === LayoutType.LEFT;
    const isUpDirection = direction === 'up';

    return siblingBound.moveDelta(
      isLeftLayout
        ? siblingBound.w - MindMapIndicatorOverlay.INDICATOR_SIZE[0]
        : 0,
      isUpDirection
        ? -(
            NODE_VERTICAL_SPACING / 2 +
            MindMapIndicatorOverlay.INDICATOR_SIZE[1] / 2
          )
        : siblingBound.h +
            NODE_VERTICAL_SPACING / 2 -
            MindMapIndicatorOverlay.INDICATOR_SIZE[1] / 2
    );
  }

  override clear() {
    this.targetBound = null;
    this.parentBound = null;
  }

  override render(ctx: CanvasRenderingContext2D): void {
    if (this.currentDragPos && this.dragNodeImage) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.drawImage(
        this.dragNodeImage,
        this.currentDragPos[0] + this.dragNodePos[0],
        this.currentDragPos[1] + this.dragNodePos[1],
        this.dragNodeImage.width / 2,
        this.dragNodeImage.height / 2
      );
      ctx.restore();
    }

    if (!this.parentBound || !this.targetBound) {
      return;
    }

    const targetPos = this.targetBound;
    const points = this._generatePath();
    const color = this.themeService.getColorValue(
      '--affine-primary-color',
      '#1E96EB',
      true
    );

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.roundRect(targetPos.x, targetPos.y, targetPos.w, targetPos.h, 4);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);

    if (this.mode === ConnectorMode.Curve) {
      points.forEach((point, idx) => {
        if (idx === 0) return;
        const last = points[idx - 1];
        ctx.bezierCurveTo(
          last.absOut[0],
          last.absOut[1],
          point.absIn[0],
          point.absIn[1],
          point[0],
          point[1]
        );
      });
    } else {
      points.forEach((point, idx) => {
        if (idx === 0) return;
        ctx.lineTo(point[0], point[1]);
      });
    }

    ctx.stroke();
    ctx.closePath();
  }

  setIndicatorInfo(options: {
    targetMindMap: MindmapElementModel;
    target: MindmapNode;
    parent: MindmapNode;
    parentChildren: MindmapNode[];
    insertPosition:
      | {
          type: 'sibling';
          layoutDir: Exclude<LayoutType, LayoutType.BALANCE>;
          position: 'prev' | 'next';
        }
      | { type: 'child'; layoutDir: Exclude<LayoutType, LayoutType.BALANCE> };
    path: number[];
  }) {
    const {
      insertPosition,
      parent,
      parentChildren,
      targetMindMap,
      target,
      path,
    } = options;

    const parentBound = parent.element.elementBound;
    const isBalancedMindMap = targetMindMap.layoutType === LayoutType.BALANCE;
    const isLeftLayout = insertPosition.layoutDir === LayoutType.LEFT;
    const isFirstLevel = path.length === 2;

    this.direction = insertPosition.layoutDir;
    this.parentBound = parentBound;

    if (insertPosition.type === 'sibling') {
      const targetBound = target.element.elementBound;

      this.targetBound =
        isBalancedMindMap && isFirstLevel && isLeftLayout
          ? this._moveRelativeToBound(
              targetBound,
              insertPosition.position === 'next' ? 'up' : 'down',
              insertPosition.layoutDir
            )
          : this._moveRelativeToBound(
              targetBound,
              insertPosition.position === 'next' ? 'down' : 'up',
              insertPosition.layoutDir
            );
    } else {
      if (parentChildren.length === 0 || parent.detail.collapsed) {
        this.targetBound = parentBound.moveDelta(
          (isLeftLayout ? -1 : 1) *
            (NODE_HORIZONTAL_SPACING / 2 + parentBound.w),
          parentBound.h / 2 - MindMapIndicatorOverlay.INDICATOR_SIZE[1] / 2
        );
      } else {
        const lastChildBound = last(parentChildren)!.element.elementBound;

        this.targetBound =
          isBalancedMindMap && isFirstLevel && isLeftLayout
            ? this._moveRelativeToBound(
                lastChildBound,
                'up',
                insertPosition.layoutDir
              )
            : this._moveRelativeToBound(
                lastChildBound,
                'down',
                insertPosition.layoutDir
              );
      }
    }

    this.targetBound.w = MindMapIndicatorOverlay.INDICATOR_SIZE[0];
    this.targetBound.h = MindMapIndicatorOverlay.INDICATOR_SIZE[1];

    this.mode = targetMindMap.styleGetter.getNodeStyle(
      target,
      options.path
    ).connector.mode;
  }
}
