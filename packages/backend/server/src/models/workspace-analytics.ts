import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { BadRequest, QueryTooLong } from '../base';
import {
  decodeWithJson,
  encodeWithJson,
  PaginationInput,
} from '../base/graphql/pagination';
import { CacheRedis } from '../base/redis';
import { BaseModel } from './base';
import { WorkspaceRole } from './common';

const DEFAULT_STORAGE_HISTORY_DAYS = 30;
const DEFAULT_SYNC_HISTORY_HOURS = 48;
const DEFAULT_SHARED_LINK_WINDOW_DAYS = 28;
const DEFAULT_ANALYTICS_WINDOW_DAYS = 28;
const NON_TEAM_ANALYTICS_WINDOW_DAYS = 7;
const DEFAULT_TIMEZONE = 'UTC';
const DOC_MEMBER_QUERY_MAX_LENGTH = 255;
const MEMBER_PAGINATION_MAX = 50;
const UNIQUE_VISITOR_KEY_TTL_SECONDS = 90 * 24 * 60 * 60;

type SharedLinksOrder = 'UpdatedAtDesc' | 'PublishedAtDesc' | 'ViewsDesc';

type TimeBucket = 'Minute' | 'Day';

type SharedLinkCursor = {
  orderBy: SharedLinksOrder;
  sortValue: string | number;
  workspaceId: string;
  docId: string;
};

type MemberCursor = {
  lastAccessedAt: string;
  userId: string;
};

export type TimeWindowDto = {
  from: Date;
  to: Date;
  timezone: string;
  bucket: TimeBucket;
  requestedSize: number;
  effectiveSize: number;
};

export type AdminDashboardOptions = {
  timezone?: string;
  storageHistoryDays?: number;
  syncHistoryHours?: number;
  sharedLinkWindowDays?: number;
};

export type AdminAllSharedLinksOptions = {
  keyword?: string;
  workspaceId?: string;
  updatedAfter?: Date;
  orderBy?: SharedLinksOrder;
  analyticsWindowDays?: number;
  includeTotal?: boolean;
  pagination: PaginationInput;
};

export type OptionalTotalPaginated<T> = {
  edges: Array<{
    cursor: string;
    node: T;
  }>;
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
  totalCount?: number;
};

export type AdminSharedLinkNode = {
  workspaceId: string;
  docId: string;
  title: string | null;
  publishedAt: Date | null;
  docUpdatedAt: Date | null;
  workspaceOwnerId: string | null;
  lastUpdaterId: string | null;
  views: number;
  uniqueViews: number;
  guestViews: number;
  lastAccessedAt: Date | null;
};

export type AdminDashboardDto = {
  syncActiveUsers: number;
  syncActiveUsersTimeline: Array<{
    minute: Date;
    activeUsers: number;
  }>;
  syncWindow: TimeWindowDto;
  copilotConversations: number;
  workspaceStorageBytes: number;
  blobStorageBytes: number;
  workspaceStorageHistory: Array<{
    date: Date;
    value: number;
  }>;
  blobStorageHistory: Array<{
    date: Date;
    value: number;
  }>;
  storageWindow: TimeWindowDto;
  topSharedLinks: AdminSharedLinkNode[];
  topSharedLinksWindow: TimeWindowDto;
  generatedAt: Date;
};

export type DocPageAnalyticsPoint = {
  date: Date;
  totalViews: number;
  uniqueViews: number;
  guestViews: number;
};

export type DocPageAnalyticsDto = {
  window: TimeWindowDto;
  series: DocPageAnalyticsPoint[];
  summary: {
    totalViews: number;
    uniqueViews: number;
    guestViews: number;
    lastAccessedAt: Date | null;
  };
  generatedAt: Date;
};

export type DocMemberLastAccessNode = {
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  lastAccessedAt: Date;
  lastDocId: string | null;
};

function clampInt(
  value: number | undefined,
  min: number,
  max: number,
  def: number
) {
  if (!Number.isFinite(value)) {
    return def;
  }

  return Math.min(max, Math.max(min, Math.trunc(value as number)));
}

function floorMinute(date: Date) {
  const result = new Date(date);
  result.setSeconds(0, 0);
  return result;
}

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function asDateOnlyString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeTimezone(timezone?: string) {
  const trimmed = timezone?.trim();
  return trimmed ? trimmed : DEFAULT_TIMEZONE;
}

function parseJsonCursor<T>(cursor?: string | null): T | null {
  if (!cursor) {
    return null;
  }

  const raw = cursor.trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    try {
      return decodeWithJson<T>(raw);
    } catch {
      throw new BadRequest('Invalid pagination cursor');
    }
  }
}

