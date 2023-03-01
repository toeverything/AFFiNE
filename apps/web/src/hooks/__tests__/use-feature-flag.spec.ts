/**
 * @vitest-environment happy-dom
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';

import { defaultRecord, useFeatureFlag } from '../use-feature-flag';

beforeEach(() => {
  globalThis.featureFlag.record = defaultRecord;
  globalThis.featureFlag.callback.clear();
});

describe('useFeatureFlag', () => {
  test('basic', () => {
    const flagHook = renderHook(() =>
      useFeatureFlag('enableIndexedDBProvider')
    );
    expect(flagHook.result.current).toBe(defaultRecord.enableIndexedDBProvider);
    globalThis.featureFlag.record.enableIndexedDBProvider = false;
    globalThis.featureFlag.callback.forEach(cb => cb());
    flagHook.rerender();
    expect(flagHook.result.current).toBe(false);
  });
});
