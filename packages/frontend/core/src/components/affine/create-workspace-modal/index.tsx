import { Avatar, Input, Switch, toast } from '@affine/component';
import type { ConfirmModalProps } from '@affine/component/ui/modal';
import { ConfirmModal, Modal } from '@affine/component/ui/modal';
import { authAtom } from '@affine/core/atoms';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { track } from '@affine/core/mixpanel';
import { DebugLogger } from '@affine/debug';
import { apis } from '@affine/electron-api';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useI18n } from '@affine/i18n';
import {
  DocsService,
  useLiveData,
  useService,
  WorkspacesService,
} from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import type { KeyboardEvent } from 'react';
import { useCallback, useLayoutEffect, useState } from 'react';

import { buildShowcaseWorkspace } from '../../../bootstrap/first-app-data';
import { AuthService } from '../../../modules/cloud';
import { _addLocalWorkspace } from '../../../modules/workspace-engine';
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
  onCreate: (id: string, defaultDocId?: string) => void;
}

interface NameWorkspaceContentProps extends ConfirmModalProps {
  loading: boolean;
  onConfirmName: (
    name: string,
    workspaceFlavour: WorkspaceFlavour,
    avatar?: File
  ) => void;
}

const shouldEnableCloud = !BUILD_CONFIG.allowLocalWorkspace;

const NameWorkspaceContent = ({
  loading,
  onConfirmName,
  ...props
}: NameWorkspaceContentProps) => {
  const t = useI18n();
  const [workspaceName, setWorkspaceName] = useState('');
  const [enable, setEnable] = useState(shouldEnableCloud);
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

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && workspaceName) {
        handleCreateWorkspace();
      }
    },
    [handleCreateWorkspace, workspaceName]
  );

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

export const CreateWorkspaceModal = ({
  mode,
  onClose,
  onCreate,
}: ModalProps) => {
  const [step, setStep] = useState<CreateWorkspaceStep>();
  const t = useI18n();
  const workspacesService = useService(WorkspacesService);
  const docsService = useService(DocsService);
  const [loading, setLoading] = useState(false);

  // TODO(@Peng): maybe refactor using xstate?
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
          workspacesService.list.revalidate();
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
  }, [mode, onClose, onCreate, t, workspacesService]);

  const onConfirmName = useAsyncCallback(
    async (name: string, workspaceFlavour: WorkspaceFlavour) => {
      track.$.$.$.createWorkspace({ flavour: workspaceFlavour });
      if (loading) return;
      setLoading(true);

      // this will be the last step for web for now
      // fix me later
      if (BUILD_CONFIG.enablePreloading) {
        const { meta, defaultDocId } = await buildShowcaseWorkspace(
          workspacesService,
          workspaceFlavour,
          name
        );
        onCreate(meta.id, defaultDocId);
      } else {
        let defaultDocId: string | undefined = undefined;
        const { id } = await workspacesService.create(
          workspaceFlavour,
          async workspace => {
            workspace.meta.initialize();
            workspace.meta.setName(name);
            const page = docsService.createDoc();
            defaultDocId = page.id;
          }
        );
        onCreate(id, defaultDocId);
      }

      setLoading(false);
    },
    [docsService, loading, onCreate, workspacesService]
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
