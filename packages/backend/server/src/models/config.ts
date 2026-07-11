import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';

import { BaseModel } from './base';

@Injectable()
export class AppConfigModel extends BaseModel {
  async load(excludedKeys: string[] = []) {
    return this.db.appConfig.findMany({
      where: excludedKeys.length ? { id: { notIn: excludedKeys } } : undefined,
    });
  }

  @Transactional()
  async save(user: string, updates: Array<{ key: string; value: any }>) {
    return await Promise.allSettled(
      updates.map(async update => {
        return this.db.appConfig.upsert({
          where: { id: update.key },
          update: { value: update.value, lastUpdatedBy: user },
          create: { id: update.key, value: update.value, lastUpdatedBy: user },
        });
      })
    );
  }

  async get(key: string) {
    return await this.db.appConfig.findUnique({ where: { id: key } });
  }

  async createIfAbsent(key: string, value: Prisma.InputJsonValue) {
    try {
      return await this.db.appConfig.create({
        data: { id: key, value, lastUpdatedBy: null },
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      return await this.db.appConfig.findUniqueOrThrow({ where: { id: key } });
    }
  }

  @Transactional()
  async mutate(
    key: string,
    actorId: string,
    mutator: (value: Prisma.JsonValue) => Prisma.InputJsonValue
  ) {
    await this.db
      .$queryRaw`SELECT id FROM app_configs WHERE id = ${key} FOR UPDATE`;
    const current = await this.db.appConfig.findUniqueOrThrow({
      where: { id: key },
    });
    return await this.db.appConfig.update({
      where: { id: key },
      data: {
        value: mutator(current.value),
        lastUpdatedBy: actorId,
      },
    });
  }
}
