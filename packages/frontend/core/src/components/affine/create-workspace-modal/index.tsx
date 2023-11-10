import { Input, toast } from '@affine/component';
import { DebugLogger } from '@affine/debug';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { HelpIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import {
  ConfirmModal,
  type ConfirmModalProps,
  Modal,
} from '@toeverything/components/modal';
import { Tooltip } from '@toeverything/components/tooltip';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import type {
  LoadDBFileResult,
  SelectDBFileLocationResult,
} from '@toeverything/infra/type';
import { useSetAtom } from 'jotai';
import type { KeyboardEvent } from 'react';
import { useEffect } from 'react';
import { useLayoutEffect } from 'react';
import { useCallback, useState } from 'react';

import { openDisableCloudAlertModalAtom } from '../../../atoms';
import { useAppHelper } from '../../../hooks/use-workspaces';
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
        ref={ref => {
          if (ref) {
            window.setTimeout(() => ref.focus(), 0);
          }
        }}
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

interface SetDBLocationContentProps {
  onConfirmLocation: (dir?: string) => void;
}

const useDefaultDBLocation = () => {
  const [defaultDBLocation, setDefaultDBLocation] = useState('');

  useEffect(() => {
    window.apis?.db
      .getDefaultStorageLocation()
      .then(dir => {
        setDefaultDBLocation(dir);
      })
      .catch(err => {
        console.error(err);
      });
  }, []);

  return defaultDBLocation;
};

const SetDBLocationContent = ({
  onConfirmLocation,
}: SetDBLocationContentProps) => {
  const t = useAFFiNEI18N();
  const defaultDBLocation = useDefaultDBLocation();
  const [opening, setOpening] = useState(false);

  const handleSelectDBFileLocation = useCallback(() => {
    if (opening) {
      return;
    }
    setOpening(true);
    (async function () {
      const result: SelectDBFileLocationResult =
        await window.apis?.dialog.selectDBFileLocation();
      setOpening(false);
      if (result?.filePath) {
        onConfirmLocation(result.filePath);
      } else if (result?.error) {
        toast(t[result.error]());
      }
    })().catch(err => {
      logger.error(err);
    });
  }, [onConfirmLocation, opening, t]);

  return (
    <div className={style.content}>
      <div className={style.contentTitle}>
        {t['com.affine.setDBLocation.title']()}
      </div>
      <p>{t['com.affine.setDBLocation.description']()}</p>
      <div className={style.buttonGroup}>
        <Button
          disabled={opening}
          data-testid="create-workspace-customize-button"
          type="primary"
          onClick={handleSelectDBFileLocation}
        >
          {t['com.affine.setDBLocation.button.customize']()}
        </Button>
        <Tooltip
          content={t['com.affine.setDBLocation.tooltip.defaultLocation']({
            location: defaultDBLocation,
          })}
        >
          <Button
            data-testid="create-workspace-default-location-button"
            type="primary"
            onClick={() => {
              onConfirmLocation();
            }}
            icon={<HelpIcon />}
            iconPosition="end"
          >
            {t['com.affine.setDBLocation.button.defaultLocation']()}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

interface SetSyncingModeContentProps {
  mode: CreateWorkspaceMode;
  onConfirmMode: (enableCloudSyncing: boolean) => void;
}

const SetSyncingModeContent = ({
  mode,
  onConfirmMode,
}: SetSyncingModeContentProps) => {
  const t = useAFFiNEI18N();
  const [enableCloudSyncing, setEnableCloudSyncing] = useState(false);
  return (
    <div className={style.content}>
      <div className={style.contentTitle}>
        {mode === 'new'
          ? t['com.affine.setSyncingMode.title.created']()
          : t['com.affine.setSyncingMode.title.added']()}
      </div>

      <div className={style.radioGroup}>
        <label onClick={() => setEnableCloudSyncing(false)}>
          <input
            className={style.radio}
            type="radio"
            readOnly
            checked={!enableCloudSyncing}
          />
          {t['com.affine.setSyncingMode.deviceOnly']()}
        </label>
        <label onClick={() => setEnableCloudSyncing(true)}>
          <input
            className={style.radio}
            type="radio"
            readOnly
            checked={enableCloudSyncing}
          />
          {t['com.affine.setSyncingMode.cloud']()}
        </label>
      </div>

      <div className={style.buttonGroup}>
        <Button
          data-testid="create-workspace-continue-button"
          type="primary"
          onClick={() => {
            onConfirmMode(enableCloudSyncing);
          }}
        >
          {t['com.affine.setSyncingMode.button.continue']()}
        </Button>
      </div>
    </div>
  );
};

export const CreateWorkspaceModal = ({
  mode,
  onClose,
  onCreate,
}: ModalProps) => {
  const { createLocalWorkspace, addLocalWorkspace } = useAppHelper();
  const [step, setStep] = useState<CreateWorkspaceStep>();
  const [addedId, setAddedId] = useState<string>();
  const [workspaceName, setWorkspaceName] = useState<string>();
  const [dbFileLocation, setDBFileLocation] = useState<string>();
  const setOpenDisableCloudAlertModal = useSetAtom(
    openDisableCloudAlertModalAtom
  );
  const t = useAFFiNEI18N();

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
        if (!window.apis) {
          return;
        }
        logger.info('load db file');
        setStep(undefined);
        const result: LoadDBFileResult = await window.apis.dialog.loadDBFile();
        if (result.workspaceId && !canceled) {
          setAddedId(result.workspaceId);
          const newWorkspaceId = await addLocalWorkspace(result.workspaceId);
          onCreate(newWorkspaceId);
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
  }, [addLocalWorkspace, mode, onClose, onCreate, t]);

  const onConfirmEnableCloudSyncing = useCallback(
    (enableCloudSyncing: boolean) => {
      (async function () {
        if (!runtimeConfig.enableCloud && enableCloudSyncing) {
          setOpenDisableCloudAlertModal(true);
        } else {
          let id = addedId;
          // syncing mode is also the last step
          if (addedId && mode === 'add') {
            await addLocalWorkspace(addedId);
          } else if (mode === 'new' && workspaceName) {
            id = await createLocalWorkspace(workspaceName);
            // if dbFileLocation is set, move db file to that location
            if (dbFileLocation) {
              await window.apis?.dialog.moveDBFile(id, dbFileLocation);
            }
          } else {
            logger.error('invalid state');
            return;
          }
          if (id) {
            onCreate(id);
          }
        }
      })().catch(e => {
        logger.error(e);
      });
    },
    [
      addLocalWorkspace,
      addedId,
      createLocalWorkspace,
      dbFileLocation,
      mode,
      onCreate,
      setOpenDisableCloudAlertModal,
      workspaceName,
    ]
  );

  const onConfirmName = useAsyncCallback(
    async (name: string) => {
      setWorkspaceName(name);
      // this will be the last step for web for now
      // fix me later
      const id = await createLocalWorkspace(name);
      onCreate(id);
    },
    [createLocalWorkspace, onCreate]
  );

  const setDBLocationNode =
    step === 'set-db-location' ? (
      <SetDBLocationContent
        onConfirmLocation={dir => {
          setDBFileLocation(dir);
          setStep('name-workspace');
        }}
      />
    ) : null;

  const setSyncingModeNode =
    step === 'set-syncing-mode' ? (
      <SetSyncingModeContent
        mode={mode}
        onConfirmMode={onConfirmEnableCloudSyncing}
      />
    ) : null;

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
      {setDBLocationNode}
      {setSyncingModeNode}
    </Modal>
  );
};
