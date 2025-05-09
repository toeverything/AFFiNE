import type { Prisma, WorkspaceUserRole } from '@prisma/client';

import { WorkspaceMemberStatus, WorkspaceRole } from '../../models';
import { Mocker } from './factory';

export type MockWorkspaceUserInput = Omit<
  Prisma.WorkspaceUserRoleUncheckedCreateInput,
  'type'
> & {
  type?: WorkspaceRole;
};

export class MockWorkspaceUser extends Mocker<
  MockWorkspaceUserInput,
  WorkspaceUserRole
> {
  override async create(input: MockWorkspaceUserInput) {
    return await this.db.workspaceUserRole.create({
      data: {
        type: WorkspaceRole.Collaborator,
        status: WorkspaceMemberStatus.Accepted,
        ...input,
      },
    });
  }
}
