import { DisposableGroup } from '@blocksuite/global/disposable';
import { assertType, type Constructor } from '@blocksuite/global/utils';
import type { Boxed } from '@blocksuite/store';
import { BlockModel, nanoid } from '@blocksuite/store';
import { signal } from '@preact/signals-core';
import { Subject } from 'rxjs';
import * as Y from 'yjs';

import { measureOperation } from '../../perf.js';
import {
  type GfxGroupCompatibleInterface,
  isGfxGroupCompatibleModel,
} from '../base.js';
import type { GfxGroupModel, GfxModel } from '../model.js';
import { createDecoratorState } from './decorators/common.js';
import { initializeObservers, initializeWatchers } from './decorators/index.js';
import {
  GfxGroupLikeElementModel,
  type GfxPrimitiveElementModel,
  syncElementFromY,
} from './element-model.js';
import type { GfxLocalElementModel } from './local-element-model.js';

/**
 * Used for text field
 */
export const SURFACE_TEXT_UNIQ_IDENTIFIER = 'affine:surface:text';
/**
 * Used for field that use Y.Map. E.g. group children field
 */
export const SURFACE_YMAP_UNIQ_IDENTIFIER = 'affine:surface:ymap';

export type SurfaceBlockProps = {
  elements: Boxed<Y.Map<Y.Map<unknown>>>;
};

export interface ElementUpdatedData {
  id: string;
  props: Record<string, unknown>;
  oldValues: Record<string, unknown>;
  local: boolean;
}

export type MiddlewareCtx = {
  type: 'beforeAdd';
  payload: {
    type: string;
    props: Record<string, unknown>;
  };
};

export type SurfaceMiddleware = (ctx: MiddlewareCtx) => void;

export class SurfaceBlockModel extends BlockModel<SurfaceBlockProps> {
  protected _decoratorState = createDecoratorState();

  protected _elementCtorMap: Record<
    string,
    Constructor<
      GfxPrimitiveElementModel,
      ConstructorParameters<typeof GfxPrimitiveElementModel>
    >
  > = Object.create(null);

  protected _elementModels = new Map<
    string,
    {
      mount: () => void;
      unmount: () => void;
      model: GfxPrimitiveElementModel;
    }
  >();

  protected _elementTypeMap = new Map<string, GfxPrimitiveElementModel[]>();

  protected _groupLikeModels = new Map<string, GfxGroupModel>();

  protected _parentGroupMap = new Map<string, string>();

  protected _groupChildIdsMap = new Map<string, string[]>();

  protected _middlewares: SurfaceMiddleware[] = [];

  protected _surfaceBlockModel = true;

  protected localElements = new Set<GfxLocalElementModel>();

  elementAdded = new Subject<{ id: string; local: boolean }>();

  elementRemoved = new Subject<{
    id: string;
    type: string;
    model: GfxPrimitiveElementModel;
    local: boolean;
  }>();

  elementUpdated = new Subject<ElementUpdatedData>();

  localElementAdded = new Subject<GfxLocalElementModel>();

  localElementDeleted = new Subject<GfxLocalElementModel>();

  localElementUpdated = new Subject<{
    model: GfxLocalElementModel;
    props: Record<string, unknown>;
    oldValues: Record<string, unknown>;
  }>();

  private readonly _isEmpty$ = signal(false);

  get elementModels() {
    const models: GfxPrimitiveElementModel[] = [];
    this._elementModels.forEach(model => models.push(model.model));
    return models;
  }

  get elements() {
    return this.props.elements;
  }

  get localElementModels() {
    return this.localElements;
  }

  get registeredElementTypes() {
    return Object.keys(this._elementCtorMap);
  }

  override isEmpty(): boolean {
    return this._isEmpty$.value;
  }

  constructor() {
    super();
    const subscription = this.created.subscribe(() => {
      this._init();
      subscription.unsubscribe();
    });
  }

