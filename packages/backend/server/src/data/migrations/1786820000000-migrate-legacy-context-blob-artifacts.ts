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
    const runtime = injector.get(BackendRuntimeProvider, { strict: false });
    const blobs = await db.$queryRaw<LegacyContextBlob[]>`
      SELECT DISTINCT
        session.workspace_id AS "workspaceId",
        blob.key AS "blobId",
        blob.mime AS "mimeType"
      FROM ai_contexts context
      JOIN ai_sessions_metadata session ON session.id = context.session_id
      JOIN blobs blob
        ON blob.workspace_id = session.workspace_id
       AND blob.deleted_at IS NULL
       AND blob.status = 'completed'
      WHERE jsonb_path_exists(
        context.config::jsonb,
        '$.** ? (@ == $blobKey)',
        jsonb_build_object('blobKey', to_jsonb(blob.key::text))
      )
        AND NOT EXISTS (
          SELECT 1
          FROM workspace_artifacts artifact
          WHERE artifact.workspace_id = session.workspace_id
            AND artifact.storage_scope = 'blob'
            AND artifact.storage_key = concat(session.workspace_id, '/', blob.key)
            AND artifact.status = 'ready'
        )
      ORDER BY session.workspace_id, blob.key
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
