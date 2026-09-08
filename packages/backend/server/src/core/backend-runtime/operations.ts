import { wrapCallMetric } from '../../base/metrics';
import type {
  RuntimeUserQuotaState,
  RuntimeWorkspaceQuotaState,
} from '../../native';
import {
  type BlobManifestV1,
  type BlobSourceV1,
  normalizeClaimedInviteAbuseAction,
  normalizeWorkspaceInviteQuotaDecision,
  type RuntimeInstance,
  type RuntimeInviteAbuseClaimedAction,
  type RuntimeMailDeliveryQuotaDecision,
  type RuntimeMailDeliveryQuotaInput,
  type RuntimePermissionMethods,
  type RuntimeQuotaMethods,
  type RuntimeStorageReservationInput,
  type RuntimeStorageReservationMutation,
  type RuntimeWorkspaceInviteQuotaDecision,
  type RuntimeWorkspaceInviteQuotaInput,
  type RuntimeWorkspaceInviteQuotaUsage,
} from './contracts';

const runtimeErrorPattern = /\[affine-runtime:([a-z0-9_]+)\]\s*/;

export class BackendRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'BackendRuntimeError';
  }
}

export function backendRuntimeErrorCode(error: unknown) {
  return error instanceof BackendRuntimeError ? error.code : undefined;
}

export class BackendRuntimeCoreOperations {
  constructor(protected readonly runtime: RuntimeInstance) {}

  executePaymentCommandV1<T = unknown>(input: Record<string, unknown>) {
    return this.measured('executePaymentCommandV1', runtime =>
      runtime.executePaymentCommandV1(input)
    ) as Promise<T>;
  }

  createPaymentCustomerPortalV1(
    ...args: Parameters<RuntimeInstance['createPaymentCustomerPortalV1']>
  ) {
    return this.measured('createPaymentCustomerPortalV1', runtime =>
      runtime.createPaymentCustomerPortalV1(...args)
    );
  }

  createLicenseCustomerPortalV1(
    ...args: Parameters<RuntimeInstance['createLicenseCustomerPortalV1']>
  ) {
    return this.measured('createLicenseCustomerPortalV1', runtime =>
      runtime.createLicenseCustomerPortalV1(...args)
    );
  }

  executeAuthSessionCommandV1<T = unknown>(input: Record<string, unknown>) {
    return this.measured('executeAuthSessionCommandV1', runtime =>
      runtime.executeAuthSessionCommandV1(input)
    ) as Promise<T>;
  }

  resolveAuthPrincipalV1<T = unknown>(input: Record<string, unknown>) {
    return this.measured('resolveAuthPrincipalV1', runtime =>
      runtime.resolveAuthPrincipalV1(input)
    ) as Promise<T>;
  }

  createAuthCaptchaChallengeV1() {
    return this.measured('createAuthCaptchaChallengeV1', runtime =>
      runtime.createAuthCaptchaChallengeV1()
    );
  }

  verifyAuthCaptchaV1(
    input: Parameters<RuntimeInstance['verifyAuthCaptchaV1']>[0]
  ) {
    return this.measured('verifyAuthCaptchaV1', runtime =>
      runtime.verifyAuthCaptchaV1(input)
    );
  }

  capturePaymentWebhookV1(
    provider: string,
    rawBody: Buffer,
    authorization: string
  ) {
    return this.measured('capturePaymentWebhookV1', runtime =>
      runtime.capturePaymentWebhookV1(provider, rawBody, authorization)
    );
  }

  paymentProviderNamespacesV1() {
    return this.measured('paymentProviderNamespacesV1', runtime =>
      runtime.paymentProviderNamespacesV1()
    );
  }

  upsertAdminGrantV1(
    input: Parameters<RuntimeInstance['upsertAdminGrantV1']>[0]
  ) {
    return this.measured('upsertAdminGrantV1', runtime =>
      runtime.upsertAdminGrantV1(input)
    );
  }

