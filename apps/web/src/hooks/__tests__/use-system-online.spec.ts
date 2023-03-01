/**
 * @vitest-environment happy-dom
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { useSystemOnline } from '../use-system-online';

describe('useSystemOnline', () => {
  test('should be online', () => {
    const systemOnlineHook = renderHook(() => useSystemOnline());
    expect(systemOnlineHook.result.current).toBe(true);
  });

  test('should be offline', () => {
    const systemOnlineHook = renderHook(() => useSystemOnline());
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(systemOnlineHook.result.current).toBe(true);
    window.dispatchEvent(new Event('offline'));
    systemOnlineHook.rerender();
    expect(systemOnlineHook.result.current).toBe(false);
  });
});
