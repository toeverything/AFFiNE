import { createHmac } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { CryptoHelper } from '../base';
import { BaseModel } from './base';

export type MailDeliveryStatus =
  | 'queued'
  | 'sending'
  | 'retry_wait'
  | 'sent'
  | 'skipped'
  | 'failed'
  | 'canceled';

export type MailDeliveryPriority = 'critical' | 'high' | 'normal' | 'low';

export type MailDeliveryRow = {
  id: string;
  mailName: string;
  mailClass: string;
  priority: MailDeliveryPriority;
  status: MailDeliveryStatus;
  dedupeKey: string | null;
  recipientEmail: string | null;
  recipientHash: string;
  recipientDomain: string;
  recipientUserId: string | null;
  actorUserId: string | null;
  workspaceId: string | null;
  notificationId: string | null;
  abuseSubjectKey: string | null;
  quotaReservationId: string | null;
  quotaDecision: Prisma.JsonValue | null;
  payload: Prisma.JsonValue | null;
  sendAfter: Date;
  expiresAt: Date | null;
  attemptCount: number;
  maxAttempts: number;
  lockedBy: string | null;
  lockedUntil: Date | null;
  firstAttemptAt: Date | null;
  lastAttemptAt: Date | null;
  sentAt: Date | null;
  settledAt: Date | null;
  canceledAt: Date | null;
  failedAt: Date | null;
  providerMessageId: string | null;
  providerResponse: string | null;
  lastErrorCode: string | null;
  lastError: string | null;
  retentionState: 'full' | 'anonymized';
  anonymizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MailDeliveryCreateInput = {
  mailName: string;
  mailClass: string;
  priority: MailDeliveryPriority;
  status?: Extract<MailDeliveryStatus, 'queued' | 'skipped' | 'failed'>;
  dedupeKey?: string;
  recipientEmail: string;
  recipientUserId?: string;
  actorUserId?: string;
  workspaceId?: string;
  notificationId?: string;
  abuseSubjectKey?: string;
  quotaReservationId?: string;
  quotaDecision?: Prisma.JsonValue;
  payload: Prisma.JsonValue;
  sendAfter?: Date;
  expiresAt?: Date;
  maxAttempts?: number;
  lastErrorCode?: string;
  lastError?: string;
};

export type MailDeliveryAdminAggregate = {
  bucket: Date;
  mailName: string;
  mailClass: string;
  status: MailDeliveryStatus;
  count: number;
};

export type MailDeliveryMetricsSnapshot = {
  retryWait: number;
  failedRecent: number;
  expiredLeases: number;
  readyDelayMs: number;
};

const TERMINAL_STATUSES = new Set<MailDeliveryStatus>([
  'sent',
  'skipped',
  'failed',
  'canceled',
]);

function recipientDomain(email: string) {
  const parts = email.trim().toLowerCase().split('@');
  return parts.length === 2 ? parts[1] : '';
}

function redact(value: string | undefined | null) {
  if (!value) {
    return null;
  }
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{6,}\b/g, '[code]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .slice(0, 1000);
}

function mapRow(row: Record<string, unknown>): MailDeliveryRow {
  return {
    id: row.id as string,
    mailName: row.mailName as string,
    mailClass: row.mailClass as string,
    priority: row.priority as MailDeliveryPriority,
    status: row.status as MailDeliveryStatus,
    dedupeKey: row.dedupeKey as string | null,
    recipientEmail: row.recipientEmail as string | null,
    recipientHash: row.recipientHash as string,
    recipientDomain: row.recipientDomain as string,
    recipientUserId: row.recipientUserId as string | null,
    actorUserId: row.actorUserId as string | null,
    workspaceId: row.workspaceId as string | null,
    notificationId: row.notificationId as string | null,
    abuseSubjectKey: row.abuseSubjectKey as string | null,
    quotaReservationId: row.quotaReservationId as string | null,
    quotaDecision: row.quotaDecision as Prisma.JsonValue | null,
    payload: row.payload as Prisma.JsonValue | null,
    sendAfter: row.sendAfter as Date,
    expiresAt: row.expiresAt as Date | null,
    attemptCount: row.attemptCount as number,
    maxAttempts: row.maxAttempts as number,
    lockedBy: row.lockedBy as string | null,
    lockedUntil: row.lockedUntil as Date | null,
    firstAttemptAt: row.firstAttemptAt as Date | null,
    lastAttemptAt: row.lastAttemptAt as Date | null,
    sentAt: row.sentAt as Date | null,
    settledAt: row.settledAt as Date | null,
    canceledAt: row.canceledAt as Date | null,
    failedAt: row.failedAt as Date | null,
    providerMessageId: row.providerMessageId as string | null,
    providerResponse: row.providerResponse as string | null,
    lastErrorCode: row.lastErrorCode as string | null,
    lastError: row.lastError as string | null,
    retentionState: row.retentionState as 'full' | 'anonymized',
    anonymizedAt: row.anonymizedAt as Date | null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

const SELECT_FIELDS = Prisma.sql`
  id::text AS "id",
  mail_name AS "mailName",
  mail_class AS "mailClass",
  priority,
  status,
  dedupe_key AS "dedupeKey",
  recipient_email AS "recipientEmail",
  recipient_hash AS "recipientHash",
  recipient_domain AS "recipientDomain",
  recipient_user_id AS "recipientUserId",
  actor_user_id AS "actorUserId",
  workspace_id AS "workspaceId",
  notification_id AS "notificationId",
  abuse_subject_key AS "abuseSubjectKey",
  quota_reservation_id::text AS "quotaReservationId",
  quota_decision AS "quotaDecision",
  payload,
  send_after AS "sendAfter",
  expires_at AS "expiresAt",
  attempt_count AS "attemptCount",
  max_attempts AS "maxAttempts",
  locked_by AS "lockedBy",
  locked_until AS "lockedUntil",
  first_attempt_at AS "firstAttemptAt",
  last_attempt_at AS "lastAttemptAt",
  sent_at AS "sentAt",
  settled_at AS "settledAt",
  canceled_at AS "canceledAt",
  failed_at AS "failedAt",
  provider_message_id AS "providerMessageId",
  provider_response AS "providerResponse",
  last_error_code AS "lastErrorCode",
  last_error AS "lastError",
  retention_state AS "retentionState",
  anonymized_at AS "anonymizedAt",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

@Injectable()
export class MailDeliveryModel extends BaseModel {
  constructor(private readonly crypto: CryptoHelper) {
    super();
  }

  private recipientHash(email: string) {
    return createHmac('sha256', this.crypto.keyPair.sha256.privateKey)
      .update(email.trim().toLowerCase())
      .digest('hex');
  }

  async create(input: MailDeliveryCreateInput): Promise<MailDeliveryRow> {
    const now = new Date();
    const sendAfter = input.sendAfter ?? now;
    const status = input.status ?? 'queued';
    const expired =
      input.expiresAt &&
      (input.expiresAt.getTime() <= now.getTime() ||
        sendAfter.getTime() >= input.expiresAt.getTime());
    const finalStatus = expired ? 'failed' : status;
    const terminal = TERMINAL_STATUSES.has(finalStatus);
    const lastErrorCode = expired
      ? 'expired'
      : (input.lastErrorCode ?? (status === 'skipped' ? 'skipped' : null));
    const rows = await this.db.$queryRaw<Array<Record<string, unknown>>>`
      INSERT INTO mail_deliveries (
        mail_name,
        mail_class,
        priority,
        status,
        dedupe_key,
        recipient_email,
        recipient_hash,
        recipient_domain,
        recipient_user_id,
        actor_user_id,
        workspace_id,
        notification_id,
        abuse_subject_key,
        quota_reservation_id,
        quota_decision,
        payload,
        send_after,
        expires_at,
        max_attempts,
        settled_at,
        failed_at,
        last_error_code,
        last_error,
        retention_state,
        anonymized_at
      )
      VALUES (
        ${input.mailName},
        ${input.mailClass},
        ${input.priority},
        ${finalStatus},
        ${input.dedupeKey ?? null},
        ${terminal ? null : input.recipientEmail},
        ${this.recipientHash(input.recipientEmail)},
        ${recipientDomain(input.recipientEmail)},
        ${input.recipientUserId ?? null},
        ${input.actorUserId ?? null},
        ${input.workspaceId ?? null},
        ${input.notificationId ?? null},
        ${input.abuseSubjectKey ?? null},
        ${input.quotaReservationId ?? null}::uuid,
        ${input.quotaDecision ?? null},
        ${terminal ? null : input.payload},
        ${sendAfter},
        ${input.expiresAt ?? null},
        ${input.maxAttempts ?? 3},
        ${terminal ? now : null},
        ${finalStatus === 'failed' ? now : null},
        ${lastErrorCode},
        ${redact(input.lastError)},
        ${terminal ? 'anonymized' : 'full'},
        ${terminal ? now : null}
      )
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL
      DO NOTHING
      RETURNING ${SELECT_FIELDS}
    `;

    if (rows[0]) {
      return mapRow(rows[0]);
    }
    if (!input.dedupeKey) {
      throw new Error('Failed to create mail delivery.');
    }
    const existing = await this.findByDedupeKey(input.dedupeKey);
    if (!existing) {
      throw new Error('Failed to find deduped mail delivery.');
    }
    return existing;
  }

  async findByDedupeKey(dedupeKey: string) {
    const rows = await this.db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT ${SELECT_FIELDS}
      FROM mail_deliveries
      WHERE dedupe_key = ${dedupeKey}
      LIMIT 1
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async claimReady(
    workerId: string,
    options: { batchSize: number; leaseMs: number }
  ) {
    await this.markExpiredPending(options.batchSize);
    const rows = await this.db.$queryRaw<Array<Record<string, unknown>>>`
      UPDATE mail_deliveries
      SET status = 'sending',
          locked_by = ${workerId},
          locked_until = now() + (${options.leaseMs}::text || ' milliseconds')::interval,
          updated_at = now()
      WHERE id IN (
        SELECT id
        FROM mail_deliveries
        WHERE (
            status IN ('queued', 'retry_wait')
            OR (status = 'sending' AND locked_until < now())
          )
          AND send_after <= now()
          AND (expires_at IS NULL OR expires_at > now())
          AND (locked_until IS NULL OR locked_until < now())
          AND max_attempts > attempt_count
        ORDER BY
          CASE priority
            WHEN 'critical' THEN 0
            WHEN 'high' THEN 1
            WHEN 'normal' THEN 2
            ELSE 3
          END,
          send_after,
          created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${options.batchSize}
      )
      RETURNING ${SELECT_FIELDS}
    `;
    return rows.map(mapRow);
  }

  async markAttemptStarted(id: string, workerId: string) {
    const rows = await this.db.$queryRaw<Array<Record<string, unknown>>>`
      UPDATE mail_deliveries
      SET attempt_count = attempt_count + 1,
          first_attempt_at = COALESCE(first_attempt_at, now()),
          last_attempt_at = now(),
          updated_at = now()
      WHERE id = ${id}::uuid
        AND status = 'sending'
        AND locked_by = ${workerId}
        AND (expires_at IS NULL OR expires_at > now())
        AND max_attempts > attempt_count
      RETURNING ${SELECT_FIELDS}
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async markSent(
    id: string,
    workerId: string,
    result: {
      providerMessageId?: string | null;
      providerResponse?: string | null;
    }
  ) {
    return await this.markTerminal(id, workerId, 'sent', {
      providerMessageId: result.providerMessageId,
      providerResponse: redact(result.providerResponse),
    });
  }

  async markRetry(
    id: string,
    workerId: string,
    input: {
      sendAfter: Date;
      errorCode?: string | null;
      error?: string | null;
    }
  ) {
    const rows = await this.db.$queryRaw<Array<Record<string, unknown>>>`
      UPDATE mail_deliveries
      SET status = 'retry_wait',
          send_after = ${input.sendAfter},
          locked_by = NULL,
          locked_until = NULL,
          last_error_code = ${input.errorCode ?? null},
          last_error = ${redact(input.error)},
          updated_at = now()
      WHERE id = ${id}::uuid
        AND status = 'sending'
        AND locked_by = ${workerId}
        AND (expires_at IS NULL OR ${input.sendAfter} < expires_at)
        AND attempt_count < max_attempts
      RETURNING ${SELECT_FIELDS}
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async markSkipped(
    id: string,
    workerId: string,
    reason: string,
    detail?: string
  ) {
    return await this.markTerminal(id, workerId, 'skipped', {
      lastErrorCode: reason,
      lastError: redact(detail),
    });
  }

  async markFailed(
    id: string,
    workerId: string,
    errorCode: string,
    error?: string
  ) {
    return await this.markTerminal(id, workerId, 'failed', {
      lastErrorCode: errorCode,
      lastError: redact(error),
    });
  }

  async markCanceled(id: string, workerId: string, reason = 'canceled') {
    return await this.markTerminal(id, workerId, 'canceled', {
      lastErrorCode: reason,
    });
  }

  async cancelByRecipient(
    recipientEmail: string,
    reason = 'recipient_deleted'
  ) {
    return await this.cancelWhere(
      Prisma.sql`recipient_hash = ${this.recipientHash(recipientEmail)}`,
      reason
    );
  }

  async cancelById(id: string, reason = 'canceled') {
    return await this.cancelWhere(Prisma.sql`id = ${id}::uuid`, reason);
  }

  async cancelMemberInvitationByActor(
    actorUserId: string,
    reason = 'actor_deleted'
  ) {
    return await this.cancelWhere(
      Prisma.sql`mail_name = 'MemberInvitation' AND actor_user_id = ${actorUserId}`,
      reason
    );
  }

  async cancelByActor(actorUserId: string, reason = 'actor_quarantined') {
    return await this.cancelWhere(
      Prisma.sql`actor_user_id = ${actorUserId}`,
      reason
    );
  }

  async cancelByWorkspace(
    workspaceId: string,
    reason = 'workspace_quarantined'
  ) {
    return await this.cancelWhere(
      Prisma.sql`workspace_id = ${workspaceId}`,
      reason
    );
  }

  async cancelByAbuseSubject(
    subjectKey: string,
    reason = 'abuse_subject_quarantined'
  ) {
    return await this.cancelWhere(
      Prisma.sql`abuse_subject_key = ${subjectKey}`,
      reason
    );
  }

  async markExpiredPending(limit: number) {
    const result = await this.db.$executeRaw`
      UPDATE mail_deliveries
      SET status = 'failed',
          failed_at = now(),
          settled_at = now(),
          locked_by = NULL,
          locked_until = NULL,
          recipient_email = NULL,
          payload = NULL,
          retention_state = 'anonymized',
          anonymized_at = now(),
          last_error_code = 'expired',
          updated_at = now()
      WHERE id IN (
        SELECT id
        FROM mail_deliveries
        WHERE (
            status IN ('queued', 'retry_wait')
            OR (status = 'sending' AND locked_until < now())
          )
          AND expires_at IS NOT NULL
          AND expires_at <= now()
        LIMIT ${limit}
      )
    `;
    return Number(result);
  }

  async adminAggregate(input: {
    from: Date;
    to: Date;
    bucket: 'hour' | 'day';
  }) {
    const rows = await this.db.$queryRaw<Array<Record<string, unknown>>>`
      WITH events AS (
        SELECT
          date_trunc(${input.bucket}, created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS bucket,
          mail_name,
          mail_class,
          status,
          COUNT(*)::int AS count
        FROM mail_deliveries
        WHERE created_at >= ${input.from}
          AND created_at < ${input.to}
        GROUP BY
          bucket,
          mail_name,
          mail_class,
          status
      )
      SELECT
        bucket AS "bucket",
        mail_name AS "mailName",
        mail_class AS "mailClass",
        status,
        count
      FROM events
      ORDER BY bucket ASC, count DESC, "mailName" ASC
    `;
    return rows.map(row => ({
      bucket: row.bucket as Date,
      mailName: row.mailName as string,
      mailClass: row.mailClass as string,
      status: row.status as MailDeliveryStatus,
      count: row.count as number,
    })) satisfies MailDeliveryAdminAggregate[];
  }

  async deleteAnonymizedBefore(before: Date, limit: number) {
    const result = await this.db.$executeRaw`
      DELETE FROM mail_deliveries
      WHERE id IN (
        SELECT id
        FROM mail_deliveries
        WHERE retention_state = 'anonymized'
          AND settled_at IS NOT NULL
          AND settled_at < ${before}
        ORDER BY settled_at
        LIMIT ${limit}
      )
    `;
    return Number(result);
  }

  async metricsSnapshot(): Promise<MailDeliveryMetricsSnapshot> {
    const rows = await this.db.$queryRaw<
      Array<{
        retryWait: number;
        failedRecent: number;
        expiredLeases: number;
        readyDelayMs: number;
      }>
    >`
      SELECT
        COUNT(*) FILTER (WHERE status = 'retry_wait')::int AS "retryWait",
        COUNT(*) FILTER (
          WHERE status = 'failed' AND failed_at >= now() - interval '1 hour'
        )::int AS "failedRecent",
        COUNT(*) FILTER (
          WHERE status = 'sending' AND locked_until < now()
        )::int AS "expiredLeases",
        COALESCE(MAX(EXTRACT(EPOCH FROM now() - send_after) * 1000) FILTER (
          WHERE status IN ('queued', 'retry_wait') AND send_after <= now()
        ), 0)::int AS "readyDelayMs"
      FROM mail_deliveries
    `;
    return (
      rows[0] ?? {
        retryWait: 0,
        failedRecent: 0,
        expiredLeases: 0,
        readyDelayMs: 0,
      }
    );
  }

  private async markTerminal(
    id: string,
    workerId: string,
    status: Extract<
      MailDeliveryStatus,
      'sent' | 'skipped' | 'failed' | 'canceled'
    >,
    input: {
      providerMessageId?: string | null;
      providerResponse?: string | null;
      lastErrorCode?: string | null;
      lastError?: string | null;
    }
  ) {
    const rows = await this.db.$queryRaw<Array<Record<string, unknown>>>`
      UPDATE mail_deliveries
      SET status = ${status},
          sent_at = CASE WHEN ${status} = 'sent' THEN now() ELSE sent_at END,
          failed_at = CASE WHEN ${status} = 'failed' THEN now() ELSE failed_at END,
          canceled_at = CASE WHEN ${status} = 'canceled' THEN now() ELSE canceled_at END,
          settled_at = now(),
          locked_by = NULL,
          locked_until = NULL,
          recipient_email = NULL,
          payload = NULL,
          retention_state = 'anonymized',
          anonymized_at = now(),
          provider_message_id = ${input.providerMessageId ?? null},
          provider_response = ${input.providerResponse ?? null},
          last_error_code = ${input.lastErrorCode ?? null},
          last_error = ${input.lastError ?? null},
          updated_at = now()
      WHERE id = ${id}::uuid
        AND status = 'sending'
        AND locked_by = ${workerId}
      RETURNING ${SELECT_FIELDS}
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  private async cancelWhere(where: Prisma.Sql, reason: string) {
    const result = await this.db.$executeRaw`
      UPDATE mail_deliveries
      SET status = 'canceled',
          canceled_at = now(),
          settled_at = now(),
          locked_by = NULL,
          locked_until = NULL,
          recipient_email = NULL,
          payload = NULL,
          retention_state = 'anonymized',
          anonymized_at = now(),
          last_error_code = ${reason},
          updated_at = now()
      WHERE status IN ('queued', 'retry_wait', 'sending')
        AND ${where}
    `;
    return Number(result);
  }
}
