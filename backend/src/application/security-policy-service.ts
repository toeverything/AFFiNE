import { errors } from '../domain/errors.js';
import {
  defaultSecurityPolicy,
  emailDomain,
  type SecurityPolicy,
} from '../domain/security.js';
import type { Clock, SecurityPolicyStore } from '../domain/ports.js';

export class SecurityPolicyService {
  constructor(
    private readonly store: SecurityPolicyStore,
    private readonly clock: Clock
  ) {}

  async get(workspaceId: string | null): Promise<SecurityPolicy> {
    const owned = await this.store.getSecurityPolicy(workspaceId);
    if (owned) {
      return owned;
    }
    if (workspaceId) {
      const instance = await this.store.getSecurityPolicy(null);
      if (instance) {
        return { ...instance, workspaceId };
      }
    }
    return defaultSecurityPolicy(workspaceId, this.clock.now());
  }

  async update(
    workspaceId: string | null,
    patch: Partial<
      Pick<
        SecurityPolicy,
        | 'allowedGuestDomains'
        | 'blockPublicLinks'
        | 'requireSso'
        | 'requireSsoDomains'
        | 'sessionMaxDurationSec'
      >
    >
  ): Promise<SecurityPolicy> {
    const current = await this.get(workspaceId);
    const next: SecurityPolicy = {
      ...current,
      workspaceId,
      ...patch,
      updatedAt: this.clock.now(),
    };
    return this.store.upsertSecurityPolicy(next);
  }

  async assertGuestEmail(workspaceId: string, email: string): Promise<void> {
    const policy = await this.get(workspaceId);
    if (policy.allowedGuestDomains.length === 0) {
      return;
    }
    const domain = emailDomain(email);
    if (
      !policy.allowedGuestDomains
        .map(item => item.toLowerCase())
        .includes(domain)
    ) {
      throw errors.guestDomainDenied();
    }
  }

  async assertPublicLinksAllowed(workspaceId: string): Promise<void> {
    const policy = await this.get(workspaceId);
    if (policy.blockPublicLinks) {
      throw errors.publicLinksBlocked();
    }
  }

  async assertPasswordAllowed(email: string): Promise<void> {
    const policy = await this.get(null);
    if (!policy.requireSso && policy.requireSsoDomains.length === 0) {
      return;
    }
    const domain = emailDomain(email);
    const claimed = policy.requireSsoDomains.map(item => item.toLowerCase());
    if (policy.requireSso || claimed.includes(domain)) {
      throw errors.ssoRequired();
    }
  }
}
