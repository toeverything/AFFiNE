import { DisposableGroup } from '@blocksuite/global/disposable';
import {
  Bound,
  deserializeXYWH,
  getBoundWithRotation,
  getPointsFromBoundWithRotation,
  type IVec,
  linePolygonIntersects,
  PointLocation,
  polygonGetPointTangent,
  polygonNearestPoint,
  randomSeed,
  rotatePoints,
  type SerializedXYWH,
  type XYWH,
} from '@blocksuite/global/gfx';
import { createMutex } from 'lib0/mutex';
import isEqual from 'lodash-es/isEqual';
import { Subject } from 'rxjs';
import * as Y from 'yjs';

import {
  descendantElementsImpl,
  hasDescendantElementImpl,
  isLockedByAncestorImpl,
  isLockedBySelfImpl,
  isLockedImpl,
  lockElementImpl,
  unlockElementImpl,
} from '../../../utils/tree.js';
import type { EditorHost } from '../../../view/index.js';
import type {
  GfxCompatibleInterface,
  GfxGroupCompatibleInterface,
  PointTestOptions,
} from '../base.js';
import { gfxGroupCompatibleSymbol } from '../base.js';
import type { GfxBlockElementModel } from '../gfx-block-model.js';
import type { GfxGroupModel, GfxModel } from '../model.js';
import {
  convertProps,
  field,
  getDerivedProps,
  getFieldPropsSet,
  local,
  updateDerivedProps,
  watch,
} from './decorators/index.js';
import type { SurfaceBlockModel } from './surface-model.js';

export type BaseElementProps = {
  index: string;
  seed: number;
  lockedBySelf?: boolean;
  comments?: Record<string, boolean>;
};

export type SerializedElement = Record<string, unknown> & {
  type: string;
  xywh: SerializedXYWH;
  id: string;
  index: string;
  lockedBySelf?: boolean;
  comments?: Record<string, boolean>;
  props: Record<string, unknown>;
};
export abstract class GfxPrimitiveElementModel<
  Props extends BaseElementProps = BaseElementProps,
