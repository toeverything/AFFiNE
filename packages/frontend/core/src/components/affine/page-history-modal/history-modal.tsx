import { Loading, Scrollable } from '@affine/component';
import {
  BlockSuiteEditor,
  EditorLoading,
} from '@affine/component/block-suite-editor';
import { Button, IconButton } from '@affine/component/ui/button';
import { ConfirmModal, Modal } from '@affine/component/ui/modal';
import { openSettingModalAtom, type PageMode } from '@affine/core/atoms';
import { useIsWorkspaceOwner } from '@affine/core/hooks/affine/use-is-workspace-owner';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useUserSubscription } from '@affine/core/hooks/use-subscription';
import { waitForCurrentWorkspaceAtom } from '@affine/core/modules/workspace';
import { timestampToLocalTime } from '@affine/core/utils';
import { SubscriptionPlan } from '@affine/graphql';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloseIcon, ToggleCollapseIcon } from '@blocksuite/icons';
import type { Page, Workspace } from '@blocksuite/store';
import * as Collapsible from '@radix-ui/react-collapsible';
import type { DialogContentProps } from '@radix-ui/react-dialog';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  Fragment,
  type PropsWithChildren,
  Suspense,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { encodeStateAsUpdate } from 'yjs';

import { currentModeAtom } from '../../../atoms/mode';
import { pageHistoryModalAtom } from '../../../atoms/page-history';
import { StyledEditorModeSwitch } from '../../blocksuite/block-suite-mode-switch/style';
import {
  EdgelessSwitchItem,
  PageSwitchItem,
} from '../../blocksuite/block-suite-mode-switch/switch-items';
import { AffineErrorBoundary } from '../affine-error-boundary';
import {
  historyListGroupByDay,
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
      {children}
    </Modal>
  );
};

interface HistoryEditorPreviewProps {
  ts?: string;
  snapshotPage?: Page;
  mode: PageMode;
  onModeChange: (mode: PageMode) => void;
  title: string;
}

const HistoryEditorPreview = ({
  ts,
  snapshotPage,
  onModeChange,
  mode,
  title,
}: HistoryEditorPreviewProps) => {
  const onSwitchToPageMode = useCallback(() => {
    onModeChange('page');
  }, [onModeChange]);
  const onSwitchToEdgelessMode = useCallback(() => {
    onModeChange('edgeless');
  }, [onModeChange]);

  return (
    <div className={styles.previewWrapper}>
      <div className={styles.previewContainerStack2} />
      <div className={styles.previewContainerStack1} />
      <div className={styles.previewContainer}>
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

        {snapshotPage ? (
          <AffineErrorBoundary>
            <BlockSuiteEditor
              className={styles.editor}
              mode={mode}
              page={snapshotPage}
              onModeChange={onModeChange}
            />
          </AffineErrorBoundary>
        ) : (
          <div className={styles.loadingContainer}>
            <Loading size={24} />
          </div>
        )}
      </div>
    </div>
  );
};
const planPromptClosedAtom = atom(false);

