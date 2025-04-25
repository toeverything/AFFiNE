import { Button, Loading, notify, useConfirmModal } from '@affine/component';
import {
  InviteTeamMemberModal,
  type InviteTeamMemberModalProps,
  MemberLimitModal,
} from '@affine/component/member-components';
import { SettingRow } from '@affine/component/setting-components';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { Upload } from '@affine/core/components/pure/file-upload';
import {
  ServerService,
  SubscriptionService,
  WorkspaceSubscriptionService,
} from '@affine/core/modules/cloud';
import {
  WorkspaceMembersService,
  WorkspacePermissionService,
} from '@affine/core/modules/permissions';
import { WorkspaceQuotaService } from '@affine/core/modules/quota';
import { WorkspaceShareSettingService } from '@affine/core/modules/share-setting';
import { copyTextToClipboard } from '@affine/core/utils/clipboard';
import { emailRegex } from '@affine/core/utils/email-regex';
import { UserFriendlyError } from '@affine/error';
import type { WorkspaceInviteLinkExpireTime } from '@affine/graphql';
import { ServerDeploymentType, SubscriptionPlan } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { ExportIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { SettingState } from '../../types';
import { MemberList } from './member-list';
import * as styles from './styles.css';

const parseCSV = async (blob: Blob): Promise<string[]> => {
  try {
    const textContent = await blob.text();
    const emails = textContent
      .split('\n')
      .map(email => email.trim())
      .filter(email => email.length > 0 && emailRegex.test(email));

    return emails;
  } catch (error) {
    console.error('Error parsing CSV:', error);
    throw new Error('Failed to parse CSV');
  }
};

export const CloudWorkspaceMembersPanel = ({
  onChangeSettingState,
  isTeam,
}: {
  onChangeSettingState: (settingState: SettingState) => void;
  isTeam?: boolean;
}) => {
  const workspaceShareSettingService = useService(WorkspaceShareSettingService);
  const subscription = useService(WorkspaceSubscriptionService).subscription;
  const workspaceSubscription = useLiveData(subscription.subscription$);
  const inviteLink = useLiveData(
    workspaceShareSettingService.sharePreview.inviteLink$
  );
  const serverService = useService(ServerService);
  const hasPaymentFeature = useLiveData(
    serverService.server.features$.map(f => f?.payment)
  );
  const isSelfhosted = useLiveData(
    serverService.server.config$.selector(
      c => c.type === ServerDeploymentType.Selfhosted
    )
  );
  const membersService = useService(WorkspaceMembersService);
  const permissionService = useService(WorkspacePermissionService);

  const isOwner = useLiveData(permissionService.permission.isOwner$);
  const isAdmin = useLiveData(permissionService.permission.isAdmin$);
  const isOwnerOrAdmin = isOwner || isAdmin;
  useEffect(() => {
    permissionService.permission.revalidate();
  }, [permissionService]);

  useEffect(() => {
    membersService.members.revalidate();
  }, [membersService]);

  const workspaceQuotaService = useService(WorkspaceQuotaService);
  useEffect(() => {
    workspaceQuotaService.quota.revalidate();
  }, [workspaceQuotaService]);
  const isLoading = useLiveData(workspaceQuotaService.quota.isRevalidating$);
  const error = useLiveData(workspaceQuotaService.quota.error$);
  const workspaceQuota = useLiveData(workspaceQuotaService.quota.quota$);
  const subscriptionService = useService(SubscriptionService);
  const plan = useLiveData(
    subscriptionService.subscription.pro$.map(s => s?.plan)
  );

  const t = useI18n();

  const [openInvite, setOpenInvite] = useState(false);
  const [openMemberLimit, setOpenMemberLimit] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const { openConfirmModal, closeConfirmModal } = useConfirmModal();
  const goToTeamBilling = useCallback(() => {
    onChangeSettingState({
      activeTab: isSelfhosted ? 'workspace:license' : 'workspace:billing',
    });
  }, [isSelfhosted, onChangeSettingState]);
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const resume = useAsyncCallback(async () => {
    try {
      setIsMutating(true);
      await subscription.resumeSubscription(
        idempotencyKey,
        SubscriptionPlan.Team
      );
      await subscription.waitForRevalidation();
      // refresh idempotency key
      setIdempotencyKey(nanoid());
      closeConfirmModal();
      notify.success({
        title: t['com.affine.payment.resume.success.title'](),
        message: t['com.affine.payment.resume.success.team.message'](),
      });
    } catch (err) {
      const error = UserFriendlyError.fromAny(err);
      notify.error({
        title: error.name,
        message: error.message,
      });
    } finally {
      setIsMutating(false);
    }
  }, [subscription, idempotencyKey, closeConfirmModal, t]);
  const openInviteModal = useCallback(() => {
    if (isTeam && workspaceSubscription?.canceledAt) {
      openConfirmModal({
        title: t['com.affine.payment.member.team.retry-payment.title'](),
        description:
          t[
            `com.affine.payment.member.team.disabled-subscription.${isOwner ? 'owner' : 'admin'}.description`
          ](),
        confirmText:
          t[
            isOwner
              ? 'com.affine.payment.member.team.disabled-subscription.resume-subscription'
              : 'Got it'
          ](),
        cancelText: t['Cancel'](),
        cancelButtonOptions: {
          style: {
            visibility: isOwner ? 'visible' : 'hidden',
          },
        },
        onConfirm: isOwner ? resume : undefined,
        confirmButtonOptions: {
          variant: 'primary',
          loading: isMutating,
        },
      });

      return;
    }
    setOpenInvite(true);
  }, [
    isMutating,
    isOwner,
    isTeam,
    openConfirmModal,
    resume,
    t,
    workspaceSubscription?.canceledAt,
  ]);

  const onGenerateInviteLink = useCallback(
    async (expireTime: WorkspaceInviteLinkExpireTime) => {
      const { link } = await membersService.generateInviteLink(expireTime);
      workspaceShareSettingService.sharePreview.revalidate();
      return link;
    },
    [membersService, workspaceShareSettingService.sharePreview]
  );

  const onRevokeInviteLink = useCallback(async () => {
    const success = await membersService.revokeInviteLink();
    workspaceShareSettingService.sharePreview.revalidate();
    return success;
  }, [membersService, workspaceShareSettingService.sharePreview]);

  const onInviteBatchConfirm = useAsyncCallback(
    async ({
      emails,
    }: Parameters<InviteTeamMemberModalProps['onConfirm']>[0]) => {
      setIsMutating(true);
      const uniqueEmails = deduplicateEmails(emails);
      if (
        !isTeam &&
        workspaceQuota &&
        uniqueEmails.length >
          workspaceQuota.memberLimit - workspaceQuota.memberCount
      ) {
        setOpenMemberLimit(true);
        setIsMutating(false);
        return;
      }
      const results = await membersService.inviteMembers(uniqueEmails);
      const unSuccessInvites = results.reduce<string[]>((acc, result) => {
        if (!result.sentSuccess) {
          acc.push(result.email);
        }
        return acc;
      }, []);
      if (results) {
        notify({
          title: t['com.affine.payment.member.team.invite.notify.title']({
            successCount: (
              uniqueEmails.length - unSuccessInvites.length
            ).toString(),
            failedCount: unSuccessInvites.length.toString(),
          }),
          message: <NotifyMessage unSuccessInvites={unSuccessInvites} />,
        });
        setOpenInvite(false);
        membersService.members.revalidate();
        workspaceQuotaService.quota.revalidate();
      }
      setIsMutating(false);
    },
    [isTeam, membersService, t, workspaceQuota, workspaceQuotaService.quota]
  );

  const onImportCSV = useAsyncCallback(
    async (file: File) => {
      setIsMutating(true);
      const emails = await parseCSV(file);
      onInviteBatchConfirm({ emails });
      setIsMutating(false);
    },
    [onInviteBatchConfirm]
  );

  const handleUpgradeConfirm = useCallback(() => {
    onChangeSettingState({
      activeTab: 'plans',
      scrollAnchor: 'cloudPricingPlan',
    });
    track.$.settingsPanel.workspace.viewPlans({
      control: 'inviteMember',
    });
  }, [onChangeSettingState]);

  const desc = useMemo(() => {
    if (!workspaceQuota) return null;

    if (isTeam) {
      return <span>{t['com.affine.payment.member.team.description']()}</span>;
    }
    return (
      <span>
        {t['com.affine.payment.member.description2']()}
        {hasPaymentFeature && isOwner ? (
          <div
            className={styles.goUpgradeWrapper}
            onClick={handleUpgradeConfirm}
          >
            <span className={styles.goUpgrade}>
              {t['com.affine.payment.member.description.choose-plan']()}
            </span>
          </div>
        ) : null}
      </span>
    );
  }, [
    handleUpgradeConfirm,
    hasPaymentFeature,
    isOwner,
    isTeam,
    t,
    workspaceQuota,
  ]);

  const title = useMemo(() => {
    if (isTeam) {
      return `${t['Members']()} (${workspaceQuota?.memberCount})`;
    }
    return `${t['Members']()} (${workspaceQuota?.memberCount}/${workspaceQuota?.memberLimit})`;
  }, [isTeam, t, workspaceQuota?.memberCount, workspaceQuota?.memberLimit]);

  if (workspaceQuota === null) {
    if (isLoading) {
      return <MembersPanelFallback />;
    } else {
      return (
        <span className={styles.errorStyle}>
          {error
            ? UserFriendlyError.fromAny(error).message
            : 'Failed to load members'}
        </span>
      );
    }
  }

  return (
    <>
      <SettingRow name={title} desc={desc} spreadCol={!!isOwnerOrAdmin}>
        {isOwnerOrAdmin ? (
          <>
            <Button onClick={openInviteModal}>{t['Invite Members']()}</Button>
            {!isTeam ? (
              <MemberLimitModal
                isFreePlan={!plan}
                open={openMemberLimit}
                plan={workspaceQuota.humanReadable.name ?? ''}
                quota={workspaceQuota.humanReadable.memberLimit ?? ''}
                setOpen={setOpenMemberLimit}
                onConfirm={handleUpgradeConfirm}
              />
            ) : null}
            <InviteTeamMemberModal
              open={openInvite}
              setOpen={setOpenInvite}
              onConfirm={onInviteBatchConfirm}
              isMutating={isMutating}
              copyTextToClipboard={copyTextToClipboard}
              onGenerateInviteLink={onGenerateInviteLink}
              onRevokeInviteLink={onRevokeInviteLink}
              importCSV={<ImportCSV onImport={onImportCSV} />}
              invitationLink={inviteLink}
            />
          </>
        ) : null}
      </SettingRow>

      <div className={styles.membersPanel}>
        <MemberList
          isOwner={!!isOwner}
          isAdmin={!!isAdmin}
          goToTeamBilling={goToTeamBilling}
        />
      </div>
    </>
  );
};

const NotifyMessage = ({
  unSuccessInvites,
}: {
  unSuccessInvites: string[];
}) => {
  const t = useI18n();

  if (unSuccessInvites.length === 0) {
    return t['Invitation sent hint']();
  }

  return (
    <div>
      {t['com.affine.payment.member.team.invite.notify.fail-message']()}
      {unSuccessInvites.map((email, index) => (
        <div key={`${index}:${email}`}>{email}</div>
      ))}
    </div>
  );
};

export const MembersPanelFallback = () => {
  const t = useI18n();

  return (
    <>
      <SettingRow
        name={t['Members']()}
        desc={t['com.affine.payment.member.description2']()}
      />
      <div className={styles.membersPanel}>
        <MemberListFallback memberCount={1} />
      </div>
    </>
  );
};

const MemberListFallback = ({ memberCount }: { memberCount?: number }) => {
  // prevent page jitter
  const height = useMemo(() => {
    if (memberCount) {
      // height and margin-bottom
      return memberCount * 58 + (memberCount - 1) * 6;
    }
    return 'auto';
  }, [memberCount]);
  const t = useI18n();

  return (
    <div
      style={{
        height,
      }}
      className={styles.membersFallback}
    >
      <Loading size={20} />
      <span>{t['com.affine.settings.member.loading']()}</span>
    </div>
  );
};

const ImportCSV = ({ onImport }: { onImport: (file: File) => void }) => {
  const t = useI18n();

  return (
    <Upload accept="text/csv" fileChange={onImport}>
      <Button
        className={styles.importButton}
        prefix={<ExportIcon />}
        variant="secondary"
      >
        {t['com.affine.payment.member.team.invite.import-csv']()}
      </Button>
    </Upload>
  );
};

function deduplicateEmails(emails: string[]): string[] {
  const seenEmails = new Set<string>();
  return emails.filter(email => {
    const lowerCaseEmail = email.trim().toLowerCase();
    if (seenEmails.has(lowerCaseEmail)) {
      return false;
    } else {
      seenEmails.add(lowerCaseEmail);
      return true;
    }
  });
}
