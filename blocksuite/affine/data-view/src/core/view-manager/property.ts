import type { UniComponent } from '@blocksuite/affine-shared/types';
import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import { computed, type ReadonlySignal } from '@preact/signals-core';

import type { TypeInstance } from '../logical/type.js';
import type { CellRenderer, PropertyMetaConfig } from '../property/index.js';
import type { PropertyDataUpdater } from '../types.js';
import type { Cell } from './cell.js';
import type { SingleView } from './single-view.js';

export interface Property<
  RawValue = unknown,
  JsonValue = unknown,
  Data extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string;
  readonly index$: ReadonlySignal<number | undefined>;
  readonly view: SingleView;
  readonly isFirst$: ReadonlySignal<boolean>;
  readonly isLast$: ReadonlySignal<boolean>;
  readonly next$: ReadonlySignal<Property | undefined>;
  readonly prev$: ReadonlySignal<Property | undefined>;
  readonly readonly$: ReadonlySignal<boolean>;
  readonly renderer$: ReadonlySignal<CellRenderer | undefined>;
  readonly cells$: ReadonlySignal<Cell[]>;
  readonly dataType$: ReadonlySignal<TypeInstance | undefined>;
  readonly meta$: ReadonlySignal<PropertyMetaConfig | undefined>;
  readonly icon?: UniComponent;

  readonly delete?: () => void;
  get canDelete(): boolean;

  readonly duplicate?: () => void;
  get canDuplicate(): boolean;

  cellGetOrCreate(rowId: string): Cell<RawValue, JsonValue, Data>;

  readonly data$: ReadonlySignal<Data>;
  dataUpdate(updater: PropertyDataUpdater<Data>): void;

  readonly type$: ReadonlySignal<string>;
  readonly typeSet?: (type: string) => void;
  get typeCanSet(): boolean;

  readonly name$: ReadonlySignal<string>;
  nameSet(name: string): void;

  readonly hide$: ReadonlySignal<boolean>;
  hideSet(hide: boolean): void;
  get hideCanSet(): boolean;

  valueGet(rowId: string): RawValue | undefined;
  valueSet(rowId: string, value: RawValue | undefined): void;

  stringValueGet(rowId: string): string | undefined;
  valueSetFromString(rowId: string, value: string): void;
  parseValueFromString(value: string):
    | {
        value: unknown;
        data?: Record<string, unknown>;
      }
    | undefined;

  move(position: InsertToPosition): void;
}

export abstract class PropertyBase<
  RawValue = unknown,
  JsonValue = unknown,
  Data extends Record<string, unknown> = Record<string, unknown>,
> implements Property<RawValue, JsonValue, Data> {
  meta$ = computed(() => {
    return this.dataSource.propertyMetaGet(this.type$.value);
  });

  cells$ = computed(() => {
    return this.view.rows$.value.map(row =>
      this.view.cellGetOrCreate(row.rowId, this.id)
    );
  });

  data$ = computed(() => {
    return this.dataSource.propertyDataGet(this.id) as Data;
  });

  dataType$ = computed(() => {
    const type = this.type$.value;
    if (!type) {
      return;
    }
    const meta = this.dataSource.propertyMetaGet(type);
    if (!meta) {
      return;
    }
    return meta.config.jsonValue.type({
      data: this.data$.value,
      dataSource: this.dataSource,
    });
  });

  abstract hide$: ReadonlySignal<boolean>;

  name$ = computed(() => {
    return this.dataSource.propertyNameGet(this.id);
  });

  readonly$ = computed(() => {
    return (
      this.view.readonly$.value || this.dataSource.propertyReadonlyGet(this.id)
    );
  });

  type$ = computed(() => {
    return this.dataSource.propertyTypeGet(this.id)!;
  });

  renderer$ = computed(() => {
    return this.meta$.value?.renderer.cellRenderer;
  });

  get delete(): (() => void) | undefined {
    return () => this.dataSource.propertyDelete(this.id);
  }

  get duplicate(): (() => void) | undefined {
    return () => {
      const id = this.dataSource.propertyDuplicate(this.id);
      if (!id) {
        return;
      }
      const property = this.view.propertyGetOrCreate(id);
      property.move({
        before: false,
        id: this.id,
      });
    };
  }

  abstract move(position: InsertToPosition): void;

  get icon(): UniComponent | undefined {
    if (!this.type$.value) return undefined;
    return this.dataSource.propertyMetaGet(this.type$.value)?.renderer.icon;
  }

  get id(): string {
    return this.propertyId;
  }

  index$ = computed(() => {
    const index = this.view.propertyIds$.value.indexOf(this.id);
    return index >= 0 ? index : undefined;
  });

  isFirst$ = computed(() => {
    return this.index$.value === 0;
  });

  isLast$ = computed(() => {
    return this.index$.value === this.view.propertyIds$.value.length - 1;
  });

  next$ = computed(() => {
    const properties = this.view.properties$.value;
    if (this.index$.value == null) {
      return;
    }
    return properties[this.index$.value + 1];
  });

  prev$ = computed(() => {
    const properties = this.view.properties$.value;
    if (this.index$.value == null) {
      return;
    }
    return properties[this.index$.value - 1];
  });

  get typeSet(): undefined | ((type: string) => void) {
    return type => this.dataSource.propertyTypeSet(this.id, type);
  }

  constructor(
    public view: SingleView,
    public propertyId: string
  ) {}
  protected get dataSource() {
    return this.view.manager.dataSource;
  }
  get canDelete(): boolean {
    return this.dataSource.propertyCanDelete(this.id);
  }
  get canDuplicate(): boolean {
    return this.dataSource.propertyCanDuplicate(this.id);
  }
  get typeCanSet(): boolean {
    return this.dataSource.propertyTypeCanSet(this.id);
  }
  get hideCanSet(): boolean {
    return this.type$.value !== 'title';
  }

  cellGetOrCreate(rowId: string): Cell<RawValue, JsonValue, Data> {
    return this.view.cellGetOrCreate(rowId, this.id) as Cell<
      RawValue,
      JsonValue,
      Data
    >;
  }

  dataUpdate(updater: PropertyDataUpdater<Data>): void {
    const data = this.data$.value;
    this.dataSource.propertyDataSet(this.id, {
      ...data,
      ...updater(data),
    });
  }

  abstract hideSet(hide: boolean): void;

  nameSet(name: string): void {
    this.dataSource.propertyNameSet(this.id, name);
  }

  stringValueGet(rowId: string): string | undefined {
    return this.cellGetOrCreate(rowId).stringValue$.value;
  }

  valueGet(rowId: string): RawValue | undefined {
    return this.cellGetOrCreate(rowId).value$.value;
  }

  valueSet(rowId: string, value: RawValue | undefined): void {
    return this.cellGetOrCreate(rowId).valueSet(value);
  }

  parseValueFromString(value: string):
    | {
        value: unknown;
        data?: Record<string, unknown>;
      }
    | undefined {
    const type = this.type$.value;
    if (!type) {
      return;
    }
    const fromString =
      this.dataSource.propertyMetaGet(type)?.config.rawValue.fromString;
    if (!fromString) {
      return;
    }
    return fromString({
      value,
      data: this.data$.value,
      dataSource: this.dataSource,
    });
  }

  valueSetFromString(rowId: string, value: string): void {
    const data = this.parseValueFromString(value);
    if (!data) {
      return;
    }
    if (data.data) {
      this.dataUpdate(() => data.data as Data);
    }
    this.valueSet(rowId, data.value as RawValue);
  }
}
