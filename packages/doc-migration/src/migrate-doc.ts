/**
 * Migrate YDoc from version 0.6.0 to 0.8.0
 */

import { prismaNewService, prismaOldService } from './prisma';
import { saveMigratedDocToSnapshot, upgradeYDoc } from './util';

await prismaOldService.connect();
await prismaNewService.connect();

const prismaOldClient = prismaOldService.getClient();

const workspaceIds = await prismaOldClient.workspaces.findMany({
  select: {
    id: true,
    created_at: true,
  },
  orderBy: {
    created_at: 'asc',
  },
});

console.log(`workspaceIds found: ${workspaceIds.length}`);

for (let i = 0; i < workspaceIds.length; i++) {
  const { id: workspaceId, created_at: createdAt } = workspaceIds[i];
  console.log(
    `dealing ${i}'s workspace: ${workspaceId}, createdAt: ${createdAt}`
  );
  try {
    const { doc, updatedAt, createdAt } =
      await prismaOldService.getYDoc(workspaceId);
    const migratedDoc = upgradeYDoc(doc);
    migratedDoc.guid = workspaceId;
    await saveMigratedDocToSnapshot(workspaceId, migratedDoc, createdAt, updatedAt);
  } catch (e) {
    console.error(`workspaceId: ${workspaceId} update and save failed`, e);
  }
}

await prismaOldService.disconnect();
await prismaNewService.disconnect();
