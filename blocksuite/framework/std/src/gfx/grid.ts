import { DisposableGroup } from '@blocksuite/global/disposable';
import type { IBound } from '@blocksuite/global/gfx';
import {
  Bound,
  getBoundWithRotation,
  intersects,
} from '@blocksuite/global/gfx';
import type { BlockModel } from '@blocksuite/store';

import { compare } from '../utils/layer.js';
import { GfxExtension } from './extension.js';
import { GfxBlockElementModel } from './model/gfx-block-model.js';
import type { GfxModel } from './model/model.js';
import { GfxPrimitiveElementModel } from './model/surface/element-model.js';
import { GfxLocalElementModel } from './model/surface/local-element-model.js';
import { SurfaceBlockModel } from './model/surface/surface-model.js';

function getGridIndex(val: number) {
  return Math.ceil(val / DEFAULT_GRID_SIZE) - 1;
}

function rangeFromBound(a: IBound): number[] {
  if (a.rotate) a = getBoundWithRotation(a);
  const minRow = getGridIndex(a.x);
  const maxRow = getGridIndex(a.x + a.w);
  const minCol = getGridIndex(a.y);
  const maxCol = getGridIndex(a.y + a.h);
  return [minRow, maxRow, minCol, maxCol];
}

function rangeFromElement(ele: GfxModel | GfxLocalElementModel): number[] {
  const bound = ele.elementBound;

  bound.w += ele.responseExtension[0] * 2;
  bound.h += ele.responseExtension[1] * 2;
  bound.x -= ele.responseExtension[0];
  bound.y -= ele.responseExtension[1];

  const minRow = getGridIndex(bound.x);
  const maxRow = getGridIndex(bound.maxX);
  const minCol = getGridIndex(bound.y);
  const maxCol = getGridIndex(bound.maxY);
  return [minRow, maxRow, minCol, maxCol];
}

function rangeFromElementExternal(ele: GfxModel): number[] | null {
  if (!ele.externalXYWH) return null;

  const bound = Bound.deserialize(ele.externalXYWH);
  const minRow = getGridIndex(bound.x);
  const maxRow = getGridIndex(bound.maxX);
  const minCol = getGridIndex(bound.y);
  const maxCol = getGridIndex(bound.maxY);
  return [minRow, maxRow, minCol, maxCol];
}

export const DEFAULT_GRID_SIZE = 3000;

const typeFilters = {
  block: (model: GfxModel | GfxLocalElementModel) =>
    model instanceof GfxBlockElementModel,
  canvas: (model: GfxModel | GfxLocalElementModel) =>
    model instanceof GfxPrimitiveElementModel,
  local: (model: GfxModel | GfxLocalElementModel) =>
    model instanceof GfxLocalElementModel,
};

export type BuiltInFilterModelMap = {
  block: GfxBlockElementModel;
  canvas: GfxPrimitiveElementModel;
  local: GfxLocalElementModel;
};

export type BuiltInFilterType = keyof typeof typeFilters;

type FilterFunc = (model: GfxModel | GfxLocalElementModel) => boolean;

export class GridManager extends GfxExtension {
  static override key = 'grid';

  private readonly _elementToGrids = new Map<
    GfxModel | GfxLocalElementModel,
    Set<Set<GfxModel | GfxLocalElementModel>>
  >();

  private readonly _externalElementToGrids = new Map<
    GfxModel,
    Set<Set<GfxModel>>
  >();

  private readonly _externalGrids = new Map<string, Set<GfxModel>>();

  private readonly _grids = new Map<
    string,
    Set<GfxModel | GfxLocalElementModel>
  >();

  get isEmpty() {
    return this._grids.size === 0;
  }

  private _addToExternalGrids(element: GfxModel) {
    const range = rangeFromElementExternal(element);

    if (!range) {
      this._removeFromExternalGrids(element);
      return;
    }

    const [minRow, maxRow, minCol, maxCol] = range;
    const grids = new Set<Set<GfxModel>>();
    this._externalElementToGrids.set(element, grids);

    for (let i = minRow; i <= maxRow; i++) {
      for (let j = minCol; j <= maxCol; j++) {
        let grid = this._getExternalGrid(i, j);
        if (!grid) {
          grid = this._createExternalGrid(i, j);
        }
        grid.add(element);
        grids.add(grid);
      }
    }
  }

  private _createExternalGrid(row: number, col: number) {
    const id = row + '|' + col;
    const elements = new Set<GfxModel>();
    this._externalGrids.set(id, elements);
    return elements;
  }

  private _createGrid(row: number, col: number) {
    const id = row + '|' + col;
    const elements = new Set<GfxModel>();
    this._grids.set(id, elements);
    return elements;
  }

  private _getExternalGrid(row: number, col: number) {
    const id = row + '|' + col;
    return this._externalGrids.get(id);
  }

  private _getGrid(row: number, col: number) {
    const id = row + '|' + col;
    return this._grids.get(id);
  }

