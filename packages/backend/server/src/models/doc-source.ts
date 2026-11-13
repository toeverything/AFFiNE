import type { WorkspaceDoc } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { BadRequest } from '../base';

export type DocInfoRow = Pick<
  WorkspaceDoc,
  | 'workspaceId'
  | 'docId'
  | 'mode'
  | 'title'
  | 'summary'
  | 'blocked'
  | 'publishedAt'
> & {
  public: boolean;
  defaultRolePolicy: string;
  createdAt: Date;
  updatedAt: Date;
  creatorId: string | null;
  lastUpdaterId: string | null;
};

export function workspaceDocSources(workspaceId: string, docIds?: string[]) {
  const selectedIds =
    docIds === undefined
      ? Prisma.empty
      : Prisma.sql`selected_doc_ids AS (SELECT jsonb_array_elements_text(${JSON.stringify(docIds)}::jsonb) AS doc_id),`;
  const ids =
    docIds === undefined
      ? Prisma.empty
      : Prisma.sql`AND guid IN (SELECT doc_id FROM selected_doc_ids)`;
  return Prisma.sql`WITH ${selectedIds} doc_sources AS (
    SELECT workspace_id,doc_id,min(created_at) AS created_at,max(updated_at) AS updated_at,
      (array_agg(created_by ORDER BY created_at) FILTER (WHERE created_by IS NOT NULL))[1] AS created_by,
      (array_agg(updated_by ORDER BY updated_at DESC) FILTER (WHERE updated_by IS NOT NULL))[1] AS updated_by
    FROM (
      SELECT workspace_id,guid AS doc_id,created_at,updated_at,created_by,updated_by FROM snapshots WHERE workspace_id=${workspaceId} ${ids}
      UNION ALL SELECT workspace_id,guid,created_at,created_at,created_by,created_by FROM updates WHERE workspace_id=${workspaceId} ${ids}
    ) records GROUP BY workspace_id,doc_id
  )`;
}

export const docInfoProjection = Prisma.sql`SELECT source.workspace_id AS "workspaceId",source.doc_id AS "docId",
  COALESCE(workspace_pages.mode,0) AS mode, workspace_pages.title,workspace_pages.summary,COALESCE(workspace_pages.blocked,false) AS blocked,workspace_pages.published_at AS "publishedAt",
  COALESCE(policy.visibility='public' AND policy.public_role='external' AND policy.published_at IS NOT NULL AND workspace_pages.published_at IS NOT NULL,false) AS public,
  COALESCE(policy.member_default_role,'manager') AS "defaultRolePolicy",
  source.created_at AS "createdAt",source.updated_at AS "updatedAt",source.created_by AS "creatorId",source.updated_by AS "lastUpdaterId"
  FROM doc_sources source
  LEFT JOIN workspace_pages ON workspace_pages.workspace_id=source.workspace_id AND workspace_pages.page_id=source.doc_id
  LEFT JOIN doc_access_policies policy ON policy.workspace_id=source.workspace_id AND policy.doc_id=source.doc_id
  WHERE workspace_pages.lifecycle_state IS DISTINCT FROM 'deleted'`;

export function parseDocCursor(cursor: string) {
  let value: unknown;
  try {
    value = cursor.startsWith('[') ? JSON.parse(cursor) : [cursor, null];
  } catch {
    throw new BadRequest('Invalid document pagination cursor');
  }
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== 'string' ||
    (value[1] !== null && typeof value[1] !== 'string')
  )
    throw new BadRequest('Invalid document pagination cursor');
  const timestamp = new Date(value[0]);
  if (Number.isNaN(timestamp.getTime()))
    throw new BadRequest('Invalid document pagination cursor');
  return { timestamp, docId: typeof value[1] === 'string' ? value[1] : null };
}