  private _collectElementsToDelete(
    id: string,
    deleteElementIds: Set<string>,
    orderedDeleteIds: string[],
    deleteBlockIds: Set<string>
  ) {
    if (deleteElementIds.has(id)) {
      return;
    }

    const element = this.getElementById(id);
    if (!element) {
      return;
    }

    deleteElementIds.add(id);

    if (element instanceof GfxGroupLikeElementModel) {
      element.childIds.forEach(childId => {
        if (this.hasElementById(childId)) {
          this._collectElementsToDelete(
            childId,
            deleteElementIds,
            orderedDeleteIds,
            deleteBlockIds
          );
          return;
        }

        if (this.store.hasBlock(childId)) {
          deleteBlockIds.add(childId);
        }
      });
    }

    orderedDeleteIds.push(id);
  }

  private _createElementFromProps(
    props: Record<string, unknown>,
    options: {
      onChange: (payload: {
        id: string;
        props: Record<string, unknown>;
        oldValues: Record<string, unknown>;
        local: boolean;
      }) => void;
    }
  ) {
    const { type, id, ...rest } = props;

    if (!id) {
      throw new Error('Cannot find id in props');
    }

    const yMap = new Y.Map();
    const elementModel = this._createElementFromYMap(
      type as string,
      id as string,
      yMap,
      {
        ...options,
        newCreate: true,
      }
    );

    props = this._propsToY(type as string, props);

    yMap.set('type', type);
    yMap.set('id', id);

    Object.keys(rest).forEach(key => {
      if (props[key] !== undefined) {
        // @ts-expect-error ignore
        elementModel.model[key] = props[key];
      }
    });

    return elementModel;
  }

  private _createElementFromYMap(
    type: string,
    id: string,
    yMap: Y.Map<unknown>,
    options: {
      onChange: (payload: {
        id: string;
        props: Record<string, unknown>;
        oldValues: Record<string, unknown>;
        local: boolean;
      }) => void;
      skipFieldInit?: boolean;
      newCreate?: boolean;
    }
  ) {
    const stashed = new Map<string | symbol, unknown>();
    const Ctor = this._elementCtorMap[type];

    if (!Ctor) {
      throw new Error(`Invalid element type: ${yMap.get('type')}`);
    }
    const state = this._decoratorState;

    state.creating = true;
    state.skipField = options.skipFieldInit ?? false;

    let mounted = false;
    // @ts-expect-error ignore
    Ctor['_decoratorState'] = state;

    const elementModel = new Ctor({
      id,
      yMap,
      model: this,
      stashedStore: stashed,
      onChange: payload => mounted && options.onChange({ id, ...payload }),
    }) as GfxPrimitiveElementModel;

    // @ts-expect-error ignore
    delete Ctor['_decoratorState'];
    state.creating = false;
    state.skipField = false;

    const unmount = () => {
      mounted = false;
      elementModel.onDestroyed();
    };

    const mount = () => {
      initializeObservers(Ctor.prototype, elementModel);
      initializeWatchers(Ctor.prototype, elementModel);
      elementModel['_disposable'].add(
        syncElementFromY(elementModel, payload => {
          mounted &&
            options.onChange({
              id,
              ...payload,
            });
        })
      );
      mounted = true;
      elementModel.onCreated();
    };

    return {
      model: elementModel,
      mount,
      unmount,
    };
  }

  private _emitElementUpdated(
    model: GfxPrimitiveElementModel,
    payload: ElementUpdatedData
  ) {
    if (
      isGfxGroupCompatibleModel(model) &&
      ('childIds' in payload.props || 'childIds' in payload.oldValues)
    ) {
      const oldChildIds = Array.isArray(payload.oldValues['childIds'])
        ? (payload.oldValues['childIds'] as string[])
        : undefined;
      this._syncGroupChildrenIndex(model.id, model.childIds, oldChildIds);
    }

    this.elementUpdated.next(payload);
    Object.keys(payload.props).forEach(key => {
      model.propsUpdated.next({ key });
    });
  }

