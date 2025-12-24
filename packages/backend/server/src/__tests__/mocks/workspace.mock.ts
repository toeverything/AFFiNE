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
