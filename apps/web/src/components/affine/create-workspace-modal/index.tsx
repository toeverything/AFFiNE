import {
  Button,
  Input,
  Modal,
  ModalCloseButton,
  ModalWrapper,
  Tooltip,
} from '@affine/component';
import { DebugLogger } from '@affine/debug';
import { config } from '@affine/env';
import { useTranslation } from '@affine/i18n';
import { HelpIcon } from '@blocksuite/icons';
import { useSetAtom } from 'jotai';
import type { KeyboardEvent } from 'react';
import { useEffect } from 'react';
import { useLayoutEffect } from 'react';
import { useCallback, useRef, useState } from 'react';

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
  onCreate: (name: string) => void;
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
  const isComposition = useRef(false);

  const handleCreateWorkspace = useCallback(() => {
    onConfirmName(workspaceName);
  }, [onConfirmName, workspaceName]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && workspaceName && !isComposition.current) {
        handleCreateWorkspace();
      }
    },
    [handleCreateWorkspace, workspaceName]
  );
  const { t } = useTranslation();
  return (
    <div className={style.content}>
      <div className={style.contentTitle}>{t('Name Your Workspace')}</div>
      <p>{t('Workspace description')}</p>
      <Input
        ref={ref => {
          if (ref) {
            setTimeout(() => ref.focus(), 0);
          }
        }}
        data-testid="create-workspace-input"
        onKeyDown={handleKeyDown}
        placeholder={t('Set a Workspace name')}
        maxLength={15} // TODO: the max workspace name length?
        minLength={0}
        onChange={value => {
          setWorkspaceName(value);
        }}
        onCompositionStart={() => {
          isComposition.current = true;
        }}
        onCompositionEnd={() => {
          isComposition.current = false;
        }}
      />
      <div className={style.buttonGroup}>
        <Button
          data-testid="create-workspace-button"
          type="light"
          onClick={() => {
            onClose();
          }}
        >
          {t('Cancel')}
        </Button>
        <Button
          data-testid="create-workspace-button"
          disabled={!workspaceName}
          style={{
            opacity: !workspaceName ? 0.5 : 1,
          }}
          type="primary"
          onClick={() => {
            handleCreateWorkspace();
          }}
        >
          {t('Create')}
        </Button>
      </div>
    </div>
  );
};

interface SetDBLocationContentProps {
  onConfirmLocation: (dir?: string) => void;
}

const SetDBLocationContent = ({
  onConfirmLocation,
}: SetDBLocationContentProps) => {
  const { t } = useTranslation();
  const [defaultDBLocation, setDefaultDBLocation] = useState('');

  useEffect(() => {
    window.apis?.db.getDefaultStorageLocation().then(dir => {
      setDefaultDBLocation(dir);
    });
  }, []);

  return (
    <div className={style.content}>
      <div className={style.contentTitle}>{t('Set database location')}</div>
      <p>{t('Workspace database storage description')}</p>
      <div className={style.buttonGroup}>
        <Button
          data-testid="create-workspace-button"
          type="light"
          onClick={async () => {
            const result = await window.apis?.dialog.selectDBFileLocation();
            if (result) {
              onConfirmLocation(result);
            }
          }}
        >
          {t('Customize')}
        </Button>
        <Tooltip
          zIndex={1000}
          content={t('By default will be saved to ') + defaultDBLocation}
          placement="top-start"
        >
          <Button
            data-testid="create-workspace-button"
            type="primary"
            onClick={() => {
              onConfirmLocation();
            }}
            icon={<HelpIcon />}
            iconPosition="end"
          >
            {t('Default Location')}
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
  const { t } = useTranslation();
  const [enableCloudSyncing, setEnableCloudSyncing] = useState(false);
  return (
    <div className={style.content}>
      <div className={style.contentTitle}>
        {t(mode === 'new' ? 'Created Successfully' : 'Added Successfully')}
      </div>

      <div className={style.radioGroup}>
        <label onClick={() => setEnableCloudSyncing(false)}>
          <input
            className={style.radio}
            type="radio"
            checked={!enableCloudSyncing}
          />
          {t('Use on current device only')}
        </label>
        <label onClick={() => setEnableCloudSyncing(true)}>
          <input
            className={style.radio}
            type="radio"
            checked={enableCloudSyncing}
          />
          {t('Sync across devices with AFFiNE Cloud')}
        </label>
      </div>

      <div className={style.buttonGroup}>
        <Button
          data-testid="create-workspace-button"
          type="primary"
          onClick={() => {
            onConfirmMode(enableCloudSyncing);
          }}
        >
          {t('Finish')}
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
  const { createLocalWorkspace, importLocalWorkspace } = useAppHelper();
  const [step, setStep] = useState<CreateWorkspaceStep>();
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [workspaceName, setWorkspaceName] = useState<string>();
  const [dbFileLocation, setDBFileLocation] = useState<string>();
  const setOpenDisableCloudAlertModal = useSetAtom(
    openDisableCloudAlertModalAtom
  );

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
          setWorkspaceId(result.workspaceId);
          setStep('set-syncing-mode');
        } else if (result.error || result.canceled) {
          // TODO: handle error?
          onClose();
        }
      })();
    } else if (mode === 'new') {
      setStep('set-db-location');
    } else {
      setStep(undefined);
    }
    return () => {
      canceled = true;
    };
  }, [mode, onClose]);

  return (
    <Modal open={mode !== false && !!step} onClose={onClose}>
      <ModalWrapper width={560} style={{ padding: '10px' }}>
        <div className={style.header}>
          <ModalCloseButton
            top={6}
            right={6}
            onClick={() => {
              onClose();
            }}
          />
        </div>
        {step === 'name-workspace' && (
          <NameWorkspaceContent
            // go to previous step instead?
            onClose={onClose}
            onConfirmName={name => {
              setWorkspaceName(name);
              setStep('set-syncing-mode');
            }}
          />
        )}
        {step === 'set-db-location' && (
          <SetDBLocationContent
            onConfirmLocation={dir => {
              setDBFileLocation(dir);
              setStep('name-workspace');
            }}
          />
        )}
        {step === 'set-syncing-mode' && (
          <SetSyncingModeContent
            mode={mode}
            onConfirmMode={async enableCloudSyncing => {
              if (!config.enableLegacyCloud && enableCloudSyncing) {
                setOpenDisableCloudAlertModal(true);
              } else {
                let id = workspaceId;
                // this is also the last step
                if (workspaceId && mode === 'add') {
                  await importLocalWorkspace(workspaceId);
                } else if (mode === 'new' && workspaceName) {
                  id = await createLocalWorkspace(workspaceName);
                  // if dbFileLocation is set, move db file to that location
                  if (dbFileLocation) {
                    await window.apis?.dialog.moveDBFile(id, dbFileLocation);
                  }
                }
                if (id) {
                  onCreate(id);
                } else {
                  // ?? is this possible?
                  onClose();
                }
              }
            }}
          />
        )}
      </ModalWrapper>
    </Modal>
  );
};