  private _initElementModels() {
    const elementsYMap = this.elements.getValue()!;
    const addToType = (type: string, model: GfxPrimitiveElementModel) => {
      const sameTypeElements = this._elementTypeMap.get(type) || [];

      if (sameTypeElements.indexOf(model) === -1) {
        sameTypeElements.push(model);
      }

      this._elementTypeMap.set(type, sameTypeElements);

      if (isGfxGroupCompatibleModel(model)) {
        this._groupLikeModels.set(model.id, model);
        this._syncGroupChildrenIndex(model.id, model.childIds, []);
      }
    };
    const removeFromType = (type: string, model: GfxPrimitiveElementModel) => {
      const sameTypeElements = this._elementTypeMap.get(type) || [];
      const index = sameTypeElements.indexOf(model);

      if (index !== -1) {
        sameTypeElements.splice(index, 1);
      }

      this._parentGroupMap.delete(model.id);

      if (isGfxGroupCompatibleModel(model)) {
        this._removeGroupFromChildrenIndex(model.id);
        this._groupLikeModels.delete(model.id);
      }
    };
    const onElementsMapChange = (
      event: Y.YMapEvent<Y.Map<unknown>>,
      transaction: Y.Transaction
    ) => {
      const { changes, keysChanged } = event;
      const addedElements: {
        mount: () => void;
        model: GfxPrimitiveElementModel;
      }[] = [];
      const deletedElements: {
        unmount: () => void;
        model: GfxPrimitiveElementModel;
      }[] = [];

      keysChanged.forEach(id => {
        const change = changes.keys.get(id);
        const element = this.elements.getValue()!.get(id);

        switch (change?.action) {
          case 'add':
            if (element) {
              const hasModel = this._elementModels.has(id);
              const model = hasModel
                ? this._elementModels.get(id)!
                : this._createElementFromYMap(
                    element.get('type') as string,
                    element.get('id') as string,
                    element,
                    {
                      onChange: payload => {
                        this._emitElementUpdated(model.model, {
                          ...payload,
                          id,
                        });
                      },
                      skipFieldInit: true,
                    }
                  );

              !hasModel && this._elementModels.set(id, model);
              addToType(model.model.type, model.model);
              addedElements.push(model);
            }
            break;
          case 'delete':
            if (this._elementModels.has(id)) {
              const { model, unmount } = this._elementModels.get(id)!;
              removeFromType(model.type, model);
              this._elementModels.delete(id);
              deletedElements.push({ model, unmount });
            }
            break;
        }
      });

      addedElements.forEach(({ mount, model }) => {
        mount();
        this.elementAdded.next({ id: model.id, local: transaction.local });
      });
      deletedElements.forEach(({ unmount, model }) => {
        unmount();
        this.elementRemoved.next({
          id: model.id,
          type: model.type,
          model,
          local: transaction.local,
        });
      });
    };

    elementsYMap.forEach((val, key) => {
      const model = this._createElementFromYMap(
        val.get('type') as string,
        val.get('id') as string,
        val,
        {
          onChange: payload => {
            this._emitElementUpdated(model.model, {
              ...payload,
              id: key,
            });
          },
          skipFieldInit: true,
        }
      );

      this._elementModels.set(key, model);
    });

    this._elementModels.forEach(({ mount, model }) => {
      addToType(model.type, model);
      mount();
    });

    Object.values(this.store.blocks.peek()).forEach(block => {
      if (isGfxGroupCompatibleModel(block.model)) {
        this._groupLikeModels.set(block.id, block.model);
        this._syncGroupChildrenIndex(block.id, block.model.childIds, []);
      }
    });

    this._rebuildGroupChildrenIndex();

    elementsYMap.observe(onElementsMapChange);

    const subscription = this.store.slots.blockUpdated.subscribe(payload => {
      switch (payload.type) {
        case 'add':
          if (isGfxGroupCompatibleModel(payload.model)) {
            this._groupLikeModels.set(payload.id, payload.model);
            this._syncGroupChildrenIndex(
              payload.id,
              payload.model.childIds,
              []
            );
          }

          break;
        case 'delete':
          if (isGfxGroupCompatibleModel(payload.model)) {
            this._removeGroupFromChildrenIndex(payload.id);
            this._groupLikeModels.delete(payload.id);
          }
          {
            const group = this.getGroup(payload.id);
            if (group) {
              // oxlint-disable-next-line unicorn/prefer-dom-node-remove
              group.removeChild(payload.model as GfxModel);
            }
          }
          this._parentGroupMap.delete(payload.id);

          break;
        case 'update':
          if (payload.props.key === 'childElementIds') {
            const group = this.store.getBlock(payload.id)?.model;
            if (group && isGfxGroupCompatibleModel(group)) {
              this._syncGroupChildrenIndex(group.id, group.childIds);
            }
          }

          break;
      }
    });

    this.deleted.subscribe(() => {
      elementsYMap.unobserve(onElementsMapChange);
      subscription.unsubscribe();
      this._groupChildIdsMap.clear();
      this._parentGroupMap.clear();
    });
  }

