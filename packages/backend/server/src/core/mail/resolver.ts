import {
  Args,
  Field,
  Float,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { GraphQLJSONObject } from 'graphql-scalars';

import { BadRequest } from '../../base';
import { Renderers } from '../../mails';
import { Models } from '../../models';
import { CurrentUser } from '../auth/session';
import { Admin } from '../common';
import {
  TimeBucket,
  TimeWindow,
} from '../workspaces/resolvers/analytics-types';
import { MailSender } from './sender';

@InputType()
class AdminMailDeliveriesInput {
  @Field(() => Int, { defaultValue: 24 })
  hours!: number;
}

@ObjectType()
class AdminMailDeliveryPoint {
  @Field(() => Date)
  bucket!: Date;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
class AdminMailDeliverySeries {
  @Field()
  key!: string;

  @Field()
  label!: string;

  @Field(() => Int)
  total!: number;

  @Field(() => [AdminMailDeliveryPoint])
  points!: AdminMailDeliveryPoint[];
}

@ObjectType()
class AdminMailDeliverySummary {
  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  sent!: number;

  @Field(() => Int)
  failed!: number;

  @Field(() => Int)
  skipped!: number;

  @Field(() => Int)
  canceled!: number;

  @Field(() => Int)
  queued!: number;

  @Field(() => Int)
  sending!: number;

  @Field(() => Int)
  retryWait!: number;

  @Field(() => Float)
  successRate!: number;
}

@ObjectType()
class AdminMailDeliveryAnalytics {
  @Field(() => TimeWindow)
  window!: TimeWindow;

  @Field(() => AdminMailDeliverySummary)
  summary!: AdminMailDeliverySummary;

  @Field(() => [AdminMailDeliverySeries])
  byStatus!: AdminMailDeliverySeries[];

  @Field(() => [AdminMailDeliverySeries])
  byType!: AdminMailDeliverySeries[];

  @Field(() => [AdminMailDeliverySeries])
  byOutcome!: AdminMailDeliverySeries[];
}

const MAIL_STATUSES = [
  'sent',
  'failed',
  'skipped',
  'canceled',
  'queued',
  'sending',
  'retry_wait',
] as const;

const STATUS_LABELS = {
  sent: 'Sent',
  failed: 'Failed',
  skipped: 'Skipped',
  canceled: 'Canceled',
  queued: 'Queued',
  sending: 'Sending',
  retry_wait: 'Retry wait',
} satisfies Record<(typeof MAIL_STATUSES)[number], string>;

function startOfUtcHour(value: Date) {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      value.getUTCHours()
    )
  );
}

function startOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );
}

function addUtcHours(value: Date, hours: number) {
  return new Date(value.getTime() + hours * 60 * 60 * 1000);
}

function addUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function normalizeMailWindow(hours: number | undefined) {
  if (hours !== undefined && hours !== 24 && hours !== 24 * 7) {
    throw new BadRequest(
      'Mail delivery analytics window must be 24 or 168 hours.'
    );
  }
  const requestedHours = hours ?? 24;
  const bucket = requestedHours > 24 ? ('day' as const) : ('hour' as const);
  const now = new Date();
  const to =
    bucket === 'hour'
      ? addUtcHours(startOfUtcHour(now), 1)
      : addUtcDays(startOfUtcDay(now), 1);
  const effectiveSize =
    bucket === 'hour' ? requestedHours : requestedHours / 24;
  const from =
    bucket === 'hour'
      ? addUtcHours(to, -effectiveSize)
      : addUtcDays(to, -effectiveSize);

  return {
    from,
    to,
    bucket,
    requestedHours,
    effectiveSize,
  };
}

function buildBuckets(input: ReturnType<typeof normalizeMailWindow>) {
  return Array.from({ length: input.effectiveSize }, (_, index) =>
    input.bucket === 'hour'
      ? addUtcHours(input.from, index)
      : addUtcDays(input.from, index)
  );
}

function bucketKey(value: Date) {
  return value.toISOString();
}

function buildSeries(
  keys: { key: string; label: string }[],
  buckets: Date[],
  counts: Map<string, number>
): AdminMailDeliverySeries[] {
  return keys.map(({ key, label }) => {
    let total = 0;
    const points = buckets.map(bucket => {
      const count = counts.get(`${key}:${bucketKey(bucket)}`) ?? 0;
      total += count;
      return { bucket, count };
    });
    return { key, label, total, points };
  });
}

