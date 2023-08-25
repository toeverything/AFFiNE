import { applyUpdate, Doc } from 'yjs';

import { PrismaClient as PrismaClientNew } from '../../prisma-generated/clientNew';
import { PrismaClient as PrismaClientOld } from '../../prisma-generated/clientOld';
import { PrismaClient as PrismaClientOldBinary } from '../../prisma-generated/clientOldBinary';
import type { DocSnapshot, DocUpdate } from './type';

class PrismaNewService {
  private prismaClient: PrismaClientNew;

  constructor() {
    this.prismaClient = new PrismaClientNew();
  }

  public async insertYDocToUpdate(
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

  // warn: wrong, it assumes one doc only have one record, but it's not the truth
  // updates may have many records
  public async getYDocs(): Promise<DocUpdate[]> {
    const docs: DocUpdate[] = [];

    const results: { blob: Buffer; workspace: string; timestamp: Date }[] = [];
    const recordsCount = await this.prismaClientBinary.docs.count();
    console.log(`recordsCount: ${recordsCount}`);
    const step = 10;
    for (let i = 0; i < recordsCount; i += step) {
      console.log(`retrieved ${i} doc record`);
      results.push(
        ...(await this.prismaClientBinary.docs.findMany({
          skip: i,
          take: step,
          select: {
            workspace: true,
            blob: true,
            timestamp: true,
          },
        }))
      );
    }

    results.forEach(result => {
      const doc = new Doc();
      try {
        applyUpdate(doc, result.blob);
      } catch (e) {
        console.error(result.workspace, 'apply failed: ', e);
      }
      docs.push({
        workspaceId: result.workspace,
        doc,
        createdAt: result.timestamp,
      });
    });

    return docs;
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
