export interface WorkspaceWebhook {
  id: string;
  workspaceId: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: Date;
}

export interface WebhookDelivery {
  event: string;
  workspaceId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export const WEBHOOK_EVENTS = [
  'member.invited',
  'member.accepted',
  'share.published',
  'share.revoked',
  'comment.created',
  'jira.synced',
] as const;
