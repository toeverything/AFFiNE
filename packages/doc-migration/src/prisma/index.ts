import { applyUpdate, Doc } from 'yjs';

import { PrismaClient as PrismaClientNew } from '../../prisma-generated/clientNew';
import { PrismaClient as PrismaClientOld } from '../../prisma-generated/clientOld';
import { PrismaClient as PrismaClientOldBinary } from '../../prisma-generated/clientOldBinary';
import type { DocSnapshot } from './type';

class PrismaNewService {
  private prismaClient: PrismaClientNew;

  constructor() {
    this.prismaClient = new PrismaClientNew();
  }

  public async insertYDocToSnapshot(
    workspaceId: string,
    guid: string,
    blob: Uint8Array,
    createdAt: Date,
    updatedAt: Date
  ) {
    await this.prismaClient.snapshot.create({
      data: {
        id: guid,
        workspaceId,
        blob: Buffer.from(blob),
        createdAt,
        updatedAt,
      },
    });
  }

  public getClient() {
    return this.prismaClient;
  }

  public async connect() {
    await this.prismaClient.$connect();
  }

  public async disconnect() {
    await this.prismaClient.$disconnect();
  }
}

class PrismaOldService {
  private prismaClient!: PrismaClientOld;
  private prismaClientBinary!: PrismaClientOldBinary;

  constructor() {
    this.prismaClient = new PrismaClientOld();
    this.prismaClientBinary = new PrismaClientOldBinary();
  }

  public async getYDoc(workspaceId: string): Promise<DocSnapshot> {
    const results = await this.prismaClientBinary.docs.findMany({
      select: {
        workspace: true,
        blob: true,
        timestamp: true,
      },
      where: {
        workspace: workspaceId,
      },
    });

    const timestamps = results
      .map(result => result.timestamp)
      .sort((a, b) => b.getTime() - a.getTime());
    const updatedAt = timestamps[0];
    const createdAt = timestamps[1];

    const doc = new Doc();
    for (const update of results.map(result => result.blob)) {
      applyUpdate(doc, update);
    }

    return {
      workspaceId,
      doc,
      createdAt,
      updatedAt,
    };
  }

  public getClient() {
    return this.prismaClient;
  }

  public getClientBinary() {
    return this.prismaClientBinary;
  }

  public async connect() {
    await this.prismaClient.$connect();
    await this.prismaClientBinary.$connect();
  }

  public async disconnect() {
    await this.prismaClient.$disconnect();
    await this.prismaClientBinary.$disconnect();
  }
}

export const prismaNewService = new PrismaNewService();
export const prismaOldService = new PrismaOldService();
