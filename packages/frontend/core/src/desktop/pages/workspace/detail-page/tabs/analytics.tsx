import {
  Avatar,
  Button,
  Loading,
  Menu,
  MenuItem,
  toast,
} from '@affine/component';
import { useQuery } from '@affine/core/components/hooks/use-query';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import {
  getDocLastAccessedMembersQuery,
  getDocPageAnalyticsQuery,
} from '@affine/graphql';
import { i18nTime, useI18n } from '@affine/i18n';
import {
  ArrowDownSmallIcon,
  CalendarPanelIcon,
  LockIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts';

import * as styles from './analytics.css';
import {
  type AnalyticsChartPoint,
  buildAnalyticsChartPoints,
  clampAnalyticsWindowDays,
  DEFAULT_ANALYTICS_WINDOW_DAYS,
  ensureMinimumChartPoints,
  getAvailableAnalyticsWindowOptions,
  INITIAL_MEMBERS_PAGE_SIZE,
  isLockedAnalyticsWindowOption,
  MAX_MEMBERS_PAGE_SIZE,
} from './analytics.utils';

const intFormatter = new Intl.NumberFormat('en-US');
const totalViewsColor = cssVar('primaryColor');
const uniqueViewsColor = cssVar('processingColor');

function formatChartDate(value: string) {
  return i18nTime(value, { absolute: { accuracy: 'day' } });
}

function AnalyticsChartTooltip({
  active,
  payload,
}: TooltipProps<number, string>) {
  const t = useI18n();
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload as AnalyticsChartPoint | undefined;
  if (!point) {
    return null;
  }

  const valueByKey = payload.reduce<Record<string, number>>((acc, item) => {
    if (!item.dataKey) {
      return acc;
    }
    acc[String(item.dataKey)] =
      typeof item.value === 'number' ? item.value : Number(item.value ?? 0);
    return acc;
  }, {});

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipTitle}>{formatChartDate(point.date)}</div>
      <div className={styles.tooltipRow}>
        <span
          className={styles.legendDot}
          style={{ backgroundColor: totalViewsColor }}
          aria-hidden="true"
        />
        {t['com.affine.doc.analytics.chart.total-views']()}
        <span className={styles.tooltipValue}>
          {intFormatter.format(valueByKey.totalViews ?? point.totalViews)}
        </span>
      </div>
      <div className={styles.tooltipRow}>
        <span
          className={styles.legendDot}
          style={{ backgroundColor: uniqueViewsColor }}
          aria-hidden="true"
        />
        {t['com.affine.doc.analytics.chart.unique-views']()}
        <span className={styles.tooltipValue}>
          {intFormatter.format(valueByKey.uniqueViews ?? point.uniqueViews)}
        </span>
      </div>
    </div>
  );
}

