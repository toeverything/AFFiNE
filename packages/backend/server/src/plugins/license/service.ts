import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InstalledLicense, PrismaClient } from '@prisma/client';

import {
  Config,
  EventBus,
  InternalServerError,
  LicenseNotFound,
  OnEvent,
  UserFriendlyError,
  WorkspaceLicenseAlreadyExists,
} from '../../base';
import { Models } from '../../models';
import { SubscriptionPlan, SubscriptionRecurring } from '../payment/types';

interface License {
  plan: SubscriptionPlan;
  recurring: SubscriptionRecurring;
  quantity: number;
  endAt: number;
}

@Injectable()
export class LicenseService implements OnModuleInit {
  private readonly logger = new Logger(LicenseService.name);

  constructor(
    private readonly config: Config,
    private readonly db: PrismaClient,
    private readonly event: EventBus,
    private readonly models: Models
  ) {}

  async onModuleInit() {
    if (this.config.isSelfhosted) {
      this.event.on(
        'workspace.subscription.activated',
        this.onWorkspaceSubscriptionUpdated
      );
      this.event.on(
        'workspace.subscription.canceled',
        this.onWorkspaceSubscriptionCanceled
      );
    }
  }

  private readonly onWorkspaceSubscriptionUpdated = async ({
    workspaceId,
    plan,
    recurring,
    quantity,
  }: Events['workspace.subscription.activated']) => {
    switch (plan) {
      case SubscriptionPlan.SelfHostedTeam:
        await this.models.workspaceFeature.add(
          workspaceId,
          'team_plan_v1',
          `${recurring} team subscription activated`,
          {
            memberLimit: quantity,
          }
        );
        await this.models.workspaceUser.refresh(workspaceId, quantity);
        break;
      default:
        break;
    }
  };

  private readonly onWorkspaceSubscriptionCanceled = async ({
    workspaceId,
    plan,
  }: Events['workspace.subscription.canceled']) => {
    switch (plan) {
      case SubscriptionPlan.SelfHostedTeam:
        await this.models.workspaceFeature.remove(workspaceId, 'team_plan_v1');
        break;
      default:
        break;
    }
  };

  async getLicense(workspaceId: string) {
    return this.db.installedLicense.findUnique({
      select: {
        installedAt: true,
        validatedAt: true,
        expiredAt: true,
        quantity: true,
        recurring: true,
      },
      where: {
        workspaceId,
      },
    });
  }

  async activateTeamLicense(workspaceId: string, licenseKey: string) {
    const installedLicense = await this.getLicense(workspaceId);

    if (installedLicense) {
      throw new WorkspaceLicenseAlreadyExists();
    }

    const data = await this.fetchAffinePro<License>(
      `/api/team/licenses/${licenseKey}/activate`,
      {
        method: 'POST',
      }
    );

    const license = await this.db.installedLicense.upsert({
      where: {
        workspaceId,
      },
      update: {
        key: licenseKey,
        validatedAt: new Date(),
        validateKey: data.res.headers.get('x-next-validate-key') ?? '',
        expiredAt: new Date(data.endAt),
        recurring: data.recurring,
        quantity: data.quantity,
      },
      create: {
        workspaceId,
        key: licenseKey,
        expiredAt: new Date(data.endAt),
        validatedAt: new Date(),
        validateKey: data.res.headers.get('x-next-validate-key') ?? '',
        recurring: data.recurring,
        quantity: data.quantity,
      },
    });

    this.event.emit('workspace.subscription.activated', {
      workspaceId,
      plan: data.plan,
      recurring: data.recurring,
      quantity: data.quantity,
    });
    return license;
  }

  async deactivateTeamLicense(workspaceId: string) {
    const license = await this.db.installedLicense.findUnique({
      where: {
        workspaceId,
      },
    });

    if (!license) {
      throw new LicenseNotFound();
    }

    await this.fetchAffinePro(`/api/team/licenses/${license.key}/deactivate`, {
      method: 'POST',
    });

    await this.db.installedLicense.deleteMany({
      where: {
        workspaceId,
      },
    });

    this.event.emit('workspace.subscription.canceled', {
      workspaceId,
      plan: SubscriptionPlan.SelfHostedTeam,
      recurring: SubscriptionRecurring.Monthly,
    });
    return true;
  }

