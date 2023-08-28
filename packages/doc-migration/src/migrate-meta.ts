/**
 * Migrate YDoc from version 0.6.0 to 0.8.0
 */

import { prismaNewService, prismaOldService } from './prisma';

await prismaOldService.connect();
await prismaNewService.connect();

const prismaOldClient = prismaOldService.getClient();
const prismaNewClient = prismaNewService.getClient();

const users = await prismaOldClient.users.findMany();
await prismaNewClient.user.createMany({
  data: users.map(user => {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.created_at || new Date(),
      ...(user.avatar_url ? { avatarUrl: user.avatar_url } : {}),
    };
  }),
});

const workspaces = await prismaOldClient.workspaces.findMany({
  select: {
    id: true,
    public: true,
    created_at: true,
  },
});

await prismaNewClient.workspace.createMany({
  data: workspaces.map(workspace => {
    return {
      id: workspace.id,
      public: workspace.public,
      createdAt: workspace.created_at || new Date(),
    };
  }),
});

const permissions = await prismaOldClient.permissions.findMany();

await prismaNewClient.userWorkspacePermission.createMany({
  data: permissions.map(permission => {
    return {
      id: permission.id,
      workspaceId: permission.workspace_id,
      type: permission.type,
      accepted: permission.accepted,
      createdAt: permission.created_at || new Date(),
      ...(permission.user_id ? { userId: permission.user_id } : {}),
    };
  }),
});

await prismaOldService.disconnect();
await prismaNewService.disconnect();
