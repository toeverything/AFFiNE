import type { WorkspaceDocUserRole } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { Mocker } from './factory';

export type MockDocUserInput = Prisma.WorkspaceDocUserRoleUncheckedCreateInput;

export type MockedDocUser = WorkspaceDocUserRole;

export class MockDocUser extends Mocker<MockDocUserInput, MockedDocUser> {
  override async create(input: MockDocUserInput) {
    return await this.db.workspaceDocUserRole.create({
      data: input,
    });
  }
}
