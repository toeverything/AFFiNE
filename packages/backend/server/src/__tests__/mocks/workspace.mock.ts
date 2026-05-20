import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { faker } from '@faker-js/faker';
import type { Prisma, Workspace } from '@prisma/client';
import { omit } from 'lodash-es';

import { WorkspaceRole } from '../../models';
import { Mocker } from './factory';

export type MockWorkspaceInput = Prisma.WorkspaceCreateInput & {
  owner?: { id: string };
  snapshot?: Uint8Array | true;
};

export type MockedWorkspace = Workspace;

export class MockWorkspace extends Mocker<MockWorkspaceInput, MockedWorkspace> {
  override async create(input?: Partial<MockWorkspaceInput>) {
    const owner = input?.owner;
    if (input?.snapshot === true) {
      const snapshot = await readFile(
        path.join(
          import.meta.dirname,
          '../__fixtures__/test-root-doc.snapshot.bin'
        )
      );
      input.snapshot = snapshot;
    }
    const snapshot = input?.snapshot;
    input = omit(input, 'owner', 'snapshot');
    const workspace = await this.db.workspace.create({
      data: {
        name: faker.animal.cat(),
        public: false,
        ...input,
        permissions: owner
          ? {
              create: {
                userId: owner.id,
                type: WorkspaceRole.Owner,
                status: 'Accepted',
              },
            }
          : undefined,
      },
    });
    const runtimeStateColumns = await this.db.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'workspace_runtime_states'
          AND column_name = 'known'
      ) AS "exists"
    `;
    if (runtimeStateColumns[0]?.exists) {
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
        VALUES (${workspace.id}, true, false, ARRAY[]::TEXT[], now(), NULL, now())
        ON CONFLICT (workspace_id)
        DO UPDATE SET
          known = true,
          readonly = false,
          readonly_reasons = ARRAY[]::TEXT[],
          last_reconciled_at = now(),
          stale_after = NULL,
          updated_at = now()
      `;
    } else {
      await this.db.$executeRaw`
        INSERT INTO workspace_runtime_states (
          workspace_id,
          readonly,
          readonly_reasons,
          stale_at,
          updated_at
        )
        VALUES (${workspace.id}, false, ARRAY[]::TEXT[], NULL, now())
        ON CONFLICT (workspace_id)
        DO UPDATE SET
          readonly = false,
          readonly_reasons = ARRAY[]::TEXT[],
          stale_at = NULL,
          updated_at = now()
      `;
    }

    // create a rootDoc snapshot
    if (snapshot) {
      await this.db.snapshot.create({
        data: {
          id: workspace.id,
          workspaceId: workspace.id,
          blob: snapshot,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: owner?.id,
          updatedBy: owner?.id,
        },
      });
    }
    return workspace;
  }
}