function parseCursorDate(value: unknown): Date {
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    !(value instanceof Date)
  ) {
    throw new BadRequest('Invalid pagination cursor');
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequest('Invalid pagination cursor');
  }
  return parsed;
}

function parseCursorNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new BadRequest('Invalid pagination cursor');
  }
  return parsed;
}

function parseCursorString(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    throw new BadRequest('Invalid pagination cursor');
  }
  return value;
}

@Injectable()
export class WorkspaceAnalyticsModel extends BaseModel {
  constructor(private readonly redis: CacheRedis) {
    super();
  }

  async adminGetDashboard(
    options: AdminDashboardOptions
  ): Promise<AdminDashboardDto> {
    const timezone = normalizeTimezone(options.timezone);
    const storageHistoryDays = clampInt(
      options.storageHistoryDays,
      1,
      90,
      DEFAULT_STORAGE_HISTORY_DAYS
    );
    const syncHistoryHours = clampInt(
      options.syncHistoryHours,
      1,
      72,
      DEFAULT_SYNC_HISTORY_HOURS
    );
    const sharedLinkWindowDays = clampInt(
      options.sharedLinkWindowDays,
      1,
      90,
      DEFAULT_SHARED_LINK_WINDOW_DAYS
    );

    const now = new Date();

    const syncTo = floorMinute(now);
    const syncFrom = new Date(
      syncTo.getTime() - (syncHistoryHours - 1) * 60 * 60 * 1000
    );

    const currentDay = startOfUtcDay(now);
    const storageFrom = addUtcDays(currentDay, -(storageHistoryDays - 1));
    const sharedFrom = addUtcDays(currentDay, -(sharedLinkWindowDays - 1));

    const [
      syncCurrent,
      syncTimeline,
      storageCurrent,
      storageHistory,
      copilotCount,
      topSharedLinks,
    ] = await Promise.all([
      this.db.$queryRaw<{ activeUsers: number }[]>`
          SELECT COALESCE(
            (
              SELECT active_users
              FROM sync_active_users_minutely
              WHERE minute_ts <= ${syncTo}
              ORDER BY minute_ts DESC
              LIMIT 1
            ),
            0
          )::integer AS "activeUsers"
        `,
      this.db.$queryRaw<{ minute: Date; activeUsers: number }[]>`
          WITH minutes AS (
            SELECT generate_series(${syncFrom}, ${syncTo}, interval '1 minute') AS minute_ts
          )
          SELECT
            minutes.minute_ts AS minute,
            COALESCE(s.active_users, 0)::integer AS "activeUsers"
          FROM minutes
          LEFT JOIN sync_active_users_minutely s ON s.minute_ts = minutes.minute_ts
          ORDER BY minute ASC
        `,
      this.db.$queryRaw<
        {
          workspaceStorageBytes: bigint | number;
          blobStorageBytes: bigint | number;
        }[]
      >`
          SELECT
            COALESCE(SUM(snapshot_size), 0) AS "workspaceStorageBytes",
            COALESCE(SUM(blob_size), 0) AS "blobStorageBytes"
          FROM workspace_admin_stats
        `,
      this.db.$queryRaw<
        {
          date: Date;
          workspaceStorageBytes: bigint | number;
          blobStorageBytes: bigint | number;
        }[]
      >`
          WITH days AS (
            SELECT generate_series(${storageFrom}::date, ${currentDay}::date, interval '1 day')::date AS day
          ),
          grouped AS (
            SELECT
              date,
              COALESCE(SUM(snapshot_size), 0) AS workspace_storage_bytes,
              COALESCE(SUM(blob_size), 0) AS blob_storage_bytes
            FROM workspace_admin_stats_daily
            WHERE date BETWEEN ${storageFrom}::date AND ${currentDay}::date
            GROUP BY date
          )
          SELECT
            days.day AS date,
            COALESCE(grouped.workspace_storage_bytes, 0) AS "workspaceStorageBytes",
            COALESCE(grouped.blob_storage_bytes, 0) AS "blobStorageBytes"
          FROM days
          LEFT JOIN grouped ON grouped.date = days.day
          ORDER BY date ASC
        `,
      this.db.$queryRaw<{ conversations: bigint | number }[]>`
          SELECT COUNT(*) AS conversations
          FROM ai_sessions_messages
          WHERE role = 'user'
          AND created_at >= ${sharedFrom}
          AND created_at <= ${now}
        `,
      this.db.$queryRaw<
        {
          workspaceId: string;
          docId: string;
          title: string | null;
          publishedAt: Date | null;
          docUpdatedAt: Date | null;
          workspaceOwnerId: string | null;
          lastUpdaterId: string | null;
          views: bigint | number;
          uniqueViews: bigint | number;
          guestViews: bigint | number;
          lastAccessedAt: Date | null;
        }[]
      >`
          WITH view_agg AS (
            SELECT
              workspace_id,
              doc_id,
              COALESCE(SUM(total_views), 0) AS views,
              COALESCE(SUM(unique_views), 0) AS unique_views,
              COALESCE(SUM(guest_views), 0) AS guest_views,
              MAX(last_accessed_at) AS last_accessed_at
            FROM workspace_doc_view_daily
            WHERE date BETWEEN ${sharedFrom}::date AND ${currentDay}::date
            GROUP BY workspace_id, doc_id
          )
          SELECT
            wp.workspace_id AS "workspaceId",
            wp.page_id AS "docId",
            wp.title AS title,
            wp.published_at AS "publishedAt",
            sn.updated_at AS "docUpdatedAt",
            owner.user_id AS "workspaceOwnerId",
            sn.updated_by AS "lastUpdaterId",
            COALESCE(v.views, 0) AS views,
            COALESCE(v.unique_views, 0) AS "uniqueViews",
            COALESCE(v.guest_views, 0) AS "guestViews",
            v.last_accessed_at AS "lastAccessedAt"
          FROM workspace_pages wp
          LEFT JOIN snapshots sn
            ON sn.workspace_id = wp.workspace_id AND sn.guid = wp.page_id
          LEFT JOIN view_agg v
            ON v.workspace_id = wp.workspace_id AND v.doc_id = wp.page_id
          LEFT JOIN LATERAL (
            SELECT user_id
            FROM workspace_user_permissions
            WHERE workspace_id = wp.workspace_id
            AND type = ${WorkspaceRole.Owner}
            AND status = 'Accepted'::"WorkspaceMemberStatus"
            ORDER BY created_at ASC
            LIMIT 1
          ) owner ON TRUE
          WHERE wp.public = TRUE
          ORDER BY views DESC, "uniqueViews" DESC, "workspaceId" ASC, "docId" ASC
          LIMIT 10
        `,
    ]);

    const storageHistorySeries = storageHistory.map(row => ({
      date: row.date,
      workspaceStorageBytes: Number(row.workspaceStorageBytes ?? 0),
      blobStorageBytes: Number(row.blobStorageBytes ?? 0),
    }));

    return {
      syncActiveUsers: Number(syncCurrent[0]?.activeUsers ?? 0),
      syncActiveUsersTimeline: syncTimeline.map(row => ({
        minute: row.minute,
        activeUsers: Number(row.activeUsers ?? 0),
      })),
      syncWindow: {
        from: syncFrom,
        to: syncTo,
        timezone,
        bucket: 'Minute',
        requestedSize: options.syncHistoryHours ?? DEFAULT_SYNC_HISTORY_HOURS,
        effectiveSize: syncHistoryHours,
      },
      copilotConversations: Number(copilotCount[0]?.conversations ?? 0),
      workspaceStorageBytes: Number(
        storageCurrent[0]?.workspaceStorageBytes ?? 0
      ),
      blobStorageBytes: Number(storageCurrent[0]?.blobStorageBytes ?? 0),
      workspaceStorageHistory: storageHistorySeries.map(row => ({
        date: row.date,
        value: row.workspaceStorageBytes,
      })),
      blobStorageHistory: storageHistorySeries.map(row => ({
        date: row.date,
        value: row.blobStorageBytes,
      })),
      storageWindow: {
        from: storageFrom,
        to: currentDay,
        timezone,
        bucket: 'Day',
        requestedSize:
          options.storageHistoryDays ?? DEFAULT_STORAGE_HISTORY_DAYS,
        effectiveSize: storageHistoryDays,
      },
      topSharedLinks: topSharedLinks.map(row => ({
        ...row,
        views: Number(row.views ?? 0),
        uniqueViews: Number(row.uniqueViews ?? 0),
        guestViews: Number(row.guestViews ?? 0),
      })),
      topSharedLinksWindow: {
        from: sharedFrom,
        to: currentDay,
        timezone,
        bucket: 'Day',
        requestedSize:
          options.sharedLinkWindowDays ?? DEFAULT_SHARED_LINK_WINDOW_DAYS,
        effectiveSize: sharedLinkWindowDays,
      },
      generatedAt: now,
    };
  }