  revokeAdminGrantV1(
    ...args: Parameters<RuntimeInstance['revokeAdminGrantV1']>
  ) {
    return this.measured('revokeAdminGrantV1', runtime =>
      runtime.revokeAdminGrantV1(...args)
    );
  }

  installTeamLicenseFileV1(
    ...args: Parameters<RuntimeInstance['installTeamLicenseFileV1']>
  ) {
    return this.measured('installTeamLicenseFileV1', runtime =>
      runtime.installTeamLicenseFileV1(...args)
    );
  }

  getInstalledLicenseV1(
    ...args: Parameters<RuntimeInstance['getInstalledLicenseV1']>
  ) {
    return this.measured('getInstalledLicenseV1', runtime =>
      runtime.getInstalledLicenseV1(...args)
    );
  }

  activateTeamLicenseV1(
    ...args: Parameters<RuntimeInstance['activateTeamLicenseV1']>
  ) {
    return this.measured('activateTeamLicenseV1', runtime =>
      runtime.activateTeamLicenseV1(...args)
    );
  }

  removeTeamLicenseV1(
    ...args: Parameters<RuntimeInstance['removeTeamLicenseV1']>
  ) {
    return this.measured('removeTeamLicenseV1', runtime =>
      runtime.removeTeamLicenseV1(...args)
    );
  }

  updateTeamLicenseRecurringV1(
    ...args: Parameters<RuntimeInstance['updateTeamLicenseRecurringV1']>
  ) {
    return this.measured('updateTeamLicenseRecurringV1', runtime =>
      runtime.updateTeamLicenseRecurringV1(...args)
    );
  }

  createTeamLicensePortalV1(
    ...args: Parameters<RuntimeInstance['createTeamLicensePortalV1']>
  ) {
    return this.measured('createTeamLicensePortalV1', runtime =>
      runtime.createTeamLicensePortalV1(...args)
    );
  }

  updateTeamLicenseSeatsV1(
    ...args: Parameters<RuntimeInstance['updateTeamLicenseSeatsV1']>
  ) {
    return this.measured('updateTeamLicenseSeatsV1', runtime =>
      runtime.updateTeamLicenseSeatsV1(...args)
    );
  }

  checkLicensesV1(...args: Parameters<RuntimeInstance['checkLicensesV1']>) {
    return this.measured('checkLicensesV1', runtime =>
      runtime.checkLicensesV1(...args)
    );
  }

  getByokEntitlementV1(
    ...args: Parameters<RuntimeInstance['getByokEntitlementV1']>
  ) {
    return this.measured('getByokEntitlementV1', runtime =>
      runtime.getByokEntitlementV1(...args)
    );
  }

  hasAiEntitlementV1(
    ...args: Parameters<RuntimeInstance['hasAiEntitlementV1']>
  ) {
    return this.measured('hasAiEntitlementV1', runtime =>
      runtime.hasAiEntitlementV1(...args)
    );
  }

  hasWorkspaceCommercialEntitlementV1(
    ...args: Parameters<RuntimeInstance['hasWorkspaceCommercialEntitlementV1']>
  ) {
    return this.measured('hasWorkspaceCommercialEntitlementV1', runtime =>
      runtime.hasWorkspaceCommercialEntitlementV1(...args)
    );
  }

  async getDocBlobManifestV1(
    actorUserId: string | undefined,
    source: BlobSourceV1
  ): Promise<BlobManifestV1> {
    return await this.measured('getDocBlobManifestV1', runtime =>
      runtime.getDocBlobManifestV1({ actorUserId, source })
    );
  }

  async appendWorkspaceDocUpdatesV1(input: {
    workspaceId: string;
    docId: string;
    updates: Buffer[];
    actorUserId: string;
    writeIntent: 'update_doc' | 'create_doc';
    permissionDocId?: string;
    expectedPermissionGeneration?: number;
  }): Promise<number> {
    return await this.measured('appendWorkspaceDocUpdatesV1', runtime =>
      runtime.appendWorkspaceDocUpdatesV1(input)
    );
  }

