import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { getStreamAsBuffer } from 'get-stream';

import { Config, metrics, OnEvent } from '../../base';
import { type MailName, Renderers } from '../../mails';
import { UserProps, WorkspaceProps } from '../../mails/components';
import { MailDeliveryRow, Models } from '../../models';
import { containsUrlOrDomain } from '../content-policy';
import { DocReader } from '../doc/reader';
import { WorkspaceBlobStorage } from '../storage';
import { MailSender, SendOptions } from './sender';
import { SendMailPayload } from './types';

type DynamicProp = Record<string, unknown> & {
  $$workspaceId?: string;
  $$userId?: string;
};

@Injectable()
export class MailJob {
  private readonly logger = new Logger('MailDeliveryWorker');
  private readonly workerId = `mail-delivery-${process.pid}-${randomUUID()}`;

  constructor(
    private readonly sender: MailSender,
    private readonly doc: DocReader,
    private readonly workspaceBlob: WorkspaceBlobStorage,
    private readonly models: Models,
    private readonly config: Config
  ) {}

  @OnEvent('user.deleted')
  async onUserDeleted(user: Events['user.deleted']) {
    await Promise.all([
      this.models.mailDelivery.cancelByRecipient(user.email),
      this.models.mailDelivery.cancelMemberInvitationByActor(user.id),
    ]);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async sendPendingMails() {
    await this.processReadyDeliveries();
    await this.cleanupRetainedDeliveries();
    await this.recordDeliveryMetrics();
  }

  async processReadyDeliveries(
    batchSize = this.config.mailer.deliveryWorker.batchSize
  ) {
    const rows = await this.models.mailDelivery.claimReady(this.workerId, {
      batchSize,
      leaseMs: this.config.mailer.deliveryWorker.leaseMs,
    });

    for (const row of rows) {
      await this.processDelivery(row);
    }
    return rows.length;
  }

  private async cleanupRetainedDeliveries() {
    const retentionMs =
      this.config.mailer.deliveryWorker.retentionDays * 24 * 60 * 60 * 1000;
    const before = new Date(Date.now() - retentionMs);
    await this.models.mailDelivery.deleteAnonymizedBefore(
      before,
      this.config.mailer.deliveryWorker.batchSize
    );
  }

  private async recordDeliveryMetrics() {
    const snapshot = await this.models.mailDelivery.metricsSnapshot();
    metrics.mail.gauge('retry_wait_backlog').record(snapshot.retryWait);
    metrics.mail.gauge('failed_recent').record(snapshot.failedRecent);
    metrics.mail.gauge('expired_lease_backlog').record(snapshot.expiredLeases);
    metrics.mail.histogram('ready_delay_ms').record(snapshot.readyDelayMs);
  }

  private async processDelivery(row: MailDeliveryRow) {
    if (!row.recipientEmail || !row.payload) {
      await this.models.mailDelivery.markSkipped(
        row.id,
        this.workerId,
        'missing_payload'
      );
      return;
    }
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      await this.models.mailDelivery.markFailed(
        row.id,
        this.workerId,
        'expired'
      );
      return;
    }
    if (await this.shouldSkipRecipient(row.recipientEmail)) {
      await this.models.mailDelivery.markSkipped(
        row.id,
        this.workerId,
        'disabled_recipient'
      );
      return;
    }

    const payload = row.payload as SendMailPayload;
    const rendered = await this.renderPayload(payload);
    if (!rendered) {
      await this.models.mailDelivery.markSkipped(
        row.id,
        this.workerId,
        'dynamic_props_missing'
      );
      return;
    }
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      await this.models.mailDelivery.markFailed(
        row.id,
        this.workerId,
        'expired'
      );
      return;
    }

    const attempt = await this.models.mailDelivery.markAttemptStarted(
      row.id,
      this.workerId
    );
    if (!attempt) {
      return;
    }

    const result = await this.sender.send(payload.name, {
      to: row.recipientEmail,
      ...rendered.options,
      ...rendered.content,
    });

