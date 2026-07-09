/* eslint-disable rxjs/finnish */
/**
 * @vitest-environment happy-dom
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { featureFlagLiveData, serverFeaturesLiveData, state } = vi.hoisted(
  () => ({
    featureFlagLiveData: Symbol('enable-ai-flag'),
    serverFeaturesLiveData: Symbol('server-features'),
    state: {
      aiFeature: true,
      serverFeatures: undefined as undefined | { copilot?: boolean },
    },
  })
);

vi.mock('@affine/core/modules/cloud', () => ({
  ServerService: class ServerService {},
}));

vi.mock('@affine/core/modules/feature-flag', () => ({
  FeatureFlagService: class FeatureFlagService {},
}));

vi.mock('@toeverything/infra', () => ({
  useService: (service: { name: string }) => {
    if (service.name === 'FeatureFlagService') {
      return {
        flags: {
          enable_ai: {
            $: featureFlagLiveData,
          },
        },
      };
    }

    return {
      server: {
        features$: serverFeaturesLiveData,
      },
    };
  },
  useLiveData: (liveData: unknown) => {
    if (liveData === featureFlagLiveData) {
      return state.aiFeature;
    }

    if (liveData === serverFeaturesLiveData) {
      return state.serverFeatures;
    }

    return undefined;
  },
}));

import { useEnableAI } from '../use-enable-ai';

describe('useEnableAI', () => {
  beforeEach(() => {
    state.aiFeature = true;
    state.serverFeatures = undefined;
  });

  test('returns false before server features load', () => {
    const render = () => renderHook(() => useEnableAI());

    expect(render).not.toThrow();
    expect(render().result.current).toBe(false);
  });

  test('returns true when AI flag and copilot feature are enabled', () => {
    state.serverFeatures = { copilot: true };

    const { result } = renderHook(() => useEnableAI());

    expect(result.current).toBe(true);
  });

  test('returns false when copilot is unavailable', () => {
    state.serverFeatures = { copilot: false };

    const { result } = renderHook(() => useEnableAI());

    expect(result.current).toBe(false);
  });
});
