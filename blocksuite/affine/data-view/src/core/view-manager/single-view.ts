import type { UniComponent } from '@blocksuite/affine-shared/types';
import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import { computed, type ReadonlySignal, signal } from '@preact/signals-core';

import type { DataViewContextKey } from '../data-source/context.js';
import type { Variable } from '../expression/types.js';
import type { TypeInstance } from '../logical/type.js';
import type { PropertyMetaConfig } from '../property/property-config.js';
import { fromJson } from '../property/utils';
import type { TraitKey } from '../traits/key.js';
import type { DatabaseFlags } from '../types.js';
import type { DataViewDataType, ViewMeta } from '../view/data-view.js';
import { type Cell, CellBase } from './cell.js';
import type { Property } from './property.js';
import { type Row, RowBase } from './row.js';
import type { ViewManager } from './view-manager.js';

export type MainProperties = {
  titleColumn?: string;
  iconColumn?: string;
  imageColumn?: string;
};

export interface SingleView {
  readonly id: string;
  readonly type: string;
  readonly manager: ViewManager;
  readonly meta: ViewMeta;
  readonly readonly$: ReadonlySignal<boolean>;

  delete(): void;

  duplicate(): void;

  readonly name$: ReadonlySignal<string>;

  nameSet(name: string): void;

  readonly propertyIds$: ReadonlySignal<string[]>;
  readonly propertiesWithoutFilter$: ReadonlySignal<string[]>;
  readonly properties$: ReadonlySignal<Property[]>;
  readonly detailProperties$: ReadonlySignal<string[]>;
  readonly rows$: ReadonlySignal<string[]>;

  readonly vars$: ReadonlySignal<Variable[]>;

  readonly featureFlags$: ReadonlySignal<DatabaseFlags>;

  cellValueGet(rowId: string, propertyId: string): unknown;

  cellValueSet(rowId: string, propertyId: string, value: unknown): void;

  cellJsonValueGet(rowId: string, propertyId: string): unknown | null;

  cellJsonValueSet(rowId: string, propertyId: string, value: unknown): void;

  cellStringValueGet(rowId: string, propertyId: string): string | undefined;

  cellGet(rowId: string, propertyId: string): Cell;

  propertyParseValueFromString(
    propertyId: string,
    value: string
  ):
    | {
        value: unknown;
        data?: Record<string, unknown>;
      }
    | undefined;

  rowAdd(insertPosition: InsertToPosition): string;

  rowDelete(ids: string[]): void;

  rowMove(rowId: string, position: InsertToPosition): void;

  rowGet(rowId: string): Row;

  rowPrevGet(rowId: string): string | undefined;

  rowNextGet(rowId: string): string | undefined;

  readonly propertyMetas$: ReadonlySignal<PropertyMetaConfig[]>;

  propertyAdd(
    toAfterOfProperty: InsertToPosition,
    type?: string
  ): string | undefined;

  propertyDelete(propertyId: string): void;

  propertyCanDelete(propertyId: string): boolean;

  propertyDuplicate(propertyId: string): void;

  propertyCanDuplicate(propertyId: string): boolean;

  propertyGet(propertyId: string): Property;

  propertyMetaGet(type: string): PropertyMetaConfig | undefined;

  propertyPreGet(propertyId: string): Property | undefined;

  propertyNextGet(propertyId: string): Property | undefined;

  propertyNameGet(propertyId: string): string;

  propertyNameSet(propertyId: string, name: string): void;

  propertyTypeGet(propertyId: string): string | undefined;

  propertyTypeSet(propertyId: string, type: string): void;

  propertyTypeCanSet(propertyId: string): boolean;

  propertyHideGet(propertyId: string): boolean;

  propertyHideSet(propertyId: string, hide: boolean): void;

  propertyCanHide(propertyId: string): boolean;

  propertyDataGet(propertyId: string): Record<string, unknown>;

  propertyDataSet(propertyId: string, data: Record<string, unknown>): void;

  propertyDataTypeGet(propertyId: string): TypeInstance | undefined;

  propertyIndexGet(propertyId: string): number;

  propertyIdGetByIndex(index: number): string | undefined;

  propertyReadonlyGet(propertyId: string): boolean;

  propertyMove(propertyId: string, position: InsertToPosition): void;

  propertyIconGet(type: string): UniComponent | undefined;

  contextGet<T>(key: DataViewContextKey<T>): T;

  traitGet<T>(key: TraitKey<T>): T | undefined;

  mainProperties$: ReadonlySignal<MainProperties>;

  lockRows(lock: boolean): void;

  isLocked$: ReadonlySignal<boolean>;
}

export abstract class SingleViewBase<
  ViewData extends DataViewDataType = DataViewDataType,