  private _propsToY(type: string, props: Record<string, unknown>) {
    const ctor = this._elementCtorMap[type];

    if (!ctor) {
      throw new Error(`Invalid element type: ${type}`);
    }

    Object.entries(props).forEach(([key, val]) => {
      if (val instanceof Object) {
        if (Reflect.has(val, SURFACE_TEXT_UNIQ_IDENTIFIER)) {
          const yText = new Y.Text();
          yText.applyDelta(Reflect.get(val, 'delta'));
          Reflect.set(props, key, yText);
        }

        if (Reflect.has(val, SURFACE_YMAP_UNIQ_IDENTIFIER)) {
          const childJson = Reflect.get(val, 'json') as Record<string, unknown>;
          const childrenYMap = new Y.Map<unknown>();

          Object.keys(childJson).forEach(childId => {
            childrenYMap.set(childId, childJson[childId]);
          });
          Reflect.set(props, key, childrenYMap);
        }
      }
    });

    // @ts-expect-error ignore
    return ctor.propsToY ? ctor.propsToY(props) : props;
  }

  private _watchGroupRelationChange() {
    const isGroup = (
      element: GfxPrimitiveElementModel
    ): element is GfxGroupLikeElementModel =>
      element instanceof GfxGroupLikeElementModel;

    const disposable = this.elementUpdated.subscribe(({ id, oldValues }) => {
      const element = this.getElementById(id)!;

      if (
        isGroup(element) &&
        oldValues['childIds'] &&
        element.childIds.length === 0
      ) {
        this.deleteElement(id);
      }
    });
    this.deleted.subscribe(() => {
      disposable.unsubscribe();
    });
  }

  private _watchChildrenChange() {
    const updateIsEmpty = () => {
      this._isEmpty$.value =
        this._elementModels.size === 0 && this.children.length === 0;
    };

    const disposables = new DisposableGroup();
    disposables.add(this.elementAdded.subscribe(updateIsEmpty));
    disposables.add(this.elementRemoved.subscribe(updateIsEmpty));
    this.store.slots.blockUpdated.subscribe(payload => {
      if (['add', 'delete'].includes(payload.type)) {
        updateIsEmpty();
      }
    });
    this.deleted.subscribe(() => {
      disposables.dispose();
    });
  }

  protected _extendElement(
    ctorMap: Record<
      string,
      Constructor<
        GfxPrimitiveElementModel,
        ConstructorParameters<typeof GfxPrimitiveElementModel>
      >
    >
  ) {
    Object.assign(this._elementCtorMap, ctorMap);
  }