  async appendWorkspaceDocUpdatesTrustedV1(input: {
    workspaceId: string;
    docId: string;
    updates: Buffer[];
    editorId?: string;
  }): Promise<number> {
    return await this.measured('appendWorkspaceDocUpdatesTrustedV1', runtime =>
      runtime.appendWorkspaceDocUpdatesTrustedV1(input)
    );
  }

  async getSyncPermissionGenerationV1(workspaceId: string): Promise<number> {
    return await this.measured('getSyncPermissionGenerationV1', runtime =>
      runtime.getSyncPermissionGenerationV1(workspaceId)
    );
  }

  async getUserQuotaStateV1(userId: string): Promise<RuntimeUserQuotaState> {
    return await this.measured('getUserQuotaStateV1', runtime =>
      runtime.getUserQuotaStateV1(userId)
    );
  }

  async getWorkspaceQuotaStateV1(
    workspaceId: string
  ): Promise<RuntimeWorkspaceQuotaState> {
    return await this.measured('getWorkspaceQuotaStateV1', runtime =>
      runtime.getWorkspaceQuotaStateV1(workspaceId)
    );
  }

  async quotaSeatUsageTransitionV1(workspaceIds: string[]): Promise<void> {
    if (!workspaceIds.length) {
      return;
    }
    await this.measured('quotaSeatUsageTransitionV1', runtime =>
      this.quotaRuntime(runtime).quotaSeatUsageTransitionV1(workspaceIds)
    );
  }

  async getReadableWorkspaceBlobManifestV1(input: {
    actorUserId: string;
    workspaceId: string;
    cursor?: string;
    limit?: number;
  }): Promise<BlobManifestV1> {
    return await this.measured('getReadableWorkspaceBlobManifestV1', runtime =>
      runtime.getReadableWorkspaceBlobManifestV1(input)
    );
  }

  async openBlobV1(
    actorUserId: string | undefined,
    source: BlobSourceV1,
    key: string
  ) {
    return await this.measured('getBlobV1', runtime =>
      runtime.getBlobV1({ actorUserId, source, key })
    );
  }

  async readBlobStreamChunkV1(streamId: string) {
    return await this.runtime.readBlobStreamChunkV1(streamId);
  }

  async closeBlobStreamV1(streamId: string) {
    await this.runtime.closeBlobStreamV1(streamId);
  }

  async readWorkspaceAvatarV1(
    actorUserId: string,
    workspaceId: string,
    key: string
  ): Promise<Buffer> {
    const blob = await this.openBlobV1(
      actorUserId,
      { type: 'currentDoc', workspaceId, docId: workspaceId },
      key
    );
    const chunks: Buffer[] = [];
    try {
      while (true) {
        const chunk = await this.readBlobStreamChunkV1(blob.streamId);
        if (chunk.body.length) chunks.push(chunk.body);
        if (chunk.done) return Buffer.concat(chunks);
      }
    } finally {
      await this.closeBlobStreamV1(blob.streamId);
    }
  }

  async cleanupExpiredUserSessions(limit: number) {
    return await this.measured('cleanupExpiredUserSessions', rt =>
      rt.cleanupExpiredUserSessions(limit)
    );
  }

  async cleanupExpiredRuntimeStates(limit: number) {
    return await this.measured('cleanupExpiredRuntimeStates', rt =>
      rt.cleanupExpiredRuntimeStates(limit)
    );
  }

  async cleanupExpiredRuntimeGates(limit: number) {
    return await this.measured('cleanupExpiredRuntimeGates', rt =>
      rt.cleanupExpiredRuntimeGates(limit)
    );
  }

  async compactPendingDocUpdates(
    workspaceId: string,
    docId: string,
    batchLimit: number,
    historyMinIntervalMs: number,
    historyMaxAgeSeconds: number
  ) {
    return await this.measured('compactPendingDocUpdates', rt =>
      rt.compactPendingDocUpdates(
        workspaceId,
        docId,
        batchLimit,
        historyMinIntervalMs,
        historyMaxAgeSeconds
      )
    );
  }

