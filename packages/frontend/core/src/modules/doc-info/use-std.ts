import { createBlockStdScope } from '@affine/core/blocksuite/manager/view';
import type { Store } from '@blocksuite/affine/store';
import { useMemo } from 'react';

export function useBlockStdScope(doc: Store) {
  return useMemo(() => createBlockStdScope(doc), [doc]);
}
