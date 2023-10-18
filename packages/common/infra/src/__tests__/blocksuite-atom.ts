/**
 * @vitest-environment happy-dom
 */
import { Schema, Workspace } from '@blocksuite/store';
import { waitFor } from '@testing-library/react';
import { getDefaultStore } from 'jotai/vanilla';
import { expect, test, vi } from 'vitest';

import {
  getBlockSuiteWorkspaceAtom,
  INTERNAL_BLOCKSUITE_HASH_MAP,
} from '../__internal__/workspace.js';

test('blocksuite atom', async () => {
  const sync = vi.fn();
  let connected = false;
  const connect = vi.fn(() => (connected = true));
  const workspace = new Workspace({
    schema: new Schema(),
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
    const [atom, effectAtom] = getBlockSuiteWorkspaceAtom('1');
    const store = getDefaultStore();
    const result = await store.get(atom);
    expect(result).toBe(workspace);
    expect(sync).toBeCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();

    store.sub(effectAtom, vi.fn());
    await waitFor(() => expect(connect).toBeCalledTimes(1));
    expect(connected).toBe(true);
  }
});