> implements SingleView
{
  private readonly searchString = signal('');

  private readonly traitMap = new Map<symbol, unknown>();

  data$ = computed(() => {
    return this.dataSource.viewDataGet(this.id) as ViewData | undefined;
  });

  abstract detailProperties$: ReadonlySignal<string[]>;

  protected lockRows$ = signal(false);

  isLocked$ = computed(() => {
    return this.lockRows$.value;
  });

  abstract mainProperties$: ReadonlySignal<MainProperties>;

  name$: ReadonlySignal<string> = computed(() => {
    return this.data$.value?.name ?? '';
  });

  preRows: string[] = [];

  abstract propertyIds$: ReadonlySignal<string[]>;

  properties$ = computed(() => {
    return this.propertyIds$.value.map(
      id => this.propertyGet(id) as ReturnType<this['propertyGet']>
    );
  });

  abstract propertiesWithoutFilter$: ReadonlySignal<string[]>;

  abstract readonly$: ReadonlySignal<boolean>;

  rows$ = computed(() => {
    if (this.lockRows$.value) {
      return this.preRows;
    }
    return (this.preRows = this.rowsMapping(this.dataSource.rows$.value));
  });

  vars$ = computed(() => {
    return this.propertiesWithoutFilter$.value.flatMap(id => {
      const v = this.propertyGet(id);
      const propertyMeta = this.dataSource.propertyMetaGet(v.type$.value);
      if (!propertyMeta) {
        return [];
      }
      return {
        id: v.id,
        name: v.name$.value,
        type: propertyMeta.config.jsonValue.type({
          data: v.data$.value,
          dataSource: this.dataSource,
        }),
        icon: v.icon,
        propertyType: v.type$.value,
      };
    });
  });

  protected get dataSource() {
    return this.manager.dataSource;
  }

  get featureFlags$() {
    return this.dataSource.featureFlags$;
  }

  get isLocked() {
    return this.lockRows$.value;
  }

  get meta() {
    return this.dataSource.viewMetaGet(this.type);
  }

  get propertyMetas$() {
    return this.dataSource.propertyMetas$;
  }

  abstract get type(): string;

  constructor(
    public manager: ViewManager,
    public id: string
  ) {}

  propertyCanDelete(propertyId: string): boolean {
    return this.dataSource.propertyCanDelete(propertyId);
  }

  propertyCanDuplicate(propertyId: string): boolean {
    return this.dataSource.propertyCanDuplicate(propertyId);
  }

  propertyTypeCanSet(propertyId: string): boolean {
    return this.dataSource.propertyTypeCanSet(propertyId);
  }

  propertyCanHide(propertyId: string): boolean {
    return this.propertyTypeGet(propertyId) !== 'title';
  }

  private searchRowsMapping(rows: string[], searchString: string): string[] {
    return rows.filter(id => {
      if (searchString) {
        const containsSearchString = this.propertyIds$.value.some(
          propertyId => {
            return this.cellStringValueGet(id, propertyId)
              ?.toLowerCase()
              .includes(searchString?.toLowerCase());
          }
        );
        if (!containsSearchString) {
          return false;
        }
      }
      return this.isShow(id);
    });
  }

  cellGet(rowId: string, propertyId: string): Cell {
    return new CellBase(this, propertyId, rowId);
  }

  cellJsonValueGet(rowId: string, propertyId: string): unknown | null {
    const type = this.propertyTypeGet(propertyId);
    if (!type) {
      return null;
    }
    return (
      this.dataSource.propertyMetaGet(type)?.config.rawValue.toJson({
        value: this.dataSource.cellValueGet(rowId, propertyId),
        data: this.propertyDataGet(propertyId),
        dataSource: this.dataSource,
      }) ?? null
    );
  }

  cellJsonValueSet(rowId: string, propertyId: string, value: unknown): void {
    const type = this.propertyTypeGet(propertyId);
    if (!type) {
      return;
    }
    const config = this.dataSource.propertyMetaGet(type)?.config;
    if (!config) {
      return;
    }
    const rawValue = fromJson(config, {
      value: value,
      data: this.propertyDataGet(propertyId),
      dataSource: this.dataSource,
    });
    this.dataSource.cellValueChange(rowId, propertyId, rawValue);
  }

  cellStringValueGet(rowId: string, propertyId: string): string | undefined {
    const type = this.propertyTypeGet(propertyId);
    if (!type) {
      return;
    }
    return (
      this.dataSource.propertyMetaGet(type)?.config.rawValue.toString({
        value: this.dataSource.cellValueGet(rowId, propertyId),
        data: this.propertyDataGet(propertyId),
      }) ?? ''
    );
  }

  cellValueGet(rowId: string, propertyId: string): unknown {
    return this.dataSource.cellValueGet(rowId, propertyId);
  }

  cellValueSet(rowId: string, propertyId: string, value: unknown): void {
    this.dataSource.cellValueChange(rowId, propertyId, value);
  }

  contextGet<T>(key: DataViewContextKey<T>): T {
    return this.dataSource.contextGet(key);
  }

  dataUpdate(updater: (viewData: ViewData) => Partial<ViewData>): void {
    this.dataSource.viewDataUpdate(this.id, updater);
  }

  delete(): void {
    this.manager.viewDelete(this.id);
  }

  duplicate(): void {
    this.manager.viewDuplicate(this.id);
  }

  abstract isShow(rowId: string): boolean;

  lockRows(lock: boolean) {
    this.lockRows$.value = lock;
  }

  nameSet(name: string): void {
    this.dataUpdate(() => {
      return {
        name,
      } as ViewData;
    });
  }

  propertyAdd(position: InsertToPosition, type?: string): string | undefined {
    const id = this.dataSource.propertyAdd(position, type);
    if (!id) {
      return;
    }
    this.propertyMove(id, position);
    return id;
  }

  propertyDataGet(propertyId: string): Record<string, unknown> {
    return this.dataSource.propertyDataGet(propertyId);
  }

  propertyDataSet(propertyId: string, data: Record<string, unknown>): void {
    this.dataSource.propertyDataSet(propertyId, data);
  }

  propertyDataTypeGet(propertyId: string): TypeInstance | undefined {
    const type = this.propertyTypeGet(propertyId);
    if (!type) {
      return;
    }
    const meta = this.dataSource.propertyMetaGet(type);
    if (!meta) {
      return;
    }
    return meta.config.jsonValue.type({
      data: this.propertyDataGet(propertyId),
      dataSource: this.dataSource,
    });
  }

  propertyDelete(propertyId: string): void {
    this.dataSource.propertyDelete(propertyId);
  }

  propertyDuplicate(propertyId: string): void {
    const id = this.dataSource.propertyDuplicate(propertyId);
    if (!id) {
      return;
    }
    this.propertyMove(id, {
      before: false,
      id: propertyId,
    });
  }

  abstract propertyGet(propertyId: string): Property;

  abstract propertyHideGet(propertyId: string): boolean;

  abstract propertyHideSet(propertyId: string, hide: boolean): void;

  propertyIconGet(type: string): UniComponent | undefined {
    return this.dataSource.propertyMetaGet(type)?.renderer.icon;
  }

  propertyIdGetByIndex(index: number): string | undefined {
    return this.propertyIds$.value[index];
  }

  propertyIndexGet(propertyId: string): number {
    return this.propertyIds$.value.indexOf(propertyId);
  }

  propertyMetaGet(type: string): PropertyMetaConfig | undefined {
    return this.dataSource.propertyMetaGet(type);
  }

  abstract propertyMove(propertyId: string, position: InsertToPosition): void;

  propertyNameGet(propertyId: string): string {
    return this.dataSource.propertyNameGet(propertyId);
  }

  propertyNameSet(propertyId: string, name: string): void {
    this.dataSource.propertyNameSet(propertyId, name);
  }

  propertyNextGet(propertyId: string): Property | undefined {
    const index = this.propertyIndexGet(propertyId);
    const nextId = this.propertyIdGetByIndex(index + 1);
    if (!nextId) return;
    return this.propertyGet(nextId);
  }

  propertyParseValueFromString(propertyId: string, cellData: string) {
    const type = this.propertyTypeGet(propertyId);
    if (!type) {
      return;
    }
    const fromString =
      this.dataSource.propertyMetaGet(type)?.config.rawValue.fromString;
    if (!fromString) {
      return;
    }
    return fromString({
      value: cellData,
      data: this.propertyDataGet(propertyId),
      dataSource: this.dataSource,
    });
  }

  propertyPreGet(propertyId: string): Property | undefined {
    const index = this.propertyIndexGet(propertyId);
    const prevId = this.propertyIdGetByIndex(index - 1);
    if (!prevId) return;
    return this.propertyGet(prevId);
  }

  propertyReadonlyGet(propertyId: string): boolean {
    return this.dataSource.propertyReadonlyGet(propertyId);
  }

  propertyTypeGet(propertyId: string): string | undefined {
    return this.dataSource.propertyTypeGet(propertyId);
  }

  propertyTypeSet(propertyId: string, type: string): void {
    this.dataSource.propertyTypeSet(propertyId, type);
  }

  rowAdd(insertPosition: InsertToPosition | number): string {
    return this.dataSource.rowAdd(insertPosition);
  }

  rowDelete(ids: string[]): void {
    this.dataSource.rowDelete(ids);
  }

  rowGet(rowId: string): Row {
    return new RowBase(this, rowId);
  }

  rowMove(rowId: string, position: InsertToPosition): void {
    this.dataSource.rowMove(rowId, position);
  }

  abstract rowNextGet(rowId: string): string | undefined;

  abstract rowPrevGet(rowId: string): string | undefined;

  protected rowsMapping(rows: string[]): string[] {
    return this.searchRowsMapping(rows, this.searchString.value);
  }

  setSearch(str: string): void {
    this.searchString.value = str;
  }

  traitGet<T>(key: TraitKey<T>): T | undefined {
    return this.traitMap.get(key.key) as T | undefined;
  }

  protected traitSet<T>(key: TraitKey<T>, value: T): T {
    this.traitMap.set(key.key, value);
    return value;
  }
}
