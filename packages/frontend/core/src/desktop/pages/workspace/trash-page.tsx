import { notify, toast, useConfirmModal } from '@affine/component';
import {
  ATTACHMENT_TRASH_CUSTOM_PROPERTY,
  ATTACHMENT_TRASH_META_KEY,
  parseAttachmentTrashMetadata,
  serializeAttachmentTrashMetadata,
} from '@affine/core/blocksuite/block-suite-editor/attachment-trash';
import {
  createDocExplorerContext,
  DocExplorerContext,
} from '@affine/core/components/explorer/context';
import { DocsExplorer } from '@affine/core/components/explorer/docs-view/docs-list';
import { useBlockSuiteMetaHelper } from '@affine/core/components/hooks/affine/use-block-suite-meta-helper';
import { Header } from '@affine/core/components/pure/header';
import { CollectionRulesService } from '@affine/core/modules/collection-rules';
import { DocsService } from '@affine/core/modules/doc';
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

// Helper functions for attachment restoration
function cloneAttachmentProps(props: Record<string, unknown>) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(props);
    } catch (error) {
      console.warn('structuredClone failed for attachment props', error);
    }
  }
  return JSON.parse(JSON.stringify(props));
}

function resolveAttachmentParent(store: any, parentId: string | null) {
  if (parentId) {
    const parent = store.getModelById(parentId);
    if (parent) {
      return parent.id;
    }
  }
  const note = store.getModelsByFlavour('affine:note')[0];
  if (note) return note.id;
  const surface = store.getModelsByFlavour('affine:surface')[0];
  if (surface) return surface.id;
  return store.root?.id ?? null;
}

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
  const docsService = useService(DocsService);

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
  const groups = useLiveData(explorerContextValue.groups$);
  const isEmpty =
    groups.length === 0 ||
    (groups.length > 0 && groups.every(group => !group.items?.length));

  const handleMultiRestore = useCallback(
    async (ids: string[]) => {
      let normalDocsCount = 0;
      let attachmentDocsCount = 0;

      for (const id of ids) {
        const record = docsService.list.doc$(id).value;
        if (!record) {
          console.warn('Document not found for restore:', id);
          continue;
        }

        const properties = record.getProperties() as Record<string, unknown>;
        const metadata = parseAttachmentTrashMetadata(
          properties[ATTACHMENT_TRASH_CUSTOM_PROPERTY]
        );

        if (metadata) {
          // This is an attachment trash document - handle specially
          attachmentDocsCount++;

          // Clear metadata immediately to prevent double-restoration
          record.setCustomProperty(ATTACHMENT_TRASH_META_KEY, '');

          try {
            const { docId: originalDocId, entry } = metadata;

            // Now restore the attachment to its original location
            const { doc: targetDoc, release: releaseTarget } =
              docsService.open(originalDocId);
            try {
              await targetDoc.waitForSyncReady();
              const store = targetDoc.blockSuiteDoc;
              const attachmentProps = cloneAttachmentProps(entry.props);
              delete attachmentProps.id;

              const parent = entry.parentId
                ? store.getModelById(entry.parentId)
                : null;

              store.captureSync();
              store.transact(() => {
                if (parent) {
                  let insertIndex: number | undefined;
                  if (entry.nextId) {
                    const next = store.getModelById(entry.nextId);
                    if (next && parent.children) {
                      const idx = parent.children.findIndex(
                        ({ id }) => id === next.id
                      );
                      insertIndex = idx >= 0 ? idx : undefined;
                    }
                  } else if (entry.prevId) {
                    const prev = store.getModelById(entry.prevId);
                    if (prev && parent.children) {
                      const idx = parent.children.findIndex(
                        ({ id }) => id === prev.id
                      );
                      insertIndex = idx >= 0 ? idx + 1 : undefined;
                    }
                  }

                  store.addBlock(
                    'affine:attachment',
                    attachmentProps as Record<string, unknown>,
                    parent.id,
                    insertIndex
                  );
                } else {
                  const fallbackParent = resolveAttachmentParent(
                    store,
                    entry.parentId
                  );
                  store.addBlock(
                    'affine:attachment',
                    attachmentProps as Record<string, unknown>,
                    fallbackParent ?? undefined
                  );
                }
              });
            } finally {
              releaseTarget();
            }

            // Now permanently delete the trash document
            permanentlyDeletePage(record.id);
          } catch (error) {
            console.error('Failed to restore attachment from trash', error);
            // Restore metadata so user can retry
            record.setCustomProperty(
              ATTACHMENT_TRASH_META_KEY,
              serializeAttachmentTrashMetadata(metadata)
            );
            notify.error({
              title: 'Failed to restore attachment',
              message: 'Could not restore the attachment. Please try again.',
            });
          }
        } else {
          // Normal document - use standard restore
          normalDocsCount++;
          restoreFromTrash(id);
        }
      }

      // Show appropriate toast message
      if (attachmentDocsCount > 0 && normalDocsCount === 0) {
        notify.success({
          title: `${attachmentDocsCount} attachment${attachmentDocsCount > 1 ? 's' : ''} restored`,
          message: 'Attachments have been restored to their original locations',
        });
      } else if (normalDocsCount > 0 && attachmentDocsCount === 0) {
        toast(
          t['com.affine.toastMessage.restored']({
            title: normalDocsCount > 1 ? 'docs' : 'doc',
          })
        );
      } else if (attachmentDocsCount > 0 && normalDocsCount > 0) {
        notify.success({
          title: 'Items restored',
          message: `${normalDocsCount} doc${normalDocsCount > 1 ? 's' : ''} and ${attachmentDocsCount} attachment${attachmentDocsCount > 1 ? 's' : ''} restored`,
        });
      }
    },
    [docsService, permanentlyDeletePage, restoreFromTrash, t]
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
        <TrashHeader />
      </ViewHeader>
      <ViewBody>
        <div className={styles.body}>
          {isEmpty ? (
            <EmptyPageList type="trash" />
          ) : (
            <DocsExplorer
              disableMultiDelete={!isAdmin && !isOwner}
              onRestore={
                isAdmin || isOwner
                  ? ids => {
                      handleMultiRestore(ids).catch(console.error);
                    }
                  : undefined
              }
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
