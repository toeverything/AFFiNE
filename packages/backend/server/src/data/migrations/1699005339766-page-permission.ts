import { PrismaService } from '../../prisma';

export class PagePermission1699005339766 {
  // do the migration
  static async up(db: PrismaService) {
    let turn = 0;
    let lastTurnCount = 50;
    const done = new Set<string>();

    while (lastTurnCount === 50) {
      const workspaces = await db.workspace.findMany({
        skip: turn * 50,
        take: 50,
        orderBy: {
          createdAt: 'asc',
        },
      });
      lastTurnCount = workspaces.length;

      for (const workspace of workspaces) {
        if (done.has(workspace.id)) {
          continue;
        }

        const oldPermissions =
          await db.deprecatedUserWorkspacePermission.findMany({
            where: {
              workspaceId: workspace.id,
            },
          });

        for (const oldPermission of oldPermissions) {
          // mark subpage public
          if (oldPermission.subPageId) {
            const existed = await db.workspacePage.findUnique({
              where: {
                workspaceId_pageId: {
                  workspaceId: oldPermission.workspaceId,
                  pageId: oldPermission.subPageId,
                },
              },
            });
            if (!existed) {
              await db.workspacePage.create({
                select: null,
                data: {
                  workspaceId: oldPermission.workspaceId,
                  pageId: oldPermission.subPageId,
                  public: true,
                },
              });
            }
          } else if (oldPermission.userId) {
            // workspace user permission
            const existed = await db.workspaceUserPermission.findUnique({
              where: {
                id: oldPermission.id,
              },
            });

            if (!existed) {
              await db.workspaceUserPermission
                .create({
                  select: null,
                  data: {
                    // this id is used at invite email, should keep
                    id: oldPermission.id,
                    workspaceId: oldPermission.workspaceId,
                    userId: oldPermission.userId,
                    type: oldPermission.type,
                    accepted: oldPermission.accepted,
                  },
                })
                .catch(() => {
                  // duplicated
                });
            }
          } else {
            // ignore wrong data
          }
        }

        done.add(workspace.id);
      }

      turn++;
    }
  }

  // revert the migration
  static async down(db: PrismaService) {
    await db.workspaceUserPermission.deleteMany({});
    await db.workspacePageUserPermission.deleteMany({});
  }
}
