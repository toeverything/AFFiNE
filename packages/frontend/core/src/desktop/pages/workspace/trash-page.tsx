import { IconButton, toast, useConfirmModal } from '@affine/component';
import {
  createDocExplorerContext,
  DocExplorerContext,
} from '@affine/core/components/explorer/context';
import { DocsExplorer } from '@affine/core/components/explorer/docs-view/docs-list';
import { useBlockSuiteMetaHelper } from '@affine/core/components/hooks/affine/use-block-suite-meta-helper';
import { useEmptyTrash } from '@affine/core/components/hooks/affine/use-empty-trash';
import { Header } from '@affine/core/components/pure/header';
import { CollectionRulesService } from '@affine/core/modules/collection-rules';
import { DocsService } from '@affine/core/modules/doc';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { UserFriendlyError } from '@affine/error';
import { useI18n } from '@affine/i18n';
import { DeleteIcon, DeletePermanentlyIcon } from '@blocksuite/icons/rc';
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

const TrashHeader = ({
  onEmptyTrash,
  disableEmptyTrash,
}: {
  onEmptyTrash: () => void;
  disableEmptyTrash: boolean;
}) => {
  const t = useI18n();
  return (
    <Header
      left={
        <div className={styles.trashTitle}>
          <DeleteIcon className={styles.trashIcon} />
          {t['com.affine.workspaceSubPath.trash']()}
        </div>
      }
      right={
        <IconButton
          size="20"
          className={styles.emptyTrashButton}
          tooltip={t['com.affine.workspaceSubPath.trash.empty']()}
          disabled={disableEmptyTrash}
          onClick={onEmptyTrash}
          data-testid="trash-empty-button"
        >
          <DeletePermanentlyIcon />
        </IconButton>
      }
    />
  );
};

export const TrashPage = () => {
  const t = useI18n();
  const collectionRulesService = useService(CollectionRulesService);
  const globalContextService = useService(GlobalContextService);
  const permissionService = useService(WorkspacePermissionService);
  const docsService = useService(DocsService);

  const { restoreFromTrash, permanentlyDeletePage } = useBlockSuiteMetaHelper();
  const { confirmAndEmptyTrash } = useEmptyTrash();
  const isActiveView = useIsActiveView();
  const { openConfirmModal } = useConfirmModal();
  const trashDocs = useLiveData(docsService.list.trashDocs$);

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

  const handleMultiDelete = useCallback(
    (ids: string[]) => {
      let firstError: unknown;

      ids.forEach(pageId => {
        try {
          permanentlyDeletePage(pageId);
        } catch (error) {
          console.error(error);
          firstError ??= error;
        }
      });

      if (firstError) {
        const userFriendlyError = UserFriendlyError.fromAny(firstError);
        toast(t[`error.${userFriendlyError.name}`](userFriendlyError.data));
        return;
      }

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

  const onEmptyTrash = useCallback(() => {
    confirmAndEmptyTrash(trashDocs.map(doc => doc.id)).catch(() => {
      // Errors are already handled in useEmptyTrash.
    });
  }, [confirmAndEmptyTrash, trashDocs]);

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
        <TrashHeader
          onEmptyTrash={onEmptyTrash}
          disableEmptyTrash={isEmpty || (!isAdmin && !isOwner)}
        />
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
                isAdmin || isOwner ? onConfirmPermanentlyDelete : undefined
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