  async adminPaginateAllSharedLinks(
    options: AdminAllSharedLinksOptions
  ): Promise<
    OptionalTotalPaginated<AdminSharedLinkNode> & {
      analyticsWindow: TimeWindowDto;
    }
  > {
    const pagination: PaginationInput = {
      ...options.pagination,
      first: Math.min(Math.max(options.pagination.first ?? 10, 1), 100),
      offset: Math.max(options.pagination.offset ?? 0, 0),
    };
    const keyword = options.keyword?.trim();
    if (keyword && keyword.length > DOC_MEMBER_QUERY_MAX_LENGTH) {
      throw new QueryTooLong({ max: DOC_MEMBER_QUERY_MAX_LENGTH });
    }

    const includeTotal = options.includeTotal ?? false;
    const orderBy = options.orderBy ?? 'UpdatedAtDesc';
    const analyticsWindowDays = clampInt(
      options.analyticsWindowDays,
      1,
      90,
      DEFAULT_ANALYTICS_WINDOW_DAYS
    );
    const now = new Date();
    const currentDay = startOfUtcDay(now);
    const analyticsFrom = addUtcDays(currentDay, -(analyticsWindowDays - 1));

    const cursor = parseJsonCursor<SharedLinkCursor>(pagination.after ?? null);
    const cursorCondition = this.buildSharedLinkCursorCondition(
      orderBy,
      cursor
    );
    const orderClause = this.buildSharedLinkOrderClause(orderBy);

    const keywordCondition = keyword
      ? Prisma.sql`AND (
          wp.title ILIKE ${`%${keyword}%`}
          OR wp.page_id ILIKE ${`%${keyword}%`}
          OR wp.workspace_id ILIKE ${`%${keyword}%`}
        )`
      : Prisma.empty;

    const workspaceCondition = options.workspaceId
      ? Prisma.sql`AND wp.workspace_id = ${options.workspaceId}`
      : Prisma.empty;

    const updatedAfterCondition = options.updatedAfter
      ? Prisma.sql`AND sn.updated_at >= ${options.updatedAfter}`
      : Prisma.empty;

    const rows = await this.db.$queryRaw<
      Array<
        AdminSharedLinkNode & {
          sortValueDate: Date;
          sortValueNumber: number;
        }
      >
    >`
      WITH view_agg AS (
        SELECT
          workspace_id,
          doc_id,
          COALESCE(SUM(total_views), 0) AS views,
          COALESCE(SUM(unique_views), 0) AS unique_views,
          COALESCE(SUM(guest_views), 0) AS guest_views,
          MAX(last_accessed_at) AS last_accessed_at
        FROM workspace_doc_view_daily
        WHERE date BETWEEN ${analyticsFrom}::date AND ${currentDay}::date
        GROUP BY workspace_id, doc_id
      ),
      base AS (
        SELECT
          wp.workspace_id AS "workspaceId",
          wp.page_id AS "docId",
          wp.title AS title,
          wp.published_at AS "publishedAt",
          sn.updated_at AS "docUpdatedAt",
          owner.user_id AS "workspaceOwnerId",
          sn.updated_by AS "lastUpdaterId",
          COALESCE(v.views, 0) AS views,
          COALESCE(v.unique_views, 0) AS "uniqueViews",
          COALESCE(v.guest_views, 0) AS "guestViews",
          v.last_accessed_at AS "lastAccessedAt",
          COALESCE(sn.updated_at, to_timestamp(0)) AS "sortValueDateUpdatedAt",
          COALESCE(wp.published_at, to_timestamp(0)) AS "sortValueDatePublishedAt",
          COALESCE(v.views, 0) AS "sortValueViews"
        FROM workspace_pages wp
        LEFT JOIN snapshots sn
          ON sn.workspace_id = wp.workspace_id AND sn.guid = wp.page_id
        LEFT JOIN view_agg v
          ON v.workspace_id = wp.workspace_id AND v.doc_id = wp.page_id
        LEFT JOIN LATERAL (
          SELECT user_id
          FROM workspace_user_permissions
          WHERE workspace_id = wp.workspace_id
          AND type = ${WorkspaceRole.Owner}
          AND status = 'Accepted'::"WorkspaceMemberStatus"
          ORDER BY created_at ASC
          LIMIT 1
        ) owner ON TRUE
        WHERE wp.public = TRUE
        ${keywordCondition}
        ${workspaceCondition}
        ${updatedAfterCondition}
      )
      SELECT
        "workspaceId",
        "docId",
        title,
        "publishedAt",
        "docUpdatedAt",
        "workspaceOwnerId",
        "lastUpdaterId",
        views,
        "uniqueViews",
        "guestViews",
        "lastAccessedAt",
        CASE
          WHEN ${orderBy} = 'UpdatedAtDesc' THEN "sortValueDateUpdatedAt"
          WHEN ${orderBy} = 'PublishedAtDesc' THEN "sortValueDatePublishedAt"
          ELSE to_timestamp(0)
        END AS "sortValueDate",
        CASE
          WHEN ${orderBy} = 'ViewsDesc' THEN "sortValueViews"
          ELSE 0
        END AS "sortValueNumber"
      FROM base
      WHERE 1 = 1
      ${cursorCondition}
      ORDER BY ${orderClause}
      LIMIT ${pagination.first + 1}
      OFFSET ${pagination.offset}
    `;

    const hasNextPage = rows.length > pagination.first;
    const pageRows = hasNextPage ? rows.slice(0, pagination.first) : rows;

    const edges = pageRows.map(row => {
      const sortValue =
        orderBy === 'ViewsDesc'
          ? Number(row.sortValueNumber ?? 0)
          : row.sortValueDate.toISOString();
      const cursorValue: SharedLinkCursor = {
        orderBy,
        sortValue,
        workspaceId: row.workspaceId,
        docId: row.docId,
      };

      return {
        cursor: encodeWithJson(cursorValue),
        node: {
          ...row,
          views: Number(row.views ?? 0),
          uniqueViews: Number(row.uniqueViews ?? 0),
          guestViews: Number(row.guestViews ?? 0),
        },
      };
    });

    const totalCount = includeTotal
      ? await this.countAdminSharedLinks({
          keyword,
          workspaceId: options.workspaceId,
          updatedAfter: options.updatedAfter,
        })
      : undefined;

    return {
      edges,
      pageInfo: {
        hasNextPage,
        hasPreviousPage: Boolean(pagination.after) || pagination.offset > 0,
        startCursor: edges[0]?.cursor ?? null,
        endCursor: edges[edges.length - 1]?.cursor ?? null,
      },
      totalCount,
      analyticsWindow: {
        from: analyticsFrom,
        to: currentDay,
        timezone: DEFAULT_TIMEZONE,
        bucket: 'Day',
        requestedSize:
          options.analyticsWindowDays ?? DEFAULT_ANALYTICS_WINDOW_DAYS,
        effectiveSize: analyticsWindowDays,
      },
    };
  }

