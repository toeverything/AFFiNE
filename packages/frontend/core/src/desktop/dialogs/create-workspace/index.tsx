import { Avatar, ConfirmModal, Input, Switch } from '@affine/component';
import type { ConfirmModalProps } from '@affine/component/ui/modal';
import { CloudSvg } from '@affine/core/components/affine/share-page-modal/cloud-svg';
import { authAtom } from '@affine/core/components/atoms';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { AuthService } from '@affine/core/modules/cloud';
import {
  type DialogComponentProps,
  type GLOBAL_DIALOG_SCHEMA,
} from '@affine/core/modules/dialogs';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import {
  FeatureFlagService,
  useLiveData,
  useService,
  WorkspacesService,
} from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { useCallback, useState } from 'react';

import { buildShowcaseWorkspace } from '../../../utils/first-app-data';
import * as styles from './dialog.css';

interface NameWorkspaceContentProps extends ConfirmModalProps {
  loading: boolean;
  onConfirmName: (
    name: string,
    workspaceFlavour: WorkspaceFlavour,
    avatar?: File
  ) => void;
}

const NameWorkspaceContent = ({
  loading,
  onConfirmName,
  ...props
}: NameWorkspaceContentProps) => {
  const t = useI18n();
  const [workspaceName, setWorkspaceName] = useState('');
  const featureFlagService = useService(FeatureFlagService);
  const enableLocalWorkspace = useLiveData(
    featureFlagService.flags.enable_local_workspace.$
  );
  const [enable, setEnable] = useState(!enableLocalWorkspace);
  const session = useService(AuthService).session;
  const loginStatus = useLiveData(session.status$);

  const setOpenSignIn = useSetAtom(authAtom);

  const openSignInModal = useCallback(() => {
    setOpenSignIn(state => ({
      ...state,
      openModal: true,
    }));
  }, [setOpenSignIn]);

  const onSwitchChange = useCallback(
    (checked: boolean) => {
      if (loginStatus !== 'authenticated') {
        return openSignInModal();
      }
      return setEnable(checked);
    },
    [loginStatus, openSignInModal]
  );

  const handleCreateWorkspace = useCallback(() => {
    onConfirmName(
      workspaceName,
      enable ? WorkspaceFlavour.AFFINE_CLOUD : WorkspaceFlavour.LOCAL
    );
  }, [enable, onConfirmName, workspaceName]);

  const onEnter = useCallback(() => {
    if (workspaceName) {
      handleCreateWorkspace();
    }
  }, [handleCreateWorkspace, workspaceName]);

  // Currently, when we create a new workspace and upload an avatar at the same time,
  // an error occurs after the creation is successful: get blob 404 not found
  return (
    <ConfirmModal
      defaultOpen={true}
      title={t['com.affine.nameWorkspace.title']()}
      description={t['com.affine.nameWorkspace.description']()}
      cancelText={t['com.affine.nameWorkspace.button.cancel']()}
      confirmText={t['com.affine.nameWorkspace.button.create']()}
      confirmButtonOptions={{
        variant: 'primary',
        loading,
        disabled: !workspaceName,
        ['data-testid' as string]: 'create-workspace-create-button',
      }}
      closeButtonOptions={{
        ['data-testid' as string]: 'create-workspace-close-button',
      }}
      onConfirm={handleCreateWorkspace}
      {...props}
    >
      <div className={styles.avatarWrapper}>
        <Avatar size={56} name={workspaceName} colorfulFallback />
      </div>

      <div className={styles.workspaceNameWrapper}>
        <div className={styles.subTitle}>
          {t['com.affine.nameWorkspace.subtitle.workspace-name']()}
        </div>
        <Input
          autoFocus
          data-testid="create-workspace-input"
          onEnter={onEnter}
          placeholder={t['com.affine.nameWorkspace.placeholder']()}
          maxLength={64}
          minLength={0}
          onChange={setWorkspaceName}
          size="large"
        />
      </div>
      <div className={styles.affineCloudWrapper}>
        <div className={styles.subTitle}>{t['AFFiNE Cloud']()}</div>
        <div className={styles.card}>
          <div className={styles.cardText}>
            <div className={styles.cardTitle}>
              <span>{t['com.affine.nameWorkspace.affine-cloud.title']()}</span>
              <Switch
                checked={enable}
                onChange={onSwitchChange}
                disabled={!enableLocalWorkspace}
              />
            </div>
            <div className={styles.cardDescription}>
              {t['com.affine.nameWorkspace.affine-cloud.description']()}
            </div>
          </div>
          <div className={styles.cloudSvgContainer}>
            <CloudSvg />
          </div>
        </div>
        {!enableLocalWorkspace ? (
          <a
            className={styles.cloudTips}
            href={BUILD_CONFIG.downloadUrl}
            target="_blank"
            rel="noreferrer"
          >
            {t['com.affine.nameWorkspace.affine-cloud.web-tips']()}
          </a>
        ) : null}
      </div>
    </ConfirmModal>
  );
};

export const CreateWorkspaceDialog = ({
  close,
}: DialogComponentProps<GLOBAL_DIALOG_SCHEMA['create-workspace']>) => {
  const workspacesService = useService(WorkspacesService);
  const [loading, setLoading] = useState(false);

  const onConfirmName = useAsyncCallback(
    async (name: string, workspaceFlavour: WorkspaceFlavour) => {
      track.$.$.$.createWorkspace({ flavour: workspaceFlavour });
      if (loading) return;
      setLoading(true);

      // this will be the last step for web for now
      // fix me later
      const { meta, defaultDocId } = await buildShowcaseWorkspace(
        workspacesService,
        workspaceFlavour,
        name
      );

      close({ metadata: meta, defaultDocId });
      setLoading(false);
    },
    [loading, workspacesService, close]
  );

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        close();
      }
    },
    [close]
  );

  return (
    <NameWorkspaceContent
      loading={loading}
      open
      onOpenChange={onOpenChange}
      onConfirmName={onConfirmName}
    />
  );
};
