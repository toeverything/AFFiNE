import type { UniComponent } from '@blocksuite/affine-shared/types';

import type { TypeInstance, ValueTypeOf } from '../logical/type.js';
import type { Group } from './trait.js';
export interface GroupRenderProps<
  JsonValue = unknown,
  Data extends Record<string, unknown> = Record<string, unknown>,
> {
  group: Group<unknown, JsonValue, Data>;
  readonly: boolean;
}
type AddToGroup<GroupValue, MatchType> = (
  value: GroupValue | null,
  oldValue: ValueTypeOf<MatchType> | null
) => ValueTypeOf<MatchType> | null;
export type GroupByConfig<
  Data extends NonNullable<unknown> = NonNullable<unknown>,
  MatchType extends TypeInstance = TypeInstance,
  GroupValue = unknown,
> = {
  name: string;
  matchType: MatchType;
  groupName: (type: MatchType, value: GroupValue | null) => string;
  defaultKeys: (type: MatchType) => {
    key: string;
    value: GroupValue | null;
  }[];
  valuesGroup: (
    value: ValueTypeOf<MatchType> | null,
    type: MatchType
  ) => {
    key: string;
    value: GroupValue | null;
  }[];
  addToGroup: AddToGroup<GroupValue, MatchType> | false;
  removeFromGroup?: (
    value: GroupValue | null,
    oldValue: ValueTypeOf<MatchType> | null
  ) => ValueTypeOf<MatchType> | null;
  view: UniComponent<GroupRenderProps<GroupValue | null, Data>>;
};