  async getDocPageAnalytics(input: {
    workspaceId: string;
    docId: string;
    windowDays?: number;
    timezone?: string;
  }): Promise<DocPageAnalyticsDto> {
    const isTeamWorkspace = await this.models.workspace.isTeamWorkspace(
      input.workspaceId
    );
    const defaultWindowDays = isTeamWorkspace
      ? DEFAULT_ANALYTICS_WINDOW_DAYS
      : NON_TEAM_ANALYTICS_WINDOW_DAYS;
    const requestedWindowDays = input.windowDays ?? defaultWindowDays;
    const windowDays = clampInt(
      requestedWindowDays,
      1,
      isTeamWorkspace ? 90 : NON_TEAM_ANALYTICS_WINDOW_DAYS,
      defaultWindowDays
    );
    const timezone = normalizeTimezone(input.timezone);
    const now = new Date();
    const currentDay = startOfUtcDay(now);
    const from = addUtcDays(currentDay, -(windowDays - 1));

    const rows = await this.db.$queryRaw<
      {
        date: Date;
        totalViews: bigint | number;
        uniqueViews: bigint | number;
        guestViews: bigint | number;
        lastAccessedAt: Date | null;
      }[]
    >`
      WITH days AS (
        SELECT generate_series(${from}::date, ${currentDay}::date, interval '1 day')::date AS day
      )
      SELECT
        days.day AS date,
        COALESCE(v.total_views, 0) AS "totalViews",
        COALESCE(v.unique_views, 0) AS "uniqueViews",
        COALESCE(v.guest_views, 0) AS "guestViews",
        v.last_accessed_at AS "lastAccessedAt"
      FROM days
      LEFT JOIN workspace_doc_view_daily v
        ON v.workspace_id = ${input.workspaceId}
       AND v.doc_id = ${input.docId}
       AND v.date = days.day
      ORDER BY date ASC
    `;

    const series = rows.map(row => ({
      date: row.date,
      totalViews: Number(row.totalViews ?? 0),
      uniqueViews: Number(row.uniqueViews ?? 0),
      guestViews: Number(row.guestViews ?? 0),
      lastAccessedAt: row.lastAccessedAt,
    }));

    const summary = series.reduce(
      (acc, row) => {
        acc.totalViews += row.totalViews;
        acc.uniqueViews += row.uniqueViews;
        acc.guestViews += row.guestViews;
        if (
          row.lastAccessedAt &&
          (!acc.lastAccessedAt || row.lastAccessedAt > acc.lastAccessedAt)
        ) {
          acc.lastAccessedAt = row.lastAccessedAt;
        }
        return acc;
      },
      {
        totalViews: 0,
        uniqueViews: 0,
        guestViews: 0,
        lastAccessedAt: null as Date | null,
      }
    );

    return {
      window: {
        from,
        to: currentDay,
        timezone,
        bucket: 'Day',
        requestedSize: requestedWindowDays,
        effectiveSize: windowDays,
      },
      series: series.map(row => ({
        date: row.date,
        totalViews: row.totalViews,
        uniqueViews: row.uniqueViews,
        guestViews: row.guestViews,
      })),
      summary,
      generatedAt: now,
    };
  }