export const EditorAnalyticsPanel = ({
  workspaceId,
  docId,
}: {
  workspaceId: string;
  docId: string;
}) => {
  const t = useI18n();
  const permission = useService(WorkspacePermissionService).permission;
  const workspaceDialogService = useService(WorkspaceDialogService);
  const isTeam = useLiveData(permission.isTeam$);
  const isTeamWorkspace = isTeam ?? false;
  const [windowDays, setWindowDays] = useState(DEFAULT_ANALYTICS_WINDOW_DAYS);
  const [membersPageSize, setMembersPageSize] = useState(
    INITIAL_MEMBERS_PAGE_SIZE
  );
  const allowedWindowOptions = useMemo(
    () => getAvailableAnalyticsWindowOptions(),
    []
  );
  const effectiveWindowDays = useMemo(
    () => clampAnalyticsWindowDays(windowDays, isTeamWorkspace),
    [isTeamWorkspace, windowDays]
  );
  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    []
  );

  useEffect(() => {
    setMembersPageSize(INITIAL_MEMBERS_PAGE_SIZE);
  }, [docId]);

  useEffect(() => {
    permission.revalidate();
  }, [permission, workspaceId]);

  useEffect(() => {
    if (windowDays !== effectiveWindowDays) {
      setWindowDays(effectiveWindowDays);
    }
  }, [effectiveWindowDays, windowDays]);

  const {
    data: analyticsData,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = useQuery(
    {
      query: getDocPageAnalyticsQuery,
      variables: {
        workspaceId,
        docId,
        input: {
          windowDays: effectiveWindowDays,
          timezone,
        },
      },
    },
    {
      suspense: false,
      keepPreviousData: true,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );

  const {
    data: membersData,
    isLoading: membersLoading,
    error: membersError,
  } = useQuery(
    {
      query: getDocLastAccessedMembersQuery,
      variables: {
        workspaceId,
        docId,
        pagination: {
          first: membersPageSize,
          offset: 0,
        },
        includeTotal: true,
      },
    },
    {
      suspense: false,
      keepPreviousData: true,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );

  const analytics = analyticsData?.workspace.doc.analytics;
  const summary = analytics?.summary;
  const chartPoints = useMemo(
    () =>
      ensureMinimumChartPoints(
        buildAnalyticsChartPoints(analytics?.series ?? [])
      ),
    [analytics?.series]
  );

  const membersConnection = membersData?.workspace.doc.lastAccessedMembers;
  const members = useMemo(
    () => membersConnection?.edges.map(edge => edge.node) ?? [],
    [membersConnection?.edges]
  );
  const totalMembers = membersConnection?.totalCount ?? members.length;
  const hasMoreMembers =
    Boolean(membersConnection?.pageInfo.hasNextPage) &&
    membersPageSize < MAX_MEMBERS_PAGE_SIZE;
  const openTeamPricing = useCallback(() => {
    workspaceDialogService.open('setting', {
      activeTab: 'plans',
      scrollAnchor: 'cloudPricingPlan',
    });
  }, [workspaceDialogService]);
  const showTeamPlanToast = useCallback(() => {
    toast(t['com.affine.doc.analytics.paywall.toast']());
  }, [t]);

  return (
    <div className={styles.root}>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>
            <span>{t['com.affine.doc.analytics.title']()}</span>
            <span className={styles.sectionSubtitle}>
              {summary
                ? t.t('com.affine.doc.analytics.summary.total', {
                    count: intFormatter.format(summary.totalViews),
                  })
                : ''}
            </span>
          </div>
          <Menu
            contentOptions={{ align: 'end' }}
            items={
              <>
                {allowedWindowOptions.map(option => {
                  const isLocked = isLockedAnalyticsWindowOption(
                    option,
                    isTeamWorkspace
                  );

                  return (
                    <MenuItem
                      key={option}
                      selected={effectiveWindowDays === option}
                      suffixIcon={
                        isLocked ? (
                          <button
                            type="button"
                            className={styles.lockButton}
                            aria-label={t[
                              'com.affine.doc.analytics.paywall.open-pricing'
                            ]()}
                            onClick={event => {
                              event.preventDefault();
                              event.stopPropagation();
                              openTeamPricing();
                            }}
                          >
                            <LockIcon />
                          </button>
                        ) : undefined
                      }
                      onSelect={() => {
                        if (isLocked) {
                          showTeamPlanToast();
                          return;
                        }
                        setWindowDays(option);
                      }}
                    >
                      {t.t('com.affine.doc.analytics.window.last-days', {
                        days: option,
                      })}
                      {isLocked
                        ? ` (${t['com.affine.payment.cloud.team-workspace.name']()})`
                        : ''}
                    </MenuItem>
                  );
                })}
              </>
            }
          >
            <Button
              variant="secondary"
              size="default"
              className={styles.windowButton}
              prefix={<CalendarPanelIcon />}
              suffix={<ArrowDownSmallIcon />}
            >
              {t.t('com.affine.doc.analytics.window.last-days', {
                days: effectiveWindowDays,
              })}
            </Button>
          </Menu>
        </div>

        <div className={styles.metrics}>
          <div className={styles.metricCard}>
            <div className={styles.metricLabel}>
              {t['com.affine.doc.analytics.metric.total']()}
            </div>
            <div className={styles.metricValue}>
              {intFormatter.format(summary?.totalViews ?? 0)}
            </div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricLabel}>
              {t['com.affine.doc.analytics.metric.unique']()}
            </div>
            <div className={styles.metricValue}>
              {intFormatter.format(summary?.uniqueViews ?? 0)}
            </div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricLabel}>
              {t['com.affine.doc.analytics.metric.guest']()}
            </div>
            <div className={styles.metricValue}>
              {intFormatter.format(summary?.guestViews ?? 0)}
            </div>
          </div>
        </div>

        {analyticsLoading && !analytics ? (
          <div className={styles.loading}>
            <Loading size={20} />
          </div>
        ) : analyticsError && !analytics ? (
          <div className={styles.emptyState}>
            {t['com.affine.doc.analytics.error.load-analytics']()}
          </div>
        ) : chartPoints.length ? (
          <>
            <div className={styles.chartContainer}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartPoints}
                  margin={{ top: 10, right: 6, bottom: 6, left: 6 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke={cssVar('borderColor')}
                    strokeDasharray="3 3"
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
                  <RechartsTooltip
                    cursor={{
                      stroke: cssVar('borderColor'),
                      strokeDasharray: '4 4',
                    }}
                    content={<AnalyticsChartTooltip />}
                  />
                  <Area
                    dataKey="totalViews"
                    type="monotone"
                    stroke={totalViewsColor}
                    fill={totalViewsColor}
                    fillOpacity={0.15}
                    isAnimationActive={false}
                  />
                  <Area
                    dataKey="uniqueViews"
                    type="monotone"
                    stroke={uniqueViewsColor}
                    fill={uniqueViewsColor}
                    fillOpacity={0.1}
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="totalViews"
                    type="monotone"
                    stroke={totalViewsColor}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="uniqueViews"
                    type="monotone"
                    stroke={uniqueViewsColor}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className={styles.axisLabels}>
              <span>{formatChartDate(chartPoints[0].date)}</span>
              <span>
                {formatChartDate(chartPoints[chartPoints.length - 1].date)}
              </span>
            </div>
            <div className={styles.chartLegend}>
              <span className={styles.legendItem}>
                <span
                  className={styles.legendDot}
                  style={{ backgroundColor: totalViewsColor }}
                  aria-hidden="true"
                />
                {t['com.affine.doc.analytics.chart.total-views']()}
              </span>
              <span className={styles.legendItem}>
                <span
                  className={styles.legendDot}
                  style={{ backgroundColor: uniqueViewsColor }}
                  aria-hidden="true"
                />
                {t['com.affine.doc.analytics.chart.unique-views']()}
              </span>
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            {t['com.affine.doc.analytics.empty.no-page-views']()}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>
            <span>{t['com.affine.doc.analytics.viewers.title']()}</span>
            <span className={styles.sectionSubtitle}>
              ({intFormatter.format(totalMembers)})
            </span>
          </div>
        </div>

        {membersLoading && !membersConnection ? (
          <div className={styles.loading}>
            <Loading size={20} />
          </div>
        ) : membersError && !membersConnection ? (
          <div className={styles.emptyState}>
            {t['com.affine.doc.analytics.error.load-viewers']()}
          </div>
        ) : members.length ? (
          <>
            <div className={styles.viewersList}>
              {members.map(member => (
                <div className={styles.viewerRow} key={member.user.id}>
                  <div className={styles.viewerUser}>
                    <Avatar
                      size={24}
                      url={member.user.avatarUrl || ''}
                      name={member.user.name}
                    />
                    <span className={styles.viewerName}>
                      {member.user.name}
                    </span>
                  </div>
                  <span className={styles.viewerTime}>
                    {i18nTime(member.lastAccessedAt, { relative: true })}
                  </span>
                </div>
              ))}
            </div>
            {hasMoreMembers ? (
              <Button
                variant="plain"
                className={styles.loadMoreButton}
                onClick={() => setMembersPageSize(MAX_MEMBERS_PAGE_SIZE)}
              >
                {t['com.affine.doc.analytics.viewers.show-all']()}
              </Button>
            ) : null}
          </>
        ) : (
          <div className={styles.emptyState}>
            {t['com.affine.doc.analytics.empty.no-viewers']()}
          </div>
        )}
      </section>
    </div>
  );
};
