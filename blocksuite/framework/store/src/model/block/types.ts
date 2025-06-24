import type * as Y from 'yjs';

import type { BlockModel } from './block-model.js';
import type { Block } from './index.js';

export type YBlock = Y.Map<unknown> & {
  get(prop: 'sys:id' | 'sys:flavour'): string;
  get(prop: 'sys:children'): Y.Array<string>;
  get<T = unknown>(prop: string): T;
};

export type BlockOptions = {
  onChange?: (block: Block, key: string, isLocal: boolean) => void;
};

export type BlockSysProps = {
  id: string;
  flavour: string;
  children?: BlockModel[];
};
export type BlockProps = BlockSysProps & Record<string, unknown>;

export type PropsOfModel<T> = T extends BlockModel<infer P> ? P : never;
