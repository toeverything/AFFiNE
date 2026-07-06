import { Injectable } from '@nestjs/common';

import { EmailServiceNotConfigured } from '../../base';
import type { MailName } from '../../mails';
import { Models } from '../../models';
import { BackendRuntimeProvider } from '../backend-runtime';
import { MailSender } from './sender';
import type { SendMailCommand } from './types';

type MailCommand = SendMailCommand;
type SkipMailOptions = {
  mailClass: string;
  reason: string;
  priority?: 'critical' | 'high' | 'normal' | 'low';
};

function recipientDomain(email: string) {
  const parts = email.trim().toLowerCase().split('@');
  return parts.length === 2 ? parts[1] : '';
}

function defaultPriority(mailClass: string): 'critical' | 'high' | 'normal' {
  if (mailClass === 'auth') {
    return 'critical';
  }
  if (mailClass === 'billing_license') {
    return 'high';
  }
  return 'normal';
}

function serializePayload(command: MailCommand) {
  return JSON.parse(
    JSON.stringify({
      name: command.name,
      to: command.to,
      props: command.props,
    })
  );
}

@Injectable()
export class Mailer {
  constructor(
    private readonly sender: MailSender,
    private readonly models: Models,
    private readonly runtime: BackendRuntimeProvider
  ) {}

  /**
   * try to send mail
   *
   * @note never throw
   */
  async trySend(command: MailCommand) {
    return this.send(command, true);
  }

  async skip(command: MailCommand, options: SkipMailOptions) {
    const metadata = command.metadata ?? {};
    const deduped = metadata.dedupeKey
      ? await this.models.mailDelivery.findByDedupeKey(metadata.dedupeKey)
      : null;
    if (deduped) {
      return false;
    }

    await this.models.mailDelivery.create({
      mailName: command.name,
      mailClass: options.mailClass,
      priority:
        options.priority ??
        metadata.priority ??
        defaultPriority(options.mailClass),
      status: 'skipped',
      dedupeKey: metadata.dedupeKey,
      recipientEmail: command.to,
      recipientUserId: metadata.recipientUserId,
      actorUserId: metadata.actorUserId,
      workspaceId: metadata.workspaceId,
      notificationId: metadata.notificationId,
      abuseSubjectKey: metadata.abuseSubjectKey,
      payload: serializePayload(command),
      expiresAt: metadata.expiresAt,
      maxAttempts: 0,
      lastErrorCode: options.reason,
    });
    return false;
  }

  async send(command: MailCommand, suppressError = false) {
    if (!this.sender.configured) {
      if (suppressError) {
        return false;
      }
      throw new EmailServiceNotConfigured();
    }

    let reservationId: string | undefined;
    let deliveryId: string | undefined;
    try {
      const metadata = command.metadata ?? {};
      const deduped = metadata.dedupeKey
        ? await this.models.mailDelivery.findByDedupeKey(metadata.dedupeKey)
        : null;
      if (deduped) {
        return !['failed', 'canceled', 'skipped'].includes(deduped.status);
      }

      const decision = await this.runtime.assertMailDeliveryQuotaV1({
        mailName: command.name as MailName,
        recipient: {
          email: command.to,
          domain: recipientDomain(command.to),
          userId: metadata.recipientUserId,
        },
        metadata: {
          actorUserId: metadata.actorUserId,
          workspaceId: metadata.workspaceId,
          notificationId: metadata.notificationId,
          abuseSubjectKey: metadata.abuseSubjectKey,
        },
        source: metadata.source,
      });
      reservationId = decision.reservationId;

      if (!decision.allowed) {
        await this.models.mailDelivery.create({
          mailName: command.name,
          mailClass: decision.mailClass,
          priority: metadata.priority ?? defaultPriority(decision.mailClass),
          status: 'skipped',
          dedupeKey: metadata.dedupeKey,
          recipientEmail: command.to,
          recipientUserId: metadata.recipientUserId,
          actorUserId: metadata.actorUserId,
          workspaceId: metadata.workspaceId,
          notificationId: metadata.notificationId,
          abuseSubjectKey: metadata.abuseSubjectKey,
          quotaDecision: decision,
          payload: serializePayload(command),
          expiresAt: metadata.expiresAt,
          maxAttempts: metadata.maxAttempts,
          lastErrorCode: decision.reason ?? 'quota_denied',
        });
        return false;
      }

      const delivery = await this.models.mailDelivery.create({
        mailName: command.name,
        mailClass: decision.mailClass,
        priority: metadata.priority ?? defaultPriority(decision.mailClass),
        dedupeKey: metadata.dedupeKey,
        recipientEmail: command.to,
        recipientUserId: metadata.recipientUserId,
        actorUserId: metadata.actorUserId,
        workspaceId: metadata.workspaceId,
        notificationId: metadata.notificationId,
        abuseSubjectKey: metadata.abuseSubjectKey,
        quotaReservationId: decision.reservationId,
        quotaDecision: decision,
        payload: serializePayload(command),
        expiresAt: metadata.expiresAt,
        maxAttempts: metadata.maxAttempts,
      });
      deliveryId = delivery.id;
      if (decision.reservationId) {
        if (delivery.quotaReservationId === decision.reservationId) {
          await this.runtime.commitMailDeliveryQuotaV1(decision.reservationId);
        } else {
          await this.runtime.releaseMailDeliveryQuotaV1(decision.reservationId);
        }
      }
      return true;
    } catch (error) {
      if (deliveryId) {
        await this.models.mailDelivery.cancelById(
          deliveryId,
          'quota_commit_failed'
        );
      }
      if (reservationId) {
        await this.runtime.releaseMailDeliveryQuotaV1(reservationId);
      }
      if (!suppressError) {
        throw error;
      }
      return false;
    }
  }
}
