import { Injectable } from '@nestjs/common';

import { BaseModel } from './base';

export type WorkspaceRuntimeState = {
  workspaceId: string;
  known: boolean;
  stale: boolean;
  readonly: boolean;
  readonlyReasons: string[];
  updatedAt: Date | null;
  lastReconciledAt: Date | null;
  staleAfter: Date | null;
};

type WorkspaceRuntimeStateRow = {
  workspaceId: string;
  known: boolean;
  readonly: boolean;
  readonlyReasons: string[];
  updatedAt: Date;
  lastReconciledAt: Date | null;
  staleAfter: Date | null;
};

type LegacyWorkspaceRuntimeStateRow = {
  workspaceId: string;
  readonly: boolean;
  readonlyReasons: string[];
  updatedAt: Date;
  staleAt: Date | null;
};

function isMissingRuntimeStateColumn(error: unknown) {
  const meta = (error as { meta?: { code?: string } })?.meta;
  return meta?.code === '42703';
}

@Injectable()
export class WorkspaceRuntimeStateModel extends BaseModel {
  private hasCurrentColumns?: Promise<boolean>;

  async get(workspaceId: string): Promise<WorkspaceRuntimeState> {
    const rows = await this.loadRows(workspaceId);
    const row = rows[0];

    if (!row) {
      return {
        workspaceId,
        known: false,
        stale: true,
        readonly: false,
        readonlyReasons: [],
        updatedAt: null,
        lastReconciledAt: null,
        staleAfter: null,
      };
    }

    return {
      workspaceId,
      known: row.known,
      stale:
        !row.known || (row.staleAfter !== null && row.staleAfter <= new Date()),
      readonly: row.readonly,
      readonlyReasons: row.readonlyReasons,
      updatedAt: row.updatedAt,
      lastReconciledAt: row.lastReconciledAt,
      staleAfter: row.staleAfter,
    };
  }

  async upsert(
    workspaceId: string,
    state: {
      readonly: boolean;
      readonlyReasons: string[];
      known?: boolean;
      lastReconciledAt?: Date | null;
      staleAfter?: Date | null;
    }
  ) {
    if (await this.supportsCurrentRuntimeStateColumns()) {
      await this.upsertCurrent(workspaceId, state);
    } else {
      await this.upsertLegacy(workspaceId, state);
    }
  }

  private async loadRows(workspaceId: string) {
    if (!(await this.supportsCurrentRuntimeStateColumns())) {
      return await this.loadLegacyRows(workspaceId);
    }

    try {
      return await this.db.$queryRaw<WorkspaceRuntimeStateRow[]>`
        SELECT
          workspace_id AS "workspaceId",
          known,
          readonly,
          readonly_reasons AS "readonlyReasons",
          updated_at AS "updatedAt",
          last_reconciled_at AS "lastReconciledAt",
          stale_after AS "staleAfter"
        FROM workspace_runtime_states
        WHERE workspace_id = ${workspaceId}
        LIMIT 1
      `;
    } catch (error) {
      if (!isMissingRuntimeStateColumn(error)) {
        throw error;
      }
      return await this.loadLegacyRows(workspaceId);
    }
  }

  private async supportsCurrentRuntimeStateColumns() {
    this.hasCurrentColumns ??= this.db.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'workspace_runtime_states'
            AND column_name = 'known'
        ) AS "exists"
      `.then(rows => rows[0]?.exists ?? false);
    return await this.hasCurrentColumns;
  }

  private async loadLegacyRows(workspaceId: string) {
    const rows = await this.db.$queryRaw<LegacyWorkspaceRuntimeStateRow[]>`
      SELECT
        workspace_id AS "workspaceId",
        readonly,
        readonly_reasons AS "readonlyReasons",
        updated_at AS "updatedAt",
        stale_at AS "staleAt"
      FROM workspace_runtime_states
      WHERE workspace_id = ${workspaceId}
      LIMIT 1
    `;
    return rows.map(row => ({
      workspaceId: row.workspaceId,
      known: true,
      readonly: row.readonly,
      readonlyReasons: row.readonlyReasons,
      updatedAt: row.updatedAt,
      lastReconciledAt: row.updatedAt,
      staleAfter: row.staleAt,
    }));
  }

  private async upsertCurrent(
    workspaceId: string,
    state: {
      readonly: boolean;
      readonlyReasons: string[];
      known?: boolean;
      lastReconciledAt?: Date | null;
      staleAfter?: Date | null;
    }
  ) {
    await this.db.$executeRaw`
        INSERT INTO workspace_runtime_states (
          workspace_id,
          known,
          readonly,
          readonly_reasons,
          last_reconciled_at,
          stale_after,
          updated_at
        )
        VALUES (
          ${workspaceId},
          ${state.known ?? true},
          ${state.readonly},
          ${state.readonlyReasons},
          ${state.lastReconciledAt ?? new Date()},
          ${state.staleAfter ?? null},
          now()
        )
        ON CONFLICT (workspace_id)
        DO UPDATE SET
          known = EXCLUDED.known,
          readonly = EXCLUDED.readonly,
          readonly_reasons = EXCLUDED.readonly_reasons,
          last_reconciled_at = EXCLUDED.last_reconciled_at,
          stale_after = EXCLUDED.stale_after,
          updated_at = now()
      `;
  }

  private async upsertLegacy(
    workspaceId: string,
    state: {
      readonly: boolean;
      readonlyReasons: string[];
      staleAfter?: Date | null;
    }
  ) {
    await this.db.$executeRaw`
        INSERT INTO workspace_runtime_states (
          workspace_id,
          readonly,
          readonly_reasons,
          stale_at,
          updated_at
        )
        VALUES (
          ${workspaceId},
          ${state.readonly},
          ${state.readonlyReasons},
          ${state.staleAfter ?? null},
          now()
        )
        ON CONFLICT (workspace_id)
        DO UPDATE SET
          readonly = EXCLUDED.readonly,
          readonly_reasons = EXCLUDED.readonly_reasons,
          stale_at = EXCLUDED.stale_at,
          updated_at = now()
      `;
  }
}
