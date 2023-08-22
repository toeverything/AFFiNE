import type { Doc } from 'yjs';

import { PrismaClient as PrismaClientNew } from '../../prisma-generated/clientNew';

class PrismaNewService {
  private prismaClient!: PrismaClientNew;

  public getInstance() {
    if (!this.prismaClient) {
      this.prismaClient = new PrismaClientNew();
      this.prismaClient.$connect();
    }
    return this.prismaClient;
  }

  public async insertYDoc(workspaceId: string, guid: string, blob: Uint8Array) {
    await this.prismaClient.update.create({
      data: {
        id: guid,
        workspaceId,
        blob: Buffer.from(blob),
      },
    });
  }
}

class PrismaOldService {
  public async getYDocs(): Promise<Doc[]> {
    return [];
  }
}

export const prismaNewService = new PrismaNewService();
export const prismOldService = new PrismaOldService();
