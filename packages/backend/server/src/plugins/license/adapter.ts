import { type InstalledLicense } from '@prisma/client';

import {
  CryptoHelper,
  InternalServerError,
  InvalidLicenseToActivate,
  LicenseExpired,
  metrics,
  UserFriendlyError,
  WorkspaceLicenseAlreadyExists,
} from '../../base';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { type ResolvedEntitlement, resolveEntitlementV1 } from '../../native';
import { SubscriptionPlan, SubscriptionRecurring } from '../payment/types';

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

export function installedLicense(
  input: NonNullable<
    Awaited<ReturnType<BackendRuntimeProvider['getInstalledLicenseV1']>>
  >
): InstalledLicense {
  return {
    ...input,
    variant: input.variant ?? null,
    license: input.license ?? null,
    installedAt: new Date(input.installedAt),
    validatedAt: new Date(input.validatedAt),
    expiredAt: input.expiredAt ? new Date(input.expiredAt) : null,
  };
}

export function throwNativeLicenseError(error: unknown): never {
  if (error instanceof Error) {
    try {
      const friendly = UserFriendlyError.fromUserFriendlyErrorJSON(
        JSON.parse(error.message)
      );
      throw friendly;
    } catch (parsed) {
      if (parsed instanceof UserFriendlyError) throw parsed;
    }
    if (error.message === 'workspace_license_already_exists')
      throw new WorkspaceLicenseAlreadyExists();
    if (error.message === 'license_expired') throw new LicenseExpired();
    if (
      error.message.startsWith('license_') &&
      error.message !== 'license_generation_changed'
    ) {
      throw new InvalidLicenseToActivate({ reason: error.message });
    }
  }
  throw error;
}

export function throwNativeLicenseInstallError(error: unknown): never {
  if (error instanceof Error) {
    if (error.message === 'license_workspace_mismatch') {
      throw new InvalidLicenseToActivate({
        reason: 'Workspace mismatched with license.',
      });
    }
    if (error.message === 'license_expired') {
      throw new InvalidLicenseToActivate({ reason: 'license expired' });
    }
  }
  throwNativeLicenseError(error);
}

export function resolveWorkspaceTeamLicense(
  crypto: CryptoHelper,
  workspaceId: string | null,
  buf: Buffer
): LicensePreview {
  if (!crypto.AFFiNEProPublicKey) {
    throw new InternalServerError(
      'License public key is not loaded. Please contact with Affine support.'
    );
  }

  let resolved: ResolvedEntitlement;
  try {
    resolved = resolveEntitlementV1({
      deploymentType: 'selfhosted',
      targetType: 'workspace',
      targetId: workspaceId ?? undefined,
      signedPayload: buf,
      publicKey: crypto.AFFiNEProPublicKey.toString(),
      now: new Date().toISOString(),
    });
  } catch (error) {
    metrics.license.counter('verification_total').add(1, {
      deployment: 'selfhosted',
      result: 'error',
      reason: 'invalid_input',
    });
    throw error;
  }
  metrics.license.counter('verification_total').add(1, {
    deployment: 'selfhosted',
    result: resolved.valid ? 'allow' : 'deny',
    reason: resolved.errorCode ?? 'valid',
  });

  if (resolved.errorCode === 'workspace_mismatch') {
    throw new InvalidLicenseToActivate({
      reason: 'Workspace mismatched with license.',
    });
  }

  if (!resolved.valid) {
    throw new InvalidLicenseToActivate({
      reason: resolved.errorMessage ?? 'Failed to verify the license.',
    });
  }

  if (
    !resolved.subjectId ||
    !resolved.targetId ||
    !resolved.quantity ||
    !resolved.expiresAt ||
    !resolved.issuedAt
  ) {
    throw new InvalidLicenseToActivate({ reason: 'Invalid license payload.' });
  }
  const expiresAt = new Date(resolved.expiresAt);
  return {
    id: resolved.subjectId,
    workspaceId: resolved.targetId,
    plan: SubscriptionPlan.SelfHostedTeam,
    recurring: (resolved.recurring ??
      SubscriptionRecurring.Lifetime) as SubscriptionRecurring,
    quantity: resolved.quantity,
    issuedAt: new Date(resolved.issuedAt),
    expiresAt,
    endAt: expiresAt,
    entity: resolved.entity ?? '',
    issuer: resolved.issuer ?? '',
    valid: true,
  };
}
