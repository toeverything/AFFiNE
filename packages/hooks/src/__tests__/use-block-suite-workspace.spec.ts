/**
 * @vitest-environment happy-dom
 */
import { Workspace } from '@blocksuite/store';
import { renderHook } from '@testing-library/react';
import {
  getActiveBlockSuiteWorkspaceAtom,
  INTERNAL_BLOCKSUITE_HASH_MAP,
  usePassiveWorkspaceEffect,
  useStaticBlockSuiteWorkspace,
} from '@toeverything/hooks/use-block-suite-workspace';
import { getDefaultStore } from 'jotai/vanilla';
import { expect, test, vi } from 'vitest';

test('useStaticBlockSuiteWorkspace', async () => {
  const sync = vi.fn();
  let connected = false;
  const connect = vi.fn(() => (connected = true));
  const workspace = new Workspace({
    id: '1',
    providerCreators: [
      () => ({
        flavour: 'fake',
        active: true,
        sync,
        get whenReady(): Promise<void> {
          return Promise.resolve();
        },
      }),
      () => ({
        flavour: 'fake-2',
        passive: true,
        get connected() {
          return connected;
        },
        connect,
        disconnect: vi.fn(),
      }),
    ],
  });
  INTERNAL_BLOCKSUITE_HASH_MAP.set('1', workspace);

  {
    const workspaceHook = renderHook(() => useStaticBlockSuiteWorkspace('1'));
    // wait for suspense to resolve
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(workspaceHook.result.current).toBe(workspace);
    expect(sync).toBeCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
  }

  {
    const atom = getActiveBlockSuiteWorkspaceAtom('1');
    const store = getDefaultStore();
    const result = await store.get(atom);
    expect(result).toBe(workspace);
    expect(sync).toBeCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
  }

  {
    renderHook(() => usePassiveWorkspaceEffect(workspace));
    expect(sync).toBeCalledTimes(1);
    expect(connect).toBeCalledTimes(1);
    expect(connected).toBe(true);
  }
});
