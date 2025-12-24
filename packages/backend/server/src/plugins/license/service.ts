import { createDecipheriv, createVerify } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InstalledLicense, PrismaClient } from '@prisma/client';
import { z } from 'zod';

import {
  CryptoHelper,
  EventBus,
  InternalServerError,
  InvalidLicenseToActivate,
  LicenseExpired,
  LicenseNotFound,
  OnEvent,
  UserFriendlyError,
  WorkspaceLicenseAlreadyExists,
} from '../../base';
import { Models } from '../../models';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionVariant,
} from '../payment/types';

interface License {
  plan: SubscriptionPlan;
  recurring: SubscriptionRecurring;
  quantity: number;
  endAt: number;
}

const BaseLicenseSchema = z.object({
  entity: z.string().nonempty(),
  issuer: z.string().nonempty(),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

const TeamLicenseSchema = z
  .object({
    subject: z.literal(SubscriptionPlan.SelfHostedTeam),
    data: z.object({
      id: z.string().nonempty(),
      workspaceId: z.string().nonempty(),
      plan: z.literal(SubscriptionPlan.SelfHostedTeam),
      recurring: z.nativeEnum(SubscriptionRecurring),
      quantity: z.number().positive(),
      endAt: z.string().datetime(),
    }),
  })
  .extend(BaseLicenseSchema.shape);

@Injectable()
export class LicenseService {
  private readonly logger = new Logger(LicenseService.name);

  constructor(
    private readonly db: PrismaClient,
    private readonly event: EventBus,
    private readonly models: Models,
    private readonly crypto: CryptoHelper
  ) {}

  @OnEvent('workspace.subscription.activated')
  async onWorkspaceSubscriptionUpdated({
    workspaceId,
    plan,
    recurring,
    quantity,
  }: Events['workspace.subscription.activated']) {
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
        this.event.emit('workspace.members.allocateSeats', {
          workspaceId,
          quantity,
        });
        break;
      default:
        break;
    }
  }

  @OnEvent('workspace.subscription.canceled')
  async onWorkspaceSubscriptionCanceled({
    workspaceId,
    plan,
  }: Events['workspace.subscription.canceled']) {
    switch (plan) {
      case SubscriptionPlan.SelfHostedTeam:
        await this.models.workspaceFeature.remove(workspaceId, 'team_plan_v1');
        break;
      default:
        break;
    }
  }

  async getLicense(workspaceId: string) {
    return this.db.installedLicense.findUnique({
      select: {
        installedAt: true,
        validatedAt: true,
        expiredAt: true,
        quantity: true,
        recurring: true,
        variant: true,
      },
      where: {
        workspaceId,
      },
    });
  }

  async installLicense(workspaceId: string, license: Buffer) {
    const payload = this.decryptWorkspaceTeamLicense(workspaceId, license);
    const data = payload.data;
    const now = new Date();

    if (new Date(payload.expiresAt) < now || new Date(data.endAt) < now) {
      throw new LicenseExpired();
    }

    const installed = await this.db.installedLicense.upsert({
      where: {
        workspaceId,
      },
      update: {
        key: data.id,
        expiredAt: new Date(data.endAt),
        validatedAt: new Date(),
        recurring: data.recurring,
        quantity: data.quantity,
        variant: SubscriptionVariant.Onetime,
        license,
      },
      create: {
        key: data.id,
        workspaceId,
        expiredAt: new Date(data.endAt),
        validateKey: '',
        validatedAt: new Date(),
        recurring: data.recurring,
        quantity: data.quantity,
        variant: SubscriptionVariant.Onetime,
        license,
      },
    });

    await this.event.emitAsync('workspace.subscription.activated', {
      workspaceId,
      plan: data.plan,
      recurring: data.recurring,
      quantity: data.quantity,
    });

    return installed;
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

  async removeTeamLicense(workspaceId: string) {
    const license = await this.db.installedLicense.findUnique({
      where: {
        workspaceId,
      },
    });

    if (!license) {
      throw new LicenseNotFound();
    }

    await this.db.installedLicense.deleteMany({
      where: {
        workspaceId: license.workspaceId,
      },
    });

    if (license.variant !== SubscriptionVariant.Onetime) {
      await this.deactivateTeamLicense(license);
    }

    this.event.emit('workspace.subscription.canceled', {
      workspaceId: license.workspaceId,
      plan: SubscriptionPlan.SelfHostedTeam,
      recurring: license.recurring as SubscriptionRecurring,
    });

    return true;
  }

  async deactivateTeamLicense(license: InstalledLicense) {
    await this.fetchAffinePro(`/api/team/licenses/${license.key}/deactivate`, {
      method: 'POST',
    });
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
    const { workspaceId } = payload;

    const license = await this.db.installedLicense.findUnique({
      where: {
        workspaceId,
      },
    });

    if (!license) {
      return;
    }

    if (license.variant === SubscriptionVariant.Onetime) {
      this.event.emit('workspace.members.allocateSeats', {
        workspaceId,
        quantity: license.quantity,
      });

      return;
    }

    const count = await this.models.workspaceUser.chargedCount(workspaceId);
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
        const res = await this.revalidateRecurringLicense(license);

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

  @Cron(CronExpression.EVERY_10_MINUTES, { disabled: !env.selfhosted })
  async licensesHealthCheck() {
    const licenses = await this.db.installedLicense.findMany({
      where: {
        validatedAt: {
          lte: new Date(Date.now() - 1000 * 60 * 60 /* 1h */),
        },
      },
    });

    for (const license of licenses) {
      if (license.variant === SubscriptionVariant.Onetime) {
        this.revalidateOnetimeLicense(license);
      } else {
        await this.revalidateRecurringLicense(license);
      }
    }
  }

  private async revalidateRecurringLicense(license: InstalledLicense) {
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

  private revalidateOnetimeLicense(license: InstalledLicense) {
    const buf = license.license;
    let valid = !!buf;

    if (buf) {
      try {
        const { data } = this.decryptWorkspaceTeamLicense(
          license.workspaceId,
          Buffer.from(buf)
        );

        if (new Date(data.endAt) < new Date()) {
          valid = false;
        } else {
          this.event.emit('workspace.subscription.activated', {
            workspaceId: license.workspaceId,
            plan: data.plan,
            recurring: data.recurring,
            quantity: data.quantity,
          });
        }
      } catch {
        valid = false;
      }
    }

    if (!valid) {
      this.event.emit('workspace.subscription.canceled', {
        workspaceId: license.workspaceId,
        plan: SubscriptionPlan.SelfHostedTeam,
        recurring: SubscriptionRecurring.Monthly,
      });
    }
  }

  private decryptWorkspaceTeamLicense(workspaceId: string, buf: Buffer) {
    if (!this.crypto.AFFiNEProPublicKey) {
      throw new InternalServerError(
        'License public key is not loaded. Please contact with Affine support.'
      );
    }

    // we use workspace id as aes key hash plain text content
    // verify signature to make sure the payload or signature is not forged
    const { payload: payloadStr, signature, iv } = this.decryptLicense(buf);

    const verifier = createVerify('rsa-sha256');
    verifier.update(iv);
    verifier.update(payloadStr);
    const valid = verifier.verify(
      this.crypto.AFFiNEProPublicKey,
      signature,
      'hex'
    );
    if (!valid) {
      throw new InvalidLicenseToActivate({
        reason: 'Invalid license signature.',
      });
    }

    const payload = JSON.parse(payloadStr);

    const parseResult = TeamLicenseSchema.safeParse(payload);

    if (!parseResult.success) {
      throw new InvalidLicenseToActivate({
        reason: 'Invalid license payload.',
      });
    }

    if (new Date(parseResult.data.expiresAt) < new Date()) {
      throw new InvalidLicenseToActivate({
        reason:
          'License file has expired. Please contact with Affine support to fetch a latest one.',
      });
    }

    if (parseResult.data.data.workspaceId !== workspaceId) {
      throw new InvalidLicenseToActivate({
        reason: 'Workspace mismatched with license.',
      });
    }

    return parseResult.data;
  }

  private decryptLicense(buf: Buffer) {
    if (!this.crypto.AFFiNEProLicenseAESKey) {
      throw new InternalServerError(
        'License AES key is not loaded. Please contact with Affine support.'
      );
    }

    if (buf.length < 2) {
      throw new InvalidLicenseToActivate({
        reason: 'Invalid license file.',
      });
    }

    try {
      const ivLength = buf.readUint8(0);
      const authTagLength = buf.readUInt8(1);

      const iv = buf.subarray(2, 2 + ivLength);
      const tag = buf.subarray(2 + ivLength, 2 + ivLength + authTagLength);
      const payload = buf.subarray(2 + ivLength + authTagLength);

      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.crypto.AFFiNEProLicenseAESKey,
        iv,
        {
          authTagLength,
        }
      );
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([
        decipher.update(payload),
        decipher.final(),
      ]);

      const data = JSON.parse(decrypted.toString('utf-8')) as {
        payload: string;
        signature: string;
      };

      return {
        ...data,
        iv,
      };
    } catch {
      // we use workspace id as aes key hash plain text content
      throw new InvalidLicenseToActivate({
        reason: 'Failed to verify the license.',
      });
    }
  }
}
