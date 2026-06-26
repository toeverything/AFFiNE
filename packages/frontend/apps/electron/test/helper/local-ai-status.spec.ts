import { describe, expect, test } from 'vitest';

import {
  errorStatus,
  readyStatus,
  startingStatus,
  unsupportedStatus,
} from '../../src/helper/local-ai/types';

describe('local AI status helpers', () => {
  test('build the expected status payloads', () => {
    expect(unsupportedStatus('not_apple_silicon')).toEqual({
      state: 'unsupported',
      canRun: false,
      fallbackToServer: true,
      reason: 'not_apple_silicon',
      modelId: 'gemma-3-4b-it-local',
    });

    expect(startingStatus()).toEqual({
      state: 'starting',
      canRun: false,
      fallbackToServer: true,
      modelId: 'gemma-3-4b-it-local',
    });

    expect(
      readyStatus({
        endpoint: 'http://127.0.0.1:43111',
        pid: 998,
        port: 43111,
      })
    ).toEqual({
      state: 'ready',
      canRun: true,
      fallbackToServer: false,
      modelId: 'gemma-3-4b-it-local',
      endpoint: 'http://127.0.0.1:43111',
      pid: 998,
      port: 43111,
    });

    expect(errorStatus('healthcheck_failed', 'timeout')).toEqual({
      state: 'error',
      canRun: false,
      fallbackToServer: true,
      reason: 'healthcheck_failed',
      detail: 'timeout',
      modelId: 'gemma-3-4b-it-local',
    });
  });
});
