export type AuditActorType = 'user' | 'system' | 'sso';

export interface AuditEvent {
  id: string;
  workspaceId: string | null;
  actorId: string | null;
  actorType: AuditActorType;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface AuditQuery {
  workspaceId?: string;
  actorId?: string;
  action?: string;
  take?: number;
  after?: Date;
}

export const AUDIT_ACTIONS = [
  'auth.sign_in',
  'auth.sign_in_failed',
  'auth.sign_out',
  'auth.sso_login',
  'workspace.create',
  'workspace.delete',
  'member.invite',
  'member.accept',
  'member.revoke',
  'member.role_change',
  'share.publish',
  'share.revoke',
  'security.policy_update',
  'webhook.create',
  'webhook.delete',
  'webhook.deliver',
  'ai.session_create',
  'jira.push',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number] | string;
