import type { BlockModel } from '@blocksuite/store';

export function getBlockProps(model: BlockModel): Record<string, unknown> {
  const keys = model.keys as (keyof typeof model.props)[];
  return Object.fromEntries(keys.map(key => [key, model.props[key]]));
}
