import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';

import { BaseModel } from './base';

@Injectable()
export class AppConfigModel extends BaseModel {
  async load() {
    return this.db.appConfig.findMany();
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
}