  private _removeFromExternalGrids(element: GfxModel) {
    const grids = this._externalElementToGrids.get(element);
    if (grids) {
      for (const grid of grids) {
        grid.delete(element);
      }
    }
  }

  private _searchExternal(
    bound: IBound,
    options: { filterFunc: FilterFunc; strict: boolean }
  ): Set<GfxModel> {
    const [minRow, maxRow, minCol, maxCol] = rangeFromBound(bound);
    const results = new Set<GfxModel>();
    const b = Bound.from(bound);

    for (let i = minRow; i <= maxRow; i++) {
      for (let j = minCol; j <= maxCol; j++) {
        const gridElements = this._getExternalGrid(i, j);
        if (!gridElements) continue;

        for (const element of gridElements) {
          const externalBound = element.externalBound;
          if (
            options.filterFunc(element) &&
            externalBound &&
            (options.strict
              ? b.contains(externalBound)
              : intersects(externalBound, bound))
          ) {
            results.add(element);
          }
        }
      }
    }

    return results;
  }

  private _toFilterFunc(filters: (keyof typeof typeFilters | FilterFunc)[]) {
    const filterFuncs: FilterFunc[] = filters.map(filter => {
      if (typeof filter === 'function') {
        return filter;
      }
      return typeFilters[filter];
    });

    return (model: GfxModel | GfxLocalElementModel) =>
      filterFuncs.some(filter => filter(model));
  }

  add(element: GfxModel | GfxLocalElementModel) {
    if (!(element instanceof GfxLocalElementModel)) {
      this._addToExternalGrids(element);
    }

    const [minRow, maxRow, minCol, maxCol] = rangeFromElement(element);
    const grids = new Set<Set<GfxModel | GfxLocalElementModel>>();
    this._elementToGrids.set(element, grids);

    for (let i = minRow; i <= maxRow; i++) {
      for (let j = minCol; j <= maxCol; j++) {
        let grid = this._getGrid(i, j);
        if (!grid) {
          grid = this._createGrid(i, j);
        }
        grid.add(element);
        grids.add(grid);
      }
    }
  }

  boundHasChanged(a: IBound, b: IBound) {
    const [minRow, maxRow, minCol, maxCol] = rangeFromBound(a);
    const [minRow2, maxRow2, minCol2, maxCol2] = rangeFromBound(b);
    return (
      minRow !== minRow2 ||
      maxRow !== maxRow2 ||
      minCol !== minCol2 ||
      maxCol !== maxCol2
    );
  }

