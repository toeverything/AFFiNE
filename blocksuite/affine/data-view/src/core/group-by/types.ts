import type { UniComponent } from '@blocksuite/affine-shared/types';

import type { TypeInstance } from '../logical/type.js';
export interface GroupRenderProps<
  Data extends NonNullable<unknown> = NonNullable<unknown>,
  JsonValue = unknown,
> {
  data: Data;
  updateData?: (data: Data) => void;
  value: JsonValue;
  updateValue?: (value: JsonValue) => void;
  readonly: boolean;
}

export type GroupByConfig<
  JsonValue = unknown,
  Data extends NonNullable<unknown> = NonNullable<unknown>,
> = {
  name: string;
  groupName: (type: TypeInstance, value: unknown) => string;
  defaultKeys: (type: TypeInstance) => {
    key: string;
    value: JsonValue;
  }[];
  valuesGroup: (
    value: unknown,
    type: TypeInstance
  ) => {
    key: string;
    value: JsonValue;
  }[];
  addToGroup?: (value: JsonValue, oldValue: JsonValue) => JsonValue;
  removeFromGroup?: (value: JsonValue, oldValue: JsonValue) => JsonValue;
  view: UniComponent<GroupRenderProps<Data, JsonValue>>;
};
