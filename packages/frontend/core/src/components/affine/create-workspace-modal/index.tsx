import { Input, toast } from '@affine/component';
import {
  ConfirmModal,
  type ConfirmModalProps,
  Modal,
} from '@affine/component/ui/modal';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { DebugLogger } from '@affine/debug';
import { apis } from '@affine/electron-api';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { _addLocalWorkspace } from '@affine/workspace-impl';
import { WorkspaceManager } from '@toeverything/infra';
import { getCurrentStore } from '@toeverything/infra/atom';
import {
  buildShowcaseWorkspace,
  initEmptyPage,
} from '@toeverything/infra/blocksuite';
import { useService } from '@toeverything/infra/di';
import type { KeyboardEvent } from 'react';
import { useLayoutEffect } from 'react';
import { useCallback, useState } from 'react';

import { setPageModeAtom } from '../../../atoms';
import * as style from './index.css';

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
  onConfirmName: (name: string) => void;
}

const NameWorkspaceContent = ({
  onConfirmName,
  ...props
}: NameWorkspaceContentProps) => {
  const [workspaceName, setWorkspaceName] = useState('');

  const handleCreateWorkspace = useCallback(() => {
    onConfirmName(workspaceName);
  }, [onConfirmName, workspaceName]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && workspaceName) {
        handleCreateWorkspace();
      }
    },
    [handleCreateWorkspace, workspaceName]
  );
  const t = useAFFiNEI18N();
  return (
    <ConfirmModal
      defaultOpen={true}
      title={t['com.affine.nameWorkspace.title']()}
      description={t['com.affine.nameWorkspace.description']()}
      cancelText={t['com.affine.nameWorkspace.button.cancel']()}
      confirmButtonOptions={{
        type: 'primary',
        disabled: !workspaceName,
        ['data-testid' as string]: 'create-workspace-create-button',
        children: t['com.affine.nameWorkspace.button.create'](),
      }}
      closeButtonOptions={{
        ['data-testid' as string]: 'create-workspace-close-button',
      }}
      onConfirm={handleCreateWorkspace}
      {...props}
    >
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
    async (name: string) => {
      // this will be the last step for web for now
      // fix me later
      const { id } = await workspaceManager.createWorkspace(
        WorkspaceFlavour.LOCAL,
        async workspace => {
          workspace.meta.setName(name);
          if (runtimeConfig.enablePreloading) {
            await buildShowcaseWorkspace(workspace, {
              store: getCurrentStore(),
              atoms: {
                pageMode: setPageModeAtom,
              },
            });
          } else {
            const page = workspace.createPage();
            workspace.setPageMeta(page.id, {
              jumpOnce: true,
            });
            await initEmptyPage(page);
          }
          logger.debug('create first workspace');
        }
      );
      onCreate(id);
    },
    [onCreate, workspaceManager]
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
      <div className={style.header}></div>
    </Modal>
  );
};
