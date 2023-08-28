/**
 * Migrate YDoc from version 0.6.0 to 0.8.0
 */

import { prismaNewService, prismaOldService } from './prisma';
import { step } from './util';

await prismaOldService.connect();
await prismaNewService.connect();

const prismaOldClientBinary = prismaOldService.getClientBinary();
const prismaNewClient = prismaNewService.getClient();

const blobsCount = await prismaOldClientBinary.blobs.count();
console.log(`blobsCount: ${blobsCount}`);
for (let i = 0; i < blobsCount; i += step) {
  const blobs: {
    workspace: string;
    hash: string;
    blob: Buffer;
    length: bigint;
    timestamp: Date;
  }[] = [];
  blobs.push(
    ...(await prismaOldClientBinary.blobs.findMany({
      skip: i,
      take: step,
      select: {
        workspace: true,
        hash: true,
        blob: true,
        length: true,
        timestamp: true,
      },
    }))
  );

  console.log(`retrieved ${i} blob record`);
  try {
    await prismaNewClient.blob.createMany({
      data: blobs.map(blob => {
        return {
          workspaceId: blob.workspace,
          hash: blob.hash,
          blob: blob.blob,
          length: blob.length,
          createdAt: blob.timestamp,
        };
      }),
    });
  } catch (e) {
    console.error(e);
  }
  console.log(`saved ${i + step} blob record`);
}

await prismaOldService.disconnect();
await prismaNewService.disconnect();
