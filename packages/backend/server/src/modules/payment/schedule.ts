import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class ScheduleManager {
  private _schedule: Stripe.SubscriptionSchedule | null = null;
  private readonly logger = new Logger(ScheduleManager.name);

  constructor(private readonly stripe: Stripe) {}

  static create(stripe: Stripe, schedule?: Stripe.SubscriptionSchedule) {
    const manager = new ScheduleManager(stripe);
    if (schedule) {
      manager._schedule = schedule;
    }

    return manager;
  }

  get schedule() {
    return this._schedule;
  }

  get currentPhase() {
    if (!this._schedule) {
      return null;
    }

    return this._schedule.phases.find(
      phase =>
        phase.start_date * 1000 < Date.now() &&
        phase.end_date * 1000 > Date.now()
    );
  }

  get nextPhase() {
    if (!this._schedule) {
      return null;
    }

    return this._schedule.phases.find(
      phase => phase.start_date * 1000 > Date.now()
    );
  }

  get isActive() {
    return this._schedule?.status === 'active';
  }

  async fromSchedule(schedule: string | Stripe.SubscriptionSchedule) {
    if (typeof schedule === 'string') {
      const s = await this.stripe.subscriptionSchedules
        .retrieve(schedule)
        .catch(e => {
          this.logger.error('Failed to retrieve subscription schedule', e);
          return undefined;
        });

      return ScheduleManager.create(this.stripe, s);
    } else {
      return ScheduleManager.create(this.stripe, schedule);
    }
  }

  async fromSubscription(
    idempotencyKey: string,
    subscription: string | Stripe.Subscription
  ) {
    if (typeof subscription === 'string') {
      subscription = await this.stripe.subscriptions.retrieve(subscription, {
        expand: ['schedule'],
      });
    }

    if (subscription.schedule) {
      return await this.fromSchedule(subscription.schedule);
    } else {
      const schedule = await this.stripe.subscriptionSchedules.create(
        { from_subscription: subscription.id },
        { idempotencyKey }
      );

      return await this.fromSchedule(schedule);
    }
  }

  /**
   * Cancel a subscription by marking schedule's end behavior to `cancel`.
   * At the same time, the coming phase's price and coupon will be saved to metadata for later resuming to correction subscription.
   */
  async cancel(idempotencyKey: string) {
    if (!this._schedule) {
      throw new Error('No schedule');
    }

    if (!this.isActive || !this.currentPhase) {
      throw new Error('Unexpected subscription schedule status');
    }

    const phases: Stripe.SubscriptionScheduleUpdateParams.Phase = {
      items: [
        {
          price: this.currentPhase.items[0].price as string,
          quantity: 1,
        },
      ],
      coupon: (this.currentPhase.coupon as string | null) ?? undefined,
      start_date: this.currentPhase.start_date,
      end_date: this.currentPhase.end_date,
    };

    if (this.nextPhase) {
      // cancel a subscription with a schedule exiting will delete the upcoming phase,
      // it's hard to recover the subscription to the original state if user wan't to resume before due.
      // so we manually save the next phase's key information to metadata for later easy resuming.
      phases.metadata = {
        next_coupon: (this.nextPhase.coupon as string | null) || null, // avoid empty string
        next_price: this.nextPhase.items[0].price as string,
      };
    }

    await this.stripe.subscriptionSchedules.update(
      this._schedule.id,
      {
        phases: [phases],
        end_behavior: 'cancel',
      },
      { idempotencyKey }
    );
  }

  async resume(idempotencyKey: string) {
    if (!this._schedule) {
      throw new Error('No schedule');
    }

    if (!this.isActive || !this.currentPhase) {
      throw new Error('Unexpected subscription schedule status');
    }

    const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [
      {
        items: [
          {
            price: this.currentPhase.items[0].price as string,
            quantity: 1,
          },
        ],
        coupon: (this.currentPhase.coupon as string | null) ?? undefined,
        start_date: this.currentPhase.start_date,
        end_date: this.currentPhase.end_date,
        metadata: {
          next_coupon: null,
          next_price: null,
        },
      },
    ];

    if (this.currentPhase.metadata && this.currentPhase.metadata.next_price) {
      phases.push({
        items: [
          {
            price: this.currentPhase.metadata.next_price,
            quantity: 1,
          },
        ],
        coupon: this.currentPhase.metadata.next_coupon || undefined,
      });
    }

    await this.stripe.subscriptionSchedules.update(
      this._schedule.id,
      {
        phases: phases,
        end_behavior: 'release',
      },
      { idempotencyKey }
    );
  }

  async release(idempotencyKey: string) {
    if (!this._schedule) {
      throw new Error('No schedule');
    }

    await this.stripe.subscriptionSchedules.release(this._schedule.id, {
      idempotencyKey,
    });
  }

  async update(idempotencyKey: string, price: string, coupon?: string) {
    if (!this._schedule) {
      throw new Error('No schedule');
    }

    if (!this.isActive || !this.currentPhase) {
      throw new Error('Unexpected subscription schedule status');
    }

    // if current phase's plan matches target, and no coupon change, just release the schedule
    if (
      this.currentPhase.items[0].price === price &&
      (!coupon || this.currentPhase.coupon === coupon)
    ) {
      await this.stripe.subscriptionSchedules.release(this._schedule.id, {
        idempotencyKey,
      });
      this._schedule = null;
    } else {
      await this.stripe.subscriptionSchedules.update(
        this._schedule.id,
        {
          phases: [
            {
              items: [
                {
                  price: this.currentPhase.items[0].price as string,
                },
              ],
              start_date: this.currentPhase.start_date,
              end_date: this.currentPhase.end_date,
            },
            {
              items: [
                {
                  price: price,
                  quantity: 1,
                },
              ],
              coupon,
            },
          ],
        },
        { idempotencyKey }
      );
    }
  }
}
