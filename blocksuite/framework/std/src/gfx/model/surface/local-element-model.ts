import type { IVec, SerializedXYWH, XYWH } from '@blocksuite/global/gfx';
import {
  Bound,
  deserializeXYWH,
  getPointsFromBoundWithRotation,
  linePolygonIntersects,
  PointLocation,
  polygonGetPointTangent,
  polygonNearestPoint,
  rotatePoints,
} from '@blocksuite/global/gfx';
import { mutex } from 'lib0';

import type { EditorHost } from '../../../view/index.js';
import type { GfxCompatibleInterface, PointTestOptions } from '../base.js';
import type { GfxGroupModel, GfxModel } from '../model.js';
import type { SurfaceBlockModel } from './surface-model.js';

export function prop<V, T extends GfxLocalElementModel>() {
  return function propDecorator(
    _target: ClassAccessorDecoratorTarget<T, V>,
    context: ClassAccessorDecoratorContext
  ) {
    const prop = context.name;

    return {
      init(this: T, val: unknown) {
        this._props.add(prop);
        this._local.set(prop, val);
      },
      get(this: T) {
        return this._local.get(prop);
      },
      set(this: T, val: V) {
        this._local.set(prop, val);
      },
    } as ClassAccessorDecoratorResult<T, V>;
  };
}

export abstract class GfxLocalElementModel implements GfxCompatibleInterface {
  private readonly _mutex: mutex.mutex = mutex.createMutex();

  protected _local = new Map<string | symbol, unknown>();

  /**
   * Used to store all the name of the properties that have been decorated
   * with the `@prop`
   */
  protected _props = new Set<string | symbol>();

  protected _surface: SurfaceBlockModel;

  /**
   * used to store the properties' cache key
   * when the properties required heavy computation
   */
  cache = new Map<string | symbol, unknown>();

  id: string = '';

  abstract readonly type: string;

  creator: GfxModel | null = null;

  get deserializedXYWH() {
    if (!this._local.has('deserializedXYWH')) {
      const xywh = this.xywh;
      const deserialized = deserializeXYWH(xywh);

      this._local.set('deserializedXYWH', deserialized);
    }

    return this._local.get('deserializedXYWH') as XYWH;
  }

  get elementBound() {
    return new Bound(this.x, this.y, this.w, this.h);
  }

  get group() {
    return (
      this.groupId ? this._surface.getElementById(this.groupId) : null
    ) as GfxGroupModel | null;
  }

  get groups() {
    if (this.group) {
      const groups = this._surface.getGroups(this.group.id);
      groups.unshift(this.group);

      return groups;
    }

    return [];
  }

  get h() {
    return this.deserializedXYWH[3];
  }

  get responseBound() {
    return this.elementBound.expand(this.responseExtension);
  }

  get surface() {
    return this._surface;
  }

  get w() {
    return this.deserializedXYWH[2];
  }

  get x() {
    return this.deserializedXYWH[0];
  }

  get y() {
    return this.deserializedXYWH[1];
  }

  constructor(surfaceModel: SurfaceBlockModel) {
    this._surface = surfaceModel;

    const p = new Proxy(this, {
      set: (target, prop, value) => {
        if (prop === 'xywh') {
          this._local.delete('deserializedXYWH');
        }

        // @ts-expect-error ignore
        const oldValue = target[prop as string];

        if (oldValue === value) {
          return true;
        }

        // @ts-expect-error ignore
        target[prop as string] = value;

        if (!this._props.has(prop)) {
          return true;
        }

        if (surfaceModel.localElementModels.has(p)) {
          this._mutex(() => {
            surfaceModel.localElementUpdated.next({
              model: p,
              props: {
                [prop as string]: value,
              },
              oldValues: {
                [prop as string]: oldValue,
              },
            });
          });
        }

        return true;
      },
    });

    // oxlint-disable-next-line no-constructor-return
    return p;
  }

  containsBound(bounds: Bound): boolean {
    return getPointsFromBoundWithRotation(this).some(point =>
      bounds.containsPoint(point)
    );
  }

  getLineIntersections(start: IVec, end: IVec) {
    const points = getPointsFromBoundWithRotation(this);
    return linePolygonIntersects(start, end, points);
  }

  getNearestPoint(point: IVec) {
    const points = getPointsFromBoundWithRotation(this);
    return polygonNearestPoint(points, point);
  }

  getRelativePointLocation(relativePoint: IVec) {
    const bound = Bound.deserialize(this.xywh);
    const point = bound.getRelativePoint(relativePoint);
    const rotatePoint = rotatePoints([point], bound.center, this.rotate)[0];
    const points = rotatePoints(bound.points, bound.center, this.rotate);
    const tangent = polygonGetPointTangent(points, rotatePoint);
    return new PointLocation(rotatePoint, tangent);
  }

  includesPoint(
    x: number,
    y: number,
    opt: PointTestOptions,
    __: EditorHost
  ): boolean {
    const bound = opt.useElementBound ? this.elementBound : this.responseBound;
    return bound.isPointInBound([x, y]);
  }

  intersectsBound(bound: Bound): boolean {
    return (
      this.containsBound(bound) ||
      bound.points.some((point, i, points) =>
        this.getLineIntersections(point, points[(i + 1) % points.length])
      )
    );
  }

  isLocked() {
    return false;
  }

  isLockedByAncestor() {
    return false;
  }

  isLockedBySelf() {
    return false;
  }

  lock() {
    return;
  }

  unlock() {
    return;
  }

  @prop()
  accessor groupId: string = '';

  @prop()
  accessor hidden: boolean = false;

  @prop()
  accessor index: string = 'a0';

  @prop()
  accessor opacity: number = 1;

  @prop()
  accessor responseExtension: [number, number] = [0, 0];

  @prop()
  accessor rotate: number = 0;

  @prop()
  accessor seed: number = Math.random();

  @prop()
  accessor xywh: SerializedXYWH = '[0,0,0,0]';
}
