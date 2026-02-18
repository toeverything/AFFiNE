/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

const { nextThemeProviderMock } = vi.hoisted(() => ({
  nextThemeProviderMock: vi.fn(({ children }: { children?: any }) => (
    <div data-testid="next-theme-provider">{children}</div>
  )),
}));

vi.mock('next-themes', () => ({
  ThemeProvider: nextThemeProviderMock,
}));

import { ThemeProvider } from './theme-provider';

describe('Admin ThemeProvider', () => {
  test('uses the same dark/light/system behavior as main frontend', () => {
    render(
      <ThemeProvider>
        <div>content</div>
      </ThemeProvider>
    );

    expect(screen.queryByText('content')).not.toBeNull();
    expect(nextThemeProviderMock).toHaveBeenCalledTimes(1);

    const props = nextThemeProviderMock.mock.calls[0]?.[0] as any;
    expect(props?.themes).toEqual(['dark', 'light']);
    expect(props?.enableSystem).toBe(true);
    expect(props?.defaultTheme).toBe('system');
  });
});
