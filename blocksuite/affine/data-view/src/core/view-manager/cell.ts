import { computed, type ReadonlySignal } from '@preact/signals-core';

import { fromJson } from '../property/utils.js';
import type { Property } from './property.js';
import type { Row } from './row.js';
import type { SingleView } from './single-view.js';

export interface Cell<
  RawValue = unknown,
  JsonValue = unknown,
  Data extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly view: SingleView;
  readonly rowId: string;
  readonly row: Row;
  readonly propertyId: string;
  readonly property: Property<RawValue, JsonValue, Data>;

  readonly isEmpty$: ReadonlySignal<boolean>;
  readonly value$: ReadonlySignal<RawValue | undefined>;
  readonly jsonValue$: ReadonlySignal<JsonValue | undefined>;
  readonly stringValue$: ReadonlySignal<string | undefined>;

  valueSet(value: RawValue | undefined): void;
  jsonValueSet(value: JsonValue | undefined): void;
}

export class CellBase<
  RawValue = unknown,
  JsonValue = unknown,
  Data extends Record<string, unknown> = Record<string, unknown>,
> implements Cell<RawValue, JsonValue, Data> {
  get dataSource() {
    return this.view.manager.dataSource;
  }

  meta$ = computed(() => {
    return this.dataSource.propertyMetaGet(this.property.type$.value);
  });

  value$ = computed(() => {
    return this.view.manager.dataSource.cellValueGet(
      this.rowId,
      this.propertyId
    ) as RawValue;
  });

  isEmpty$: ReadonlySignal<boolean> = computed(() => {
    return (
      this.meta$.value?.config.jsonValue.isEmpty({
        value: this.jsonValue$.value,
        dataSource: this.view.manager.dataSource,
      }) ?? true
    );
  });

  jsonValue$: ReadonlySignal<JsonValue | undefined> = computed(() => {
    const toJson = this.property.meta$.value?.config.rawValue.toJson;
    if (!toJson) {
      return undefined;
    }
    return (
      (toJson({
        value: this.value$.value,
        data: this.property.data$.value,
        dataSource: this.dataSource,
      }) as JsonValue) ?? undefined
    );
  });

  property$ = computed(() => {
    return this.view.propertyGetOrCreate(this.propertyId) as Property<
      RawValue,
      JsonValue,
      Data
    >;
  });

  stringValue$: ReadonlySignal<string | undefined> = computed(() => {
    const toString = this.property.meta$.value?.config.rawValue.toString;
    if (!toString) {
      return;
    }
    return toString({
      value: this.value$.value,
      data: this.property.data$.value,
    });
  });

  get property(): Property<RawValue, JsonValue, Data> {
    return this.property$.value;
  }

  get row(): Row {
    return this.view.rowGetOrCreate(this.rowId);
  }

  constructor(
    public view: SingleView,
    public propertyId: string,
    public rowId: string
  ) {}

  valueSet(value: RawValue | undefined): void {
    this.view.manager.dataSource.cellValueChange(
      this.rowId,
      this.propertyId,
      value
    );
  }

  jsonValueSet(value: JsonValue | undefined): void {
    const meta = this.property.meta$.value;
    if (!meta) {
      return;
    }
    const rawValue = fromJson(meta.config, {
      value: value,
      data: this.property.data$.value,
      dataSource: this.view.manager.dataSource,
    });
    this.dataSource.cellValueChange(this.rowId, this.propertyId, rawValue);
  }
}
