import { Scrollable } from '@affine/component';
import {
  BlockSuiteEditor,
  BlockSuiteFallback,
} from '@affine/component/block-suite-editor';
import type { PageMode } from '@affine/core/atoms';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { Workspace } from '@blocksuite/store';
import type { DialogContentProps } from '@radix-ui/react-dialog';
import { Button } from '@toeverything/components/button';
import { ConfirmModal, Modal } from '@toeverything/components/modal';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import { useAtom, useAtomValue } from 'jotai';
import {
  type PropsWithChildren,
  Suspense,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

import { currentModeAtom } from '../../../atoms/mode';
import { pageHistoryModalAtom } from '../../../atoms/page-history';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { StyledEditorModeSwitch } from '../../blocksuite/block-suite-mode-switch/style';
import {
  EdgelessSwitchItem,
  PageSwitchItem,
} from '../../blocksuite/block-suite-mode-switch/switch-items';
import { AffineErrorBoundary } from '../affine-error-boundary';
import {
  historyListGroupByDay,
  usePageHistory,
  usePageSnapshotList,
  useRestorePage,
  useSnapshotPage,
} from './data';
import { EmptyHistoryShape } from './empty-history-shape';
import * as styles from './styles.css';

export interface PageHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  pageId: string;
}

const contentOptions: DialogContentProps = {
  ['data-testid' as string]: 'page-history-modal',
  onPointerDownOutside: e => {
    e.preventDefault();
  },
  style: {
    padding: 0,
    maxWidth: 944,
    backgroundColor: 'var(--affine-background-primary-color)',
    overflow: 'hidden',
  },
};

const ModalContainer = ({
  onOpenChange,
  open,
  children,
}: PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) => {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      width="calc(100% - 64px)"
      height="80%"
      withoutCloseButton
      contentOptions={contentOptions}
    >
      <AffineErrorBoundary>{children}</AffineErrorBoundary>
    </Modal>
  );
};

const localTimeFormatter = new Intl.DateTimeFormat('en', {
  timeStyle: 'short',
});

const timestampToLocalTime = (ts: string) => {
  return localTimeFormatter.format(new Date(ts));
};

interface HistoryEditorPreviewProps {
  workspaceId: string;
  pageDocId: string;
  ts?: string;
  snapshot?: ArrayBuffer;
  mode: PageMode;
  onModeChange: (mode: PageMode) => void;
  title: string;
}

const HistoryEditorPreview = ({
  ts,
  snapshot,
  onModeChange,
  mode,
  workspaceId,
  pageDocId,
  title,
}: HistoryEditorPreviewProps) => {
  const onSwitchToPageMode = useCallback(() => {
    onModeChange('page');
  }, [onModeChange]);
  const onSwitchToEdgelessMode = useCallback(() => {
    onModeChange('edgeless');
  }, [onModeChange]);
  const page = useSnapshotPage(workspaceId, pageDocId, ts, snapshot);

  return (
    <div className={styles.previewWrapper}>
      <div className={styles.previewHeader}>
        <StyledEditorModeSwitch switchLeft={mode === 'page'}>
          <PageSwitchItem
            data-testid="switch-page-mode-button"
            active={mode === 'page'}
            onClick={onSwitchToPageMode}
          />
          <EdgelessSwitchItem
            data-testid="switch-edgeless-mode-button"
            active={mode === 'edgeless'}
            onClick={onSwitchToEdgelessMode}
          />
        </StyledEditorModeSwitch>

        <div className={styles.previewHeaderTitle}>{title}</div>

        <div className={styles.previewHeaderTimestamp}>
          {ts ? timestampToLocalTime(ts) : null}
        </div>
      </div>

      {page ? (
        <BlockSuiteEditor
          className={styles.editor}
          mode={mode}
          page={page}
          onModeChange={onModeChange}
        />
      ) : (
        <BlockSuiteFallback />
      )}
    </div>
  );
};

const PageHistoryList = ({
  pageDocId,
  workspaceId,
  activeVersion,
  onVersionChange,
}: {
  workspaceId: string;
  pageDocId: string;
  activeVersion?: string;
  onVersionChange: (version: string) => void;
}) => {
  const [historyList, loadMore, loadingMore] = usePageSnapshotList(
    workspaceId,
    pageDocId
  );
  const historyListByDay = useMemo(() => {
    return historyListGroupByDay(historyList);
  }, [historyList]);

  const t = useAFFiNEI18N();

  useLayoutEffect(() => {
    if (historyList.length > 0 && !activeVersion) {
      onVersionChange(historyList[0].timestamp);
    }
  }, [activeVersion, historyList, onVersionChange]);

  return (
    <div className={styles.historyList}>
      <div className={styles.historyListHeader}>
        {t['com.affine.history.version-history']()}
      </div>
      <Scrollable.Root className={styles.historyListScrollable}>
        <Scrollable.Viewport className={styles.historyListScrollableInner}>
          {historyListByDay.map(([day, list]) => {
            return (
              <div key={day} className={styles.historyItemGroup}>
                <div className={styles.historyItemGroupTitle}>{day}</div>
                {list.map(history => (
                  <div
                    className={styles.historyItem}
                    key={history.timestamp}
                    data-testid="version-history-item"
                    onClick={e => {
                      e.stopPropagation();
                      onVersionChange(history.timestamp);
                    }}
                    data-active={activeVersion === history.timestamp}
                  >
                    <button>{timestampToLocalTime(history.timestamp)}</button>
                  </div>
                ))}
              </div>
            );
          })}
          {loadMore ? (
            <Button
              type="plain"
              loading={loadingMore}
              disabled={loadingMore}
              className={styles.historyItemLoadMore}
              onClick={loadMore}
            >
              Load More
            </Button>
          ) : null}
        </Scrollable.Viewport>
        <Scrollable.Scrollbar />
      </Scrollable.Root>
    </div>
  );
};

