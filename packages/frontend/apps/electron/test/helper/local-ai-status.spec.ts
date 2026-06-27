import { describe, expect, test } from 'vitest';

import {
  downloadErrorStatus,
  downloadingStatus,
  downloadReadyStatus,
  downloadUnavailableStatus,
  errorStatus,
  readyStatus,
  startingStatus,
  unsupportedStatus,
} from '../../src/helper/local-ai/types';

describe('local AI status helpers', () => {
  test('build the expected runtime status payloads', () => {
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
        modelSource: 'downloaded',
      })
    ).toEqual({
      state: 'ready',
      canRun: true,
      fallbackToServer: false,
      modelId: 'gemma-3-4b-it-local',
      endpoint: 'http://127.0.0.1:43111',
      pid: 998,
      port: 43111,
      modelSource: 'downloaded',
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

  test('build the expected download status payloads', () => {
    expect(
      downloadUnavailableStatus({
        reason: 'model_missing',
        downloadUrl: 'https://example.com/gemma.gguf',
        targetPath: '/tmp/gemma.gguf',
      })
    ).toEqual({
      state: 'unavailable',
      canDownload: true,
      reason: 'model_missing',
      modelId: 'gemma-3-4b-it-local',
      downloadUrl: 'https://example.com/gemma.gguf',
      targetPath: '/tmp/gemma.gguf',
      progress: 0,
      source: 'none',
      downloadedBytes: 0,
      totalBytes: null,
    });

    expect(
      downloadingStatus({
        downloadUrl: 'https://example.com/gemma.gguf',
        targetPath: '/tmp/gemma.gguf',
        progress: 42,
        downloadedBytes: 420,
        totalBytes: 1000,
      })
    ).toEqual({
      state: 'downloading',
      canDownload: false,
      modelId: 'gemma-3-4b-it-local',
      downloadUrl: 'https://example.com/gemma.gguf',
      targetPath: '/tmp/gemma.gguf',
      progress: 42,
      source: 'none',
      downloadedBytes: 420,
      totalBytes: 1000,
    });

    expect(
      downloadReadyStatus({
        downloadUrl: 'https://example.com/gemma.gguf',
        targetPath: '/tmp/gemma.gguf',
        source: 'downloaded',
        downloadedBytes: 1000,
        totalBytes: 1000,
      })
    ).toEqual({
      state: 'ready',
      canDownload: false,
      modelId: 'gemma-3-4b-it-local',
      downloadUrl: 'https://example.com/gemma.gguf',
      targetPath: '/tmp/gemma.gguf',
      progress: 100,
      source: 'downloaded',
      downloadedBytes: 1000,
      totalBytes: 1000,
    });

    expect(
      downloadErrorStatus({
        downloadUrl: 'https://example.com/gemma.gguf',
        targetPath: '/tmp/gemma.gguf',
        detail: 'network error',
        progress: 12,
        downloadedBytes: 120,
        totalBytes: 1000,
      })
    ).toEqual({
      state: 'error',
      canDownload: true,
      modelId: 'gemma-3-4b-it-local',
      downloadUrl: 'https://example.com/gemma.gguf',
      targetPath: '/tmp/gemma.gguf',
      progress: 12,
      source: 'none',
      downloadedBytes: 120,
      totalBytes: 1000,
      detail: 'network error',
    });
  });
});