  async assertWorkspaceInviteQuotaV1(
    input: RuntimeWorkspaceInviteQuotaInput
  ): Promise<RuntimeWorkspaceInviteQuotaDecision> {
    return normalizeWorkspaceInviteQuotaDecision(
      await this.measured('assertWorkspaceInviteQuotaV1', rt =>
        this.quotaRuntime(rt).assertWorkspaceInviteQuotaV1(input)
      )
    );
  }

  async reserveStorageQuotaV1(input: RuntimeStorageReservationInput) {
    return await this.measured('reserveStorageQuotaV1', rt =>
      this.quotaRuntime(rt).reserveStorageQuotaV1(input)
    );
  }

  async listManagedWorkspaceBlobsV1(actorUserId: string, workspaceId: string) {
    return await this.measured('listManagedWorkspaceBlobsV1', rt =>
      this.quotaRuntime(rt).listManagedWorkspaceBlobsV1(
        actorUserId,
        workspaceId
      )
    );
  }

  async manageWorkspaceBlobV1(input: {
    workspaceId: string;
    actorUserId: string;
    key: string;
    permanently: boolean;
  }) {
    return await this.measured('manageWorkspaceBlobV1', rt =>
      this.quotaRuntime(rt).manageWorkspaceBlobV1(input)
    );
  }

  async releaseManagedWorkspaceBlobsV1(
    actorUserId: string,
    workspaceId: string,
    limit: number
  ) {
    return await this.measured('releaseManagedWorkspaceBlobsV1', rt =>
      this.quotaRuntime(rt).releaseManagedWorkspaceBlobsV1(
        actorUserId,
        workspaceId,
        limit
      )
    );
  }

  async cleanupExpiredStorageReservationsV1(limit: number) {
    return await this.measured('cleanupExpiredStorageReservationsV1', rt =>
      this.quotaRuntime(rt).cleanupExpiredStorageReservationsV1(limit)
    );
  }

  async reserveWorkspaceSeatsV1(input: {
    workspaceId: string;
    actorUserId: string;
    targets: Array<{ email: string }>;
  }) {
    return await this.measured('reserveWorkspaceSeatsV1', rt =>
      this.quotaRuntime(rt).reserveWorkspaceSeatsV1(input)
    );
  }

  async activateWorkspaceSeatV1(input: {
    workspaceId: string;
    actorUserId: string;
    targetUserId: string;
    requireManagePermission: boolean;
  }) {
    return await this.measured('activateWorkspaceSeatV1', rt =>
      this.quotaRuntime(rt).activateWorkspaceSeatV1(input)
    );
  }

  async reserveWorkspaceReviewSeatV1(input: {
    workspaceId: string;
    targetUserId: string;
    inviterUserId: string;
  }) {
    return await this.measured('reserveWorkspaceReviewSeatV1', rt =>
      this.quotaRuntime(rt).reserveWorkspaceReviewSeatV1(input)
    );
  }

  async finalizeStorageReservationV1(input: RuntimeStorageReservationMutation) {
    return await this.measured('finalizeStorageReservationV1', rt =>
      this.quotaRuntime(rt).finalizeStorageReservationV1(input)
    );
  }

  async abortStorageReservationV1(input: RuntimeStorageReservationMutation) {
    return await this.measured('abortStorageReservationV1', rt =>
      this.quotaRuntime(rt).abortStorageReservationV1(input)
    );
  }

  async evaluateWorkspaceInviteLinkV1(
    actorUserId: string,
    workspaceId: string
  ) {
    return await this.measured('evaluateWorkspaceInviteLinkV1', rt =>
      this.quotaRuntime(rt).evaluateWorkspaceInviteLinkV1(
        actorUserId,
        workspaceId
      )
    );
  }

