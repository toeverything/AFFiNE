import type { PropertyMetaConfig } from '@blocksuite/data-view';
import type { DisposableMember } from '@blocksuite/global/disposable';
import type { Block, BlockModel } from '@blocksuite/store';

type PropertyMeta<
  T extends BlockModel = BlockModel,
  RawValue = unknown,
  JsonValue = unknown,
  ColumnData extends NonNullable<unknown> = NonNullable<unknown>,
> = {
  name: string;
  key: string;
  metaConfig: PropertyMetaConfig<string, ColumnData, RawValue, JsonValue>;
  getColumnData?: (block: T) => ColumnData;
  setColumnData?: (block: T, data: ColumnData) => void;
  get: (block: T) => RawValue;
  set?: (block: T, value: RawValue) => void;
  updated: (block: T, callback: () => void) => DisposableMember;
};
export type BlockMeta<T extends BlockModel = BlockModel> = {
  selector: (block: Block) => boolean;
  properties: PropertyMeta<T>[];
};
export const createBlockMeta = <T extends BlockModel>(
  options: Omit<BlockMeta<T>, 'properties'>
) => {
  const meta: BlockMeta = {
    ...options,
    properties: [],
  };
  return {
    ...meta,
    addProperty: <Value>(property: PropertyMeta<T, Value>) => {
      meta.properties.push(property as PropertyMeta);
    },
  };
};
