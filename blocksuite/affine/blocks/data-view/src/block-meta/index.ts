import type { BlockMeta } from './base.js';
import { todoMeta } from './todo.js';

export const blockMetaMap = {
  todo: todoMeta,
} satisfies Record<string, BlockMeta>;