  /**
   *
   * @param bound
   * @param strict
   * @param reverseChecking If true, check if the bound is inside the elements instead of checking if the elements are inside the bound
   * @returns
   */
  has(
    bound: IBound,
    strict: boolean = false,
    reverseChecking: boolean = false,
    filter?: (model: GfxModel | GfxLocalElementModel) => boolean
  ) {
    const [minRow, maxRow, minCol, maxCol] = rangeFromBound(bound);
    const b = Bound.from(bound);
    const check = reverseChecking
      ? (target: Bound) => {
          return strict ? target.contains(b) : intersects(b, target);
        }
      : (target: Bound) => {
          return strict ? b.contains(target) : intersects(target, b);
        };

    for (let i = minRow; i <= maxRow; i++) {
      for (let j = minCol; j <= maxCol; j++) {
        const gridElements = this._getGrid(i, j);
        if (!gridElements) continue;
        for (const element of gridElements) {
          if ((!filter || filter(element)) && check(element.elementBound)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  remove(element: GfxModel | GfxLocalElementModel) {
    const grids = this._elementToGrids.get(element);
    if (grids) {
      for (const grid of grids) {
        grid.delete(element);
      }
    }
    this._elementToGrids.delete(element);

    if (!(element instanceof GfxLocalElementModel)) {
      this._removeFromExternalGrids(element);
    }
  }

  /**
   * Search for elements in a bound.
   * @param bound
   * @param options
   */
  search<T extends BuiltInFilterType = 'canvas' | 'block'>(
    bound: IBound,
    options?: {
      /**
       * If true, only return elements that are completely inside the bound.
       * Default is false.
       */
      strict?: boolean;
      /**
       * If true, return a set of elements instead of an array
       */
      useSet?: false;
      /**
       * Use this to filter the elements, if not provided, it will return blocks and canvas elements by default
       */
      filter?: (T | FilterFunc)[] | FilterFunc;
    }
  ): BuiltInFilterModelMap[T][];
  search<T extends BuiltInFilterType = 'canvas' | 'block'>(
    bound: IBound,
    options: {
      strict?: boolean | undefined;
      useSet: true;
      filter?: (T | FilterFunc)[] | FilterFunc;
    }
  ): Set<BuiltInFilterModelMap[T]>;
  search<T extends BuiltInFilterType = 'canvas' | 'block'>(
    bound: IBound,
    options: {
      strict?: boolean;
      useSet?: boolean;
      filter?: (T | FilterFunc)[] | FilterFunc;
    } = {
      useSet: false,
    }
  ):
    | (GfxModel | GfxLocalElementModel)[]
    | Set<GfxModel | GfxLocalElementModel> {
    const strict = options.strict ?? false;
    const [minRow, maxRow, minCol, maxCol] = rangeFromBound(bound);
    const b = Bound.from(bound);
    const returnSet = options.useSet ?? false;
    const filterFunc =
      (Array.isArray(options.filter)
        ? this._toFilterFunc(options.filter)
        : options.filter) ?? this._toFilterFunc(['canvas', 'block']);
    const results: Set<GfxModel | GfxLocalElementModel> = this._searchExternal(
      bound,
      {
        filterFunc,
        strict,
      }
    );

    for (let i = minRow; i <= maxRow; i++) {
      for (let j = minCol; j <= maxCol; j++) {
        const gridElements = this._getGrid(i, j);
        if (!gridElements) continue;
        for (const element of gridElements) {
          if (
            !(element as GfxPrimitiveElementModel).hidden &&
            filterFunc(element) &&
            (strict
              ? b.contains(element.elementBound)
              : intersects(element.responseBound, b))
          ) {
            results.add(element);
          }
        }
      }
    }

    if (returnSet) return results;

    // sort elements in set based on index
    const sorted = Array.from(results).sort(compare);

    return sorted;
  }

  update(element: GfxModel | GfxLocalElementModel) {
    this.remove(element);
    this.add(element);
  }

  private readonly _disposables = new DisposableGroup();

  override unmounted(): void {
    this._disposables.dispose();
  }

  override mounted() {
    const disposables = this._disposables;
    const { store } = this.std;
    const canBeRenderedAsGfxBlock = (
      block: BlockModel
    ): block is GfxBlockElementModel => {
      return (
        block instanceof GfxBlockElementModel &&
        (block.parent?.role === 'root' ||
          block.parent instanceof SurfaceBlockModel)
      );
    };

    disposables.add(
      store.slots.blockUpdated.subscribe(payload => {
        if (payload.type === 'add' && canBeRenderedAsGfxBlock(payload.model)) {
          this.add(payload.model);
        }
        if (payload.type === 'update') {
          const model = store.getModelById(payload.id);
          if (!model) return;

          if (payload.props.key === 'xywh' && canBeRenderedAsGfxBlock(model)) {
            this.update(model);
          }
        }
        if (
          payload.type === 'delete' &&
          payload.model instanceof GfxBlockElementModel
        ) {
          this.remove(payload.model);
        }
      })
    );

    Object.values(store.blocks.peek()).forEach(block => {
      if (canBeRenderedAsGfxBlock(block.model)) {
        this.add(block.model);
      }
    });

    const watchSurface = (surface: SurfaceBlockModel) => {
      let lastChildMap = new Map<string, number>(surface.childMap.peek());
      disposables.add(
        surface.childMap.subscribe(currentChildMap => {
          currentChildMap.forEach((_, id) => {
            if (lastChildMap.has(id)) {
              lastChildMap.delete(id);
              return;
            }
          });
          lastChildMap.forEach((_, id) => {
            const model = store.getModelById(id);
            if (model) {
              this.remove(model as GfxBlockElementModel);
            }
          });
          currentChildMap.forEach((_, id) => {
            const model = store.getModelById(id);
            if (model) {
              this.add(model as GfxBlockElementModel);
            }
          });
          lastChildMap = new Map(currentChildMap);
        })
      );

      disposables.add(
        surface.elementAdded.subscribe(payload => {
          this.add(surface.getElementById(payload.id)!);
        })
      );

      disposables.add(
        surface.elementRemoved.subscribe(payload => {
          this.remove(payload.model);
        })
      );

      disposables.add(
        surface.elementUpdated.subscribe(payload => {
          if (
            payload.props['xywh'] ||
            payload.props['externalXYWH'] ||
            payload.props['responseExtension']
          ) {
            this.update(surface.getElementById(payload.id)!);
          }
        })
      );

      disposables.add(
        surface.localElementAdded.subscribe(elm => {
          this.add(elm);
        })
      );

      disposables.add(
        surface.localElementUpdated.subscribe(payload => {
          if (payload.props['xywh'] || payload.props['responseExtension']) {
            this.update(payload.model);
          }
        })
      );

      disposables.add(
        surface.localElementDeleted.subscribe(elm => {
          this.remove(elm);
        })
      );

      surface.elementModels.forEach(model => {
        this.add(model);
      });
      surface.localElementModels.forEach(model => {
        this.add(model);
      });
    };

    if (this.gfx.surface) {
      watchSurface(this.gfx.surface);
    } else {
      disposables.add(
        this.gfx.surface$.subscribe(surface => {
          if (surface) {
            watchSurface(surface);
          }
        })
      );
    }
  }
}
