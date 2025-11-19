import { randomUUID } from 'node:crypto';

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Logger,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { PrismaClient, Subscription } from '@prisma/client';
import type { Response } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';

import {
  CustomerPortalCreateFailed,
  InvalidLicenseToActivate,
  InvalidLicenseUpdateParams,
  LicenseNotFound,
  Mutex,
} from '../../../base';
import { Public } from '../../../core/auth';
import { SelfhostTeamSubscriptionManager } from '../manager/selfhost';
import { SubscriptionService } from '../service';
import { StripeFactory } from '../stripe';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '../types';

const UpdateSeatsParams = z.object({
  seats: z.number().min(1),
});

const UpdateRecurringParams = z.object({
  recurring: z.enum([
    SubscriptionRecurring.Monthly,
    SubscriptionRecurring.Yearly,
  ]),
});

@Public()
@Controller('/api/team/licenses')
export class LicenseController {
  private readonly logger = new Logger(LicenseController.name);

  constructor(
    private readonly db: PrismaClient,
    private readonly mutex: Mutex,
    private readonly subscription: SubscriptionService,
    private readonly manager: SelfhostTeamSubscriptionManager,
    private readonly stripeProvider: StripeFactory
  ) {}

  @Post('/:license/activate')
  async activate(@Res() res: Response, @Param('license') key: string) {
    await using lock = await this.mutex.acquire(`license-activation:${key}`);

    if (!lock) {
      throw new InvalidLicenseToActivate({
        reason: 'Too Many Requests',
      });
    }

    const license = await this.db.license.findUnique({
      where: {
        key,
      },
    });

    if (!license) {
      throw new InvalidLicenseToActivate({
        reason: 'License not found',
      });
    }

    const subscription = await this.manager.getActiveSubscription({
      key: license.key,
      plan: SubscriptionPlan.SelfHostedTeam,
    });

    if (
      !subscription ||
      license.installedAt ||
      subscription.status !== SubscriptionStatus.Active
    ) {
      throw new InvalidLicenseToActivate({
        reason: 'Invalid license',
      });
    }

    const validateKey = randomUUID();
    await this.db.license.update({
      where: {
        key,
      },
      data: {
        installedAt: new Date(),
        validateKey,
      },
    });

    res
      .status(HttpStatus.OK)
      .header('x-next-validate-key', validateKey)
      .json(this.license(subscription));
  }

  @Post('/:license/deactivate')
  async deactivate(@Param('license') key: string) {
    await this.db.license.update({
      where: {
        key,
      },
      data: {
        installedAt: null,
        validateKey: null,
      },
    });

    return {
      success: true,
    };
  }

  @Get('/:license/health')
  async health(
    @Res() res: Response,
    @Param('license') key: string,
    @Headers('x-validate-key') revalidateKey: string
  ) {
    const license = await this.db.license.findUnique({
      where: {
        key,
      },
    });

    const subscription = await this.manager.getActiveSubscription({
      key,
      plan: SubscriptionPlan.SelfHostedTeam,
    });

    if (!license || !subscription) {
      throw new LicenseNotFound();
    }

    if (!license.validateKey || license.validateKey !== revalidateKey) {
      throw new InvalidLicenseToActivate({
        reason: 'Invalid validate key',
      });
    }

    const validateKey = randomUUID();
    await this.db.license.update({
      where: {
        key,
      },
      data: {
        validateKey,
      },
    });

    res
      .status(HttpStatus.OK)
      .header('x-next-validate-key', validateKey)
      .json(this.license(subscription));
  }

  @Post('/:license/seats')
  async updateSeats(
    @Param('license') key: string,
    @Body() body: z.infer<typeof UpdateSeatsParams>
  ) {
    const parseResult = UpdateSeatsParams.safeParse(body);

    if (parseResult.error) {
      throw new InvalidLicenseUpdateParams({
        reason: parseResult.error.message,
      });
    }

    const license = await this.db.license.findUnique({
      where: {
        key,
      },
    });

    if (!license) {
      throw new LicenseNotFound();
    }

    await this.subscription.updateSubscriptionQuantity(
      {
        key: license.key,
        plan: SubscriptionPlan.SelfHostedTeam,
      },
      parseResult.data.seats
    );
  }

  @Post('/:license/recurring')
  async updateRecurring(
    @Param('license') key: string,
    @Body() body: z.infer<typeof UpdateRecurringParams>
  ) {
    const parseResult = UpdateRecurringParams.safeParse(body);

    if (parseResult.error) {
      throw new InvalidLicenseUpdateParams({
        reason: parseResult.error.message,
      });
    }

    const license = await this.db.license.findUnique({
      where: {
        key,
      },
    });

    if (!license) {
      throw new LicenseNotFound();
    }

    await this.subscription.updateSubscriptionRecurring(
      {
        key: license.key,
        plan: SubscriptionPlan.SelfHostedTeam,
      },
      parseResult.data.recurring
    );
  }

  @Post('/:license/create-customer-portal')
  async createCustomerPortal(@Param('license') key: string) {
    const subscription = await this.db.subscription.findFirst({
      where: {
        targetId: key,
      },
    });

    if (!subscription || !subscription.stripeSubscriptionId) {
      throw new LicenseNotFound();
    }

    const subscriptionData =
      await this.stripeProvider.stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId,
        {
          expand: ['customer'],
        }
      );

    const customer = subscriptionData.customer as Stripe.Customer;
    try {
      const portal =
        await this.stripeProvider.stripe.billingPortal.sessions.create({
          customer: customer.id,
        });

      return { url: portal.url };
    } catch (e) {
      this.logger.error('Failed to create customer portal.', e);
      throw new CustomerPortalCreateFailed();
    }
  }

  license(subscription: Subscription) {
    return {
      plan: subscription.plan,
      recurring: subscription.recurring,
      quantity: subscription.quantity,
      endAt: subscription.end?.getTime(),
    };
  }
}
