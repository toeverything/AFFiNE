import { Avatar, Input, Switch, toast } from '@affine/component';
import {
  ConfirmModal,
  type ConfirmModalProps,
  Modal,
} from '@affine/component/ui/modal';
import { authAtom, openDisableCloudAlertModalAtom } from '@affine/core/atoms';
import { useCurrentLoginStatus } from '@affine/core/hooks/affine/use-current-login-status';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { DebugLogger } from '@affine/debug';
import { apis } from '@affine/electron-api';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { _addLocalWorkspace } from '@affine/workspace-impl';
import { WorkspaceManager } from '@toeverything/infra';
import { buildShowcaseWorkspace, initEmptyPage } from '@toeverything/infra';
import { useService } from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import type { KeyboardEvent } from 'react';
import { useLayoutEffect } from 'react';
import { useCallback, useState } from 'react';

import { CloudSvg } from '../share-page-modal/cloud-svg';
import * as styles from './index.css';

type CreateWorkspaceStep =
  | 'set-db-location'
  | 'name-workspace'
  | 'set-syncing-mode';

export type CreateWorkspaceMode = 'add' | 'new' | false;

const logger = new DebugLogger('CreateWorkspaceModal');

interface ModalProps {
  mode: CreateWorkspaceMode; // false means not open
  onClose: () => void;
  onCreate: (id: string) => void;
}

interface NameWorkspaceContentProps extends ConfirmModalProps {
  loading: boolean;
  onConfirmName: (
    name: string,
    workspaceFlavour: WorkspaceFlavour,
    avatar?: File
  ) => void;
}

const shouldEnableCloud =
  !runtimeConfig.allowLocalWorkspace && !environment.isDesktop;

const NameWorkspaceContent = ({
  loading,
  onConfirmName,
  ...props
}: NameWorkspaceContentProps) => {
  const t = useAFFiNEI18N();
  const [workspaceName, setWorkspaceName] = useState('');
  const [enable, setEnable] = useState(shouldEnableCloud);
  const loginStatus = useCurrentLoginStatus();
  const setDisableCloudOpen = useSetAtom(openDisableCloudAlertModalAtom);

  const setOpenSignIn = useSetAtom(authAtom);

  const openSignInModal = useCallback(() => {
    if (!runtimeConfig.enableCloud) {
      setDisableCloudOpen(true);
    } else {
      setOpenSignIn(state => ({
        ...state,
        openModal: true,
      }));
    }
  }, [setDisableCloudOpen, setOpenSignIn]);

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

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && workspaceName) {
        handleCreateWorkspace();
      }
    },
    [handleCreateWorkspace, workspaceName]
  );
  // TODO: Support uploading avatars.
  // Currently, when we create a new workspace and upload an avatar at the same time,
  // an error occurs after the creation is successful: get blob 404 not found
  return (
    <ConfirmModal
      defaultOpen={true}
      title={t['com.affine.nameWorkspace.title']()}
      description={t['com.affine.nameWorkspace.description']()}
      cancelText={t['com.affine.nameWorkspace.button.cancel']()}
      confirmButtonOptions={{
        type: 'primary',
        disabled: !workspaceName || loading,
        ['data-testid' as string]: 'create-workspace-create-button',
        children: t['com.affine.nameWorkspace.button.create'](),
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
          onKeyDown={handleKeyDown}
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
                disabled={shouldEnableCloud}
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
        {shouldEnableCloud ? (
          <a
            className={styles.cloudTips}
            href={runtimeConfig.downloadUrl}
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

export const CreateWorkspaceModal = ({
  mode,
  onClose,
  onCreate,
}: ModalProps) => {
  const [step, setStep] = useState<CreateWorkspaceStep>();
  const t = useAFFiNEI18N();
  const workspaceManager = useService(WorkspaceManager);
  const [loading, setLoading] = useState(false);

  // todo: maybe refactor using xstate?
  useLayoutEffect(() => {
    let canceled = false;
    // if mode changed, reset step
    if (mode === 'add') {
      // a hack for now
      // when adding a workspace, we will immediately let user select a db file
      // after it is done, it will effectively add a new workspace to app-data folder
      // so after that, we will be able to load it via importLocalWorkspace
      (async () => {
        if (!apis) {
          return;
        }
        logger.info('load db file');
        setStep(undefined);
        const result = await apis.dialog.loadDBFile();
        if (result.workspaceId && !canceled) {
          _addLocalWorkspace(result.workspaceId);
          workspaceManager.list.revalidate().catch(err => {
            logger.error("can't revalidate workspace list", err);
          });
          onCreate(result.workspaceId);
        } else if (result.error || result.canceled) {
          if (result.error) {
            toast(t[result.error]());
          }
          onClose();
        }
      })().catch(err => {
        console.error(err);
      });
    } else if (mode === 'new') {
      setStep('name-workspace');
    } else {
      setStep(undefined);
    }
    return () => {
      canceled = true;
    };
  }, [mode, onClose, onCreate, t, workspaceManager]);

  const onConfirmName = useAsyncCallback(
    async (name: string, workspaceFlavour: WorkspaceFlavour) => {
      if (loading) return;
      setLoading(true);

      // this will be the last step for web for now
      // fix me later
      if (runtimeConfig.enablePreloading) {
        const { id } = await buildShowcaseWorkspace(
          workspaceManager,
          workspaceFlavour,
          name
        );
        onCreate(id);
      } else {
        const { id } = await workspaceManager.createWorkspace(
          workspaceFlavour,
          async workspace => {
            workspace.meta.setName(name);
            const page = workspace.createDoc();
            workspace.setDocMeta(page.id, {
              jumpOnce: true,
            });
            initEmptyPage(page);
          }
        );
        onCreate(id);
      }

      setLoading(false);
    },
    [loading, onCreate, workspaceManager]
  );

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
  );

  if (step === 'name-workspace') {
    return (
      <NameWorkspaceContent
        loading={loading}
        open={mode !== false && !!step}
        onOpenChange={onOpenChange}
        onConfirmName={onConfirmName}
      />
    );
  }

  return (
    <Modal
      open={mode !== false && !!step}
      width={560}
      onOpenChange={onOpenChange}
      contentOptions={{
        style: { padding: '10px' },
      }}
    >
      <div className={styles.header}></div>
    </Modal>
  );
};