  protected _init() {
    this._initElementModels();
    this._watchGroupRelationChange();
    this._watchChildrenChange();
  }

  getConstructor(type: string) {
    return this._elementCtorMap[type];
  }

  private _rebuildGroupChildrenIndex() {
    this._groupChildIdsMap.clear();
    this._parentGroupMap.clear();

    this._groupLikeModels.forEach(group => {
      this._syncGroupChildrenIndex(group.id, group.childIds, []);
    });
  }

  private _removeFromParentGroupIfNeeded(
    element: GfxModel,
    deleteElementIds: Set<string>
  ) {
    const parentGroupId = this._parentGroupMap.get(element.id);

    if (parentGroupId && deleteElementIds.has(parentGroupId)) {
      return;
    }

    let parentGroup: GfxGroupModel | null = null;

    if (parentGroupId) {
      parentGroup = this._groupLikeModels.get(parentGroupId) ?? null;
    }

    parentGroup = parentGroup ?? this.getGroup(element.id);

    if (parentGroup && !deleteElementIds.has(parentGroup.id)) {
      // oxlint-disable-next-line unicorn/prefer-dom-node-remove
      parentGroup.removeChild(element);
    }
  }

  private _removeGroupFromChildrenIndex(groupId: string) {
    const previousChildIds = this._groupChildIdsMap.get(groupId) ?? [];

    previousChildIds.forEach(childId => {
      if (this._parentGroupMap.get(childId) === groupId) {
        this._parentGroupMap.delete(childId);
      }
    });

    this._groupChildIdsMap.delete(groupId);
  }

  private _syncGroupChildrenIndex(
    groupId: string,
    nextChildIds: string[],
    previousChildIds?: string[]
  ) {
    const prev = previousChildIds ?? this._groupChildIdsMap.get(groupId) ?? [];

    prev.forEach(childId => {
      if (this._parentGroupMap.get(childId) === groupId) {
        this._parentGroupMap.delete(childId);
      }
    });

    nextChildIds.forEach(childId => {
      this._parentGroupMap.set(childId, groupId);
    });

    this._groupChildIdsMap.set(groupId, [...nextChildIds]);
  }

  addElement<T extends object = Record<string, unknown>>(
    props: Partial<T> & { type: string }
  ) {
    if (this.store.readonly) {
      throw new Error('Cannot add element in readonly mode');
    }

    const middlewareCtx: MiddlewareCtx = {
      type: 'beforeAdd',
      payload: {
        type: props.type,
        props,
      },
    };

    this._middlewares.forEach(mid => mid(middlewareCtx));

    props = middlewareCtx.payload.props as Partial<T> & { type: string };

    const id = nanoid();

    // @ts-expect-error ignore
    props.id = id;

    const elementModel = this._createElementFromProps(props, {
      onChange: payload => {
        this._emitElementUpdated(elementModel.model, {
          ...payload,
          id,
        });
      },
    });

    this._elementModels.set(id, elementModel);

    this.store.transact(() => {
      this.elements.getValue()!.set(id, elementModel.model.yMap);
    });

    return id;
  }

  addLocalElement(elem: GfxLocalElementModel) {
    this.localElements.add(elem);
    this.localElementAdded.next(elem);
  }

  applyMiddlewares(middlewares: SurfaceMiddleware[]) {
    this._middlewares = middlewares;
  }

