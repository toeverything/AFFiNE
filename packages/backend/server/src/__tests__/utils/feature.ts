import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { UserType } from '../../core/user/types';

@Injectable()
export class WorkspaceResolverMock {
  constructor(private readonly prisma: PrismaClient) {}

  async createWorkspace(user: UserType, _init: null) {
    const workspace = await this.prisma.workspace.create({
      data: {
        accessPolicy: { create: {} },
        members: {
          create: {
            role: 'owner',
            state: 'active',
            userId: user.id,
          },
        },
      },
    });
    return workspace;
  }
}
