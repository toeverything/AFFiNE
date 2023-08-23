import { applyUpdate, Doc } from 'yjs';

import { PrismaClient as PrismaClientNew } from '../../prisma-generated/clientNew';
import { PrismaClient as PrismaClientOld } from '../../prisma-generated/clientOld';
import { PrismaClient as PrismaClientOldBinary } from '../../prisma-generated/clientOldBinary';
import type { DocType } from './type';

class PrismaNewService {
  private prismaClient: PrismaClientNew;

  constructor() {
    this.prismaClient = new PrismaClientNew();
    this.prismaClient.$connect();
  }

  public async insertYDoc(
    workspaceId: string,
    guid: string,
    blob: Uint8Array,
    createdAt: Date
  ) {
    await this.prismaClient.update.create({
      data: {
        id: guid,
        workspaceId,
        blob: Buffer.from(blob),
        createdAt,
      },
    });
  }

  public getClient() {
    return this.prismaClient;
  }

  public dispose() {
    this.prismaClient.$disconnect();
  }
}

class PrismaOldService {
  private prismaClient!: PrismaClientOld;
  private prismaClientBinary!: PrismaClientOldBinary;

  constructor() {
    this.prismaClient = new PrismaClientOld();
    this.prismaClientBinary = new PrismaClientOldBinary();
    this.prismaClient.$connect();
    this.prismaClientBinary.$connect();
  }

  public async getYDocs(): Promise<DocType[]> {
    const docs: DocType[] = [];
    const results = await this.prismaClientBinary.docs.findMany({
      select: {
        workspace: true,
        blob: true,
        timestamp: true,
      },
    });
    results.forEach(result => {
      const doc = new Doc();
      applyUpdate(doc, result.blob);
      docs.push({
        workspaceId: result.workspace,
        doc,
        createdAt: result.timestamp,
      });
    });

    return docs;
  }

  public getClient() {
    return this.prismaClient;
  }

  public getClientBinary() {
    return this.prismaClientBinary;
  }

  public dispose() {
    this.prismaClient.$disconnect();
    this.prismaClientBinary.$disconnect();
  }
}

export const prismaNewService = new PrismaNewService();
export const prismOldService = new PrismaOldService();
