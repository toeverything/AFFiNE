import type { ColumnDataType } from '@blocksuite/affine-model';
import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import {
  Container,
  createScope,
  type GeneralServiceIdentifier,
  type ServiceProvider,
} from '@blocksuite/global/di';
import { computed, type ReadonlySignal } from '@preact/signals-core';

import type { TypeInstance } from '../logical/type.js';
import type { PropertyMetaConfig } from '../property/property-config.js';
import type { DatabaseFlags } from '../types.js';
import type { ViewConvertConfig } from '../view/convert.js';
import type { DataViewDataType, ViewMeta } from '../view/data-view.js';
import type { ViewManager } from '../view-manager/view-manager.js';

export interface DataSource {
  readonly$: ReadonlySignal<boolean>;
  properties$: ReadonlySignal<string[]>;
  featureFlags$: ReadonlySignal<DatabaseFlags>;

  cellValueGet(rowId: string, propertyId: string): unknown;
  cellValueGet$(
    rowId: string,
    propertyId: string
  ): ReadonlySignal<unknown | undefined>;
  cellValueChange(rowId: string, propertyId: string, value: unknown): void;

  rows$: ReadonlySignal<string[]>;
  rowAdd(InsertToPosition: InsertToPosition | number): string;
  rowDelete(ids: string[]): void;
  rowMove(rowId: string, position: InsertToPosition): void;

  propertyMetas$: ReadonlySignal<PropertyMetaConfig[]>;
  allPropertyMetas$: ReadonlySignal<PropertyMetaConfig[]>;

  propertyNameGet$(propertyId: string): ReadonlySignal<string | undefined>;
  propertyNameGet(propertyId: string): string;
  propertyNameSet(propertyId: string, name: string): void;

  propertyTypeGet(propertyId: string): string | undefined;
  propertyTypeGet$(propertyId: string): ReadonlySignal<string | undefined>;
  propertyTypeSet(propertyId: string, type: string): void;
  propertyTypeCanSet(propertyId: string): boolean;

  propertyDataGet(propertyId: string): Record<string, unknown>;
  propertyDataGet$(
    propertyId: string
  ): ReadonlySignal<Record<string, unknown> | undefined>;
  propertyDataSet(propertyId: string, data: Record<string, unknown>): void;

  propertyDataTypeGet(propertyId: string): TypeInstance | undefined;
  propertyDataTypeGet$(
    propertyId: string
  ): ReadonlySignal<TypeInstance | undefined>;

  propertyReadonlyGet(propertyId: string): boolean;
  propertyReadonlyGet$(propertyId: string): ReadonlySignal<boolean>;

  propertyMetaGet(type: string): PropertyMetaConfig | undefined;
  propertyAdd(
    insertToPosition: InsertToPosition,
    ops?: {
      type?: string;
      name?: string;
    }
  ): string | undefined;

  propertyDuplicate(propertyId: string): string | undefined;
  propertyCanDuplicate(propertyId: string): boolean;

  propertyDelete(id: string): void;
  propertyCanDelete(propertyId: string): boolean;

  provider: ServiceProvider;
  serviceGet<T>(key: GeneralServiceIdentifier<T>): T | null;
  serviceGetOrCreate<T>(key: GeneralServiceIdentifier<T>, create: () => T): T;

  viewConverts: ViewConvertConfig[];
  viewManager: ViewManager;
  viewMetas: ViewMeta[];
  viewDataList$: ReadonlySignal<DataViewDataType[]>;

  viewDataGet(viewId: string): DataViewDataType | undefined;
  viewDataGet$(viewId: string): ReadonlySignal<DataViewDataType | undefined>;

  viewDataAdd(viewData: DataViewDataType): string;
  viewDataDuplicate(id: string): string;
  viewDataDelete(viewId: string): void;
  viewDataMoveTo(id: string, position: InsertToPosition): void;
  viewDataUpdate<ViewData extends DataViewDataType>(
    id: string,
    updater: (data: ViewData) => Partial<ViewData>
  ): void;

  viewMetaGet(type: string): ViewMeta;
  viewMetaGet$(type: string): ReadonlySignal<ViewMeta | undefined>;

  viewMetaGetById(viewId: string): ViewMeta | undefined;
  viewMetaGetById$(viewId: string): ReadonlySignal<ViewMeta | undefined>;
}

export const DataSourceScope = createScope('data-source');

export abstract class DataSourceBase implements DataSource {
  propertyTypeCanSet(propertyId: string): boolean {
    return !this.isFixedProperty(propertyId);
  }
  propertyCanDuplicate(propertyId: string): boolean {
    return !this.isFixedProperty(propertyId);
  }
  propertyCanDelete(propertyId: string): boolean {
    return !this.isFixedProperty(propertyId);
  }
  protected container = new Container();

  abstract get parentProvider(): ServiceProvider;

  abstract featureFlags$: ReadonlySignal<DatabaseFlags>;

  abstract properties$: ReadonlySignal<string[]>;

  abstract propertyMetas$: ReadonlySignal<PropertyMetaConfig[]>;

  abstract allPropertyMetas$: ReadonlySignal<PropertyMetaConfig[]>;

  abstract readonly$: ReadonlySignal<boolean>;

