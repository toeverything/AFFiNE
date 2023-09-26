import { AffineSchemas } from '@blocksuite/blocks/models';
import type { DocProviderCreator } from '@blocksuite/store';
import { Schema, Workspace } from '@blocksuite/store';
import { getDefaultStore } from 'jotai/vanilla';
import { beforeEach, expect, test } from 'vitest';

import {
  disablePassiveProviders,
  enablePassiveProviders,
  getActiveBlockSuiteWorkspaceAtom,
  getWorkspace,
  INTERNAL_BLOCKSUITE_HASH_MAP,
  workspacePassiveEffectWeakMap,
} from '../__internal__/workspace';

const schema = new Schema();

schema.register(AffineSchemas);

const activeWorkspaceEnabled = new Set<string>();
const passiveWorkspaceEnabled = new Set<string>();

beforeEach(() => {
  activeWorkspaceEnabled.clear();
});

const createWorkspace = (id: string) => {
  const activeCreator: DocProviderCreator = () => ({
    flavour: 'active',
    active: true,
    sync() {
      activeWorkspaceEnabled.add(id);
    },
    get whenReady(): Promise<void> {
      return Promise.resolve();
    },
  });
  const passiveCreator: DocProviderCreator = () => ({
    flavour: 'passive',
    passive: true,
    connect() {
      passiveWorkspaceEnabled.add(id);
    },
    disconnect() {
      passiveWorkspaceEnabled.delete(id);
    },
    get connected() {
      return false;
    },
  });

  return new Workspace({
    id,
    schema,
    providerCreators: [activeCreator, passiveCreator],
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

test('workspace provider should initialize correctly', async () => {
  INTERNAL_BLOCKSUITE_HASH_MAP.set('1', createWorkspace('1'));
  {
    enablePassiveProviders(getWorkspace('1'));
    expect(activeWorkspaceEnabled.size).toBe(0);
    expect(passiveWorkspaceEnabled.size).toBe(1);
    disablePassiveProviders(getWorkspace('1'));
    expect(activeWorkspaceEnabled.size).toBe(0);
    expect(passiveWorkspaceEnabled.size).toBe(0);
  }
  {
    const atom = getActiveBlockSuiteWorkspaceAtom('1');
    await getDefaultStore().get(atom);
    expect(activeWorkspaceEnabled.size).toBe(1);
    expect(passiveWorkspaceEnabled.size).toBe(0);
  }
});
