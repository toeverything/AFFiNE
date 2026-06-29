/**
 * @vitest-environment happy-dom
 */
import { describe, expect, test } from 'vitest';

import { resolveDesktopChatLane } from './desktop-route-policy';

const readyLocalStatus = {
  state: 'ready',
  canRun: true,
  fallbackToServer: false,
  endpoint: 'http://127.0.0.1:43111',
  port: 43111,
  pid: 321,
  modelId: 'gemma-3-4b-it-local',
  modelSource: 'downloaded',
} as const;

describe('resolveDesktopChatLane', () => {
  test('routes ready Gemma chat locally when retry is disabled', async () => {
    await expect(
      resolveDesktopChatLane({
        requestAction: 'chat',
        modelId: 'gemma-3-4b-it',
        localStatus: readyLocalStatus,
      })
    ).resolves.toEqual({
      lane: 'local',
      reason: 'desktop_gemma_ready',
    });
  });

  test('routes ready Gemma mindmap actions locally', async () => {
    await expect(
      resolveDesktopChatLane({
        requestAction: 'brainstormMindmap',
        modelId: 'gemma-3-4b-it',
        localStatus: readyLocalStatus,
      })
    ).resolves.toEqual({
      lane: 'local',
      reason: 'desktop_gemma_ready',
    });
  });

  test('routes image actions back to the server', async () => {
    await expect(
      resolveDesktopChatLane({
        requestAction: 'createImage',
        modelId: 'gemma-3-4b-it',
        localStatus: readyLocalStatus,
      })
    ).resolves.toEqual({
      lane: 'server',
      reason: 'non_local_action',
    });
  });

  test('routes retry Gemma chat back to the server', async () => {
    await expect(
      resolveDesktopChatLane({
        requestAction: 'chat',
        modelId: 'gemma-3-4b-it',
        retry: true,
        localStatus: readyLocalStatus,
      })
    ).resolves.toEqual({
      lane: 'server',
      reason: 'retry_not_supported_locally',
    });
  });

  test('routes non-gemma chat back to the server', async () => {
    await expect(
      resolveDesktopChatLane({
        requestAction: 'chat',
        modelId: 'gpt-4.1',
        localStatus: readyLocalStatus,
      })
    ).resolves.toEqual({
      lane: 'server',
      reason: 'non_gemma_model',
    });
  });
});
