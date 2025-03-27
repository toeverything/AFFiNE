import { faker } from '@faker-js/faker';
import type { Prisma, Workspace } from '@prisma/client';
import { omit } from 'lodash-es';

import { WorkspaceRole } from '../../models';
import { Mocker } from './factory';

export type MockWorkspaceInput = Prisma.WorkspaceCreateInput & {
  owner?: { id: string };
};

export type MockedWorkspace = Workspace;

export class MockWorkspace extends Mocker<MockWorkspaceInput, MockedWorkspace> {
  override async create(input?: Partial<MockWorkspaceInput>) {
    const owner = input?.owner;
    input = omit(input, 'owner');
    return await this.db.workspace.create({
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
  }
}