  abstract rows$: ReadonlySignal<string[]>;

  abstract viewConverts: ViewConvertConfig[];

  abstract viewDataList$: ReadonlySignal<DataViewDataType[]>;

  abstract viewManager: ViewManager;

  abstract viewMetas: ViewMeta[];

  abstract cellValueChange(
    rowId: string,
    propertyId: string,
    value: unknown
  ): void;

  abstract cellValueChange(
    rowId: string,
    propertyId: string,
    value: unknown
  ): void;

  abstract cellValueGet(rowId: string, propertyId: string): unknown;

  cellValueGet$(
    rowId: string,
    propertyId: string
  ): ReadonlySignal<unknown | undefined> {
    return computed(() => this.cellValueGet(rowId, propertyId));
  }

  get provider() {
    return this.container.provider(DataSourceScope, this.parentProvider);
  }

  serviceGet<T>(key: GeneralServiceIdentifier<T>): T | null {
    return this.provider.getOptional(key);
  }

  serviceSet<T>(key: GeneralServiceIdentifier<T>, value: T): void {
    this.container.addValue(key, value, { scope: DataSourceScope });
  }

  serviceGetOrCreate<T>(key: GeneralServiceIdentifier<T>, create: () => T): T {
    const result = this.serviceGet(key);
    if (result != null) {
      return result;
    }
    const value = create();
    this.serviceSet(key, value);
    return value;
  }

  abstract propertyAdd(
    insertToPosition: InsertToPosition,
    ops?: {
      type?: string;
      name?: string;
    }
  ): string | undefined;

  abstract propertyDataGet(propertyId: string): Record<string, unknown>;

  propertyDataGet$(
    propertyId: string
  ): ReadonlySignal<Record<string, unknown> | undefined> {
    return computed(() => this.propertyDataGet(propertyId));
  }

  abstract propertyDataSet(
    propertyId: string,
    data: Record<string, unknown>
  ): void;

  abstract propertyDataTypeGet(propertyId: string): TypeInstance | undefined;

  propertyDataTypeGet$(
    propertyId: string
  ): ReadonlySignal<TypeInstance | undefined> {
    return computed(() => this.propertyDataTypeGet(propertyId));
  }

  abstract propertyDelete(id: string): void;

  abstract propertyDuplicate(propertyId: string): string | undefined;

  abstract propertyMetaGet(type: string): PropertyMetaConfig | undefined;

  abstract propertyNameGet(propertyId: string): string;

  propertyNameGet$(propertyId: string): ReadonlySignal<string | undefined> {
    return computed(() => this.propertyNameGet(propertyId));
  }

  abstract propertyNameSet(propertyId: string, name: string): void;

  propertyReadonlyGet(_propertyId: string): boolean {
    return false;
  }

  propertyReadonlyGet$(propertyId: string): ReadonlySignal<boolean> {
    return computed(() => this.propertyReadonlyGet(propertyId));
  }

  abstract propertyTypeGet(propertyId: string): string | undefined;

  propertyTypeGet$(propertyId: string): ReadonlySignal<string | undefined> {
    return computed(() => this.propertyTypeGet(propertyId));
  }

  abstract propertyTypeSet(propertyId: string, type: string): void;

  abstract rowAdd(InsertToPosition: InsertToPosition | number): string;

  abstract rowDelete(ids: string[]): void;

  abstract rowMove(rowId: string, position: InsertToPosition): void;

  abstract viewDataAdd(viewData: DataViewDataType): string;

  abstract viewDataDelete(viewId: string): void;

  abstract viewDataDuplicate(id: string): string;

  abstract viewDataGet(viewId: string): DataViewDataType | undefined;

  viewDataGet$(viewId: string): ReadonlySignal<DataViewDataType | undefined> {
    return computed(() => this.viewDataGet(viewId));
  }

  abstract viewDataMoveTo(id: string, position: InsertToPosition): void;

  abstract viewDataUpdate<ViewData extends DataViewDataType>(
    id: string,
    updater: (data: ViewData) => Partial<ViewData>
  ): void;

  abstract viewMetaGet(type: string): ViewMeta;

  viewMetaGet$(type: string): ReadonlySignal<ViewMeta | undefined> {
    return computed(() => this.viewMetaGet(type));
  }

  abstract viewMetaGetById(viewId: string): ViewMeta | undefined;

  viewMetaGetById$(viewId: string): ReadonlySignal<ViewMeta | undefined> {
    return computed(() => this.viewMetaGetById(viewId));
  }

  fixedProperties$ = computed(() => {
    return this.allPropertyMetas$.value
      .filter(v => v.config.fixed)
      .map(v => v.type);
  });
  fixedPropertySet = computed(() => {
    return new Set(this.fixedProperties$.value);
  });

  protected abstract getNormalPropertyAndIndex(propertyId: string):
    | {
        column: ColumnDataType<Record<string, unknown>>;
        index: number;
      }
    | undefined;

  isFixedProperty(propertyId: string) {
    if (this.fixedPropertySet.value.has(propertyId)) {
      return true;
    }
    const result = this.getNormalPropertyAndIndex(propertyId);
    if (result) {
      return this.fixedPropertySet.value.has(result.column.type);
    }
    return false;
  }
}
