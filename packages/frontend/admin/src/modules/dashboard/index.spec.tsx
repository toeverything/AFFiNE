/**
 * @vitest-environment happy-dom
 */
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const useQueryMock = vi.fn();
const mutateQueryResourceMock = vi.fn();

vi.mock('@affine/admin/use-query', () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock('../../use-mutation', () => ({
  useMutateQueryResource: () => () => {
    mutateQueryResourceMock();
    return Promise.resolve();
  },
}));

vi.mock('../header', () => ({
  Header: ({ title, endFix }: { title: string; endFix?: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {endFix}
    </div>
  ),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  Tooltip: ({ content }: { content?: ReactNode }) => (
    <div data-testid="chart-tooltip">{content}</div>
  ),
  Area: ({ children }: { children?: ReactNode }) => (
    <div data-testid="area">{children}</div>
  ),
  CartesianGrid: ({ children }: { children?: ReactNode }) => (
    <div data-testid="grid">{children}</div>
  ),
  Line: ({ children }: { children?: ReactNode }) => (
    <div data-testid="line">{children}</div>
  ),
  LineChart: ({ children }: { children?: ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
}));

import { DashboardPage } from './index';

const dashboardData = {
  adminDashboard: {
    syncActiveUsers: 0,
    syncActiveUsersTimeline: [
      { minute: '2026-02-16T10:30:00.000Z', activeUsers: 0 },
    ],
    syncWindow: {
      from: '2026-02-14T20:30:00.000Z',
      to: '2026-02-16T19:30:00.000Z',
      timezone: 'UTC',
      bucket: 'minute',
      requestedSize: 48,
      effectiveSize: 48,
    },
    copilotConversations: 0,
    workspaceStorageBytes: 375,
    blobStorageBytes: 0,
    workspaceStorageHistory: [{ date: '2026-02-16', value: 375 }],
    blobStorageHistory: [{ date: '2026-02-16', value: 0 }],
    storageWindow: {
      from: '2026-01-18T00:00:00.000Z',
      to: '2026-02-16T00:00:00.000Z',
      timezone: 'UTC',
      bucket: 'day',
      requestedSize: 30,
      effectiveSize: 30,
    },
    generatedAt: '2026-02-16T19:30:00.000Z',
  },
};

describe('DashboardPage', () => {
  beforeEach(() => {
    (globalThis as any).environment = {
      isSelfHosted: true,
    };
    useQueryMock.mockReset();
    useQueryMock.mockReturnValue({
      data: dashboardData,
      isValidating: false,
    });
    mutateQueryResourceMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  test('uses responsive tailwind breakpoints instead of hardcoded min-[1024px]', () => {
    const { container } = render(<DashboardPage />);
    const classes = Array.from(container.querySelectorAll('[class]'))
      .map(node => node.getAttribute('class') ?? '')
      .join(' ');

    expect(classes).toContain('lg:grid-cols-12');
    expect(classes).toContain('lg:grid-cols-3');
    expect(classes).not.toContain('min-[1024px]');
  });

  test('uses affine token color variables for trend chart lines', () => {
    render(<DashboardPage />);
    const styles = Array.from(document.querySelectorAll('style'))
      .map(node => node.textContent ?? '')
      .join('\n');

    expect(styles).toContain('--color-primary: var(--primary);');
    expect(styles).toContain('--color-secondary: var(--muted-foreground);');
    expect(styles).not.toContain('hsl(var(--primary))');
  });
});
