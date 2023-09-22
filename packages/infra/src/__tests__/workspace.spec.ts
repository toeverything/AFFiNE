import { AffineSchemas } from '@blocksuite/blocks/models';
import { Schema, Workspace } from '@blocksuite/store';
import { expect, test } from 'vitest';

import {
  disablePassiveProviders,
  enablePassiveProviders,
  getWorkspace,
  INTERNAL_BLOCKSUITE_HASH_MAP,
  workspacePassiveEffectWeakMap,
} from '../__internal__/workspace';

const schema = new Schema();

schema.register(AffineSchemas);

const createWorkspace = (id: string) => {
  return new Workspace({
    id,
    schema,
  });
};

test('workspace passive provider should enable correctly', () => {
  INTERNAL_BLOCKSUITE_HASH_MAP.set('1', createWorkspace('1'));
  INTERNAL_BLOCKSUITE_HASH_MAP.set('2', createWorkspace('2'));
  expect(workspacePassiveEffectWeakMap.get(getWorkspace('1'))).toBe(undefined);
  enablePassiveProviders(getWorkspace('1'));
  expect(workspacePassiveEffectWeakMap.get(getWorkspace('1'))).toBe(1);
  expect(workspacePassiveEffectWeakMap.get(getWorkspace('2'))).toBe(undefined);
  enablePassiveProviders(getWorkspace('1'));
  expect(workspacePassiveEffectWeakMap.get(getWorkspace('1'))).toBe(2);
  disablePassiveProviders(getWorkspace('1'));
  expect(workspacePassiveEffectWeakMap.get(getWorkspace('1'))).toBe(1);
  disablePassiveProviders(getWorkspace('1'));
  expect(workspacePassiveEffectWeakMap.get(getWorkspace('1'))).toBe(undefined);
});
