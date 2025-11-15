import { useConfirmModal } from '@affine/component';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { type I18nString, useI18n } from '@affine/i18n';
import { InformationFillDuotoneIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect } from 'react';

import { type WorkspaceMetadata, WorkspacesService } from '../../workspace';
import { WorkspaceQuotaService } from '../services/quota';
import * as styles from './styles.css';

interface Message {
  title: I18nString;
  description: I18nString;
  confirmText: I18nString;
  tips?: I18nString[];
  cancelText?: I18nString;
}

/**
 *
 * Notification that the cloud workspace quota has exceeded the limit
 *
 */
export const QuotaCheck = ({
  workspaceMeta,
}: {
  workspaceMeta: WorkspaceMetadata;
}) => {
  const { openConfirmModal } = useConfirmModal();
  const workspacesService = useService(WorkspacesService);
  const workspaceQuota = useService(WorkspaceQuotaService).quota;
  const workspaceProfile = workspacesService.getProfile(workspaceMeta);
  const quota = useLiveData(workspaceQuota.quota$);
  const usedPercent = useLiveData(workspaceQuota.percent$);
  const profile = useLiveData(workspaceProfile.profile$);
  const isOwner = profile?.isOwner;
  const isTeam = profile?.isTeam;
  const workspaceDialogService = useService(WorkspaceDialogService);
  const dialog = useLiveData(workspaceDialogService.dialogs$);
  const t = useI18n();

  const onConfirm = useCallback(() => {
    if (!isOwner) {
      return;
    }
    if (
      dialog.some(
        d =>
          (d.type === 'setting' && d.props.activeTab === 'plans') ||
          (d.type === 'setting' && d.props.activeTab === 'workspace:license')
      )
    ) {
      return;
    }
    workspaceDialogService.open('setting', {
      activeTab: 'plans',
      scrollAnchor: 'cloudPricingPlan',
    });
  }, [dialog, isOwner, workspaceDialogService]);

  useEffect(() => {
    workspaceQuota?.revalidate();
  }, [workspaceQuota]);

  useEffect(() => {
    if (workspaceMeta.flavour === 'local' || !quota || isTeam) {
      return;
    }
    const memberOverflow = quota.overcapacityMemberCount > 0;
    const storageOverflow = usedPercent && usedPercent >= 100;
    const message = getSyncPausedMessage(
      !!isOwner,
      memberOverflow,
      !!storageOverflow
    );

    if (memberOverflow || storageOverflow) {
      openConfirmModal({
        title: <Title title={t.t(message.title)} />,
        description: t.t(message.description),
        confirmText: t.t(message.confirmText),
        cancelText: message.cancelText ? t.t(message.cancelText) : undefined,
        children: <Tips tips={message.tips} />,
        childrenContentClassName: styles.modalChildren,
        onConfirm: onConfirm,
        confirmButtonOptions: {
          variant: 'primary',
        },
        cancelButtonOptions: {
          style: {
            visibility: message.cancelText ? 'visible' : 'hidden',
          },
        },
      });
      return;
    } else {
      return;
    }
  }, [
    isOwner,
    isTeam,
    onConfirm,
    openConfirmModal,
    quota,
    t,
    usedPercent,
    workspaceMeta.flavour,
  ]);
  return null;
};

const messages: Record<
  'owner' | 'member',
  Record<'both' | 'storage' | 'member', Message>
> = {
  owner: {
    both: {
      title: 'com.affine.payment.sync-paused.title',
      description: 'com.affine.payment.sync-paused.owner.both.description',
      tips: [
        'com.affine.payment.sync-paused.owner.both.tips-1',
        'com.affine.payment.sync-paused.owner.both.tips-2',
      ],
      cancelText: 'Cancel',
      confirmText: 'com.affine.payment.upgrade',
    },
    storage: {
      title: 'com.affine.payment.sync-paused.title',
      description: 'com.affine.payment.sync-paused.owner.storage.description',
      tips: [
        'com.affine.payment.sync-paused.owner.storage.tips-1',
        'com.affine.payment.sync-paused.owner.storage.tips-2',
      ],
      cancelText: 'Cancel',
      confirmText: 'com.affine.payment.upgrade',
    },
    member: {
      title: 'com.affine.payment.sync-paused.title',
      description: 'com.affine.payment.sync-paused.owner.member.description',
      tips: [
        'com.affine.payment.sync-paused.owner.member.tips-1',
        'com.affine.payment.sync-paused.owner.member.tips-2',
      ],
      cancelText: 'Cancel',
      confirmText: 'com.affine.payment.upgrade',
    },
  },
  member: {
    both: {
      title: 'com.affine.payment.sync-paused.title',
      description: 'com.affine.payment.sync-paused.member.both.description',
      confirmText: 'com.affine.payment.sync-paused.member.member.confirm',
    },
    storage: {
      title: 'com.affine.payment.sync-paused.title',
      description: 'com.affine.payment.sync-paused.member.storage.description',
      confirmText: 'com.affine.payment.sync-paused.member.member.confirm',
    },
    member: {
      title: 'com.affine.payment.sync-paused.title',
      description: 'com.affine.payment.sync-paused.member.member.description',
      confirmText: 'com.affine.payment.sync-paused.member.member.confirm',
    },
  },
};

function getSyncPausedMessage(
  isOwner: boolean,
  isMemberOverflow: boolean,
  isStorageOverflow: boolean
): Message {
  const userType = isOwner ? 'owner' : 'member';
  const condition =
    isStorageOverflow && isMemberOverflow
      ? 'both'
      : isStorageOverflow
        ? 'storage'
        : isMemberOverflow
          ? 'member'
          : 'both';

  return messages[userType][condition];
}

const Tips = ({ tips }: { tips?: I18nString[] }) => {
  const t = useI18n();
  if (!tips || tips.length < 1) {
    return null;
  }
  return (
    <div className={styles.tipsStyle}>
      {tips.map(tip => (
        <div key={tip.toString()} className={styles.tipStyle}>
          <div className={styles.bullet} />
          {t.t(tip)}
        </div>
      ))}
    </div>
  );
};

const Title = ({ title }: { title: string }) => {
  return (
    <div className={styles.modalTitle}>
      <InformationFillDuotoneIcon className={styles.errorIcon} />
      {title}
    </div>
  );
};
