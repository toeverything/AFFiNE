import { Injectable } from '@nestjs/common';

import { OnEvent } from '../../base';
import { Models } from '../../models';

@Injectable()
export class MailDeliveryEvents {
  constructor(private readonly models: Models) {}

  @OnEvent('user.deleted')
  async onUserDeleted(user: Events['user.deleted']) {
    await Promise.all([
      this.models.mailDelivery.cancelByRecipient(user.email),
      this.models.mailDelivery.cancelMemberInvitationByActor(user.id),
    ]);
  }
}
