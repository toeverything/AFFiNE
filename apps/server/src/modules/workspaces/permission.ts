import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma';
import { Permission } from './types';

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async get(ws: string, user: string) {
    const data = await this.prisma.userWorkspacePermission.findFirst({
      where: {
        workspaceId: ws,
        userId: user,
        accepted: true,
      },
    });

    return data?.type as Permission;
  }

  async check(
    ws: string,
    user: string,
    permission: Permission = Permission.Read
  ) {
    if (!(await this.tryCheck(ws, user, permission))) {
      throw new ForbiddenException('Permission denied');
    }
  }

  async tryCheck(
    ws: string,
    user: string,
    permission: Permission = Permission.Read
  ) {
    const data = await this.prisma.userWorkspacePermission.count({
      where: {
        workspaceId: ws,
        userId: user,
        accepted: true,
        type: {
          gte: permission,
        },
      },
    });

    if (data > 0) {
      return true;
    }

    // If the permission is read, we should check if the workspace is public
    if (permission === Permission.Read) {
      const data = await this.prisma.workspace.count({
        where: { id: ws, public: true },
      });

      return data > 0;
    }

    return false;
  }

  async grant(
    ws: string,
    user: string,
    permission: Permission = Permission.Read
  ) {
    const data = await this.prisma.userWorkspacePermission.findFirst({
      where: {
        workspaceId: ws,
        userId: user,
        accepted: true,
      },
    });

    if (data) {
      const [p] = await this.prisma.$transaction(
        [
          this.prisma.userWorkspacePermission.update({
            where: {
              id: data.id,
            },
            data: {
              type: permission,
            },
          }),

          // If the new permission is owner, we need to revoke old owner
          permission === Permission.Owner
            ? this.prisma.userWorkspacePermission.updateMany({
                where: {
                  workspaceId: ws,
                  type: Permission.Owner,
                  userId: {
                    not: user,
                  },
                },
                data: {
                  type: Permission.Admin,
                },
              })
            : null,
        ].filter(Boolean) as Prisma.PrismaPromise<any>[]
      );

      return p;
    }

    return this.prisma.userWorkspacePermission.create({
      data: {
        workspaceId: ws,
        userId: user,
        type: permission,
      },
    });
  }

  async revoke(ws: string, user: string) {
    const result = await this.prisma.userWorkspacePermission.deleteMany({
      where: {
        workspaceId: ws,
        userId: user,
        type: {
          // We shouldn't revoke owner permission, should auto deleted by workspace/user delete cascading
          not: Permission.Owner,
        },
      },
    });

    return result.count > 0;
  }
}
