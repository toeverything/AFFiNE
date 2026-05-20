import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InstalledLicense, PrismaClient } from '@prisma/client';

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
import { EntitlementService } from '../../core/entitlement';
import { WorkspacePolicyService } from '../../core/permission';
import { QuotaStateService } from '../../core/quota/state';
import { Models } from '../../models';
import { ResolvedEntitlement, resolveEntitlementV1 } from '../../native';
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

const AFFINE_PRO_REQUEST_TIMEOUT = 10_000;

export interface LicensePreview {
  id: string;
  workspaceId: string;
  plan: SubscriptionPlan.SelfHostedTeam;
  recurring: SubscriptionRecurring;
  quantity: number;
  issuedAt: Date;
  expiresAt: Date;
  endAt: Date;
  entity: string;
  issuer: string;
  valid: boolean;
}

@Injectable()
export class LicenseService {
  private readonly logger = new Logger(LicenseService.name);

  constructor(
    private readonly db: PrismaClient,
    private readonly event: EventBus,
    private readonly models: Models,
    private readonly crypto: CryptoHelper,
    private readonly policy: WorkspacePolicyService,
    private readonly entitlement: EntitlementService,
    private readonly quotaState: QuotaStateService
  ) {}

  @OnEvent('workspace.subscription.canceled')
  async onWorkspaceSubscriptionCanceled({
    workspaceId,
    plan,
  }: Events['workspace.subscription.canceled']) {
    switch (plan) {
      case SubscriptionPlan.SelfHostedTeam:
        await this.policy.handleTeamPlanCanceled(workspaceId);
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
    const resolved = this.resolveWorkspaceTeamLicense(workspaceId, license);
    if (!resolved.valid) {
      throw new LicenseExpired();
    }

    const validatedAt = new Date();

    await this.event.emitAsync('workspace.subscription.activated', {
      workspaceId,
      plan: SubscriptionPlan.SelfHostedTeam,
      recurring: this.licenseRecurring(resolved),
      quantity: this.licenseQuantity(resolved),
    });
    await this.entitlement.upsertFromSelfhostLicense({
      workspaceId,
      recurring: this.licenseRecurring(resolved),
      quantity: this.licenseQuantity(resolved),
      expiresAt: this.licenseExpiresAt(resolved),
      validatedAt,
      variant: SubscriptionVariant.Onetime,
      license,
    });

    return this.db.installedLicense.findUniqueOrThrow({
      where: { workspaceId },
    });
  }

  previewLicense(license: Buffer): LicensePreview {
    const resolved = this.resolveWorkspaceTeamLicense(null, license);
    if (!resolved.valid) {
      throw new InvalidLicenseToActivate({
        reason: 'Invalid license.',
      });
    }
    const expiresAt = this.licenseExpiresAt(resolved);

    return {
      id: this.licenseSubjectId(resolved),
      workspaceId: this.licenseWorkspaceId(resolved),
      plan: SubscriptionPlan.SelfHostedTeam,
      recurring: this.licenseRecurring(resolved),
      quantity: this.licenseQuantity(resolved),
      issuedAt: new Date(resolved.issuedAt ?? ''),
      expiresAt,
      endAt: expiresAt,
      entity: resolved.entity ?? '',
      issuer: resolved.issuer ?? '',
      valid: true,
    };
  }

  async activateTeamLicense(workspaceId: string, licenseKey: string) {
    const installedLicense = await this.getLicense(workspaceId);

    if (installedLicense) {
      throw new WorkspaceLicenseAlreadyExists();
    }
    const occupiedLicense = await this.db.installedLicense.findUnique({
      where: { key: licenseKey },
    });
    if (occupiedLicense) {
      throw new WorkspaceLicenseAlreadyExists();
    }

    const data = await this.fetchAffinePro<License>(
      `/api/team/licenses/${licenseKey}/activate`,
      {
        method: 'POST',
      }
    );

    const validatedAt = new Date();
    const expiresAt = this.remoteLicenseExpiresAt(data);
    const validateKey = data.res.headers.get('x-next-validate-key') ?? '';

    this.event.emit('workspace.subscription.activated', {
      workspaceId,
      plan: data.plan,
      recurring: data.recurring,
      quantity: data.quantity,
    });
    await this.entitlement.upsertFromValidatedSelfhostLicense({
      workspaceId,
      licenseKey,
      recurring: data.recurring,
      quantity: data.quantity,
      expiresAt,
      validatedAt,
      validateKey,
    });

    return this.db.installedLicense.upsert({
      where: { workspaceId },
      update: {
        key: licenseKey,
        quantity: data.quantity,
        recurring: data.recurring,
        variant: null,
        validateKey,
        validatedAt,
        expiredAt: expiresAt,
        license: null,
      },
      create: {
        workspaceId,
        key: licenseKey,
        quantity: data.quantity,
        recurring: data.recurring,
        variant: null,
        validateKey,
        validatedAt,
        expiredAt: expiresAt,
        license: null,
      },
    });
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
    await this.entitlement.revokeBySubject('selfhost_license', license.key);

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
      const state =
        await this.quotaState.reconcileWorkspaceQuotaState(workspaceId);
      this.event.emit('workspace.members.allocateSeats', {
        workspaceId,
        quantity: state.seatLimit ?? 0,
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
        await this.revalidateOnetimeLicense(license);
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

      const validatedAt = new Date();
      const expiresAt = this.remoteLicenseExpiresAt(res);
      const validateKey = res.res.headers.get('x-next-validate-key') ?? '';

      this.event.emit('workspace.subscription.activated', {
        workspaceId: license.workspaceId,
        plan: res.plan,
        recurring: res.recurring,
        quantity: res.quantity,
      });
      await this.db.installedLicense.update({
        where: { key: license.key },
        data: {
          quantity: res.quantity,
          recurring: res.recurring,
          validateKey,
          validatedAt,
          expiredAt: expiresAt,
        },
      });

      if (license.license) {
        await this.entitlement.upsertFromSelfhostLicense({
          workspaceId: license.workspaceId,
          licenseKey: license.key,
          recurring: res.recurring,
          quantity: res.quantity,
          expiresAt,
          validatedAt,
          validateKey,
          license: Buffer.from(license.license),
        });
      } else {
        await this.entitlement.upsertFromValidatedSelfhostLicense({
          workspaceId: license.workspaceId,
          licenseKey: license.key,
          recurring: res.recurring,
          quantity: res.quantity,
          expiresAt,
          validatedAt,
          validateKey,
        });
      }

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
        await this.entitlement.revokeBySubject('selfhost_license', license.key);
      }

      return null;
    }
  }

  private remoteLicenseExpiresAt(license: Pick<License, 'endAt'>) {
    const expiresAt = new Date(license.endAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
      throw new LicenseExpired();
    }
    return expiresAt;
  }

  private async fetchAffinePro<T = any>(
    path: string,
    init?: RequestInit
  ): Promise<T & { res: Response }> {
    const endpoint =
      process.env.AFFINE_PRO_SERVER_ENDPOINT ?? 'https://app.affine.pro';

    try {
      const signal =
        init?.signal ??
        (AbortSignal.timeout
          ? AbortSignal.timeout(AFFINE_PRO_REQUEST_TIMEOUT)
          : undefined);
      const res = await fetch(endpoint + path, {
        ...init,
        signal,
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

  private async revalidateOnetimeLicense(license: InstalledLicense) {
    const buf = license.license;
    let valid = !!buf;

    if (buf) {
      try {
        const resolved = this.resolveWorkspaceTeamLicense(
          license.workspaceId,
          Buffer.from(buf)
        );

        if (!resolved.valid) {
          valid = false;
        } else {
          this.event.emit('workspace.subscription.activated', {
            workspaceId: license.workspaceId,
            plan: SubscriptionPlan.SelfHostedTeam,
            recurring: this.licenseRecurring(resolved),
            quantity: this.licenseQuantity(resolved),
          });
          await this.entitlement.upsertFromSelfhostLicense({
            workspaceId: license.workspaceId,
            recurring: this.licenseRecurring(resolved),
            quantity: this.licenseQuantity(resolved),
            expiresAt: this.licenseExpiresAt(resolved),
            validatedAt: new Date(),
            license: Buffer.from(buf),
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
      await this.entitlement.revokeBySubject('selfhost_license', license.key);
    }
  }

  private resolveWorkspaceTeamLicense(workspaceId: string | null, buf: Buffer) {
    if (!this.crypto.AFFiNEProPublicKey) {
      throw new InternalServerError(
        'License public key is not loaded. Please contact with Affine support.'
      );
    }

    if (!this.crypto.AFFiNEProLicenseAESKey) {
      throw new InternalServerError(
        'License AES key is not loaded. Please contact with Affine support.'
      );
    }

    const resolved = resolveEntitlementV1({
      deploymentType: 'selfhosted',
      targetType: 'workspace',
      targetId: workspaceId ?? undefined,
      signedPayload: buf,
      publicKey: this.crypto.AFFiNEProPublicKey.toString(),
      licenseAesKey: this.crypto.AFFiNEProLicenseAESKey.toString('hex'),
      now: new Date().toISOString(),
    });

    if (resolved.errorCode === 'workspace_mismatch') {
      throw new InvalidLicenseToActivate({
        reason: 'Workspace mismatched with license.',
      });
    }

    if (!resolved.valid && resolved.errorCode === 'expired_end_at') {
      throw new LicenseExpired();
    }

    if (!resolved.valid && resolved.status === 'expired') {
      throw new InvalidLicenseToActivate({
        reason:
          'License file has expired. Please contact with Affine support to fetch a latest one.',
      });
    }

    if (!resolved.valid && resolved.status !== 'expired') {
      throw new InvalidLicenseToActivate({
        reason: resolved.errorMessage ?? 'Failed to verify the license.',
      });
    }

    return resolved;
  }

  private licenseSubjectId(resolved: ResolvedEntitlement) {
    if (!resolved.subjectId) {
      throw new InvalidLicenseToActivate({
        reason: 'Invalid license payload.',
      });
    }
    return resolved.subjectId;
  }

  private licenseWorkspaceId(resolved: ResolvedEntitlement) {
    if (!resolved.targetId) {
      throw new InvalidLicenseToActivate({
        reason: 'Invalid license payload.',
      });
    }
    return resolved.targetId;
  }

  private licenseRecurring(resolved: ResolvedEntitlement) {
    if (!resolved.recurring) {
      throw new InvalidLicenseToActivate({
        reason: 'Invalid license payload.',
      });
    }
    return resolved.recurring as SubscriptionRecurring;
  }

  private licenseQuantity(resolved: ResolvedEntitlement) {
    if (!resolved.quantity) {
      throw new InvalidLicenseToActivate({
        reason: 'Invalid license payload.',
      });
    }
    return resolved.quantity;
  }

  private licenseExpiresAt(resolved: ResolvedEntitlement) {
    if (!resolved.expiresAt) {
      throw new InvalidLicenseToActivate({
        reason: 'Invalid license payload.',
      });
    }
    return new Date(resolved.expiresAt);
  }
}
