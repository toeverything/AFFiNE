import { PrismaClient } from '@prisma/client';

import { app, e2e, Mockers } from '../test';

async function gql(query: string, variables?: Record<string, unknown>) {
  const res = await app.POST('/graphql').send({ query, variables }).expect(200);
  return res.body as {
    data?: Record<string, any>;
    errors?: Array<{ message: string; extensions: Record<string, any> }>;
  };
}

async function ensureAnalyticsTables(db: PrismaClient) {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS workspace_admin_stats_daily (
      workspace_id VARCHAR NOT NULL,
      date DATE NOT NULL,
      snapshot_size BIGINT NOT NULL DEFAULT 0,
      blob_size BIGINT NOT NULL DEFAULT 0,
      member_count BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
      PRIMARY KEY (workspace_id, date)
    );
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS sync_active_users_minutely (
      minute_ts TIMESTAMPTZ(3) NOT NULL PRIMARY KEY,
      active_users INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
    );
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS workspace_doc_view_daily (
      workspace_id VARCHAR NOT NULL,
      doc_id VARCHAR NOT NULL,
      date DATE NOT NULL,
      total_views BIGINT NOT NULL DEFAULT 0,
      unique_views BIGINT NOT NULL DEFAULT 0,
      guest_views BIGINT NOT NULL DEFAULT 0,
      last_accessed_at TIMESTAMPTZ(3),
      updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
      PRIMARY KEY (workspace_id, doc_id, date)
    );
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS workspace_member_last_access (
      workspace_id VARCHAR NOT NULL,
      user_id VARCHAR NOT NULL,
      last_accessed_at TIMESTAMPTZ(3) NOT NULL,
      last_doc_id VARCHAR,
      updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
      PRIMARY KEY (workspace_id, user_id)
    );
  `);
}

async function createPublicDoc(input: {
  workspaceId: string;
  ownerId: string;
  title: string;
  updatedAt: Date;
  publishedAt: Date;
}) {
  const snapshot = await app.create(Mockers.DocSnapshot, {
    workspaceId: input.workspaceId,
    user: { id: input.ownerId },
  });

  await app.create(Mockers.DocMeta, {
    workspaceId: input.workspaceId,
    docId: snapshot.id,
    title: input.title,
    public: true,
    publishedAt: input.publishedAt,
  });

  const db = app.get(PrismaClient);
  await db.snapshot.update({
    where: {
      workspaceId_id: {
        workspaceId: input.workspaceId,
        id: snapshot.id,
      },
    },
    data: {
      updatedAt: input.updatedAt,
      updatedBy: input.ownerId,
    },
  });

  return snapshot.id;
}

e2e(
  'adminAllSharedLinks should support stable pagination and includeTotal',
  async t => {
    const admin = await app.create(Mockers.User, {
      feature: 'administrator',
    });
    await app.login(admin);

    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });

    const newerDocId = await createPublicDoc({
      workspaceId: workspace.id,
      ownerId: owner.id,
      title: 'newer-doc',
      updatedAt: new Date('2026-02-11T10:00:00.000Z'),
      publishedAt: new Date('2026-02-11T10:00:00.000Z'),
    });
    const olderDocId = await createPublicDoc({
      workspaceId: workspace.id,
      ownerId: owner.id,
      title: 'older-doc',
      updatedAt: new Date('2026-02-10T10:00:00.000Z'),
      publishedAt: new Date('2026-02-10T10:00:00.000Z'),
    });

    const db = app.get(PrismaClient);
    await ensureAnalyticsTables(db);
    await db.$executeRaw`
    INSERT INTO workspace_doc_view_daily (
      workspace_id, doc_id, date, total_views, unique_views, guest_views, last_accessed_at, updated_at
    )
    VALUES
      (${workspace.id}, ${newerDocId}, CURRENT_DATE, 10, 8, 2, NOW(), NOW()),
      (${workspace.id}, ${olderDocId}, CURRENT_DATE, 5, 4, 1, NOW(), NOW())
    ON CONFLICT (workspace_id, doc_id, date)
    DO UPDATE SET
      total_views = EXCLUDED.total_views,
      unique_views = EXCLUDED.unique_views,
      guest_views = EXCLUDED.guest_views,
      last_accessed_at = EXCLUDED.last_accessed_at,
      updated_at = EXCLUDED.updated_at
  `;

    const query = `
    query AdminAllSharedLinks($pagination: PaginationInput!, $filter: AdminAllSharedLinksFilterInput) {
      adminAllSharedLinks(pagination: $pagination, filter: $filter) {
        totalCount
        analyticsWindow {
          requestedSize
          effectiveSize
        }
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
          node {
            workspaceId
            docId
            title
            shareUrl
            views
            uniqueViews
            guestViews
          }
        }
      }
    }
  `;

    const firstPage = await gql(query, {
      pagination: { first: 1, offset: 0 },
      filter: {
        includeTotal: false,
        orderBy: 'UpdatedAtDesc',
        workspaceId: workspace.id,
      },
    });

    t.falsy(firstPage.errors);
    const first = firstPage.data!.adminAllSharedLinks;
    t.is(first.totalCount, null);
    t.true(first.pageInfo.hasNextPage);
    t.is(first.edges.length, 1);
    t.true([newerDocId, olderDocId].includes(first.edges[0].node.docId));
    t.true(
      first.edges[0].node.shareUrl.includes(`/workspace/${workspace.id}/`)
    );

    const secondPage = await gql(query, {
      pagination: { first: 1, offset: 0, after: first.pageInfo.endCursor },
      filter: {
        includeTotal: true,
        orderBy: 'UpdatedAtDesc',
        workspaceId: workspace.id,
      },
    });

    t.falsy(secondPage.errors);
    const second = secondPage.data!.adminAllSharedLinks;
    t.is(second.totalCount, 2);
    t.is(second.edges.length, 1);
    t.not(second.edges[0].node.docId, first.edges[0].node.docId);

    const conflict = await gql(query, {
      pagination: {
        first: 1,
        offset: 1,
        after: first.pageInfo.endCursor,
      },
      filter: {
        includeTotal: false,
        orderBy: 'UpdatedAtDesc',
        workspaceId: workspace.id,
      },
    });

    t.truthy(conflict.errors?.length);
    t.is(conflict.errors![0].extensions.name, 'BAD_REQUEST');

    const malformedDateCursor = await gql(query, {
      pagination: {
        first: 1,
        offset: 0,
        after: JSON.stringify({
          orderBy: 'UpdatedAtDesc',
          sortValue: 'not-a-date',
          workspaceId: workspace.id,
          docId: newerDocId,
        }),
      },
      filter: {
        includeTotal: false,
        orderBy: 'UpdatedAtDesc',
        workspaceId: workspace.id,
      },
    });

    t.truthy(malformedDateCursor.errors?.length);
    t.is(malformedDateCursor.errors![0].extensions.name, 'BAD_REQUEST');

    const malformedViewsCursor = await gql(query, {
      pagination: {
        first: 1,
        offset: 0,
        after: JSON.stringify({
          orderBy: 'ViewsDesc',
          sortValue: 'NaN',
          workspaceId: workspace.id,
          docId: newerDocId,
        }),
      },
      filter: {
        includeTotal: false,
        orderBy: 'ViewsDesc',
        workspaceId: workspace.id,
      },
    });

    t.truthy(malformedViewsCursor.errors?.length);
    t.is(malformedViewsCursor.errors![0].extensions.name, 'BAD_REQUEST');
  }
);

e2e(
  'adminDashboard should clamp window inputs and return expected buckets',
  async t => {
    const admin = await app.create(Mockers.User, {
      feature: 'administrator',
    });
    await app.login(admin);

    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });

    const docId = await createPublicDoc({
      workspaceId: workspace.id,
      ownerId: owner.id,
      title: 'dashboard-doc',
      updatedAt: new Date(),
      publishedAt: new Date(),
    });

    const db = app.get(PrismaClient);
    await ensureAnalyticsTables(db);
    const minute = new Date();
    minute.setSeconds(0, 0);

    await db.$executeRaw`
    INSERT INTO sync_active_users_minutely (minute_ts, active_users, updated_at)
    VALUES (${minute}, 7, NOW())
    ON CONFLICT (minute_ts)
    DO UPDATE SET active_users = EXCLUDED.active_users, updated_at = EXCLUDED.updated_at
  `;

    await db.$executeRaw`
    INSERT INTO workspace_admin_stats (
      workspace_id, snapshot_count, snapshot_size, blob_count, blob_size, member_count, public_page_count, features, updated_at
    )
    VALUES (${workspace.id}, 1, 100, 1, 50, 1, 1, ARRAY[]::text[], NOW())
    ON CONFLICT (workspace_id)
    DO UPDATE SET
      snapshot_count = EXCLUDED.snapshot_count,
      snapshot_size = EXCLUDED.snapshot_size,
      blob_count = EXCLUDED.blob_count,
      blob_size = EXCLUDED.blob_size,
      member_count = EXCLUDED.member_count,
      public_page_count = EXCLUDED.public_page_count,
      features = EXCLUDED.features,
      updated_at = EXCLUDED.updated_at
  `;

    await db.$executeRaw`
    INSERT INTO workspace_admin_stats_daily (
      workspace_id, date, snapshot_size, blob_size, member_count, updated_at
    )
    VALUES (${workspace.id}, CURRENT_DATE, 100, 50, 1, NOW())
    ON CONFLICT (workspace_id, date)
    DO UPDATE SET
      snapshot_size = EXCLUDED.snapshot_size,
      blob_size = EXCLUDED.blob_size,
      member_count = EXCLUDED.member_count,
      updated_at = EXCLUDED.updated_at
  `;

    await db.$executeRaw`
    INSERT INTO workspace_doc_view_daily (
      workspace_id, doc_id, date, total_views, unique_views, guest_views, last_accessed_at, updated_at
    )
    VALUES (${workspace.id}, ${docId}, CURRENT_DATE, 3, 2, 1, NOW(), NOW())
    ON CONFLICT (workspace_id, doc_id, date)
    DO UPDATE SET
      total_views = EXCLUDED.total_views,
      unique_views = EXCLUDED.unique_views,
      guest_views = EXCLUDED.guest_views,
      last_accessed_at = EXCLUDED.last_accessed_at,
      updated_at = EXCLUDED.updated_at
  `;

    const dashboardQuery = `
    query AdminDashboard($input: AdminDashboardInput) {
      adminDashboard(input: $input) {
        syncWindow {
          bucket
          requestedSize
          effectiveSize
        }
        storageWindow {
          bucket
          requestedSize
          effectiveSize
        }
        topSharedLinksWindow {
          bucket
          requestedSize
          effectiveSize
        }
        syncActiveUsersTimeline {
          minute
          activeUsers
        }
        workspaceStorageHistory {
          date
          value
        }
      }
    }
  `;

    const result = await gql(dashboardQuery, {
      input: {
        storageHistoryDays: -10,
        syncHistoryHours: -10,
        sharedLinkWindowDays: -10,
      },
    });

    t.falsy(result.errors);
    const dashboard = result.data!.adminDashboard;
    t.is(dashboard.syncWindow.bucket, 'Minute');
    t.is(dashboard.syncWindow.effectiveSize, 1);
    t.is(dashboard.storageWindow.bucket, 'Day');
    t.is(dashboard.storageWindow.effectiveSize, 1);
    t.is(dashboard.topSharedLinksWindow.effectiveSize, 1);
    t.is(dashboard.syncActiveUsersTimeline.length, 1);
    t.is(dashboard.workspaceStorageHistory.length, 1);
  }
);

e2e(
  'Doc analytics and lastAccessedMembers should enforce permissions and privacy',
  async t => {
    const owner = await app.signup();
    const member = await app.create(Mockers.User);
    const staleMember = await app.create(Mockers.User);

    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    await app.create(Mockers.WorkspaceUser, {
      workspaceId: workspace.id,
      userId: member.id,
    });
    await app.create(Mockers.WorkspaceUser, {
      workspaceId: workspace.id,
      userId: staleMember.id,
    });

    const docId = await createPublicDoc({
      workspaceId: workspace.id,
      ownerId: owner.id,
      title: 'page-analytics-doc',
      updatedAt: new Date(),
      publishedAt: new Date(),
    });

    const db = app.get(PrismaClient);
    await ensureAnalyticsTables(db);
    await db.$executeRaw`
    INSERT INTO workspace_doc_view_daily (
      workspace_id, doc_id, date, total_views, unique_views, guest_views, last_accessed_at, updated_at
    )
    VALUES (${workspace.id}, ${docId}, CURRENT_DATE, 9, 5, 2, NOW(), NOW())
    ON CONFLICT (workspace_id, doc_id, date)
    DO UPDATE SET
      total_views = EXCLUDED.total_views,
      unique_views = EXCLUDED.unique_views,
      guest_views = EXCLUDED.guest_views,
      last_accessed_at = EXCLUDED.last_accessed_at,
      updated_at = EXCLUDED.updated_at
  `;

    await db.$executeRaw`
    INSERT INTO workspace_member_last_access (
      workspace_id, user_id, last_accessed_at, last_doc_id, updated_at
    )
    VALUES
      (${workspace.id}, ${owner.id}, NOW(), ${docId}, NOW()),
      (${workspace.id}, ${member.id}, NOW() - interval '1 minute', ${docId}, NOW()),
      (${workspace.id}, ${staleMember.id}, NOW() - interval '8 day', ${docId}, NOW())
    ON CONFLICT (workspace_id, user_id)
    DO UPDATE SET
      last_accessed_at = EXCLUDED.last_accessed_at,
      last_doc_id = EXCLUDED.last_doc_id,
      updated_at = EXCLUDED.updated_at
  `;

    const analyticsQuery = `
    query DocAnalytics($workspaceId: String!, $docId: String!) {
      workspace(id: $workspaceId) {
        doc(docId: $docId) {
          analytics(input: { windowDays: 999 }) {
            window {
              effectiveSize
            }
            series {
              date
              totalViews
            }
            summary {
              totalViews
              uniqueViews
              guestViews
            }
          }
          lastAccessedMembers(
            pagination: { first: 100, offset: 0 }
            includeTotal: true
          ) {
            totalCount
            edges {
              node {
                user {
                  id
                  name
                  avatarUrl
                }
                lastAccessedAt
                lastDocId
              }
            }
          }
        }
      }
    }
  `;

    await app.login(owner);
    const ownerResult = await gql(analyticsQuery, {
      workspaceId: workspace.id,
      docId,
    });

    t.falsy(ownerResult.errors);
    t.is(ownerResult.data!.workspace.doc.analytics.window.effectiveSize, 7);
    t.true(ownerResult.data!.workspace.doc.analytics.series.length > 0);
    t.is(ownerResult.data!.workspace.doc.lastAccessedMembers.totalCount, 2);
    t.is(ownerResult.data!.workspace.doc.lastAccessedMembers.edges.length, 2);
    t.false(
      ownerResult.data!.workspace.doc.lastAccessedMembers.edges.some(
        (edge: { node: { user: { id: string } } }) =>
          edge.node.user.id === staleMember.id
      )
    );

    const malformedMembersCursor = await gql(
      `
      query DocMembersCursor($workspaceId: String!, $docId: String!, $after: String) {
        workspace(id: $workspaceId) {
          doc(docId: $docId) {
            lastAccessedMembers(
              pagination: { first: 10, offset: 0, after: $after }
            ) {
              edges {
                node {
                  user {
                    id
                  }
                }
              }
            }
          }
        }
      }
    `,
      {
        workspaceId: workspace.id,
        docId,
        after: JSON.stringify({
          lastAccessedAt: 'not-a-date',
          userId: owner.id,
        }),
      }
    );

    t.truthy(malformedMembersCursor.errors?.length);
    t.is(malformedMembersCursor.errors![0].extensions.name, 'BAD_REQUEST');

    const privacyQuery = `
    query DocMembersPrivacy($workspaceId: String!, $docId: String!) {
      workspace(id: $workspaceId) {
        doc(docId: $docId) {
          lastAccessedMembers(pagination: { first: 10, offset: 0 }) {
            edges {
              node {
                user {
                  id
                  email
                }
              }
            }
          }
        }
      }
    }
  `;

    const privacyRes = await app
      .POST('/graphql')
      .send({
        query: privacyQuery,
        variables: {
          workspaceId: workspace.id,
          docId,
        },
      })
      .expect(400);
    const privacyResult = privacyRes.body as {
      errors?: Array<{ message: string }>;
    };
    t.truthy(privacyResult.errors?.length);
    t.true(
      privacyResult.errors![0].message.includes(
        'Cannot query field "email" on type "PublicUserType"'
      )
    );

    await app.login(member);
    const memberDeniedRes = await app
      .POST('/graphql')
      .send({
        query: `
      query DocMembersDenied($workspaceId: String!, $docId: String!) {
        workspace(id: $workspaceId) {
          doc(docId: $docId) {
            lastAccessedMembers(pagination: { first: 10, offset: 0 }) {
              edges {
                node {
                  user {
                    id
                  }
                }
              }
            }
          }
        }
      }
    `,
        variables: { workspaceId: workspace.id, docId },
      })
      .expect(200);
    const memberDenied = memberDeniedRes.body as {
      errors?: Array<{ extensions: Record<string, unknown> }>;
    };
    t.truthy(memberDenied.errors?.length);
    t.is(memberDenied.errors![0].extensions.name, 'SPACE_ACCESS_DENIED');
  }
);
