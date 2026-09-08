import type {
  AuthorizePermissionInputV1,
  BackendRuntime,
  DomainCommandInputV1,
  DomainCommandOutputV1,
  PermissionEvaluationOutputV1,
} from '../../native';

export type RuntimeInstance = InstanceType<typeof BackendRuntime>;

export type RuntimePermissionMethods = RuntimeInstance & {
  authorizePermissionV1(
    input: AuthorizePermissionInputV1
  ): Promise<PermissionEvaluationOutputV1>;
  executeDomainCommandV1(
    input: DomainCommandInputV1
  ): Promise<DomainCommandOutputV1>;
};

export type BlobSourceV1 =
  | { type: 'currentDoc'; workspaceId: string; docId: string }
  | {
      type: 'history';
      workspaceId: string;
      docId: string;
      timestampMs: number;
    };

export type BlobManifestEntryV1 = {
  key: string;
  mime: string;
  size: number;
  source: BlobSourceV1;
};

export type BlobManifestV1 = {
  version: 1;
  entries: BlobManifestEntryV1[];
  nextCursor?: string;
};

export type RuntimeQuotaTargetDomainInput = {
  domain: string;
  count: number;
};

export type RuntimeQuotaSourceInput = {
  trusted: boolean;
  ip?: string;
  country?: string;
  asn?: number;
  rayId?: string;
};

export type RuntimeWorkspaceInviteQuotaInput = {
  actorUserId: string;
  workspaceId: string;
  requestId?: string;
  targetCount: number;
  targetDomains: RuntimeQuotaTargetDomainInput[];
  source?: RuntimeQuotaSourceInput;
};

export type RuntimeWorkspaceInviteQuotaUsage = {
  targetCount: number;
  targetDomains: RuntimeQuotaTargetDomainInput[];
};

export type RuntimeWorkspaceActionDecision = {
  allowed: boolean;
  retryAfterSeconds?: number;
  reason?: string;
};

export type RuntimeStorageReservationInput = {
  workspaceId: string;
  userId: string;
  key: string;
  size: number;
  mime: string;
  kind: 'blob' | 'comment_attachment';
  docId?: string;
  name?: string;
  uploadId?: string;
};

export type RuntimeStorageReservationDecision = {
  allowed: boolean;
  reservationId?: string;
  alreadyUploaded: boolean;
  reason?: string;
  limit?: number;
  current?: number;
  requested: number;
};

export type RuntimeStorageReservationMutation = {
  workspaceId: string;
  userId: string;
  key: string;
  reservationId: string;
  kind: 'blob' | 'comment_attachment';
  docId?: string;
  size?: number;
  mime?: string;
};

export type RuntimeSeatReservationDecision = {
  allowed: boolean;
  reason?: string;
  limit: number;
  current: number;
  reservations: Array<{
    invitationId: string;
    userId: string;
    email: string;
    status: string;
  }>;
};

export type RuntimeInviteAbuseAction =
  | 'ban_actor'
  | 'quarantine_actor'
  | 'quarantine_workspace'
  | 'quarantine_source_cohort';

const RUNTIME_INVITE_ABUSE_ACTIONS = new Set<RuntimeInviteAbuseAction>([
  'ban_actor',
  'quarantine_actor',
  'quarantine_workspace',
  'quarantine_source_cohort',
]);

export type RuntimeInviteAbuseClaimedAction = {
  action: RuntimeInviteAbuseAction;
  subjectKey: string;
  evidenceId: string;
  actionId: string;
  actorUserId: string;
  workspaceId: string;
};

type NativeRuntimeInviteAbuseClaimedAction = Omit<
  RuntimeInviteAbuseClaimedAction,
  'action'
> & {
  action: string;
};

export type RuntimeWorkspaceInviteQuotaDecision = {
  allowed: boolean;
  reservationId?: string;
  retryAfterSeconds?: number;
  reason?: string;
  scopeKey?: string;
  windowSeconds?: number;
  limit?: number;
  current?: number;
  requested?: number;
  actionRequired?: {
    action: RuntimeInviteAbuseAction;
    subjectKey: string;
    evidenceId: string;
    actionId: string;
  };
};

type NativeRuntimeInviteAbuseActionRequired = Omit<
  NonNullable<RuntimeWorkspaceInviteQuotaDecision['actionRequired']>,
  'action'
> & {
  action: string;
};

type NativeRuntimeWorkspaceInviteQuotaDecision = Omit<
  RuntimeWorkspaceInviteQuotaDecision,
  'actionRequired'
> & {
  actionRequired?: NativeRuntimeInviteAbuseActionRequired;
};

export type RuntimeMailDeliveryQuotaInput = {
  requestId?: string;
  mailName: string;
  recipient: {
    email: string;
    userId?: string;
  };
  metadata: {
    actorUserId?: string;
    workspaceId?: string;
    notificationId?: string;
    abuseSubjectKey?: string;
  };
  source?: RuntimeQuotaSourceInput;
};

