import { Injectable, Logger } from '@nestjs/common';

import { Models } from '../../models';

const STAFF = ['@toeverything.info', '@affine.pro'];

export enum EarlyAccessType {
  App = 'app',
  AI = 'ai',
}

@Injectable()
export class FeatureService {
  protected logger = new Logger(FeatureService.name);

  constructor(private readonly models: Models) {}

  // ======== Admin ========
  isStaff(email: string) {
    for (const domain of STAFF) {
      if (email.endsWith(domain)) {
        return true;
      }
    }
    return false;
  }

  isAdmin(userId: string) {
    return this.models.userFeature.has(userId, 'administrator');
  }

  addAdmin(userId: string) {
    return this.models.userFeature.add(userId, 'administrator', 'Admin user');
  }

  // ======== Early Access ========
  async isEarlyAccessUser(
    userId: string,
    type: EarlyAccessType = EarlyAccessType.App
  ) {
    return await this.models.userFeature.has(
      userId,
      type === EarlyAccessType.App ? 'early_access' : 'ai_early_access'
    );
  }
}
