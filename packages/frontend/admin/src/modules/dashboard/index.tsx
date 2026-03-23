import { Button } from '@affine/admin/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@affine/admin/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@affine/admin/components/ui/chart';
import { Label } from '@affine/admin/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@affine/admin/components/ui/select';
import { Separator } from '@affine/admin/components/ui/separator';
import { Skeleton } from '@affine/admin/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@affine/admin/components/ui/table';
import { useQuery } from '@affine/admin/use-query';
import { adminDashboardQuery } from '@affine/graphql';
import { ROUTES } from '@affine/routes';
import {
  DatabaseIcon,
  MessageSquareTextIcon,
  RefreshCwIcon,
  UsersIcon,
} from 'lucide-react';
import { type ReactNode, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import { useMutateQueryResource } from '../../use-mutation';
import { Header } from '../header';
import { formatBytes } from '../workspaces/utils';

const adminDashboardOverviewQuery: typeof adminDashboardQuery = {
  ...adminDashboardQuery,
  query: `query adminDashboard($input: AdminDashboardInput) {
  adminDashboard(input: $input) {
    syncActiveUsers
    syncActiveUsersTimeline {
      minute
      activeUsers
    }
    syncWindow {
      from
      to
      timezone
      bucket
      requestedSize
      effectiveSize
    }
    copilotConversations
    workspaceStorageBytes
    blobStorageBytes
    workspaceStorageHistory {
      date
      value
    }
    blobStorageHistory {
      date
      value
    }
    storageWindow {
      from
      to
      timezone
      bucket
      requestedSize
      effectiveSize
    }
    generatedAt
  }
}`,
};

const adminDashboardTopSharedLinksQuery: typeof adminDashboardQuery = {
  ...adminDashboardQuery,
  query: `query adminDashboard($input: AdminDashboardInput) {
  adminDashboard(input: $input) {
    topSharedLinks {
      workspaceId
      docId
      title
      shareUrl
      publishedAt
      views
      uniqueViews
      guestViews
      lastAccessedAt
    }
    topSharedLinksWindow {
      from
      to
      timezone
      bucket
      requestedSize
      effectiveSize
    }
  }
}`,
};

const intFormatter = new Intl.NumberFormat('en-US');
const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const utcDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const utcDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

const STORAGE_DAY_OPTIONS = [7, 14, 30, 60, 90] as const;
const SYNC_HOUR_OPTIONS = [1, 6, 12, 24, 48, 72] as const;
const SHARED_DAY_OPTIONS = [7, 14, 28, 60, 90] as const;

type DualNumberPoint = {
  label: string;
  primary: number;
  secondary: number;
};

type TrendPoint = {
  x: number;
  label: string;
  primary: number;
  secondary?: number;
};

function formatDateTime(value: string) {
  return utcDateTimeFormatter.format(new Date(value));
}

function formatDate(value: string) {
  return utcDateFormatter.format(new Date(value));
}

function downsample<T>(items: T[], maxPoints: number) {
  if (items.length <= maxPoints) {
    return items;
  }

  const step = Math.ceil(items.length / maxPoints);
  return items.filter(
    (_, index) => index % step === 0 || index === items.length - 1
  );
}

function toIndexedTrendPoints<T extends Omit<TrendPoint, 'x'>>(points: T[]) {
  return points.map((point, index) => ({
    ...point,
    x: index,
  }));
}

function TrendChart({
  ariaLabel,
  points,
  primaryLabel,
  primaryFormatter,
  secondaryLabel,
  secondaryFormatter,
}: {
  ariaLabel: string;
  points: TrendPoint[];
  primaryLabel: string;
  primaryFormatter: (value: number) => string;
  secondaryLabel?: string;
  secondaryFormatter?: (value: number) => string;
}) {
  if (points.length === 0) {
    return <div className="text-sm text-muted-foreground">No data</div>;
  }

  const chartPoints =
    points.length === 1
      ? [points[0], { ...points[0], x: points[0].x + 1 }]
      : points;

  const hasSecondary =
    Boolean(secondaryLabel) &&
    chartPoints.some(point => typeof point.secondary === 'number');
  const config: ChartConfig = {
    primary: {
      label: primaryLabel,
      color: 'var(--primary)',
    },
    ...(hasSecondary
      ? {
          secondary: {
            label: secondaryLabel,
            color: 'var(--muted-foreground)',
          },
        }
      : {}),
  };

  return (
    <div className="space-y-3">
      <ChartContainer
        config={config}
        className="h-44 w-full"
        aria-label={ariaLabel}
        role="img"
      >
        <LineChart
          data={chartPoints}
          margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="3 4"
          />
          <XAxis
            dataKey="x"
            type="number"
            hide
            allowDecimals={false}
            domain={['dataMin', 'dataMax']}
          />
          <YAxis
            hide
            domain={[
              0,
              (max: number) => {
                if (max <= 0) {
                  return 1;
                }
                return Math.ceil(max * 1.1);
              },
            ]}
          />
          <ChartTooltip
            cursor={{
              stroke: 'var(--border)',
              strokeDasharray: '4 4',
              strokeWidth: 1,
            }}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const item = payload?.[0];
                  return item?.payload?.label ?? '';
                }}
                valueFormatter={(value, key) => {
                  if (key === 'secondary') {
                    return secondaryFormatter
                      ? secondaryFormatter(value)
                      : intFormatter.format(value);
                  }
                  return primaryFormatter(value);
                }}
              />
            }
          />
          <Area
            dataKey="primary"
            type="monotone"
            fill="var(--color-primary)"
            fillOpacity={0.16}
            stroke="none"
            isAnimationActive={false}
          />
          <Line
            dataKey="primary"
            type="monotone"
            stroke="var(--color-primary)"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          {hasSecondary ? (
            <Line
              dataKey="secondary"
              type="monotone"
              stroke="var(--color-secondary)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              strokeDasharray="6 4"
              connectNulls
              isAnimationActive={false}
            />
          ) : null}
        </LineChart>
      </ChartContainer>

      <div className="flex justify-between text-xxs text-muted-foreground tabular-nums">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function PrimaryMetricCard({
  value,
  description,
}: {
  value: string;
  description: string;
}) {
  return (
    <Card className="h-full border-border/60 bg-card shadow-1">
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2 text-sm">
          <UsersIcon className="h-4 w-4" aria-hidden="true" />
          Current Sync Active Users
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <div className="text-4xl font-bold tracking-tight tabular-nums">
          {value}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function SecondaryMetricCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <Card className="h-full border-border/60 bg-card shadow-1">
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2 text-sm">
          <span aria-hidden="true">{icon}</span>
          {title}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">{description}</p>
      </CardContent>
    </Card>
  );
}

