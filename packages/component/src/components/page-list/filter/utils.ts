import type { Filter } from '@affine/env/filter';

export const createTagFilter = (id: string): Filter => {
  return {
    type: 'filter',
    left: { type: 'ref', name: 'Tags' },
    funcName: 'contains all',
    args: [{ type: 'literal', value: [id] }],
  };
};
