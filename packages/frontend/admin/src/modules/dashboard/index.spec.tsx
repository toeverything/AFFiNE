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
  useMutation: () => ({
    trigger: vi.fn(),
  }),
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
    copilotWindow: {
      from: '2026-02-10T00:00:00.000Z',
      to: '2026-02-16T00:00:00.000Z',
      timezone: 'UTC',
      bucket: 'Day',
      requestedSize: 7,
      effectiveSize: 7,
    },
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

const mailDeliveryData = {
  adminMailDeliveries: {
    window: {
      from: '2026-02-15T20:00:00.000Z',
      to: '2026-02-16T20:00:00.000Z',
      timezone: 'UTC',
      bucket: 'Hour',
      requestedSize: 24,
      effectiveSize: 24,
    },
    summary: {
      total: 4,
      sent: 2,
      failed: 1,
      skipped: 0,
      canceled: 0,
      queued: 1,
      sending: 0,
      retryWait: 0,
      successRate: 2 / 3,
    },
    byStatus: [
      {
        key: 'sent',
        label: 'Sent',
        total: 2,
        points: [{ bucket: '2026-02-16T19:00:00.000Z', count: 2 }],
      },
      {
        key: 'failed',
        label: 'Failed',
        total: 1,
        points: [{ bucket: '2026-02-16T19:00:00.000Z', count: 1 }],
      },
      {
        key: 'queued',
        label: 'Queued',
        total: 1,
        points: [{ bucket: '2026-02-16T19:00:00.000Z', count: 1 }],
      },
    ],
    byType: [
      {
        key: 'auth',
        label: 'auth',
        total: 2,
        points: [{ bucket: '2026-02-16T19:00:00.000Z', count: 2 }],
      },
    ],
    byOutcome: [
      {
        key: 'successful',
        label: 'Successful',
        total: 2,
        points: [{ bucket: '2026-02-16T19:00:00.000Z', count: 2 }],
      },
      {
        key: 'unsuccessful',
        label: 'Unsuccessful',
        total: 1,
        points: [{ bucket: '2026-02-16T19:00:00.000Z', count: 1 }],
      },
      {
        key: 'pending',
        label: 'Pending',
        total: 1,
        points: [{ bucket: '2026-02-16T19:00:00.000Z', count: 1 }],
      },
    ],
  },
};

const topSharedLinksData = {
  adminDashboard: {
    topSharedLinks: [
      {
        workspaceId: 'workspace-1',
        docId: 'doc-1',
        title: 'Public doc',
        shareUrl: 'https://app.affine.pro/workspace/workspace-1/doc-1',
        publishedAt: '2026-02-16T10:00:00.000Z',
        views: 12,
        uniqueViews: 8,
        guestViews: 6,
        lastAccessedAt: '2026-02-16T19:00:00.000Z',
      },
    ],
    topSharedLinksWindow: {
      from: '2026-01-20T00:00:00.000Z',
      to: '2026-02-16T00:00:00.000Z',
      timezone: 'UTC',
      bucket: 'Day',
      requestedSize: 28,
      effectiveSize: 28,
    },
  },
};

describe('DashboardPage', () => {
  beforeEach(() => {
    (globalThis as any).environment = {
      isSelfHosted: true,
    };
    useQueryMock.mockReset();
    useQueryMock.mockImplementation(
      ({ query }: { query: { id: string; query: string } }) => ({
        data:
          query.id === 'adminMailDeliveriesQuery'
            ? mailDeliveryData
            : query.query.includes('topSharedLinks')
              ? topSharedLinksData
              : dashboardData,
        isValidating: false,
      })
    );
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

  test('renders mail delivery analytics controls and summary', () => {
    const { getAllByText, getByText, queryByText } = render(<DashboardPage />);

    expect(getByText('Email Delivery Trend')).toBeTruthy();
    expect(queryByText('Window Controls')).toBeNull();
    expect(getByText('Status')).toBeTruthy();
    expect(getAllByText('24h').length).toBeGreaterThan(0);
    expect(getByText('Success rate')).toBeTruthy();
    expect(getByText('66.7%')).toBeTruthy();
  });

  test('sends independent dashboard windows to the overview query', () => {
    render(<DashboardPage />);

    const overviewCall = useQueryMock.mock.calls.find(([arg]) => {
      const query = (arg as { query: { query: string } }).query.query;
      return query.includes('syncActiveUsersTimeline');
    });

    expect(overviewCall).toBeTruthy();
    expect(overviewCall![0]).toMatchObject({
      variables: {
        input: {
          storageHistoryDays: 30,
          syncHistoryHours: 48,
          copilotWindowDays: 7,
          sharedLinkWindowDays: 28,
          timezone: 'UTC',
        },
      },
    });
  });

  test('renders top shared links range control in cloud mode', () => {
    (globalThis as any).environment = {
      isSelfHosted: false,
    };

    const { getByLabelText, getByText } = render(<DashboardPage />);

    expect(getByText('Top Shared Links')).toBeTruthy();
    expect(getByLabelText('Top shared links range')).toBeTruthy();
    expect(getByText('28d')).toBeTruthy();
  });
});
