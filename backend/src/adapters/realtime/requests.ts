import type { AuthService } from '../../application/auth-service.js';
import type { BlobService } from '../../application/blob-service.js';
import type { CommentService } from '../../application/comment-service.js';
import type { MembershipService } from '../../application/membership-service.js';
import type { ShareService } from '../../application/share-service.js';
import { errors } from '../../domain/errors.js';
import type { User } from '../../domain/identity.js';

const MEMBER_TAKE_MAX = 100;

export interface RealtimeServices {
  auth: AuthService;
  members: MembershipService;
  shares: ShareService;
  comments: CommentService;
  blobs: BlobService;
}

export const REALTIME_TOPICS = new Set([
  'workspace.members.changed',
  'workspace.access.changed',
  'workspace.config.changed',
  'workspace.invite-link.changed',
  'workspace.quota-state.changed',
  'doc.share-state.changed',
  'comment.changed',
  'user.profile.changed',
  'user.settings.changed',
  'user.quota-state.changed',
  'notification.count.changed',
]);

export async function handleRealtimeRequest(
  user: User,
  op: string,
  input: Record<string, unknown>,
  services: RealtimeServices
): Promise<unknown> {
  switch (op) {
    case 'workspace.members.get': {
      const workspaceId = stringArg(input, 'workspaceId');
      const take = clampTake(input.take);
      return services.members.listMembers(user, workspaceId, {
        skip: numberArg(input.skip, 0),
        take,
        ...(typeof input.query === 'string' ? { query: input.query } : {}),
      });
    }
    case 'workspace.access.get': {
      const workspaceId = stringArg(input, 'workspaceId');
      return {
        access: await services.members.accessSnapshot(user, workspaceId),
      };
    }
    case 'workspace.config.get': {
      const workspaceId = stringArg(input, 'workspaceId');
      return {
        config: await services.members.configSnapshot(user, workspaceId),
      };
    }
    case 'workspace.invite-link.get': {
      const workspaceId = stringArg(input, 'workspaceId');
      return {
        inviteLink: await services.members.getInviteLinkSnapshot(
          user,
          workspaceId
        ),
      };
    }
    case 'doc.share-state.get': {
      const workspaceId = stringArg(input, 'workspaceId');
      const docId = stringArg(input, 'docId');
      const doc = await services.shares.get(user, workspaceId, docId);
      return { state: services.shares.shareState(doc) };
    }
    case 'comment.changes.get': {
      const workspaceId = stringArg(input, 'workspaceId');
      const docId = stringArg(input, 'docId');
      const page = await services.comments.listChanges(
        user,
        workspaceId,
        docId,
        {
          ...(typeof input.after === 'string' ? { after: input.after } : {}),
          ...(typeof input.first === 'number' ? { first: input.first } : {}),
        }
      );
      return {
        changes: page.items.map(change => ({
          id: change.id,
          action: change.action,
          item: change.item,
          commentId: change.commentId,
        })),
        startCursor: page.startCursor ?? '',
        endCursor: page.endCursor ?? '',
        hasNextPage: page.hasNextPage,
      };
    }
    case 'workspace.quota-state.get': {
      const workspaceId = stringArg(input, 'workspaceId');
      const quota = await services.blobs.quota(user, workspaceId);
      const owner = await services.members.accessSnapshot(user, workspaceId);
      return {
        state: {
          plan: 'Mosaic',
          ownerUserId: user.id,
          usesOwnerQuota: owner.role === 'Owner',
          seatLimit: quota.memberLimit,
          memberCount: quota.memberCount,
          overcapacityMemberCount: 0,
          blobLimit: quota.blobLimit,
          storageQuota: quota.storageQuota,
          usedStorageQuota: quota.usedStorageQuota,
          historyPeriodSeconds: Math.floor(quota.historyPeriod / 1000),
          readonly: false,
          readonlyReasons: [],
          unlimitedCopilot: false,
        },
      };
    }
    case 'user.quota-state.get':
      return {
        state: {
          plan: 'Mosaic',
          seatLimit: 10_000,
          blobLimit: 100 * 1024 * 1024,
          storageQuota: 100 * 1024 * 1024 * 1024,
          usedStorageQuota: 0,
          historyPeriodSeconds: 7 * 24 * 60 * 60,
          unlimitedCopilot: false,
        },
      };
    case 'user.profile.get':
      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          hasPassword: true,
          avatarUrl: user.avatarUrl,
          features: user.features,
        },
      };
    case 'user.settings.get':
      return {
        settings: {
          receiveInvitationEmail: false,
          receiveMentionEmail: false,
          receiveCommentEmail: false,
        },
      };
    case 'notification.count.get':
      return { count: 0 };
    case 'doc.grants.get': {
      stringArg(input, 'workspaceId');
      stringArg(input, 'docId');
      return {
        totalCount: 0,
        pageInfo: { endCursor: null, hasNextPage: false },
        edges: [],
      };
    }
    case 'workspace.embedding.progress.get': {
      stringArg(input, 'workspaceId');
      return { total: 0, embedded: 0 };
    }
    default:
      throw errors.actionForbidden(
        'Realtime is not enabled on this Mosaic server.'
      );
  }
}

export function workspaceIdOfTopic(
  topic: string,
  input: Record<string, unknown>
): string | null {
  if (
    topic.startsWith('workspace.') ||
    topic.startsWith('doc.') ||
    topic === 'comment.changed'
  ) {
    return typeof input.workspaceId === 'string' ? input.workspaceId : null;
  }
  return null;
}

function stringArg(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw errors.badRequest(`${key} is required.`);
  }
  return value;
}

function numberArg(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;
}

function clampTake(value: unknown): number {
  const take = typeof value === 'number' && Number.isFinite(value) ? value : 8;
  return Math.min(MEMBER_TAKE_MAX, Math.max(1, take));
}
