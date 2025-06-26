import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import {
  type GeneralServiceIdentifier,
  type ServiceProvider,
} from '@blocksuite/global/di';
import { type ReadonlySignal } from '@preact/signals-core';

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

  readonly propertyMetas: PropertyMetaConfig[];
  readonly allPropertyMetas: PropertyMetaConfig[];

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