  async paginateDocLastAccessedMembers(input: {
    workspaceId: string;
    docId: string;
    pagination: PaginationInput;
    query?: string;
    includeTotal?: boolean;
  }): Promise<OptionalTotalPaginated<DocMemberLastAccessNode>> {
    const isTeamWorkspace = await this.models.workspace.isTeamWorkspace(
      input.workspaceId
    );
    const nonTeamAccessFrom = isTeamWorkspace
      ? null
      : addUtcDays(
          startOfUtcDay(new Date()),
          -(NON_TEAM_ANALYTICS_WINDOW_DAYS - 1)
        );

    const pagination: PaginationInput = {
      ...input.pagination,
      first: Math.min(
        MEMBER_PAGINATION_MAX,
        Math.max(input.pagination.first ?? 10, 1)
      ),
      offset: Math.max(input.pagination.offset ?? 0, 0),
    };
    const keyword = input.query?.trim();
    if (keyword && keyword.length > DOC_MEMBER_QUERY_MAX_LENGTH) {
      throw new QueryTooLong({ max: DOC_MEMBER_QUERY_MAX_LENGTH });
    }

    const cursor = parseJsonCursor<MemberCursor>(pagination.after ?? null);
    const keywordCondition = keyword
      ? Prisma.sql`AND (u.name ILIKE ${`%${keyword}%`} OR u.email ILIKE ${`%${keyword}%`})`
      : Prisma.empty;
    const windowCondition = nonTeamAccessFrom
      ? Prisma.sql`AND mla.last_accessed_at >= ${nonTeamAccessFrom}`
      : Prisma.empty;
    const cursorCondition = cursor
      ? (() => {
          const cursorLastAccessedAt = parseCursorDate(cursor.lastAccessedAt);
          const cursorUserId = parseCursorString(cursor.userId);
          return Prisma.sql`
            AND (
              mla.last_accessed_at < ${cursorLastAccessedAt}
              OR (
                mla.last_accessed_at = ${cursorLastAccessedAt}
                AND mla.user_id > ${cursorUserId}
              )
            )
          `;
        })()
      : Prisma.empty;

    const rows = await this.db.$queryRaw<
      {
        userId: string;
        name: string;
        avatarUrl: string | null;
        lastAccessedAt: Date;
        lastDocId: string | null;
      }[]
    >`
      SELECT
        mla.user_id AS "userId",
        u.name AS name,
        u.avatar_url AS "avatarUrl",
        mla.last_accessed_at AS "lastAccessedAt",
        mla.last_doc_id AS "lastDocId"
      FROM workspace_member_last_access mla
      INNER JOIN users u ON u.id = mla.user_id
      INNER JOIN workspace_user_permissions wur
        ON wur.workspace_id = mla.workspace_id
       AND wur.user_id = mla.user_id
       AND wur.status = 'Accepted'::"WorkspaceMemberStatus"
      WHERE mla.workspace_id = ${input.workspaceId}
      AND mla.last_doc_id = ${input.docId}
      ${windowCondition}
      ${keywordCondition}
      ${cursorCondition}
      ORDER BY mla.last_accessed_at DESC, mla.user_id ASC
      LIMIT ${pagination.first + 1}
      OFFSET ${pagination.offset}
    `;

    const hasNextPage = rows.length > pagination.first;
    const pageRows = hasNextPage ? rows.slice(0, pagination.first) : rows;

    const edges = pageRows.map(row => {
      const cursorValue: MemberCursor = {
        lastAccessedAt: row.lastAccessedAt.toISOString(),
        userId: row.userId,
      };
      return {
        cursor: encodeWithJson(cursorValue),
        node: {
          user: {
            id: row.userId,
            name: row.name,
            avatarUrl: row.avatarUrl,
          },
          lastAccessedAt: row.lastAccessedAt,
          lastDocId: row.lastDocId,
        },
      };
    });

    const totalCount = input.includeTotal
      ? await this.countDocLastAccessedMembers(
          input.workspaceId,
          input.docId,
          keyword,
          nonTeamAccessFrom
        )
      : undefined;

    return {
      edges,
      pageInfo: {
        hasNextPage,
        hasPreviousPage: Boolean(pagination.after) || pagination.offset > 0,
        startCursor: edges[0]?.cursor ?? null,
        endCursor: edges[edges.length - 1]?.cursor ?? null,
      },
      totalCount,
    };
  }