  async updateTeamRecurring(key: string, recurring: SubscriptionRecurring) {
    await this.fetchAffinePro(`/api/team/licenses/${key}/recurring`, {
      method: 'POST',
      body: JSON.stringify({
        recurring,
      }),
    });
  }

  async createCustomerPortal(workspaceId: string) {
    const license = await this.db.installedLicense.findUnique({
      where: {
        workspaceId,
      },
    });

    if (!license) {
      throw new LicenseNotFound();
    }

    return this.fetchAffinePro<{ url: string }>(
      `/api/team/licenses/${license.key}/create-customer-portal`,
      {
        method: 'POST',
      }
    );
  }

  @OnEvent('workspace.members.updated')
  async updateTeamSeats(payload: Events['workspace.members.updated']) {
    if (!this.config.isSelfhosted) {
      return;
    }

    const { workspaceId, count } = payload;

    const license = await this.db.installedLicense.findUnique({
      where: {
        workspaceId,
      },
    });

    if (!license) {
      return;
    }

    await this.fetchAffinePro(`/api/team/licenses/${license.key}/seats`, {
      method: 'POST',
      body: JSON.stringify({
        seats: count,
      }),
    });

    // stripe payment is async, we can't directly the charge result in update calling
    await this.waitUntilLicenseUpdated(license, count);
  }

  private async waitUntilLicenseUpdated(
    license: InstalledLicense,
    memberRequired: number
  ) {
    let tried = 0;
    while (tried++ < 10) {
      try {
        const res = await this.revalidateLicense(license);

        if (res?.quantity === memberRequired) {
          return;
        }
      } catch (e) {
        this.logger.error('Failed to check license health', e);
      }

      await new Promise(resolve => setTimeout(resolve, tried * 2000));
    }

    // fallback to health check if we can't get the upgrade result immediately
    throw new Error('Timeout checking seat update result.');
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async licensesHealthCheck() {
    if (!this.config.isSelfhosted) {
      return;
    }

    const licenses = await this.db.installedLicense.findMany({
      where: {
        validatedAt: {
          lte: new Date(Date.now() - 1000 * 60 * 60 /* 1h */),
        },
      },
    });

    for (const license of licenses) {
      await this.revalidateLicense(license);
    }
  }

  private async revalidateLicense(license: InstalledLicense) {
    try {
      const res = await this.fetchAffinePro<License>(
        `/api/team/licenses/${license.key}/health`,
        {
          headers: {
            'x-validate-key': license.validateKey,
          },
        }
      );

      await this.db.installedLicense.update({
        where: {
          key: license.key,
        },
        data: {
          validatedAt: new Date(),
          validateKey: res.res.headers.get('x-next-validate-key') ?? '',
          quantity: res.quantity,
          recurring: res.recurring,
          expiredAt: new Date(res.endAt),
        },
      });

      this.event.emit('workspace.subscription.activated', {
        workspaceId: license.workspaceId,
        plan: res.plan,
        recurring: res.recurring,
        quantity: res.quantity,
      });

      return res;
    } catch (e) {
      this.logger.error('Failed to revalidate license', e);

      // only treat known error as invalid license response
      if (
        e instanceof UserFriendlyError &&
        e.name !== 'internal_server_error'
      ) {
        this.event.emit('workspace.subscription.canceled', {
          workspaceId: license.workspaceId,
          plan: SubscriptionPlan.SelfHostedTeam,
          recurring: SubscriptionRecurring.Monthly,
        });
      }

      return null;
    }
  }

  private async fetchAffinePro<T = any>(
    path: string,
    init?: RequestInit
  ): Promise<T & { res: Response }> {
    const endpoint =
      process.env.AFFINE_PRO_SERVER_ENDPOINT ?? 'https://app.affine.pro';

    try {
      const res = await fetch(endpoint + path, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      });

      if (!res.ok) {
        const body = (await res.json()) as UserFriendlyError;
        throw UserFriendlyError.fromUserFriendlyErrorJSON(body);
      }

      const data = (await res.json()) as T;
      return {
        ...data,
        res,
      };
    } catch (e) {
      if (e instanceof UserFriendlyError) {
        throw e;
      }

      throw new InternalServerError(
        e instanceof Error
          ? e.message
          : 'Failed to contact with https://app.affine.pro'
      );
    }
  }
}