interface ConfirmRestoreModalProps {
  open: boolean;
  onConfirm: (res: boolean) => void;
  isMutating: boolean;
}

const ConfirmRestoreModal = ({
  isMutating,
  open,
  onConfirm,
}: ConfirmRestoreModalProps) => {
  const t = useAFFiNEI18N();

  const handleConfirm = useCallback(() => {
    onConfirm(true);
  }, [onConfirm]);

  const handleCancel = useCallback(() => {
    onConfirm(false);
  }, [onConfirm]);

  return (
    <ConfirmModal
      open={open}
      onOpenChange={handleCancel}
      title={t['com.affine.history.restore-current-version']()}
      description={t['com.affine.history.confirm-restore-modal.hint']()}
      cancelText={t['Cancel']()}
      contentOptions={{
        ['data-testid' as string]: 'confirm-restore-history-modal',
        style: {
          padding: '20px 26px',
        },
      }}
      confirmButtonOptions={{
        loading: isMutating,
        type: 'primary',
        ['data-testid' as string]: 'confirm-restore-history-button',
        children: t['com.affine.history.confirm-restore-modal.restore'](),
      }}
      onConfirm={handleConfirm}
    ></ConfirmModal>
  );
};

const EmptyHistoryPrompt = () => {
  const t = useAFFiNEI18N();

  return (
    <div
      className={styles.emptyHistoryPrompt}
      data-testid="empty-history-prompt"
    >
      <EmptyHistoryShape />
      <div className={styles.emptyHistoryPromptTitle}>
        {t['com.affine.history.empty-prompt.title']()}
      </div>
      <div className={styles.emptyHistoryPromptDescription}>
        {t['com.affine.history.empty-prompt.description']()}
      </div>
    </div>
  );
};

const PageHistoryManager = ({
  workspace,
  pageId,
  onClose,
}: {
  workspace: Workspace;
  pageId: string;
  onClose: () => void;
}) => {
  const workspaceId = workspace.id;
  const [activeVersion, setActiveVersion] = useState<string>();

  const pageDocId = useMemo(() => {
    return workspace.getPage(pageId)?.spaceDoc.guid ?? pageId;
  }, [pageId, workspace]);

  const snapshot = usePageHistory(workspaceId, pageDocId, activeVersion);

  const t = useAFFiNEI18N();

  const { onRestore, isMutating } = useRestorePage(workspace, pageId);

  const handleRestore = useMemo(
    () => async () => {
      if (!activeVersion || !snapshot) {
        return;
      }
      await onRestore(activeVersion, new Uint8Array(snapshot));
      // close the modal after restore
      onClose();
    },
    [activeVersion, onClose, onRestore, snapshot]
  );

  const defaultPreviewPageMode = useAtomValue(currentModeAtom);
  const [mode, setMode] = useState<PageMode>(defaultPreviewPageMode);

  const title = useMemo(
    () => workspace.getPage(pageId)?.meta.title || t['Untitled'](),
    [pageId, t, workspace]
  );

  const [showRestoreConfirmModal, setShowRestoreConfirmModal] = useState(false);

  const showRestoreConfirm = useCallback(() => {
    setShowRestoreConfirmModal(true);
  }, []);

  const onConfirmRestore = useAsyncCallback(
    async res => {
      if (res) {
        await handleRestore();
      }
      setShowRestoreConfirmModal(false);
    },
    [handleRestore]
  );

  return (
    <div className={styles.root}>
      <div className={styles.modalContent} data-empty={!activeVersion}>
        <HistoryEditorPreview
          workspaceId={workspaceId}
          pageDocId={pageDocId}
          ts={activeVersion}
          snapshot={snapshot}
          mode={mode}
          onModeChange={setMode}
          title={title}
        />

        <PageHistoryList
          workspaceId={workspaceId}
          pageDocId={pageDocId}
          activeVersion={activeVersion}
          onVersionChange={setActiveVersion}
        />
      </div>

      {!activeVersion ? (
        <div className={styles.modalContent}>
          <EmptyHistoryPrompt />
        </div>
      ) : null}

      <div className={styles.historyFooter}>
        <Button type="plain" onClick={onClose}>
          {t['com.affine.history.back-to-page']()}
        </Button>
        <div className={styles.spacer} />
        <Button
          type="primary"
          onClick={showRestoreConfirm}
          disabled={isMutating || !activeVersion}
        >
          {t['com.affine.history.restore-current-version']()}
        </Button>
      </div>

      <ConfirmRestoreModal
        open={showRestoreConfirmModal}
        isMutating={isMutating}
        onConfirm={onConfirmRestore}
      />
    </div>
  );
};

export const PageHistoryModal = ({
  onOpenChange,
  open,
  pageId,
  workspace,
}: PageHistoryModalProps) => {
  const onClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <ModalContainer onOpenChange={onOpenChange} open={open}>
      <Suspense fallback={<BlockSuiteFallback />}>
        <PageHistoryManager
          onClose={onClose}
          pageId={pageId}
          workspace={workspace}
        />
      </Suspense>
    </ModalContainer>
  );
};

export const GlobalPageHistoryModal = () => {
  const [{ open, pageId }, setState] = useAtom(pageHistoryModalAtom);
  const [workspace] = useCurrentWorkspace();

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setState(prev => ({
        ...prev,
        open,
      }));
    },
    [setState]
  );

  return (
    <PageHistoryModal
      open={open}
      onOpenChange={handleOpenChange}
      pageId={pageId}
      workspace={workspace.blockSuiteWorkspace}
    />
  );
};
