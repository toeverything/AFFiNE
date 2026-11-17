import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import { nanoid } from '@blocksuite/store';
import { computed, type ReadonlySignal, signal } from '@preact/signals-core';

import type { DataSource } from '../data-source/base.js';
import type {
  DataViewDataType,
  DataViewMode,
  ViewMeta,
} from '../view/data-view.js';
import type { SingleView } from './single-view.js';

export interface ViewManager {
  viewMetas: ViewMeta[];
  dataSource: DataSource;
  readonly$: ReadonlySignal<boolean>;

  currentViewId$: ReadonlySignal<string | undefined>;
  currentView$: ReadonlySignal<SingleView | undefined>;

  setCurrentView(id: string): void;

  views$: ReadonlySignal<string[]>;

  viewGet(id: string): SingleView | undefined;

  viewAdd(type: DataViewMode): string;

  viewDelete(id: string): void;

  viewDuplicate(id: string): void;

  viewDataGet(id: string): DataViewDataType | undefined;

  moveTo(id: string, position: InsertToPosition): void;

  viewChangeType(id: string, type: string): void;
}

export class ViewManagerBase implements ViewManager {
  _currentViewId$ = signal<string | undefined>(undefined);

  views$ = computed(() => {
    return this.dataSource.viewDataList$.value.map(data => data.id);
  });

  currentViewId$ = computed(() => {
    const current = this._currentViewId$.value;
    if (current && this.views$.value.includes(current)) {
      return current;
    }
    return this.views$.value[0];
  });

  currentView$ = computed(() => {
    const id = this.currentViewId$.value;
    if (!id) return;
    return this.viewGet(id);
  });

  readonly$ = computed(() => {
    return this.dataSource.readonly$.value;
  });

  get viewMetas() {
    return this.dataSource.viewMetas;
  }

  // `SingleView` constructors (e.g. `KanbanSingleView`'s `materializeColumns`
  // write-back, `GroupTrait`'s un-disposed `effect()` subscriptions) do real,
  // one-time side-effecting work — they were never meant to be rebuilt on
  // every `viewGet` call. Callers that poll frequently (`database-ref-block
  // .ts`'s `_syncCurrentView`, invoked on every render and on every nested-
  // preview DOM mutation) previously minted a fresh, uncached instance each
  // time, re-running that side-effecting constructor logic repeatedly and
  // leaking a `GroupTrait`'s reactive subscriptions once per call — the same
  // "abandoned reactive graph" hazard this codebase already guards against
  // for abandoned preview `Store`s. Cached per view id instead; invalidated
  // only if the view's own `mode` changes underneath it (`viewChangeType`).
  private readonly _viewInstances = new Map<string, SingleView>();

  constructor(public dataSource: DataSource) {}

  moveTo(id: string, position: InsertToPosition): void {
    this.dataSource.viewDataMoveTo(id, position);
  }

  setCurrentView(id: string | undefined): void {
    this._currentViewId$.value = id;
  }

  viewAdd(type: DataViewMode): string {
    const meta = this.dataSource.viewMetaGet(type);
    const data: ReturnType<typeof meta.model.defaultData> =
      meta.model.defaultData(this);
    const id = this.dataSource.viewDataAdd({
      ...data,
      id: nanoid(),
      name: meta.model.defaultName,
      mode: type,
    });
    this.setCurrentView(id);
    return id;
  }

  viewChangeType(id: string, type: string): void {
    const from = this.viewGet(id)?.type;
    const meta = this.dataSource.viewMetaGet(type);
    this.dataSource.viewDataUpdate(id, old => {
      let data: DataViewDataType = {
        ...meta.model.defaultData(this),
        id: old.id,
        name: old.name,
        mode: type,
      };
      const convertFunction = this.dataSource.viewConverts.find(
        v => v.from === from && v.to === type
      );
      if (convertFunction) {
        data = {
          ...data,
          ...convertFunction.convert(old),
        };
      }
      return data;
    });
  }

  viewDataGet(id: string): DataViewDataType | undefined {
    return this.dataSource.viewDataGet(id);
  }

  viewDelete(id: string): void {
    this.dataSource.viewDataDelete(id);
    this.setCurrentView(this.views$.value[0]);
  }

  viewDuplicate(id: string): void {
    const newId = this.dataSource.viewDataDuplicate(id);
    this.setCurrentView(newId);
  }

  viewGet(id: string): SingleView | undefined {
    const meta = this.dataSource.viewMetaGetById(id);
    if (!meta) {
      this._viewInstances.delete(id);
      return;
    }
    const cached = this._viewInstances.get(id);
    if (cached && cached.type === meta.type) {
      return cached;
    }
    const view = new meta.model.dataViewManager(this, id);
    this._viewInstances.set(id, view);
    return view;
  }
}
