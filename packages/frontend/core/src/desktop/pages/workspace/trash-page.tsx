import { Button, toast, useConfirmModal } from '@affine/component';
import {
  createDocExplorerContext,
  DocExplorerContext,
} from '@affine/core/components/explorer/context';
import { DocsExplorer } from '@affine/core/components/explorer/docs-view/docs-list';
import { useBlockSuiteMetaHelper } from '@affine/core/components/hooks/affine/use-block-suite-meta-helper';
import { Header } from '@affine/core/components/pure/header';
import { CollectionRulesService } from '@affine/core/modules/collection-rules';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { useI18n } from '@affine/i18n';
import { DeleteIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  useIsActiveView,
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
} from '../../../modules/workbench';
import { EmptyPageList } from './page-list-empty';
import * as styles from './trash-page.css';

const TrashHeader = ({ canManageTrash }: { canManageTrash: boolean }) => {
  const t = useI18n();
  const contextValue = useContext(DocExplorerContext);
  const groups = useLiveData(contextValue.groups$);
  const selectMode = useLiveData(contextValue.selectMode$);
  const selectedDocIds = useLiveData(contextValue.selectedDocIds$);

  const allDocIds = useMemo(
    () => Array.from(new Set(groups.flatMap(group => group.items))),
    [groups]
  );
  const allSelected = useMemo(() => {
    const selectedDocIdSet = new Set(selectedDocIds);
    return (
      allDocIds.length > 0 && allDocIds.every(id => selectedDocIdSet.has(id))
    );
  }, [allDocIds, selectedDocIds]);

  const handleToggleSelectAll = useCallback(() => {
    contextValue.selectedDocIds$.next(allSelected ? [] : allDocIds);
    contextValue.prevCheckAnchorId$?.next(null);
  }, [allDocIds, allSelected, contextValue]);

  return (
    <Header
      left={
        <div className={styles.trashTitle}>
          <DeleteIcon className={styles.trashIcon} />
          {t['com.affine.workspaceSubPath.trash']()}
          {selectMode && canManageTrash && allDocIds.length > 0 ? (
            <Button
              className={styles.selectAllButton}
              data-testid="trash-select-all"
              onClick={handleToggleSelectAll}
              size="custom"
              variant="plain"
            >
              {allSelected
                ? t['com.affine.page.group-header.clear']()
                : t['com.affine.page.group-header.select-all']()}
            </Button>
          ) : null}
        </div>
      }
    />
  );
};

export const TrashPage = () => {
  const t = useI18n();
  const collectionRulesService = useService(CollectionRulesService);
  const globalContextService = useService(GlobalContextService);
  const permissionService = useService(WorkspacePermissionService);

  const { restoreFromTrash, permanentlyDeletePage } = useBlockSuiteMetaHelper();
  const isActiveView = useIsActiveView();
  const { openConfirmModal } = useConfirmModal();

  const [explorerContextValue] = useState(() =>
    createDocExplorerContext({
      displayProperties: [
        'system:createdAt',
        'system:updatedAt',
        'system:tags',
      ],
      showMoreOperation: false,
      showDragHandle: true,
      showDocPreview: false,
      quickFavorite: false,
      quickDeletePermanently: true,
      quickRestore: true,
      quickSelect: true,
      groupBy: undefined,
      orderBy: undefined,
    })
  );

  const isAdmin = useLiveData(permissionService.permission.isAdmin$);
  const isOwner = useLiveData(permissionService.permission.isOwner$);
  const canManageTrash = !!isAdmin || !!isOwner;
  const groups = useLiveData(explorerContextValue.groups$);
  const isEmpty =
    groups.length === 0 ||
    (groups.length > 0 && groups.every(group => !group.items?.length));

  const handleMultiRestore = useCallback(
    (ids: string[]) => {
      ids.forEach(id => {
        restoreFromTrash(id);
      });
      toast(
        t['com.affine.toastMessage.restored']({
          title: ids.length > 1 ? 'docs' : 'doc',
        })
      );
    },
    [restoreFromTrash, t]
  );

  const handleMultiDelete = useCallback(
    (ids: string[]) => {
      ids.forEach(pageId => {
        permanentlyDeletePage(pageId);
      });
      toast(t['com.affine.toastMessage.permanentlyDeleted']());
    },
    [permanentlyDeletePage, t]
  );

  const onConfirmPermanentlyDelete = useCallback(
    (
      ids: string[],
      callbacks?: {
        onFinished?: () => void;
        onAbort?: () => void;
      }
    ) => {
      if (ids.length === 0) {
        return;
      }
      openConfirmModal({
        title: `${t['com.affine.trashOperation.deletePermanently']()}?`,
        description: t['com.affine.trashOperation.deleteDescription'](),
        cancelText: t['Cancel'](),
        confirmText: t['com.affine.trashOperation.delete'](),
        confirmButtonOptions: {
          variant: 'error',
        },
        onConfirm: () => {
          handleMultiDelete(ids);
          callbacks?.onFinished?.();
        },
        onCancel: () => {
          callbacks?.onAbort?.();
        },
      });
    },
    [handleMultiDelete, openConfirmModal, t]
  );

  useEffect(() => {
    const subscription = collectionRulesService
      .watch({
        filters: [
          {
            type: 'system',
            key: 'trash',
            method: 'is',
            value: 'true',
          },
        ],
        orderBy: {
          type: 'system',
          key: 'updatedAt',
          desc: true,
        },
      })
      .subscribe(result => {
        explorerContextValue.groups$.next(result.groups);
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [collectionRulesService, explorerContextValue.groups$]);

  useEffect(() => {
    if (isActiveView) {
      globalContextService.globalContext.isTrash.set(true);

      return () => {
        globalContextService.globalContext.isTrash.set(false);
      };
    }
    return;
  }, [globalContextService.globalContext.isTrash, isActiveView]);

  return (
    <DocExplorerContext.Provider value={explorerContextValue}>
      <ViewTitle title={t['Trash']()} />
      <ViewIcon icon={'trash'} />
      <ViewHeader>
        <TrashHeader canManageTrash={canManageTrash} />
      </ViewHeader>
      <ViewBody>
        <div className={styles.body}>
          {isEmpty ? (
            <EmptyPageList type="trash" />
          ) : (
            <DocsExplorer
              disableMultiDelete={!canManageTrash}
              onRestore={canManageTrash ? handleMultiRestore : undefined}
              onDelete={canManageTrash ? onConfirmPermanentlyDelete : undefined}
            />
          )}
        </div>
      </ViewBody>
    </DocExplorerContext.Provider>
  );
};

export const Component = () => {
  return <TrashPage />;
};
