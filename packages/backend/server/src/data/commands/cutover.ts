import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

interface CutoverValidationResult {
  normalizedUnsignedSelfhostEntitlements: number;
  ownerlessWorkspaces: number;
  activeUnsignedSelfhostEntitlements: number;
}

@Injectable()
export class CutoverCommand {
  private readonly logger = new Logger(CutoverCommand.name);

  constructor(private readonly db: PrismaClient) {}

  async execute(
    deployment: 'cloud' | 'selfhosted' = env.selfhosted ? 'selfhosted' : 'cloud'
  ): Promise<CutoverValidationResult> {
    const result = await this.db.$transaction(
      async tx => {
        await tx.$queryRaw`
          SELECT 1 AS locked
          FROM (
            SELECT pg_advisory_xact_lock(
              hashtextextended('canonical-authority-cutover', 0)
            )
          ) lock
        `;

        const normalizedUnsignedSelfhostEntitlements =
          deployment === 'selfhosted'
            ? await tx.$executeRaw`
                UPDATE entitlements
                SET status = 'needs_reupload', updated_at = clock_timestamp()
                WHERE source = 'selfhost_license'
                  AND signed_payload IS NULL
                  AND status IN ('active', 'grace')
              `
            : 0;
        const [validation] = await tx.$queryRaw<
          Array<
            Omit<
              CutoverValidationResult,
              'normalizedUnsignedSelfhostEntitlements'
            >
          >
        >`
          SELECT
            (
              SELECT count(*)::int
              FROM workspaces workspace
              WHERE NOT EXISTS (
                SELECT 1
                FROM workspace_members member
                WHERE member.workspace_id = workspace.id
                  AND member.role = 'owner'
                  AND member.state = 'active'
              )
            ) AS "ownerlessWorkspaces",
            (
              SELECT count(*)::int
              FROM entitlements
              WHERE ${deployment} = 'selfhosted'
                AND source = 'selfhost_license'
                AND signed_payload IS NULL
                AND status IN ('active', 'grace')
            ) AS "activeUnsignedSelfhostEntitlements"
        `;

        if (!validation) {
          throw new Error('Canonical cutover validation returned no result.');
        }

        const result = {
          normalizedUnsignedSelfhostEntitlements,
          ...validation,
        };
        const failures = Object.entries(result).filter(
          ([name, count]) => !name.startsWith('normalized') && count !== 0
        );
        if (failures.length > 0) {
          throw new Error(
            `Canonical cutover validation failed: ${failures
              .map(([name, count]) => `${name}=${count}`)
              .join(', ')}`
          );
        }

        await tx.$executeRaw`
          CREATE TABLE IF NOT EXISTS storage_reconciliation_checkpoints (
            kind TEXT NOT NULL,
            scope TEXT NOT NULL,
            status TEXT NOT NULL,
            cursor JSONB NOT NULL DEFAULT '{}',
            last_key TEXT,
            last_sid INTEGER,
            completed_at TIMESTAMPTZ(3),
            updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            metadata JSONB NOT NULL DEFAULT '{}',
            PRIMARY KEY (kind, scope)
          )
        `;

        await tx.$executeRaw`
          INSERT INTO storage_reconciliation_checkpoints (
            kind,
            scope,
            status,
            completed_at,
            updated_at,
            metadata
          )
          VALUES (
            'schema_baseline_0275',
            'global',
            'completed',
            clock_timestamp(),
            clock_timestamp(),
            jsonb_build_object(
              'baselineVersion',
              '0.27.5',
              'deployment',
              ${deployment}::text
            )
          )
          ON CONFLICT (kind, scope) DO UPDATE SET
            status = EXCLUDED.status,
            completed_at = EXCLUDED.completed_at,
            updated_at = EXCLUDED.updated_at,
            metadata = EXCLUDED.metadata
        `;

        return result;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 30_000,
        timeout: 60_000,
      }
    );

    this.logger.log(
      `Canonical cutover validation passed for ${deployment}; normalized ${result.normalizedUnsignedSelfhostEntitlements} unsigned self-hosted entitlements.`
    );
    return result;
  }
}
