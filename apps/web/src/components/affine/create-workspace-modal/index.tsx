import {
  Button,
  Input,
  Modal,
  ModalCloseButton,
  ModalWrapper,
  toast,
  Tooltip,
} from '@affine/component';
import { DebugLogger } from '@affine/debug';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { HelpIcon } from '@blocksuite/icons';
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

interface NameWorkspaceContentProps {
  onClose: () => void;
  onConfirmName: (name: string) => void;
}

const NameWorkspaceContent = ({
  onConfirmName,
  onClose,
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
    <div className={style.content}>
      <div className={style.contentTitle}>{t['Name Your Workspace']()}</div>
      <p>{t['Workspace description']()}</p>
      <Input
        ref={ref => {
          if (ref) {
            setTimeout(() => ref.focus(), 0);
          }
        }}
        data-testid="create-workspace-input"
        onKeyDown={handleKeyDown}
        placeholder={t['Set a Workspace name']()}
        maxLength={64}
        minLength={0}
        onChange={setWorkspaceName}
      />
      <div className={style.buttonGroup}>
        <Button
          data-testid="create-workspace-close-button"
          type="light"
          onClick={onClose}
        >
          {t.Cancel()}
        </Button>
        <Button
          data-testid="create-workspace-create-button"
          disabled={!workspaceName}
          style={{
            opacity: !workspaceName ? 0.5 : 1,
          }}
          type="primary"
          onClick={handleCreateWorkspace}
        >
          {t.Create()}
        </Button>
      </div>
    </div>
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
      const result = await window.apis?.dialog.selectDBFileLocation();
      setOpening(false);
      if (result?.filePath) {
        onConfirmLocation(result.filePath);
      } else if (result?.error) {
        // @ts-expect-error: result.error is dynamic so the type is unknown
        toast(t[result.error]());
      }
    })().catch(err => {
      logger.error(err);
    });
  }, [onConfirmLocation, opening, t]);

  return (
    <div className={style.content}>
      <div className={style.contentTitle}>{t['Set database location']()}</div>
      <p>{t['Workspace database storage description']()}</p>
      <div className={style.buttonGroup}>
        <Button
          disabled={opening}
          data-testid="create-workspace-customize-button"
          type="light"
          onClick={handleSelectDBFileLocation}
        >
          {t['Customize']()}
        </Button>
        <Tooltip
          zIndex={1000}
          content={t['Default db location hint']({
            location: defaultDBLocation,
          })}
          placement="top-start"
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
            {t['Default Location']()}
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
        {t[mode === 'new' ? 'Created Successfully' : 'Added Successfully']()}
      </div>

      <div className={style.radioGroup}>
        <label onClick={() => setEnableCloudSyncing(false)}>
          <input
            className={style.radio}
            type="radio"
            readOnly
            checked={!enableCloudSyncing}
          />
          {t['Use on current device only']()}
        </label>
        <label onClick={() => setEnableCloudSyncing(true)}>
          <input
            className={style.radio}
            type="radio"
            readOnly
            checked={enableCloudSyncing}
          />
          {t['Sync across devices with AFFiNE Cloud']()}
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
          {t['Continue']()}
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
        const result = await window.apis.dialog.loadDBFile();
        if (result.workspaceId && !canceled) {
          setAddedId(result.workspaceId);
          setStep('set-syncing-mode');
        } else if (result.error || result.canceled) {
          if (result.error) {
            // @ts-expect-error: result.error is dynamic so the type is unknown
            toast(t[result.error]());
          }
          onClose();
        }
      })().catch(err => {
        console.error(err);
      });
    } else if (mode === 'new') {
      setStep(
        environment.isDesktop && runtimeConfig.enableSQLiteProvider
          ? 'set-db-location'
          : 'name-workspace'
      );
    } else {
      setStep(undefined);
    }
    return () => {
      canceled = true;
    };
  }, [mode, onClose, t]);

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

  const onConfirmName = useCallback(
    (name: string) => {
      setWorkspaceName(name);
      if (environment.isDesktop && runtimeConfig.enableSQLiteProvider) {
        setStep('set-syncing-mode');
      } else {
        // this will be the last step for web for now
        // fix me later
        createLocalWorkspace(name)
          .then(id => {
            onCreate(id);
          })
          .catch(err => {
            logger.error(err);
          });
      }
    },
    [createLocalWorkspace, onCreate]
  );

  const nameWorkspaceNode =
    step === 'name-workspace' ? (
      <NameWorkspaceContent
        // go to previous step instead?
        onClose={onClose}
        onConfirmName={onConfirmName}
      />
    ) : null;

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

  return (
    <Modal open={mode !== false && !!step} onClose={onClose}>
      <ModalWrapper width={560} style={{ padding: '10px' }}>
        <div className={style.header}>
          <ModalCloseButton top={6} right={6} onClick={onClose} />
        </div>
        {nameWorkspaceNode}
        {setDBLocationNode}
        {setSyncingModeNode}
      </ModalWrapper>
    </Modal>
  );
};