function WindowSelect({
  id,
  label,
  value,
  options,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  options: readonly number[];
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label
        htmlFor={id}
        className="text-xs uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </Label>
      <Select
        value={String(value)}
        onValueChange={next => onChange(Number(next))}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={`Select ${label.toLowerCase()}…`} />
        </SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem key={option} value={String(option)}>
              {option} {unit}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DashboardPageSkeleton() {
  return (
    <div className="h-dvh flex-1 flex-col flex overflow-hidden">
      <Header
        title="Dashboard"
        endFix={
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-44" />
            <Skeleton className="h-8 w-20" />
          </div>
        }
      />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <Card className="border-border/60 bg-card shadow-1">
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-80" />
          </CardHeader>
          <CardContent className="grid grid-cols-1 items-end gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <Skeleton className="h-28 w-full lg:col-span-5" />
          <Skeleton className="h-28 w-full lg:col-span-3" />
          <Skeleton className="h-28 w-full lg:col-span-4" />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Skeleton className="h-72 w-full lg:col-span-1" />
          <Skeleton className="h-72 w-full lg:col-span-2" />
        </div>

        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

function TopSharedLinksCardSkeleton() {
  return (
    <Card className="border-border/60 bg-card shadow-1">
      <CardHeader>
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
        <Separator />
        <div className="flex justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

function TopSharedLinksSection({
  sharedLinkWindowDays,
}: {
  sharedLinkWindowDays: number;
}) {
  const variables = useMemo(
    () => ({
      input: {
        sharedLinkWindowDays,
        timezone: 'UTC',
      },
    }),
    [sharedLinkWindowDays]
  );

  const { data } = useQuery(
    {
      query: adminDashboardTopSharedLinksQuery,
      variables,
    },
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateIfStale: true,
      revalidateOnReconnect: true,
    }
  );

  const topSharedLinks = data.adminDashboard.topSharedLinks;
  const topSharedLinksWindow = data.adminDashboard.topSharedLinksWindow;

  return (
    <Card className="border-border/60 bg-card shadow-1">
      <CardHeader>
        <CardTitle className="text-base">Top Shared Links</CardTitle>
        <CardDescription>
          Top {topSharedLinks.length} links in the last{' '}
          {topSharedLinksWindow.effectiveSize} days
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {topSharedLinks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 p-8 text-center bg-muted/15">
            <div className="text-sm font-medium">
              No shared links in this window
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Publish pages and collect traffic, then this table will rank links
              by views.
            </div>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link to={ROUTES.admin.workspaces}>Go to Workspaces</Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Unique</TableHead>
                <TableHead className="text-right">Guest</TableHead>
                <TableHead>Last Accessed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topSharedLinks.map(link => (
                <TableRow
                  key={`${link.workspaceId}-${link.docId}`}
                  className="hover:bg-muted/40"
                >
                  <TableCell className="max-w-80 min-w-0">
                    <a
                      href={link.shareUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline-offset-4 hover:underline truncate block"
                    >
                      {link.title || link.docId}
                    </a>
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {link.workspaceId}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {compactFormatter.format(link.views)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {compactFormatter.format(link.uniqueViews)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {compactFormatter.format(link.guestViews)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {link.lastAccessedAt
                      ? formatDateTime(link.lastAccessedAt)
                      : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Separator />
        <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
          <span>{formatDate(topSharedLinksWindow.from)}</span>
          <span>{formatDate(topSharedLinksWindow.to)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardPageContent() {
  const [storageHistoryDays, setStorageHistoryDays] = useState<number>(30);
  const [syncHistoryHours, setSyncHistoryHours] = useState<number>(48);
  const [sharedLinkWindowDays, setSharedLinkWindowDays] = useState<number>(28);
  const shouldShowTopSharedLinks = !environment.isSelfHosted;
  const revalidateQueryResource = useMutateQueryResource();

  const variables = useMemo(
    () => ({
      input: {
        storageHistoryDays,
        syncHistoryHours,
        sharedLinkWindowDays,
        timezone: 'UTC',
      },
    }),
    [sharedLinkWindowDays, storageHistoryDays, syncHistoryHours]
  );

  const { data, isValidating } = useQuery(
    {
      query: adminDashboardOverviewQuery,
      variables,
    },
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateIfStale: true,
      revalidateOnReconnect: true,
    }
  );

  const dashboard = data.adminDashboard;

  const syncPoints = useMemo(
    () =>
      toIndexedTrendPoints(
        downsample(
          dashboard.syncActiveUsersTimeline.map(point => ({
            label: formatDateTime(point.minute),
            primary: point.activeUsers,
          })),
          96
        )
      ),
    [dashboard.syncActiveUsersTimeline]
  );

  const storagePoints = useMemo(() => {
    const merged: DualNumberPoint[] = dashboard.workspaceStorageHistory.map(
      (point, index) => ({
        label: formatDate(point.date),
        primary: point.value,
        secondary: dashboard.blobStorageHistory[index]?.value ?? 0,
      })
    );
    return toIndexedTrendPoints(downsample(merged, 60));
  }, [dashboard.blobStorageHistory, dashboard.workspaceStorageHistory]);

  const totalStorageBytes =
    dashboard.workspaceStorageBytes + dashboard.blobStorageBytes;

  return (
    <div className="h-dvh flex-1 flex-col flex overflow-hidden">
      <Header
        title="Dashboard"
        endFix={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="text-xs text-muted-foreground tabular-nums">
              Updated at {formatDateTime(dashboard.generatedAt)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                revalidateQueryResource(adminDashboardQuery).catch(() => {});
              }}
              disabled={isValidating}
            >
              <RefreshCwIcon
                className={`h-3.5 w-3.5 mr-1.5 ${isValidating ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <Card className="border-border/60 bg-card shadow-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Window Controls</CardTitle>
            <CardDescription>
              Tune dashboard windows. Data is sampled in UTC and refreshes
              automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 items-end gap-3 md:grid-cols-2 lg:grid-cols-3">
            <WindowSelect
              id="storage-history-window"
              label="Storage History"
              value={storageHistoryDays}
              options={STORAGE_DAY_OPTIONS}
              unit="days"
              onChange={setStorageHistoryDays}
            />
            <WindowSelect
              id="sync-history-window"
              label="Sync History"
              value={syncHistoryHours}
              options={SYNC_HOUR_OPTIONS}
              unit="hours"
              onChange={setSyncHistoryHours}
            />
            <WindowSelect
              id="shared-link-window"
              label="Shared Link Window"
              value={sharedLinkWindowDays}
              options={SHARED_DAY_OPTIONS}
              unit="days"
              onChange={setSharedLinkWindowDays}
            />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="h-full min-w-0 lg:col-span-5">
            <PrimaryMetricCard
              value={intFormatter.format(dashboard.syncActiveUsers)}
              description={`${dashboard.syncWindow.effectiveSize}h active window`}
            />
          </div>
          <div className="h-full min-w-0 lg:col-span-3">
            <SecondaryMetricCard
              title="Copilot Conversations"
              value={intFormatter.format(dashboard.copilotConversations)}
              description={`${sharedLinkWindowDays}d aggregation`}
              icon={
                <MessageSquareTextIcon className="h-4 w-4" aria-hidden="true" />
              }
            />
          </div>
          <div className="h-full min-w-0 lg:col-span-4">
            <Card className="h-full border-border/60 bg-card shadow-1">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2 text-sm">
                  <DatabaseIcon className="h-4 w-4" aria-hidden="true" />
                  Managed Storage
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tracking-tight tabular-nums">
                  {formatBytes(totalStorageBytes)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Workspace {formatBytes(dashboard.workspaceStorageBytes)} •
                  Blob {formatBytes(dashboard.blobStorageBytes)}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card className="border-border/60 bg-card shadow-1 lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">
                Sync Active Users Trend
              </CardTitle>
              <CardDescription>
                {dashboard.syncWindow.effectiveSize}h at minute bucket
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <TrendChart
                ariaLabel="Sync active users trend"
                points={syncPoints}
                primaryLabel="Sync Active Users"
                primaryFormatter={value => intFormatter.format(value)}
              />
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card shadow-1 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">
                Storage Trend (Workspace + Blob)
              </CardTitle>
              <CardDescription>
                {dashboard.storageWindow.effectiveSize}d at day bucket
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <TrendChart
                ariaLabel="Workspace and blob storage trend"
                points={storagePoints}
                primaryLabel="Workspace Storage"
                primaryFormatter={value => formatBytes(value)}
                secondaryLabel="Blob Storage"
                secondaryFormatter={value => formatBytes(value)}
              />

              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  Workspace: {formatBytes(dashboard.workspaceStorageBytes)}
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-foreground/50" />
                  Blob: {formatBytes(dashboard.blobStorageBytes)}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {shouldShowTopSharedLinks ? (
          <Suspense fallback={<TopSharedLinksCardSkeleton />}>
            <TopSharedLinksSection
              sharedLinkWindowDays={sharedLinkWindowDays}
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}

export function DashboardPage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton />}>
      <DashboardPageContent />
    </Suspense>
  );
}

export { DashboardPage as Component };
