import {
  IconButton,
  Loading,
  Menu,
  MenuItem,
  notify,
  Skeleton,
  useConfirmModal,
} from '@affine/component';
import {
  Pagination,
  SettingHeader,
} from '@affine/component/setting-components';
import { Avatar } from '@affine/component/ui/avatar';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { BackupService } from '@affine/core/modules/backup';
import {
  type WorkspaceMetadata,
  WorkspaceProfileService,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import { i18nTime, useI18n } from '@affine/i18n';
import track from '@affine/track';
import {
  DeleteIcon,
  DownloadIcon,
  LocalWorkspaceIcon,
  MoreVerticalIcon,
  UploadIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import bytes from 'bytes';
import { useCallback, useEffect, useMemo, useState } from 'react';

import * as styles from './styles.css';

const Empty = () => {
  const t = useI18n();
  return (
    <div className={styles.empty}>
      {t['com.affine.settings.workspace.backup.empty']()}
    </div>
  );
};

const BlobAvatar = ({
  blob,
  name,
}: {
  blob: Uint8Array | null;
  name: string;
}) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(new Blob([blob as any]));
    setUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return (
    <Avatar colorfulFallback name={name} rounded={4} size={32} url={url} />
  );
};

type BackupWorkspaceItem = {
  id: string;
  name: string;
  fileSize: number;
  updatedAt: Date;
  avatar: Uint8Array | null;
  dbPath: string;
};

const BackupWorkspaceItem = ({ item }: { item: BackupWorkspaceItem }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const { openConfirmModal } = useConfirmModal();
  const backupService = useService(BackupService);
  const t = useI18n();
  const [importing, setImporting] = useState(false);

  const { jumpToPage } = useNavigateHelper();

  const handleImport = useAsyncCallback(async () => {
    setImporting(true);
    track.$.settingsPanel.archivedWorkspaces.recoverArchivedWorkspace();
    const workspaceId = await backupService.recoverBackupWorkspace(item.dbPath);
    if (!workspaceId) {
      setImporting(false);
      return;
    }
    notify.success({
      title: t['com.affine.settings.workspace.backup.import.success'](),
      actions: [
        {
          key: 'open',
          label:
            t['com.affine.settings.workspace.backup.import.success.action'](),
          onClick: () => {
            jumpToPage(workspaceId, 'all');
          },
          autoClose: false,
        },
      ],
    });
    setMenuOpen(false);
    setImporting(false);
  }, [backupService, item.dbPath, jumpToPage, t]);

  const handleDelete = useCallback(
    (backupWorkspaceId: string) => {
      openConfirmModal({
        title: t['com.affine.workspaceDelete.title'](),
        children: t['com.affine.settings.workspace.backup.delete.warning'](),
        onConfirm: async () => {
          track.$.settingsPanel.archivedWorkspaces.deleteArchivedWorkspace();
          await backupService.deleteBackupWorkspace(backupWorkspaceId);
          notify.success({
            title: t['com.affine.settings.workspace.backup.delete.success'](),
          });
        },
        confirmText: t['Confirm'](),
        cancelText: t['Cancel'](),
        confirmButtonOptions: {
          variant: 'error',
        },
      });
    },
    [backupService, openConfirmModal, t]
  );

  return (
    <div
      data-testid="backup-workspace-item"
      className={styles.listItem}
      key={item.id}
      onClick={() => setMenuOpen(v => !v)}
    >
      <BlobAvatar blob={item.avatar} name={item.name} />
      <div className={styles.listItemLeftLabel}>
        <div className={styles.listItemLeftLabelTitle}>{item.name}</div>
        <div className={styles.listItemLeftLabelDesc}>
          {bytes(item.fileSize)}
        </div>
      </div>
      <div className={styles.listItemRightLabel}>
        {t['com.affine.settings.workspace.backup.delete-at']({
          date: i18nTime(item.updatedAt, {
            absolute: {
              accuracy: 'day',
            },
          }),
          time: i18nTime(item.updatedAt, {
            absolute: {
              accuracy: 'minute',
              noDate: true,
              noYear: true,
            },
          }),
        })}
        <Menu
          rootOptions={{
            open: menuOpen && !importing,
            onOpenChange: setMenuOpen,
            modal: true,
          }}
          items={
            <>
              <MenuItem
                prefixIcon={<LocalWorkspaceIcon />}
                onClick={handleImport}
              >
                {t['com.affine.settings.workspace.backup.import']()}
              </MenuItem>
              <MenuItem
                prefixIcon={<DeleteIcon />}
                onClick={() => handleDelete(item.id)}
                type="danger"
              >
                {t['Delete']()}
              </MenuItem>
            </>
          }
          contentOptions={{ align: 'end' }}
        >
          <IconButton disabled={importing} size="20">
            {importing ? <Loading /> : <MoreVerticalIcon />}
          </IconButton>
        </Menu>
      </div>
    </div>
  );
};

const PAGE_SIZE = 6;

const WebBackupWorkspaceItem = ({ meta }: { meta: WorkspaceMetadata }) => {
  const backupService = useService(BackupService);
  const profileService = useService(WorkspaceProfileService);
  const profile = useLiveData(profileService.getProfile(meta).profile$);

  if (!profile) return null;

  return (
    <div data-testid="backup-workspace-item" className={styles.listItem}>
      <Avatar colorfulFallback name={profile.name} rounded={4} size={32} />
      <div className={styles.listItemLeftLabel}>
        <div className={styles.listItemLeftLabelTitle}>{profile.name}</div>
        <div className={styles.listItemLeftLabelDesc}>{'Local Workspace'}</div>
      </div>
      <div className={styles.listItemRightLabel}>
        <IconButton
          onClick={() => void backupService.downloadBackup(meta.id)}
          tooltip="Export to ZIP"
        >
          <DownloadIcon />
        </IconButton>
      </div>
    </div>
  );
};

export const BackupSettingPanel = () => {
  const t = useI18n();
  const backupService = useService(BackupService);
  const workspacesService = useService(WorkspacesService);
  const workspaces = useLiveData(workspacesService.list.workspaces$);
  const { jumpToPage } = useNavigateHelper();

  useEffect(() => {
    backupService.revalidate();
  }, [backupService]);

  const isLoading = useLiveData(backupService.isLoading$);
  const backupWorkspaces = useLiveData(backupService.pageBackupWorkspaces$);

  const [pageNum, setPageNum] = useState(0);

  const innerElement = useMemo(() => {
    if (isLoading) {
      return (
        <Skeleton
          style={{ margin: '2px', width: 'calc(100% - 4px)' }}
          height={60}
          animation="wave"
        />
      );
    }

    if (!BUILD_CONFIG.isElectron) {
      // Web UI: List local workspaces for export
      const localWorkspaces = workspaces.filter(w => w.flavour === 'local');

      if (localWorkspaces.length === 0) {
        return <Empty />;
      }

      return (
        <div className={styles.list}>
          {localWorkspaces.map(workspace => (
            <WebBackupWorkspaceItem key={workspace.id} meta={workspace} />
          ))}
        </div>
      );
    }

    if (!backupWorkspaces) {
      return null;
    }
    if (backupWorkspaces.items.length === 0) {
      return <Empty />;
    }

    return (
      <>
        <div className={styles.list}>
          {backupWorkspaces.items
            .slice(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE)
            .map(item => (
              <BackupWorkspaceItem key={item.id} item={item} />
            ))}
        </div>
        {backupWorkspaces.items.length > PAGE_SIZE && (
          <div className={styles.pagination}>
            <Pagination
              totalCount={backupWorkspaces?.items.length ?? 0}
              countPerPage={PAGE_SIZE}
              pageNum={pageNum}
              onPageChange={(_, pageNum) => {
                setPageNum(pageNum);
              }}
            />
          </div>
        )}
      </>
    );
  }, [isLoading, backupWorkspaces, pageNum, workspaces]);

  const handleImportBackup = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async () => {
      if (input.files && input.files.length > 0) {
        const file = input.files[0];
        try {
          const newWorkspaceId = await backupService.importBackup(file);
          workspacesService.list.revalidate();
          notify.success({
            title: t['com.affine.settings.workspace.backup.import.success'](),
            actions: [
              {
                key: 'open',
                label:
                  t[
                    'com.affine.settings.workspace.backup.import.success.action'
                  ](),
                onClick: () => {
                  jumpToPage(newWorkspaceId, 'all');
                },
                autoClose: false,
              },
            ],
          });
        } catch (error) {
          notify.error({ title: 'Import failed' });
          console.error(error);
        }
      }
    };
    input.click();
  }, [backupService, workspacesService, jumpToPage, t]);

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <SettingHeader
          title={t['com.affine.settings.workspace.backup']()}
          subtitle={t['com.affine.settings.workspace.backup.subtitle']()}
          data-testid="backup-title"
        />
        {!BUILD_CONFIG.isElectron && (
          <IconButton
            onClick={() => void handleImportBackup()}
            tooltip="Import Backup"
            style={{ marginTop: 4 }}
          >
            <UploadIcon />
          </IconButton>
        )}
      </div>

      <div className={styles.listContainer}>{innerElement}</div>
    </>
  );
};
