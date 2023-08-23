/**
 * Migrate YDoc from version 0.6.0 to 0.8.0
 */

import { prismaNewService, prismOldService } from './prisma';
import { saveMigratedDoc, upgradeYDoc } from './util';

await prismOldService.connect();
await prismaNewService.connect();

const docs = await prismOldService.getYDocs();

for (const { workspaceId, doc, createdAt } of docs) {
  const migratedDoc = upgradeYDoc(doc);
  await saveMigratedDoc(workspaceId, migratedDoc, createdAt);
}

const prismaOldClient = prismOldService.getClient();
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

await prismOldService.disconnect();
await prismaNewService.disconnect();