  async recordDocView(input: {
    workspaceId: string;
    docId: string;
    viewedAt?: Date;
    visitorId: string;
    isGuest: boolean;
    userId?: string;
  }) {
    const viewedAt = input.viewedAt ?? new Date();
    const viewedDate = asDateOnlyString(startOfUtcDay(viewedAt));
    const unique = await this.markDailyUniqueVisitor(
      input.workspaceId,
      input.docId,
      viewedDate,
      input.visitorId
    );

    await this.db.$executeRaw`
      INSERT INTO workspace_doc_view_daily (
        workspace_id,
        doc_id,
        date,
        total_views,
        unique_views,
        guest_views,
        last_accessed_at,
        updated_at
      )
      VALUES (
        ${input.workspaceId},
        ${input.docId},
        ${viewedDate}::date,
        1,
        ${unique ? 1 : 0},
        ${input.isGuest ? 1 : 0},
        ${viewedAt},
        NOW()
      )
      ON CONFLICT (workspace_id, doc_id, date)
      DO UPDATE SET
        total_views = workspace_doc_view_daily.total_views + 1,
        unique_views = workspace_doc_view_daily.unique_views + ${unique ? 1 : 0},
        guest_views = workspace_doc_view_daily.guest_views + ${input.isGuest ? 1 : 0},
        last_accessed_at = COALESCE(
          GREATEST(workspace_doc_view_daily.last_accessed_at, EXCLUDED.last_accessed_at),
          EXCLUDED.last_accessed_at
        ),
        updated_at = NOW()
    `;

    if (input.userId) {
      await this.db.$executeRaw`
        INSERT INTO workspace_member_last_access (
          workspace_id,
          user_id,
          last_accessed_at,
          last_doc_id,
          updated_at
        )
        VALUES (
          ${input.workspaceId},
          ${input.userId},
          ${viewedAt},
          ${input.docId},
          NOW()
        )
        ON CONFLICT (workspace_id, user_id)
        DO UPDATE SET
          last_accessed_at = GREATEST(
            workspace_member_last_access.last_accessed_at,
            EXCLUDED.last_accessed_at
          ),
          last_doc_id = CASE
            WHEN EXCLUDED.last_accessed_at >= workspace_member_last_access.last_accessed_at
              THEN EXCLUDED.last_doc_id
            ELSE workspace_member_last_access.last_doc_id
          END,
          updated_at = NOW()
      `;
    }
  }

