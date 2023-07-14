/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { type PassiveDocProvider, Workspace } from '@blocksuite/store';
import { renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { applyUpdate } from 'yjs';

import {
  captureSnapshot,
  createProviderManager,
  getSnapshotList,
  useProviderIsOutdated,
} from '../provider-manager';

describe('provider manager', () => {
  test('basic', async () => {
    const workspace = new Workspace({
      id: 'test-listen',
    });
    const manager = createProviderManager(workspace.doc);
    const testOrigin = 'test-origin';
    const provider: PassiveDocProvider = {
      flavour: 'test',
      passive: true,
      get connected() {
        return true;
      },
      disconnect() {},
      connect() {
        workspace.doc.transact(() => {
          workspace.doc.getMap('meta').set('name', 'Hello, world');
        }, testOrigin as any);
        setTimeout(() => {
          workspace.doc.transact(() => {
            workspace.doc.getMap('meta').set('name', 'Hello, world 2');
          }, testOrigin as any);
        }, 1000);
      },
    };
    manager.listen(provider, testOrigin);
    provider.connect();
    const date1 = manager.lastUpdate(provider);
    let date3: Date | null = null;
    const off = manager.on(provider, 'lastUpdate', () => {
      expect(workspace.meta.name).toBe('Hello, world 2');
      captureSnapshot(workspace.doc, testOrigin);
      date3 = manager.lastUpdate(provider);
    });
    const outdatedHook = renderHook(() =>
      useProviderIsOutdated(manager, provider, 1000)
    );
    expect(outdatedHook.result.current).toBe(false);
    setTimeout(() => {
      outdatedHook.rerender();
      expect(outdatedHook.result.current).toBe(false);
    }, 900);
    setTimeout(() => {
      outdatedHook.rerender();
      expect(outdatedHook.result.current).toBe(true);
    }, 1100);
    await new Promise<void>(resolve => {
      setTimeout(() => {
        resolve();
      }, 2000);
    });
    const date2 = manager.lastUpdate(provider);
    expect(workspace.meta.name).toBe('Hello, world 2');
    expect(date1).not.toBe(date2);
    expect(date1).not.toBe(date3);
    expect(date2).toBe(date3);
    expect(date2!.getTime() - date1!.getTime()).toBeGreaterThan(950);
    expect(date2!.getTime() - date1!.getTime()).toBeLessThan(1050);
    outdatedHook.rerender();
    expect(outdatedHook.result.current).toBe(true);
    off();
    setTimeout(() => {
      workspace.doc.transact(() => {
        workspace.doc.getMap('meta').set('name', 'Hello, world 3');
      }, testOrigin as any);
    }, 1000);
    await new Promise<void>(resolve => {
      setTimeout(() => {
        resolve();
      }, 1000);
    });
    const list = getSnapshotList(workspace.doc);
    expect(list.length).toBe(1);
    const update = list[0].value;
    const snapshotWorkspace = new Workspace({
      id: 'test-snapshot',
    });
    applyUpdate(snapshotWorkspace.doc, update);
    expect(snapshotWorkspace.meta.name).toBe('Hello, world 2');
  });
});