  deleteElement(id: string) {
    if (this.store.readonly) {
      throw new Error('Cannot remove element in readonly mode');
    }

    if (!this.hasElementById(id)) {
      return;
    }

    measureOperation('edgeless:delete-element', () => {
      const deleteElementIds = new Set<string>();
      const orderedDeleteIds: string[] = [];
      const deleteBlockIds = new Set<string>();

      this._collectElementsToDelete(
        id,
        deleteElementIds,
        orderedDeleteIds,
        deleteBlockIds
      );

      if (orderedDeleteIds.length === 0) {
        return;
      }

      this.store.transact(() => {
        orderedDeleteIds.forEach(elementId => {
          const element = this.getElementById(elementId);

          if (!element) {
            return;
          }

          this._removeFromParentGroupIfNeeded(element, deleteElementIds);
          this.elements.getValue()!.delete(elementId);
        });

        deleteBlockIds.forEach(blockId => {
          const block = this.store.getBlock(blockId)?.model;

          if (!block) {
            return;
          }

          this._removeFromParentGroupIfNeeded(
            block as GfxModel,
            deleteElementIds
          );
          this.store.deleteBlock(block);
        });
      });
    });
  }

  deleteLocalElement(elem: GfxLocalElementModel) {
    if (this.localElements.delete(elem)) {
      this.localElementDeleted.next(elem);
    }
  }

  override dispose(): void {
    super.dispose();

    this.elementAdded.complete();
    this.elementRemoved.complete();
    this.elementUpdated.complete();

    this._elementModels.forEach(({ unmount }) => unmount());
    this._elementModels.clear();
  }

  getElementById(id: string): GfxPrimitiveElementModel | null {
    return this._elementModels.get(id)?.model ?? null;
  }

  getElementsByType(type: string): GfxPrimitiveElementModel[] {
    return this._elementTypeMap.get(type) || [];
  }

  getGroup(elem: string | GfxModel): GfxGroupModel | null {
    const id = typeof elem === 'string' ? elem : elem.id;
    const parentGroupId = this._parentGroupMap.get(id);

    if (parentGroupId) {
      const group = this._groupLikeModels.get(parentGroupId);
      if (group) {
        return group;
      }

      this._parentGroupMap.delete(id);
    }

    const model =
      typeof elem === 'string'
        ? ((this.getElementById(elem) ??
            this.store.getBlock(elem)?.model) as GfxModel)
        : elem;

    if (!model) return null;

    assertType<GfxModel>(model);

    for (const group of this._groupLikeModels.values()) {
      if (group.hasChild(model)) {
        this._parentGroupMap.set(id, group.id);
        return group;
      }
    }

    return null;
  }

  /**
   * Get all groups in the group chain. The last group is the top level group.
   * @param id
   * @returns
   */
  getGroups(id: string): GfxGroupModel[] {
    const groups: GfxGroupModel[] = [];
    const visited = new Set<GfxGroupModel>();
    let group = this.getGroup(id);

    while (group) {
      if (visited.has(group)) {
        console.warn('Exists a cycle in group relation');
        break;
      }
      visited.add(group);
      groups.push(group);
      group = this.getGroup(group.id);
    }

    return groups;
  }

  hasElementById(id: string): boolean {
    return this._elementModels.has(id);
  }

  isGroup(element: GfxModel): element is GfxModel & GfxGroupCompatibleInterface;
  isGroup(id: string): boolean;
  isGroup(element: string | GfxModel): boolean {
    if (typeof element === 'string') {
      const el = this.getElementById(element);
      if (el) return isGfxGroupCompatibleModel(el);

      const blockModel = this.store.getBlock(element)?.model;
      if (blockModel) return isGfxGroupCompatibleModel(blockModel);

      return false;
    } else {
      return isGfxGroupCompatibleModel(element);
    }
  }

  updateElement<T extends object = Record<string, unknown>>(
    id: string,
    props: Partial<T>
  ) {
    if (this.store.readonly) {
      throw new Error('Cannot update element in readonly mode');
    }

    const elementModel = this.getElementById(id);

    if (!elementModel) {
      throw new Error(`Element ${id} is not found`);
    }

    this.store.transact(() => {
      props = this._propsToY(
        elementModel.type,
        props as Record<string, unknown>
      ) as T;
      Object.entries(props).forEach(([key, value]) => {
        // @ts-expect-error ignore
        elementModel[key] = value;
      });
    });
  }
}