  async upsertSyncActiveUsersMinute(minuteTs: Date, activeUsers: number) {
    await this.db.$executeRaw`
      INSERT INTO sync_active_users_minutely (
        minute_ts,
        active_users,
        updated_at
      )
      VALUES (
        ${minuteTs},
        ${Math.max(0, Math.trunc(activeUsers))},
        NOW()
      )
      ON CONFLICT (minute_ts)
      DO UPDATE SET
        active_users = EXCLUDED.active_users,
        updated_at = NOW()
    `;
  }

  private async countAdminSharedLinks(options: {
    keyword?: string;
    workspaceId?: string;
    updatedAfter?: Date;
  }) {
    const keywordCondition = options.keyword
      ? Prisma.sql`AND (
          wp.title ILIKE ${`%${options.keyword}%`}
          OR wp.page_id ILIKE ${`%${options.keyword}%`}
          OR wp.workspace_id ILIKE ${`%${options.keyword}%`}
        )`
      : Prisma.empty;
    const workspaceCondition = options.workspaceId
      ? Prisma.sql`AND wp.workspace_id = ${options.workspaceId}`
      : Prisma.empty;
    const updatedAfterCondition = options.updatedAfter
      ? Prisma.sql`
          AND EXISTS (
            SELECT 1
            FROM snapshots sn
            WHERE sn.workspace_id = wp.workspace_id
            AND sn.guid = wp.page_id
            AND sn.updated_at >= ${options.updatedAfter}
          )
        `
      : Prisma.empty;

    const [row] = await this.db.$queryRaw<{ total: bigint | number }[]>`
      SELECT COUNT(*) AS total
      FROM workspace_pages wp
      WHERE wp.public = TRUE
      ${keywordCondition}
      ${workspaceCondition}
      ${updatedAfterCondition}
    `;

    return Number(row?.total ?? 0);
  }

