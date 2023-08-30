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
        subPageId: null,
        userId: user,
        accepted: true,
      },
    });

    return data?.type as Permission;
  }

  async isAccessible(ws: string, id: string, user?: string): Promise<boolean> {
    if (user) {
      return await this.tryCheck(ws, user);
    } else {
      // check if this is a public workspace
      const count = await this.prisma.workspace.count({
        where: { id: ws, public: true },
      });
      if (count > 0) {
        return true;
      }

      // check whether this is a public subpage
      const workspace = await this.prisma.userWorkspacePermission.findMany({
        where: {
          workspaceId: ws,
          userId: null,
        },
      });
      const subpages = workspace
        .map(ws => ws.subPageId)
        .filter((v): v is string => !!v);
      if (subpages.length > 0 && ws === id) {
        // rootDoc is always accessible when there is a public subpage
        return true;
      } else {
        // check if this is a public subpage
        return subpages.map(page => `space:${page}`).includes(id);
      }
    }
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
    // If the permission is read, we should check if the workspace is public
    if (permission === Permission.Read) {
      const data = await this.prisma.workspace.count({
        where: { id: ws, public: true },
      });

      if (data > 0) {
        return true;
      }
    }

    const data = await this.prisma.userWorkspacePermission.count({
      where: {
        workspaceId: ws,
        subPageId: null,
        userId: user,
        accepted: true,
        type: {
          gte: permission,
        },
      },
    });

    return data > 0;
  }

  async grant(
    ws: string,
    user: string,
    permission: Permission = Permission.Read
  ): Promise<string> {
    const data = await this.prisma.userWorkspacePermission.findFirst({
      where: {
        workspaceId: ws,
        subPageId: null,
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

      return p.id;
    }

    return this.prisma.userWorkspacePermission
      .create({
        data: {
          workspaceId: ws,
          subPageId: null,
          userId: user,
          type: permission,
        },
      })
      .then(p => p.id);
  }

  async acceptById(ws: string, id: string) {
    const result = await this.prisma.userWorkspacePermission.updateMany({
      where: {
        id,
        workspaceId: ws,
      },
      data: {
        accepted: true,
      },
    });

    return result.count > 0;
  }

  async accept(ws: string, user: string) {
    const result = await this.prisma.userWorkspacePermission.updateMany({
      where: {
        workspaceId: ws,
        subPageId: null,
        userId: user,
        accepted: false,
      },
      data: {
        accepted: true,
      },
    });

    return result.count > 0;
  }

  async revoke(ws: string, user: string) {
    const result = await this.prisma.userWorkspacePermission.deleteMany({
      where: {
        workspaceId: ws,
        subPageId: null,
        userId: user,
        type: {
          // We shouldn't revoke owner permission, should auto deleted by workspace/user delete cascading
          not: Permission.Owner,
        },
      },
    });

    return result.count > 0;
  }

  async isPageAccessible(ws: string, page: string, user?: string) {
    const data = await this.prisma.userWorkspacePermission.findFirst({
      where: {
        workspaceId: ws,
        subPageId: page,
        userId: user,
      },
    });

    return data?.accepted || false;
  }

  async grantPage(
    ws: string,
    page: string,
    user?: string,
    permission: Permission = Permission.Read
  ) {
    const data = await this.prisma.userWorkspacePermission.findFirst({
      where: {
        workspaceId: ws,
        subPageId: page,
        userId: user,
      },
    });

    if (data) {
      return data.accepted;
    }

    return this.prisma.userWorkspacePermission
      .create({
        data: {
          workspaceId: ws,
          subPageId: page,
          userId: user,
          // if provide user id, user need to accept the invitation
          accepted: user ? false : true,
          type: permission,
        },
      })
      .then(ret => ret.accepted);
  }

  async revokePage(ws: string, page: string, user?: string) {
    const result = await this.prisma.userWorkspacePermission.deleteMany({
      where: {
        workspaceId: ws,
        subPageId: page,
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