@Admin()
@Resolver(() => Boolean)
export class MailResolver {
  constructor(private readonly models: Models) {}

  @Mutation(() => Boolean)
  async sendTestEmail(
    @CurrentUser() user: CurrentUser,
    @Args('config', { type: () => GraphQLJSONObject })
    config: AppConfig['mailer']['SMTP']
  ) {
    const smtp = MailSender.create(config);

    using _disposable = {
      [Symbol.dispose]: () => {
        smtp.close();
      },
    };

    try {
      await smtp.verify();
    } catch (e) {
      throw new BadRequest(
        `Failed to verify your SMTP configuration. Cause: ${(e as Error).message}`
      );
    }

    try {
      await smtp.sendMail({
        from: config.sender,
        to: user.email,
        ...(await Renderers.TestMail({})),
      });
    } catch (e) {
      throw new BadRequest(
        `Failed to send test email. Cause: ${(e as Error).message}`
      );
    }

    return true;
  }

  @Query(() => AdminMailDeliveryAnalytics, {
    description: 'Aggregate mail delivery timeline facts for admin panel',
  })
  async adminMailDeliveries(
    @Args('input', { nullable: true, type: () => AdminMailDeliveriesInput })
    input?: AdminMailDeliveriesInput
  ) {
    const window = normalizeMailWindow(input?.hours);
    const buckets = buildBuckets(window);
    const rows = await this.models.mailDelivery.adminAggregate({
      from: window.from,
      to: window.to,
      bucket: window.bucket,
    });

    const statusCounts = new Map<string, number>();
    const classCounts = new Map<string, number>();
    const outcomeCounts = new Map<string, number>();
    const classTotals = new Map<string, number>();
    const summary = {
      total: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      canceled: 0,
      queued: 0,
      sending: 0,
      retryWait: 0,
      successRate: 0,
    };

    for (const row of rows) {
      const bucket = bucketKey(row.bucket);
      summary.total += row.count;
      if (row.status === 'retry_wait') {
        summary.retryWait += row.count;
      } else {
        summary[row.status] += row.count;
      }

      statusCounts.set(
        `${row.status}:${bucket}`,
        (statusCounts.get(`${row.status}:${bucket}`) ?? 0) + row.count
      );
      classCounts.set(
        `${row.mailClass}:${bucket}`,
        (classCounts.get(`${row.mailClass}:${bucket}`) ?? 0) + row.count
      );
      classTotals.set(
        row.mailClass,
        (classTotals.get(row.mailClass) ?? 0) + row.count
      );

      const outcome =
        row.status === 'sent'
          ? 'successful'
          : row.status === 'queued' ||
              row.status === 'sending' ||
              row.status === 'retry_wait'
            ? 'pending'
            : 'unsuccessful';
      outcomeCounts.set(
        `${outcome}:${bucket}`,
        (outcomeCounts.get(`${outcome}:${bucket}`) ?? 0) + row.count
      );
    }

    const terminal =
      summary.sent + summary.failed + summary.skipped + summary.canceled;
    summary.successRate = terminal ? summary.sent / terminal : 0;

    const topClasses = [...classTotals.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([key]) => ({ key, label: key }));

    return {
      window: {
        from: window.from,
        to: window.to,
        timezone: 'UTC',
        bucket: window.bucket === 'hour' ? TimeBucket.Hour : TimeBucket.Day,
        requestedSize: window.requestedHours,
        effectiveSize: window.effectiveSize,
      },
      summary,
      byStatus: buildSeries(
        MAIL_STATUSES.map(status => ({
          key: status,
          label: STATUS_LABELS[status],
        })),
        buckets,
        statusCounts
      ),
      byType: buildSeries(topClasses, buckets, classCounts),
      byOutcome: buildSeries(
        [
          { key: 'successful', label: 'Successful' },
          { key: 'unsuccessful', label: 'Unsuccessful' },
          { key: 'pending', label: 'Pending' },
        ],
        buckets,
        outcomeCounts
      ),
    };
  }
}