  private async countDocLastAccessedMembers(
    workspaceId: string,
    docId: string,
    keyword?: string,
    accessedFrom?: Date | null
  ) {
    const keywordCondition = keyword
      ? Prisma.sql`AND (u.name ILIKE ${`%${keyword}%`} OR u.email ILIKE ${`%${keyword}%`})`
      : Prisma.empty;
    const windowCondition = accessedFrom
      ? Prisma.sql`AND mla.last_accessed_at >= ${accessedFrom}`
      : Prisma.empty;

    const [row] = await this.db.$queryRaw<{ total: bigint | number }[]>`
      SELECT COUNT(*) AS total
      FROM workspace_member_last_access mla
      INNER JOIN users u ON u.id = mla.user_id
      INNER JOIN workspace_user_permissions wur
        ON wur.workspace_id = mla.workspace_id
       AND wur.user_id = mla.user_id
       AND wur.status = 'Accepted'::"WorkspaceMemberStatus"
      WHERE mla.workspace_id = ${workspaceId}
      AND mla.last_doc_id = ${docId}
      ${windowCondition}
      ${keywordCondition}
    `;

    return Number(row?.total ?? 0);
  }

  private buildSharedLinkOrderClause(orderBy: SharedLinksOrder): Prisma.Sql {
    switch (orderBy) {
      case 'PublishedAtDesc':
        return Prisma.sql`"sortValueDatePublishedAt" DESC, "workspaceId" ASC, "docId" ASC`;
      case 'ViewsDesc':
        return Prisma.sql`"sortValueViews" DESC, "workspaceId" ASC, "docId" ASC`;
      case 'UpdatedAtDesc':
      default:
        return Prisma.sql`"sortValueDateUpdatedAt" DESC, "workspaceId" ASC, "docId" ASC`;
    }
  }

  private buildSharedLinkCursorCondition(
    orderBy: SharedLinksOrder,
    cursor: SharedLinkCursor | null
  ) {
    if (!cursor) {
      return Prisma.empty;
    }

    if (cursor.orderBy !== orderBy) {
      return Prisma.empty;
    }

    const workspaceId = parseCursorString(cursor.workspaceId);
    const docId = parseCursorString(cursor.docId);

    if (orderBy === 'ViewsDesc') {
      const sortValue = parseCursorNumber(cursor.sortValue);
      return Prisma.sql`
        AND (
          "sortValueViews" < ${sortValue}
          OR ("sortValueViews" = ${sortValue} AND "workspaceId" > ${workspaceId})
          OR (
            "sortValueViews" = ${sortValue}
            AND "workspaceId" = ${workspaceId}
            AND "docId" > ${docId}
          )
        )
      `;
    }

    const sortValue = parseCursorDate(cursor.sortValue);
    const sortField =
      orderBy === 'PublishedAtDesc'
        ? Prisma.raw('"sortValueDatePublishedAt"')
        : Prisma.raw('"sortValueDateUpdatedAt"');
    return Prisma.sql`
      AND (
        ${sortField} < ${sortValue}
        OR (${sortField} = ${sortValue} AND "workspaceId" > ${workspaceId})
        OR (
          ${sortField} = ${sortValue}
          AND "workspaceId" = ${workspaceId}
          AND "docId" > ${docId}
        )
      )
    `;
  }

  private async markDailyUniqueVisitor(
    workspaceId: string,
    docId: string,
    date: string,
    visitorId: string
  ) {
    const key = `analytics:doc_uv:${workspaceId}:${docId}:${date}`;
    try {
      const added = await this.redis.sadd(key, visitorId);
      if (added > 0) {
        await this.redis.expire(key, UNIQUE_VISITOR_KEY_TTL_SECONDS);
        return true;
      }
      return false;
    } catch {
      return true;
    }
  }
}