    if (result.status === 'accepted') {
      await this.models.mailDelivery.markSent(row.id, this.workerId, {
        providerMessageId: result.providerMessageId,
        providerResponse: result.providerResponse,
      });
      return;
    }

    const nextSendAfter = this.nextSendAfter(attempt.attemptCount);
    const canRetry =
      result.retryable &&
      attempt.attemptCount < attempt.maxAttempts &&
      (!attempt.expiresAt || nextSendAfter < attempt.expiresAt);
    if (canRetry) {
      const retry = await this.models.mailDelivery.markRetry(
        row.id,
        this.workerId,
        {
          sendAfter: nextSendAfter,
          errorCode: result.errorCode,
          error: result.error,
        }
      );
      if (retry) {
        return;
      }
    }

    await this.models.mailDelivery.markFailed(
      row.id,
      this.workerId,
      attempt.expiresAt && nextSendAfter >= attempt.expiresAt
        ? 'expired'
        : (result.errorCode ?? result.status),
      result.error ?? result.providerResponse ?? undefined
    );
  }

  private nextSendAfter(attemptCount: number) {
    const delayMs = Math.min(30 * 60 * 1000, 2 ** attemptCount * 30 * 1000);
    return new Date(Date.now() + delayMs);
  }

  private async shouldSkipRecipient(to: string) {
    const user = await this.models.user.getUserByEmail(to, {
      withDisabled: true,
    });

    return user?.disabled === true;
  }

  private async renderPayload(payload: SendMailPayload) {
    let options: Partial<SendOptions> = {};
    const renderedProps = { ...payload.props };

    for (const key in renderedProps) {
      const val = renderedProps[key as keyof typeof renderedProps] as
        | DynamicProp
        | undefined;
      if (val && typeof val === 'object') {
        if (typeof val.$$workspaceId === 'string') {
          const workspaceProps = await this.fetchWorkspaceProps(
            val.$$workspaceId
          );

          if (!workspaceProps) {
            return;
          }

          if (
            payload.name === 'MemberInvitation' &&
            containsUrlOrDomain(workspaceProps.name)
          ) {
            this.logger.warn(
              `Skip mail [${payload.name}] to [${payload.to}], reason=workspace name contains url or domain`
            );
            return;
          }

          if (workspaceProps.avatar) {
            options.attachments = [
              {
                cid: 'workspaceAvatar',
                filename: 'workspaceAvatar',
                content: workspaceProps.avatar,
                encoding: 'base64',
              },
            ];
            workspaceProps.avatar = 'cid:workspaceAvatar';
          }
          Object.assign(val, workspaceProps);
          delete val.$$workspaceId;
        } else if (typeof val.$$userId === 'string') {
          const userProps = await this.fetchUserProps(val.$$userId);

          if (!userProps) {
            return;
          }

          Object.assign(val, userProps);
          delete val.$$userId;
        }
      }
    }

    if (
      payload.name === 'MemberInvitation' &&
      'workspace' in renderedProps &&
      containsUrlOrDomain(
        (renderedProps.workspace as WorkspaceProps | undefined)?.name
      )
    ) {
      this.logger.warn(
        `Skip mail [${payload.name}] to [${payload.to}], reason=workspace name contains url or domain`
      );
      return;
    }

    return {
      options,
      content: await (
        Renderers[payload.name] as (
          props: unknown
        ) => ReturnType<(typeof Renderers)[MailName]>
      )(renderedProps),
    };
  }

  private async fetchWorkspaceProps(workspaceId: string) {
    const workspace = await this.doc.getWorkspaceContent(workspaceId);

    if (!workspace) {
      return;
    }

    const props: WorkspaceProps = {
      name: workspace.name,
    };

    if (workspace.avatarKey) {
      const avatar = await this.workspaceBlob.get(
        workspace.id,
        workspace.avatarKey
      );

      if (avatar.body) {
        props.avatar = (await getStreamAsBuffer(avatar.body)).toString(
          'base64'
        );
      }
    }

    return props;
  }

  private async fetchUserProps(userId: string) {
    const user = await this.models.user.getWorkspaceUser(userId);
    if (!user) {
      return;
    }

    return { email: user.email } satisfies UserProps;
  }
}