  async commitWorkspaceInviteQuotaV1(
    reservationId: string,
    usage: RuntimeWorkspaceInviteQuotaUsage
  ): Promise<boolean> {
    return await this.measured('commitWorkspaceInviteQuotaV1', rt =>
      this.quotaRuntime(rt).commitWorkspaceInviteQuotaV1(reservationId, usage)
    );
  }

  async releaseWorkspaceInviteQuotaV1(reservationId: string): Promise<boolean> {
    return await this.measured('releaseWorkspaceInviteQuotaV1', rt =>
      this.quotaRuntime(rt).releaseWorkspaceInviteQuotaV1(reservationId)
    );
  }

  async assertMailDeliveryQuotaV1(
    input: RuntimeMailDeliveryQuotaInput
  ): Promise<RuntimeMailDeliveryQuotaDecision> {
    return await this.measured('assertMailDeliveryQuotaV1', rt =>
      this.quotaRuntime(rt).assertMailDeliveryQuotaV1(input)
    );
  }

  async commitMailDeliveryQuotaV1(reservationId: string): Promise<boolean> {
    return await this.measured('commitMailDeliveryQuotaV1', rt =>
      this.quotaRuntime(rt).commitMailDeliveryQuotaV1(reservationId)
    );
  }

  async releaseMailDeliveryQuotaV1(reservationId: string): Promise<boolean> {
    return await this.measured('releaseMailDeliveryQuotaV1', rt =>
      this.quotaRuntime(rt).releaseMailDeliveryQuotaV1(reservationId)
    );
  }

  async cleanupExpiredRollingQuota(limit: number) {
    return await this.measured('cleanupExpiredRollingQuota', rt =>
      this.quotaRuntime(rt).cleanupExpiredRollingQuota(limit)
    );
  }

  async isInviteAbuseUserQuarantinedOrBanned(userId: string) {
    return await this.measured('isInviteAbuseUserQuarantinedOrBanned', rt =>
      this.quotaRuntime(rt).isInviteAbuseUserQuarantinedOrBanned(userId)
    );
  }

  async isInviteAbuseWorkspaceQuarantined(workspaceId: string) {
    return await this.measured('isInviteAbuseWorkspaceQuarantined', rt =>
      this.quotaRuntime(rt).isInviteAbuseWorkspaceQuarantined(workspaceId)
    );
  }

  async claimInviteAbuseAction(actionId: string, workerId: string) {
    return await this.measured('claimInviteAbuseAction', rt =>
      this.quotaRuntime(rt).claimInviteAbuseAction(actionId, workerId)
    );
  }

  async claimRetryableInviteAbuseActions(
    workerId: string,
    limit: number
  ): Promise<RuntimeInviteAbuseClaimedAction[]> {
    return (
      await this.measured('claimRetryableInviteAbuseActions', rt =>
        this.quotaRuntime(rt).claimRetryableInviteAbuseActions(workerId, limit)
      )
    ).map(normalizeClaimedInviteAbuseAction);
  }

  async markInviteAbuseAction(
    actionId: string,
    workerId: string,
    status: 'succeeded' | 'failed',
    error?: string | null
  ) {
    return await this.measured('markInviteAbuseAction', rt =>
      this.quotaRuntime(rt).markInviteAbuseAction(
        actionId,
        workerId,
        status,
        error
      )
    );
  }

  protected async measured<T>(
    method: string,
    fn: (runtime: RuntimeInstance) => Promise<T>
  ): Promise<T> {
    try {
      return await wrapCallMetric(
        () => fn(this.runtime),
        'storage',
        'backend_runtime',
        { method }
      )();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const match = runtimeErrorPattern.exec(message);
      if (!match) throw error;
      throw new BackendRuntimeError(
        match[1],
        message.replace(runtimeErrorPattern, ''),
        { cause: error }
      );
    }
  }

  private quotaRuntime(runtime: RuntimeInstance): RuntimeQuotaMethods {
    return runtime as unknown as RuntimeQuotaMethods;
  }

  protected permissionRuntime(
    runtime: RuntimeInstance
  ): RuntimePermissionMethods {
    return runtime as RuntimePermissionMethods;
  }
}
