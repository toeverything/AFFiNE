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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@affine/admin/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@affine/admin/components/ui/dropdown-menu';
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
import { useMutation } from '@affine/admin/use-mutation';
import { useQuery } from '@affine/admin/use-query';
import {
  adminDashboardQuery,
  adminMailDeliveriesQuery,
  previewLicenseMutation,
} from '@affine/graphql';
import { ROUTES } from '@affine/routes';
import {
  ChevronDownIcon,
  DatabaseIcon,
  FileSearchIcon,
  MailIcon,
  MessageSquareTextIcon,
  RefreshCwIcon,
  UsersIcon,
} from 'lucide-react';
import {
  type ChangeEvent,
  type ReactNode,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { Area, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';

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
    copilotWindow {
      from
      to
      timezone
      bucket
      requestedSize
      effectiveSize
    }
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
const COPILOT_DAY_OPTIONS = [1, 7, 14, 28, 60, 90] as const;
const MAIL_HOUR_OPTIONS = [24, 168] as const;
type MailChartMode = 'status' | 'type' | 'outcome';

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

type MultiTrendPoint = {
  x: number;
  label: string;
} & Record<string, number | string>;

type MultiTrendSeries = {
  key: string;
  label: string;
  color: string;
  total: number;
};

type LicensePreview = {
  id: string;
  workspaceId: string;
  plan: string;
  recurring: string;
  quantity: number;
  issuedAt: string;
  expiresAt: string;
  endAt: string;
  entity: string;
  issuer: string;
  valid: boolean;
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

function MultiTrendChart({
  ariaLabel,
  points,
  series,
  valueFormatter,
}: {
  ariaLabel: string;
  points: MultiTrendPoint[];
  series: MultiTrendSeries[];
  valueFormatter: (value: number) => string;
}) {
  const visibleSeries = series.filter(item => item.total > 0).slice(0, 4);

  if (points.length === 0 || visibleSeries.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/15 text-sm text-muted-foreground">
        No mail deliveries in this window
      </div>
    );
  }

  const chartPoints =
    points.length === 1
      ? [points[0], { ...points[0], x: Number(points[0].x) + 1 }]
      : points;
  const config: ChartConfig = Object.fromEntries(
    visibleSeries.map(item => [
      item.key,
      {
        label: item.label,
        color: item.color,
      },
    ])
  );

  return (
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
              valueFormatter={value => valueFormatter(value)}
            />
          }
        />
        {visibleSeries.map(item => (
          <Line
            key={item.key}
            dataKey={item.key}
            type="monotone"
            stroke={`var(--color-${item.key})`}
            strokeWidth={item.key === visibleSeries[0]?.key ? 3 : 2}
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
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
  action,
}: {
  title: string;
  value: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="h-full border-border/60 bg-card shadow-1">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <CardDescription className="flex min-w-0 items-center gap-2 pt-2 text-sm">
          <span className="shrink-0" aria-hidden="true">
            {icon}
          </span>
          <span className="min-w-0 truncate">{title}</span>
        </CardDescription>
        {action ? <div className="shrink-0">{action}</div> : null}
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

function rangeOptionLabel(option: number, unit: 'hours' | 'days') {
  if (unit === 'hours') {
    return option === 168 ? '7d' : `${option}h`;
  }
  return `${option}d`;
}

function PanelRangeSelect({
  ariaLabel,
  value,
  options,
  unit,
  onChange,
}: {
  ariaLabel: string;
  value: number;
  options: readonly number[];
  unit: 'hours' | 'days';
  onChange: (value: number) => void;
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={next => onChange(Number(next))}
    >
      <SelectTrigger className="w-full md:w-28" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(option => (
          <SelectItem key={option} value={String(option)}>
            {rangeOptionLabel(option, unit)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LicensePreviewDialog({
  license,
  onOpenChange,
}: {
  license: LicensePreview | null;
  onOpenChange: (open: boolean) => void;
}) {
  const rows = license
    ? [
        ['Status', license.valid ? 'Valid' : 'Invalid'],
        ['License ID', license.id],
        ['Workspace ID', license.workspaceId],
        ['Plan', license.plan],
        ['Recurring', license.recurring],
        ['Seats', intFormatter.format(license.quantity)],
        ['Issued At', formatDateTime(license.issuedAt)],
        ['File Expires At', formatDateTime(license.expiresAt)],
        ['License Ends At', formatDateTime(license.endAt)],
        ['Entity', license.entity],
        ['Issuer', license.issuer],
      ]
    : [];

  return (
    <Dialog open={!!license} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>License Preview</DialogTitle>
          <DialogDescription>
            Signature and payload format are valid.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border/60 overflow-hidden">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="grid grid-cols-[140px_1fr] gap-4 border-b border-border/60 px-4 py-3 last:border-b-0"
            >
              <div className="text-sm text-muted-foreground">{label}</div>
              <div className="min-w-0 break-words text-sm font-medium tabular-nums">
                {value}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="mt-2">
          <Button onClick={() => onOpenChange(false)}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DashboardActions({
  updatedAt,
  isValidating,
  onRefresh,
}: {
  updatedAt: string;
  isValidating: boolean;
  onRefresh: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerOpenRef = useRef(false);
  const [licensePreview, setLicensePreview] = useState<LicensePreview | null>(
    null
  );
  const { trigger: previewLicense } = useMutation({
    mutation: previewLicenseMutation,
  });

  const notifyNoFileSelected = useCallback(() => {
    toast.error('No license file selected.');
  }, []);

  const openLicensePicker = useCallback(() => {
    const input = inputRef.current;
    if (!input) {
      toast.error('Failed to open license file picker.');
      return;
    }

    input.value = '';
    pickerOpenRef.current = true;

    const handleFocus = () => {
      window.setTimeout(() => {
        if (pickerOpenRef.current) {
          pickerOpenRef.current = false;
          notifyNoFileSelected();
        }
      }, 200);
      window.removeEventListener('focus', handleFocus);
    };

    window.addEventListener('focus', handleFocus);
    input.click();
  }, [notifyNoFileSelected]);

  const handleLicenseFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      pickerOpenRef.current = false;

      if (!file) {
        notifyNoFileSelected();
        return;
      }

      previewLicense({ license: file })
        .then(data => {
          setLicensePreview(data.previewLicense);
        })
        .catch(error => {
          console.error(error);
          toast.error('Failed to preview license.');
        });
    },
    [notifyNoFileSelected, previewLicense]
  );

  const menuItems = useMemo(
    () =>
      environment.isSelfHosted
        ? []
        : [
            {
              key: 'preview-license',
              label: 'Preview license',
              onSelect: openLicensePicker,
            },
          ],
    [openLicensePicker]
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground tabular-nums">
          Updated at {formatDateTime(updatedAt)}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isValidating}
          >
            <RefreshCwIcon
              className={`h-3.5 w-3.5 mr-1.5 ${isValidating ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </Button>
          {menuItems.length ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="Dashboard menu">
                  <ChevronDownIcon className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {menuItems.map(item => (
                  <DropdownMenuItem key={item.key} onSelect={item.onSelect}>
                    <FileSearchIcon className="mr-2 h-3.5 w-3.5" aria-hidden />
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".lic,.license"
        className="hidden"
        onChange={handleLicenseFileChange}
      />
      <LicensePreviewDialog
        license={licensePreview}
        onOpenChange={open => {
          if (!open) {
            setLicensePreview(null);
          }
        }}
      />
    </>
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
  onWindowChange,
}: {
  sharedLinkWindowDays: number;
  onWindowChange: (value: number) => void;
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
      <CardHeader className="flex flex-col gap-3 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Top Shared Links</CardTitle>
          <CardDescription>
            Top {topSharedLinks.length} links in the last{' '}
            {topSharedLinksWindow.effectiveSize} days
          </CardDescription>
        </div>
        <PanelRangeSelect
          ariaLabel="Top shared links range"
          value={sharedLinkWindowDays}
          options={SHARED_DAY_OPTIONS}
          unit="days"
          onChange={onWindowChange}
        />
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

function mailWindowLabel(hours: number) {
  return hours === 24 ? '24h' : '7d';
}

function mailBucketLabel(value: string, hours: number) {
  return hours === 24 ? formatDateTime(value) : formatDate(value);
}

function toMailChartPoints(
  series: {
    key: string;
    points: { bucket: string; count: number }[];
  }[],
  hours: number
) {
  const first = series[0]?.points ?? [];
  return first.map((point, index) => {
    const row: MultiTrendPoint = {
      x: index,
      label: mailBucketLabel(point.bucket, hours),
    };
    for (const item of series) {
      row[item.key] = item.points[index]?.count ?? 0;
    }
    return row;
  });
}

function seriesColor(key: string, index: number) {
  const colors: Record<string, string> = {
    sent: 'var(--primary)',
    failed: 'var(--destructive)',
    retry_wait: 'var(--muted-foreground)',
    queued: 'var(--foreground)',
    pending_status: 'var(--muted-foreground)',
    successful: 'var(--primary)',
    unsuccessful: 'var(--destructive)',
    pending: 'var(--muted-foreground)',
    auth: 'var(--primary)',
    notification: 'var(--muted-foreground)',
    workspace_invitation: 'var(--foreground)',
  };
  return (
    colors[key] ??
    ['var(--primary)', 'var(--muted-foreground)', 'var(--foreground)'][
      index % 3
    ]
  );
}

function combineMailSeries(
  key: string,
  label: string,
  series: { points: { bucket: string; count: number }[] }[]
) {
  const first = series[0];
  return {
    key,
    label,
    total: series.reduce(
      (total, item) =>
        total + item.points.reduce((sum, point) => sum + point.count, 0),
      0
    ),
    points:
      first?.points.map((point, index) => ({
        bucket: point.bucket,
        count: series.reduce(
          (total, item) => total + (item.points[index]?.count ?? 0),
          0
        ),
      })) ?? [],
  };
}

function MailDeliverySection({
  hours,
  onHoursChange,
}: {
  hours: number;
  onHoursChange: (value: number) => void;
}) {
  const [mode, setMode] = useState<MailChartMode>('status');
  const { data } = useQuery(
    {
      query: adminMailDeliveriesQuery,
      variables: {
        input: { hours },
      },
    },
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateIfStale: true,
      revalidateOnReconnect: true,
    }
  );

  const analytics = data.adminMailDeliveries;
  const sourceSeries =
    mode === 'type'
      ? analytics.byType
      : mode === 'outcome'
        ? analytics.byOutcome
        : [
            analytics.byStatus.find(series => series.key === 'sent'),
            analytics.byStatus.find(series => series.key === 'failed'),
            combineMailSeries(
              'pending_status',
              'Pending',
              analytics.byStatus.filter(series =>
                ['queued', 'sending'].includes(series.key)
              )
            ),
            analytics.byStatus.find(series => series.key === 'retry_wait'),
          ].filter(series => series !== undefined);
  const chartSeries = sourceSeries.map((series, index) => ({
    key: series.key,
    label: series.label,
    total: series.total,
    color: seriesColor(series.key, index),
  }));
  const chartPoints = toMailChartPoints(sourceSeries, hours);
  const failedLike =
    analytics.summary.failed +
    analytics.summary.skipped +
    analytics.summary.canceled;
  const pending =
    analytics.summary.queued +
    analytics.summary.sending +
    analytics.summary.retryWait;

  return (
    <Card className="border-border/60 bg-card shadow-1">
      <CardHeader className="flex flex-col gap-3 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <MailIcon className="h-4 w-4" aria-hidden="true" />
            Email Delivery Trend
          </CardTitle>
          <CardDescription>
            {mailWindowLabel(hours)} at{' '}
            {analytics.window.bucket === 'Hour' ? 'hour' : 'day'} bucket in UTC
          </CardDescription>
        </div>
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
          <PanelRangeSelect
            ariaLabel="Email delivery range"
            value={hours}
            options={MAIL_HOUR_OPTIONS}
            unit="hours"
            onChange={onHoursChange}
          />
          <Select
            value={mode}
            onValueChange={value => setMode(value as MailChartMode)}
          >
            <SelectTrigger className="w-full md:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="type">Mail type</SelectItem>
              <SelectItem value="outcome">Success / failure</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-md border border-border/60 bg-muted/15 px-3 py-2">
            <div className="text-xs text-muted-foreground">Sent</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {compactFormatter.format(analytics.summary.sent)}
            </div>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/15 px-3 py-2">
            <div className="text-xs text-muted-foreground">Not delivered</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {compactFormatter.format(failedLike)}
            </div>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/15 px-3 py-2">
            <div className="text-xs text-muted-foreground">Pending</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {compactFormatter.format(pending)}
            </div>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/15 px-3 py-2">
            <div className="text-xs text-muted-foreground">Success rate</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {(analytics.summary.successRate * 100).toFixed(1)}%
            </div>
          </div>
        </div>

        <MultiTrendChart
          ariaLabel="Email delivery trend"
          points={chartPoints}
          series={chartSeries}
          valueFormatter={value => intFormatter.format(value)}
        />

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          {chartSeries
            .filter(series => series.total > 0)
            .slice(0, 4)
            .map(series => (
              <div key={series.key} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: series.color }}
                  aria-hidden="true"
                />
                {series.label}: {compactFormatter.format(series.total)}
              </div>
            ))}
        </div>

        <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
          <span>{mailBucketLabel(analytics.window.from, hours)}</span>
          <span>{mailBucketLabel(analytics.window.to, hours)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function MailDeliveryCardSkeleton() {
  return (
    <Card className="border-border/60 bg-card shadow-1">
      <CardHeader>
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <Skeleton className="h-44 w-full" />
      </CardContent>
    </Card>
  );
}

function DashboardPageContent() {
  const [storageHistoryDays, setStorageHistoryDays] = useState<number>(30);
  const [syncHistoryHours, setSyncHistoryHours] = useState<number>(48);
  const [copilotWindowDays, setCopilotWindowDays] = useState<number>(7);
  const [sharedLinkWindowDays, setSharedLinkWindowDays] = useState<number>(28);
  const [mailDeliveryHours, setMailDeliveryHours] = useState<number>(24);
  const shouldShowTopSharedLinks = !environment.isSelfHosted;
  const revalidateQueryResource = useMutateQueryResource();

  const variables = useMemo(
    () => ({
      input: {
        storageHistoryDays,
        syncHistoryHours,
        copilotWindowDays,
        sharedLinkWindowDays,
        timezone: 'UTC',
      },
    }),
    [
      copilotWindowDays,
      sharedLinkWindowDays,
      storageHistoryDays,
      syncHistoryHours,
    ]
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
          <DashboardActions
            updatedAt={dashboard.generatedAt}
            isValidating={isValidating}
            onRefresh={() => {
              revalidateQueryResource(adminDashboardQuery).catch(() => {});
              revalidateQueryResource(adminMailDeliveriesQuery).catch(() => {});
            }}
          />
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
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
              description={`${dashboard.copilotWindow.effectiveSize}d aggregation`}
              icon={
                <MessageSquareTextIcon className="h-4 w-4" aria-hidden="true" />
              }
              action={
                <PanelRangeSelect
                  ariaLabel="Copilot conversations range"
                  value={copilotWindowDays}
                  options={COPILOT_DAY_OPTIONS}
                  unit="days"
                  onChange={setCopilotWindowDays}
                />
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
            <CardHeader className="flex flex-col gap-3 pb-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1.5">
                <CardTitle className="text-base">
                  Sync Active Users Trend
                </CardTitle>
                <CardDescription>
                  {dashboard.syncWindow.effectiveSize}h at minute bucket
                </CardDescription>
              </div>
              <PanelRangeSelect
                ariaLabel="Sync active users range"
                value={syncHistoryHours}
                options={SYNC_HOUR_OPTIONS}
                unit="hours"
                onChange={setSyncHistoryHours}
              />
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
            <CardHeader className="flex flex-col gap-3 pb-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1.5">
                <CardTitle className="text-base">
                  Storage Trend (Workspace + Blob)
                </CardTitle>
                <CardDescription>
                  {dashboard.storageWindow.effectiveSize}d at day bucket
                </CardDescription>
              </div>
              <PanelRangeSelect
                ariaLabel="Storage trend range"
                value={storageHistoryDays}
                options={STORAGE_DAY_OPTIONS}
                unit="days"
                onChange={setStorageHistoryDays}
              />
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

        <Suspense fallback={<MailDeliveryCardSkeleton />}>
          <MailDeliverySection
            hours={mailDeliveryHours}
            onHoursChange={setMailDeliveryHours}
          />
        </Suspense>

        {shouldShowTopSharedLinks ? (
          <Suspense fallback={<TopSharedLinksCardSkeleton />}>
            <TopSharedLinksSection
              sharedLinkWindowDays={sharedLinkWindowDays}
              onWindowChange={setSharedLinkWindowDays}
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
