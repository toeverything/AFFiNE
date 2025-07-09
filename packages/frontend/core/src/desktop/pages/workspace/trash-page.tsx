import { toast, useConfirmModal } from '@affine/component';
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
import { useCallback, useEffect, useState } from 'react';

import {
  useIsActiveView,
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
} from '../../../modules/workbench';
import { EmptyPageList } from './page-list-empty';
import * as styles from './trash-page.css';

const TrashHeader = () => {
  const t = useI18n();
  return (
    <Header
      left={
        <div className={styles.trashTitle}>
          <DeleteIcon className={styles.trashIcon} />
          {t['com.affine.workspaceSubPath.trash']()}
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
  const { openConfirmModal } = useConfirmModal();
  const { restoreFromTrash, permanentlyDeletePage } = useBlockSuiteMetaHelper();
  const isActiveView = useIsActiveView();

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

  const handleMultiDeletePermanently = useCallback(
    (ids: string[]) => {
      const isMultiple = ids.length > 1;
      const number = ids.length.toString();

      const title = isMultiple
        ? t['com.affine.deletePermanently.confirmModal.title.multiple']({
            number,
          })
        : t['com.affine.deletePermanently.confirmModal.title']();

      const description = isMultiple
        ? t['com.affine.deletePermanently.confirmModal.description.multiple']({
            number,
          })
        : t['com.affine.deletePermanently.confirmModal.description']();

      openConfirmModal({
        title,
        description,
        cancelText: t['com.affine.confirmModal.button.cancel'](),
        confirmText: t['com.affine.trashOperation.deletePermanently'](),
        confirmButtonOptions: {
          variant: 'error',
        },
        onConfirm: () => {
          ids.forEach(id => {
            permanentlyDeletePage(id);
          });
          toast(t['com.affine.toastMessage.permanentlyDeleted']());
        },
      });
    },
    [openConfirmModal, permanentlyDeletePage, t]
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
        <TrashHeader />
      </ViewHeader>
      <ViewBody>
        <div className={styles.body}>
          {isEmpty ? (
            <EmptyPageList type="trash" />
          ) : (
            <DocsExplorer
              disableMultiDelete={!isAdmin && !isOwner}
              onRestore={isAdmin || isOwner ? handleMultiRestore : undefined}
              onDelete={
                isAdmin || isOwner ? handleMultiDeletePermanently : undefined
              }
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
