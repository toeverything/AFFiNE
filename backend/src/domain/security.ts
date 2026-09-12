export interface SecurityPolicy {
  workspaceId: string | null;
  allowedGuestDomains: string[];
  blockPublicLinks: boolean;
  requireSso: boolean;
  requireSsoDomains: string[];
  sessionMaxDurationSec: number | null;
  updatedAt: Date;
}

export function defaultSecurityPolicy(
  workspaceId: string | null,
  now: Date
): SecurityPolicy {
  return {
    workspaceId,
    allowedGuestDomains: [],
    blockPublicLinks: false,
    requireSso: false,
    requireSsoDomains: [],
    sessionMaxDurationSec: null,
    updatedAt: now,
  };
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}