> implements GfxCompatibleInterface {
  private _lastXYWH!: SerializedXYWH;

  protected _disposable = new DisposableGroup();

  protected _id: string;

  protected _local = new Map<string | symbol, unknown>();

  protected _onChange: (payload: {
    props: Record<string, unknown>;
    oldValues: Record<string, unknown>;
    local: boolean;
  }) => void;

  /**
   * Used to store a copy of data in the yMap.
   */
  protected _preserved = new Map<string, unknown>();

  protected _stashed: Map<keyof Props | string, unknown>;

  propsUpdated = new Subject<{ key: string }>();

  abstract rotate: number;

  surface!: SurfaceBlockModel;

  abstract xywh: SerializedXYWH;

  yMap: Y.Map<unknown>;

  get connectable() {
    return true;
  }

  get deserializedXYWH() {
    if (!this._lastXYWH || this.xywh !== this._lastXYWH) {
      const xywh = this.xywh;
      this._local.set('deserializedXYWH', deserializeXYWH(xywh));
      this._lastXYWH = xywh;
    }

    return (this._local.get('deserializedXYWH') as XYWH) ?? [0, 0, 0, 0];
  }

  /**
   * The bound of the element after rotation.
   * The bound without rotation should be created by `Bound.deserialize(this.xywh)`.
   */
  get elementBound() {
    if (this.rotate) {
      return Bound.from(getBoundWithRotation(this));
    }

    return Bound.deserialize(this.xywh);
  }

  get externalBound(): Bound | null {
    if (!this._local.has('externalBound')) {
      const bound = this.externalXYWH
        ? Bound.deserialize(this.externalXYWH)
        : null;

      this._local.set('externalBound', bound);
    }

    return this._local.get('externalBound') as Bound | null;
  }

  get group(): GfxGroupModel | null {
    return this.surface.getGroup(this.id);
  }

  /**
   * Return the ancestor elements in order from the most recent to the earliest.
   */
  get groups(): GfxGroupModel[] {
    return this.surface.getGroups(this.id);
  }

  get h() {
    return this.deserializedXYWH[3];
  }

  get id() {
    return this._id;
  }

  get isConnected() {
    return this.surface.hasElementById(this.id);
  }

  get responseBound() {
    return this.elementBound.expand(this.responseExtension);
  }

  abstract get type(): string;

  get w() {
    return this.deserializedXYWH[2];
  }

  get x() {
    return this.deserializedXYWH[0];
  }

  get y() {
    return this.deserializedXYWH[1];
  }

  constructor(options: {
    id: string;
    yMap: Y.Map<unknown>;
    model: SurfaceBlockModel;
    stashedStore: Map<unknown, unknown>;
    onChange: (payload: {
      props: Record<string, unknown>;
      oldValues: Record<string, unknown>;
      local: boolean;
    }) => void;
  }) {
    const { id, yMap, model, stashedStore, onChange } = options;

    this._id = id;
    this.yMap = yMap;
    this.surface = model;
    this._stashed = stashedStore as Map<keyof Props, unknown>;
    this._onChange = onChange;

    this.index = 'a0';
    this.seed = randomSeed();
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

  isLocked(): boolean {
    return isLockedImpl(this);
  }

  isLockedByAncestor(): boolean {
    return isLockedByAncestorImpl(this);
  }

  isLockedBySelf(): boolean {
    return isLockedBySelfImpl(this);
  }

  lock() {
    lockElementImpl(this.surface.store, this);
  }

  onCreated() {}

  onDestroyed() {
    this._disposable.dispose();
    this.propsUpdated.complete();
  }

  pop(prop: keyof Props | string) {
    if (!this._stashed.has(prop)) {
      return;
    }

    const value = this._stashed.get(prop);
    this._stashed.delete(prop);
    // @ts-expect-error ignore
    delete this[prop];

    if (getFieldPropsSet(this).has(prop as string)) {
      if (!isEqual(value, this.yMap.get(prop as string))) {
        this.yMap.set(prop as string, value);
      }
    } else {
      console.warn('pop a prop that is not field or local:', prop);
    }
  }

  serialize() {
    const result = this.yMap.toJSON();
    result.xywh = this.xywh;
    return result as SerializedElement;
  }

  stash(prop: keyof Props | string) {
    if (this._stashed.has(prop)) {
      return;
    }

    if (!getFieldPropsSet(this).has(prop as string)) {
      return;
    }

    const curVal = this[prop as unknown as keyof GfxPrimitiveElementModel];

    this._stashed.set(prop, curVal);

    Object.defineProperty(this, prop, {
      configurable: true,
      enumerable: true,
      get: () => this._stashed.get(prop),
      set: (original: unknown) => {
        const value = convertProps(prop as string, original, this);
        const oldValue = this._stashed.get(prop);
        const derivedProps = getDerivedProps(
          prop as string,
          original,
          this as unknown as GfxPrimitiveElementModel
        );

        this._stashed.set(prop, value);
        this._onChange({
          props: {
            [prop]: value,
          },
          oldValues: {
            [prop]: oldValue,
          },
          local: true,
        });

        updateDerivedProps(
          derivedProps,
          this as unknown as GfxPrimitiveElementModel
        );
      },
    });
  }

  unlock() {
    unlockElementImpl(this.surface.store, this);
  }

  @local()
  accessor display: boolean = true;

  /**
   * In some cases, you need to draw something related to the element, but it does not belong to the element itself.
   * And it is also interactive, you can select element by clicking on it. E.g. the title of the group element.
   * In this case, we need to store this kind of external xywh in order to do hit test. This property should not be synced to the doc.
   * This property should be updated every time it gets rendered.
   */
  @watch((_, instance) => {
    instance['_local'].delete('externalBound');
  })
  @local()
  accessor externalXYWH: SerializedXYWH | undefined = undefined;

  @field(false)
  accessor hidden: boolean = false;

  @field()
  accessor index!: string;

  @field()
  accessor lockedBySelf: boolean | undefined = false;

  @local()
  accessor opacity: number = 1;

  @local()
  accessor responseExtension: [number, number] = [0, 0];

  @field()
  accessor seed!: number;

  @field()
  accessor comments: Record<string, boolean> | undefined = undefined;
}

export abstract class GfxGroupLikeElementModel<
  Props extends BaseElementProps = BaseElementProps,
>
  extends GfxPrimitiveElementModel<Props>
  implements GfxGroupCompatibleInterface
{
  private _childIds: string[] = [];

  private readonly _mutex = createMutex();

  abstract children: Y.Map<any>;

  [gfxGroupCompatibleSymbol] = true as const;

  get childElements() {
    const elements: GfxModel[] = [];

    for (const key of this.childIds) {
      const element =
        this.surface.getElementById(key) ||
        (this.surface.store.getModelById(key) as GfxBlockElementModel);

      element && elements.push(element);
    }

    return elements;
  }

  /**
   * The ids of the children. Its role is to provide a unique way to access the children.
   * You should update this field through `setChildIds` when the children are added or removed.
   */
  get childIds() {
    return this._childIds;
  }

  get descendantElements(): GfxModel[] {
    return descendantElementsImpl(this);
  }

  get xywh() {
    this._mutex(() => {
      const curXYWH =
        (this._local.get('xywh') as SerializedXYWH) ?? '[0,0,0,0]';
      const newXYWH = this._getXYWH().serialize();

      if (curXYWH !== newXYWH || !this._local.has('xywh')) {
        this._local.set('xywh', newXYWH);

        if (curXYWH !== newXYWH) {
          this._onChange({
            props: {
              xywh: newXYWH,
            },
            oldValues: {
              xywh: curXYWH,
            },
            local: true,
          });
        }
      }
    });

    return (this._local.get('xywh') as SerializedXYWH) ?? '[0,0,0,0]';
  }

  set xywh(_) {}

  protected _getXYWH(): Bound {
    let bound: Bound | undefined;

    this.childElements.forEach(child => {
      if (child instanceof GfxPrimitiveElementModel && child.hidden) {
        return;
      }

      bound = bound ? bound.unite(child.elementBound) : child.elementBound;
    });

    if (bound) {
      this._local.set('xywh', bound.serialize());
    } else {
      this._local.delete('xywh');
    }

    return bound ?? new Bound(0, 0, 0, 0);
  }

  abstract addChild(element: GfxModel): void;

  /**
   * The actual field that stores the children of the group.
   * It should be a ymap decorated with `@field`.
   */
  hasChild(element: GfxCompatibleInterface) {
    return this.childElements.includes(element as GfxModel);
  }

  /**
   * Check if the group has the given descendant.
   */
  hasDescendant(element: GfxCompatibleInterface): boolean {
    return hasDescendantElementImpl(this, element);
  }

  /**
   * Remove the child from the group
   */
  abstract removeChild(element: GfxCompatibleInterface): void;

  /**
   * Set the new value of the childIds
   * @param value the new value of the childIds
   * @param fromLocal if true, the change is happened in the local
   */
  setChildIds(value: string[], fromLocal: boolean) {
    const oldChildIds = this.childIds;
    this._childIds = value;

    this._onChange({
      props: {
        childIds: value,
      },
      oldValues: {
        childIds: oldChildIds,
      },
      local: fromLocal,
    });
  }
}

export function syncElementFromY(
  model: GfxPrimitiveElementModel,
  callback: (payload: {
    props: Record<string, unknown>;
    oldValues: Record<string, unknown>;
    local: boolean;
  }) => void
) {
  const disposables: Record<string, () => void> = {};
  const observer = (
    event: Y.YMapEvent<unknown>,
    transaction: Y.Transaction
  ) => {
    const props: Record<string, unknown> = {};
    const oldValues: Record<string, unknown> = {};

    event.keysChanged.forEach(key => {
      const type = event.changes.keys.get(key);
      const oldValue = event.changes.keys.get(key)?.oldValue;

      if (!type) {
        return;
      }

      if (type.action === 'update' || type.action === 'add') {
        const value = model.yMap.get(key);

        if (value instanceof Y.Text) {
          disposables[key]?.();
          disposables[key] = watchText(key, value, callback);
        }

        model['_preserved'].set(key, value);
        props[key] = value;
        oldValues[key] = oldValue;
      } else {
        model['_preserved'].delete(key);
        oldValues[key] = oldValue;
      }
    });

    callback({
      props,
      oldValues,
      local: transaction.local,
    });
  };

  Array.from(model.yMap.entries()).forEach(([key, value]) => {
    if (value instanceof Y.Text) {
      disposables[key] = watchText(key, value, callback);
    }

    model['_preserved'].set(key, value);
  });

  model.yMap.observe(observer);
  disposables['ymap'] = () => {
    model.yMap.unobserve(observer);
  };

  return () => {
    Object.values(disposables).forEach(fn => fn());
  };
}

function watchText(
  key: string,
  value: Y.Text,
  callback: (payload: {
    props: Record<string, unknown>;
    oldValues: Record<string, unknown>;
    local: boolean;
  }) => void
) {
  const fn = (_: Y.YTextEvent, transaction: Y.Transaction) => {
    callback({
      props: {
        [key]: value,
      },
      oldValues: {},
      local: transaction.local,
    });
  };

  value.observe(fn);

  return () => {
    value.unobserve(fn);
  };
}
