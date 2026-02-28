import { Injectable } from '@nestjs/common';
import { PrismaClient, WorkspaceMemberStatus } from '@prisma/client';

import { WorkspaceRole } from '../../core/permission';
import { UserType } from '../../core/user/types';

@Injectable()
export class WorkspaceResolverMock {
  constructor(private readonly prisma: PrismaClient) {}

  async createWorkspace(user: UserType, _init: null) {
    const workspace = await this.prisma.workspace.create({
      data: {
        public: false,
        permissions: {
          create: {
            type: WorkspaceRole.Owner,
            userId: user.id,
            accepted: true,
            status: WorkspaceMemberStatus.Accepted,
          },
        },
      },
    });
    return workspace;
  }
}