const PlanPrompt = () => {
  const [subscription] = useUserSubscription();
  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);
  const isOwner = useIsWorkspaceOwner(currentWorkspace.meta);
  const freePlan = subscription?.plan === SubscriptionPlan.Free;

  const setSettingModalAtom = useSetAtom(openSettingModalAtom);
  const [planPromptClosed, setPlanPromptClosed] = useAtom(planPromptClosedAtom);

  const closeFreePlanPrompt = useCallback(() => {
    setPlanPromptClosed(true);
  }, [setPlanPromptClosed]);

  const onClickUpgrade = useCallback(() => {
    setSettingModalAtom({
      open: true,
      activeTab: 'plans',
    });
  }, [setSettingModalAtom]);

  const t = useAFFiNEI18N();

  const planTitle = useMemo(() => {
    return (
      <div className={styles.planPromptTitle}>
        {freePlan
          ? t[
              'com.affine.history.confirm-restore-modal.plan-prompt.limited-title'
            ]()
          : t['com.affine.history.confirm-restore-modal.plan-prompt.title']()}

        <IconButton
          size="small"
          icon={<CloseIcon />}
          onClick={closeFreePlanPrompt}
        />
      </div>
    );
  }, [closeFreePlanPrompt, freePlan, t]);

  const planDescription = useMemo(() => {
    if (freePlan) {
      return (
        <>
          <Trans i18nKey="com.affine.history.confirm-restore-modal.free-plan-prompt.description">
            Free users can view up to the <b>last 7 days</b> of page history.
          </Trans>
          {isOwner ? (
            <span
              className={styles.planPromptUpdateButton}
              onClick={onClickUpgrade}
            >
              {t[
                'com.affine.history.confirm-restore-modal.pro-plan-prompt.upgrade'
              ]()}
            </span>
          ) : null}
        </>
      );
    } else {
      return (
        <Trans i18nKey="com.affine.history.confirm-restore-modal.pro-plan-prompt.description">
          Pro users can view up to the <b>last 30 days</b> of page history.
        </Trans>
      );
    }
  }, [freePlan, isOwner, onClickUpgrade, t]);

  return !planPromptClosed ? (
    <div className={styles.planPromptWrapper}>
      <div className={styles.planPrompt}>
        {planTitle}
        {planDescription}
      </div>
    </div>
  ) : null;
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

  const [collapsedMap, setCollapsedMap] = useState<Record<number, boolean>>({});

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
          <PlanPrompt />
          {historyListByDay.map(([day, list], i) => {
            const collapsed = collapsedMap[i];
            return (
              <Collapsible.Root
                open={!collapsed}
                key={day}
                className={styles.historyItemGroup}
              >
                <Collapsible.Trigger
                  role="button"
                  onClick={() =>
                    setCollapsedMap(prev => ({ ...prev, [i]: !collapsed }))
                  }
                  className={styles.historyItemGroupTitle}
                >
                  <div
                    data-testid="page-list-group-header-collapsed-button"
                    className={styles.collapsedIconContainer}
                  >
                    <ToggleCollapseIcon
                      className={styles.collapsedIcon}
                      data-collapsed={!!collapsed}
                    />
                  </div>
                  {day}
                </Collapsible.Trigger>
                <Collapsible.Content>
                  {list.map((history, idx) => {
                    return (
                      <Fragment key={history.timestamp}>
                        <div
                          className={styles.historyItem}
                          data-testid="version-history-item"
                          onClick={e => {
                            e.stopPropagation();
                            onVersionChange(history.timestamp);
                          }}
                          data-active={activeVersion === history.timestamp}
                        >
                          <button>
                            {timestampToLocalTime(history.timestamp)}
                          </button>
                        </div>
                        {idx > list.length - 1 ? (
                          <div className={styles.historyItemGap} />
                        ) : null}
                      </Fragment>
                    );
                  })}
                </Collapsible.Content>
              </Collapsible.Root>
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
              {t['com.affine.history.confirm-restore-modal.load-more']()}
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

  const snapshotPage = useSnapshotPage(workspaceId, pageDocId, activeVersion);

  const t = useAFFiNEI18N();

  const { onRestore, isMutating } = useRestorePage(workspace, pageId);

  const handleRestore = useMemo(
    () => async () => {
      if (!activeVersion || !snapshotPage) {
        return;
      }
      const snapshot = encodeStateAsUpdate(snapshotPage.spaceDoc);
      await onRestore(activeVersion, new Uint8Array(snapshot));
      // close the modal after restore
      onClose();
    },
    [activeVersion, onClose, onRestore, snapshotPage]
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
          ts={activeVersion}
          snapshotPage={snapshotPage}
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
      <Suspense fallback={<EditorLoading />}>
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
  const workspace = useAtomValue(waitForCurrentWorkspaceAtom);

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
