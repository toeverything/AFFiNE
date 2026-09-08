import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { BackendRuntimeProvider } from '../../core/backend-runtime';

type LegacyContextBlob = {
  workspaceId: string;
  blobId: string;
  mimeType: string;
};

/**
 * Convert the last product-owned references to workspace blobs into the
 * artifact retention fact before the legacy context tables are removed.
 *
 * The runtime admission path is intentional here: a database row alone does
 * not prove that the object still exists or that its metadata is truthful.
 */
export class MigrateLegacyContextBlobArtifacts1786820000000 {
  static async up(db: PrismaClient, injector: ModuleRef) {
    const tables = await db.$queryRaw<
      Array<{
        contexts: string | null;
        sessions: string | null;
        blobs: string | null;
        artifacts: string | null;
      }>
    >`
      SELECT
        to_regclass('public.ai_contexts')::text AS contexts,
        to_regclass('public.ai_sessions_metadata')::text AS sessions,
        to_regclass('public.blobs')::text AS blobs,
        to_regclass('public.workspace_artifacts')::text AS artifacts
    `;

    if (!Object.values(tables[0] ?? {}).every(Boolean)) {
      return;
    }

    const runtime = injector.get(BackendRuntimeProvider, { strict: false });
    const blobs = await db.$queryRaw<LegacyContextBlob[]>`
      WITH referenced_blobs AS (
        SELECT DISTINCT
          session.workspace_id,
          value #>> '{}' AS blob_key
        FROM ai_contexts context
        JOIN ai_sessions_metadata session ON session.id = context.session_id
        CROSS JOIN LATERAL jsonb_path_query(
          context.config::jsonb,
          '$.** ? (@.type() == "string")'
        ) AS referenced_value(value)
      )
      SELECT
        referenced.workspace_id AS "workspaceId",
        blob.key AS "blobId",
        blob.mime AS "mimeType"
      FROM referenced_blobs referenced
      JOIN blobs blob
        ON blob.workspace_id = referenced.workspace_id
       AND blob.key = referenced.blob_key
       AND blob.deleted_at IS NULL
       AND blob.status = 'completed'
      WHERE NOT EXISTS (
        SELECT 1
        FROM workspace_artifacts artifact
        WHERE artifact.workspace_id = referenced.workspace_id
          AND artifact.storage_scope = 'blob'
          AND artifact.storage_key = concat(referenced.workspace_id, '/', blob.key)
          AND artifact.status = 'ready'
      )
      ORDER BY referenced.workspace_id, blob.key
    `;

    for (const blob of blobs) {
      await runtime.ensureWorkspaceBlobArtifact({
        workspaceId: blob.workspaceId,
        blobId: blob.blobId,
        mimeType: blob.mimeType,
        libraryOwned: false,
      });
    }
  }

  static async down(_db: PrismaClient, _injector: ModuleRef) {}
}