export type RuntimeMailDeliveryQuotaDecision = {
  allowed: boolean;
  reservationId?: string;
  mailClass: string;
  retryAfterSeconds?: number;
  reason?: string;
  scopeKey?: string;
  windowSeconds?: number;
  limit?: number;
  current?: number;
  requested?: number;
};

export type RuntimeQuotaMethods = RuntimeInstance & {
  listManagedWorkspaceBlobsV1(
    actorUserId: string,
    workspaceId: string
  ): Promise<
    Array<{ key: string; mime: string; size: number; createdAt: string }>
  >;
  manageWorkspaceBlobV1(input: {
    workspaceId: string;
    actorUserId: string;
    key: string;
    permanently: boolean;
  }): Promise<boolean>;
  releaseManagedWorkspaceBlobsV1(
    actorUserId: string,
    workspaceId: string,
    limit: number
  ): Promise<number>;
  cleanupExpiredStorageReservationsV1(limit: number): Promise<number>;
  activateWorkspaceSeatV1(input: {
    workspaceId: string;
    actorUserId: string;
    targetUserId: string;
    requireManagePermission: boolean;
  }): Promise<boolean>;
  reserveWorkspaceReviewSeatV1(input: {
    workspaceId: string;
    targetUserId: string;
    inviterUserId: string;
  }): Promise<boolean>;
  reserveWorkspaceSeatsV1(input: {
    workspaceId: string;
    actorUserId: string;
    targets: Array<{ email: string }>;
  }): Promise<RuntimeSeatReservationDecision>;
  reserveStorageQuotaV1(
    input: RuntimeStorageReservationInput
  ): Promise<RuntimeStorageReservationDecision>;
  finalizeStorageReservationV1(
    input: RuntimeStorageReservationMutation
  ): Promise<boolean>;
  abortStorageReservationV1(
    input: RuntimeStorageReservationMutation
  ): Promise<boolean>;
  evaluateWorkspaceInviteLinkV1(
    actorUserId: string,
    workspaceId: string
  ): Promise<RuntimeWorkspaceActionDecision>;
  assertWorkspaceInviteQuotaV1(
    input: RuntimeWorkspaceInviteQuotaInput
  ): Promise<NativeRuntimeWorkspaceInviteQuotaDecision>;
  commitWorkspaceInviteQuotaV1(
    reservationId: string,
    usage: RuntimeWorkspaceInviteQuotaUsage
  ): Promise<boolean>;
  releaseWorkspaceInviteQuotaV1(reservationId: string): Promise<boolean>;
  assertMailDeliveryQuotaV1(
    input: RuntimeMailDeliveryQuotaInput
  ): Promise<RuntimeMailDeliveryQuotaDecision>;
  commitMailDeliveryQuotaV1(reservationId: string): Promise<boolean>;
  releaseMailDeliveryQuotaV1(reservationId: string): Promise<boolean>;
  cleanupExpiredRollingQuota(limit: number): Promise<number>;
  quotaSeatUsageTransitionV1(workspaceIds: string[]): Promise<void>;
  isInviteAbuseUserQuarantinedOrBanned(userId: string): Promise<boolean>;
  isInviteAbuseWorkspaceQuarantined(workspaceId: string): Promise<boolean>;
  claimInviteAbuseAction(actionId: string, workerId: string): Promise<boolean>;
  claimRetryableInviteAbuseActions(
    workerId: string,
    limit: number
  ): Promise<NativeRuntimeInviteAbuseClaimedAction[]>;
  markInviteAbuseAction(
    actionId: string,
    workerId: string,
    status: 'succeeded' | 'failed',
    error?: string | null
  ): Promise<boolean>;
};

function normalizeInviteAbuseAction(action: string): RuntimeInviteAbuseAction {
  if (RUNTIME_INVITE_ABUSE_ACTIONS.has(action as RuntimeInviteAbuseAction)) {
    return action as RuntimeInviteAbuseAction;
  }
  throw new Error(`Unknown invite abuse action: ${action}`);
}

export function normalizeWorkspaceInviteQuotaDecision(
  decision: NativeRuntimeWorkspaceInviteQuotaDecision
): RuntimeWorkspaceInviteQuotaDecision {
  const { actionRequired, ...rest } = decision;
  if (!actionRequired) {
    return rest;
  }

  return {
    ...rest,
    actionRequired: {
      ...actionRequired,
      action: normalizeInviteAbuseAction(actionRequired.action),
    },
  };
}

export function normalizeClaimedInviteAbuseAction(
  action: NativeRuntimeInviteAbuseClaimedAction
): RuntimeInviteAbuseClaimedAction {
  return {
    ...action,
    action: normalizeInviteAbuseAction(action.action),
  };
}
