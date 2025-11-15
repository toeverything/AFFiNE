import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import z from 'zod';

import { BaseModel } from './base';

export const UserSettingsSchema = z.object({
  receiveInvitationEmail: z.boolean().default(true),
  receiveMentionEmail: z.boolean().default(true),
  receiveCommentEmail: z.boolean().default(true),
});

export type UserSettingsInput = z.input<typeof UserSettingsSchema>;
export type UserSettings = z.infer<typeof UserSettingsSchema>;

/**
 * UserSettings Model
 */
@Injectable()
export class UserSettingsModel extends BaseModel {
  @Transactional()
  async set(userId: string, setting: UserSettingsInput) {
    const existsSetting = await this.get(userId);
    const payload = UserSettingsSchema.parse({
      ...existsSetting,
      ...setting,
    });
    await this.db.userSettings.upsert({
      where: {
        userId,
      },
      update: {
        payload,
      },
      create: {
        userId,
        payload,
      },
    });
    this.logger.debug(`UserSettings updated for user ${userId}`);
    return payload;
  }

  async get(userId: string): Promise<UserSettings> {
    const row = await this.db.userSettings.findUnique({
      where: {
        userId,
      },
    });
    return UserSettingsSchema.parse(row?.payload ?? {});
  }
}
