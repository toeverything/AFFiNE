import {
  Checkbox,
  IconButton,
  type IconButtonProps,
  notify,
  toast,
  useConfirmModal,
} from '@affine/component';
import {
  ATTACHMENT_TRASH_CUSTOM_PROPERTY,
  ATTACHMENT_TRASH_META_KEY,
  parseAttachmentTrashMetadata,
} from '@affine/core/blocksuite/block-suite-editor/attachment-trash';
import { type DocRecord, DocsService } from '@affine/core/modules/doc';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/favorite';
import { GuardService } from '@affine/core/modules/permissions';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { UserFriendlyError } from '@affine/error';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import {
  DeleteIcon,
  OpenInNewIcon,
  ResetIcon,
  SplitViewIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { memo, useCallback, useContext } from 'react';

import { useBlockSuiteMetaHelper } from '../../hooks/affine/use-block-suite-meta-helper';
import { IsFavoriteIcon } from '../../pure/icons';
import { DocExplorerContext } from '../context';

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

export interface QuickActionProps extends IconButtonProps {
  doc: DocRecord;
}

export const QuickFavorite = memo(function QuickFavorite({
  doc,
  onClick,
  ...iconButtonProps
}: QuickActionProps) {
  const contextValue = useContext(DocExplorerContext);
  const quickFavorite = useLiveData(contextValue.quickFavorite$);

  const favAdapter = useService(CompatibleFavoriteItemsAdapter);
  const favourite = useLiveData(favAdapter.isFavorite$(doc.id, 'doc'));

  const toggleFavorite = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      e.stopPropagation();
      e.preventDefault();
      track.allDocs.list.docMenu.toggleFavorite();
      favAdapter.toggle(doc.id, 'doc');
    },
    [doc.id, favAdapter, onClick]
  );

  if (!quickFavorite) {
    return null;
  }

  return (
    <IconButton
      icon={<IsFavoriteIcon favorite={favourite} />}
      onClick={toggleFavorite}
      data-testid="doc-list-operation-favorite"
      {...iconButtonProps}
    />
  );
});

export const QuickTab = memo(function QuickTab({
  doc,
  onClick,
  ...iconButtonProps
}: QuickActionProps) {
  const contextValue = useContext(DocExplorerContext);
  const quickTab = useLiveData(contextValue.quickTab$);
  const workbench = useService(WorkbenchService).workbench;
  const onOpenInNewTab = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      e.stopPropagation();
      e.preventDefault();
      track.allDocs.list.doc.openDoc();
      track.allDocs.list.docMenu.openInNewTab();
      workbench.openDoc(doc.id, { at: 'new-tab' });
    },
    [doc.id, onClick, workbench]
  );

  if (!quickTab) {
    return null;
  }

  return (
    <IconButton
      onClick={onOpenInNewTab}
      icon={<OpenInNewIcon />}
      {...iconButtonProps}
    />
  );
});

export const QuickSplit = memo(function QuickSplit({
  doc,
  onClick,
  ...iconButtonProps
}: QuickActionProps) {
  const contextValue = useContext(DocExplorerContext);
  const quickSplit = useLiveData(contextValue.quickSplit$);
  const workbench = useService(WorkbenchService).workbench;

  const onOpenInSplitView = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      e.stopPropagation();
      e.preventDefault();
      track.allDocs.list.doc.openDoc();
      track.allDocs.list.docMenu.openInSplitView();
      workbench.openDoc(doc.id, { at: 'tail' });
    },
    [doc.id, onClick, workbench]
  );

  if (!quickSplit) {
    return null;
  }

  return (
    <IconButton
      onClick={onOpenInSplitView}
      icon={<SplitViewIcon />}
      {...iconButtonProps}
    />
  );
});

export const QuickDelete = memo(function QuickDelete({
  doc,
  onClick,
  ...iconButtonProps
}: QuickActionProps) {
  const t = useI18n();
  const { openConfirmModal } = useConfirmModal();
  const contextValue = useContext(DocExplorerContext);
  const guardService = useService(GuardService);
  const quickTrash = useLiveData(contextValue.quickTrash$);

  const onMoveToTrash = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      e.stopPropagation();
      e.preventDefault();
      if (!doc) {
        return;
      }

      track.allDocs.list.docMenu.deleteDoc();
      openConfirmModal({
        title: t['com.affine.moveToTrash.confirmModal.title'](),
        description: t['com.affine.moveToTrash.confirmModal.description']({
          title: doc.title$.value || t['Untitled'](),
        }),
        cancelText: t['com.affine.confirmModal.button.cancel'](),
        confirmText: t.Delete(),
        confirmButtonOptions: {
          variant: 'error',
        },
        onConfirm: async () => {
          try {
            const canTrash = await guardService.can('Doc_Trash', doc.id);
            if (!canTrash) {
              toast(t['com.affine.no-permission']());
              return;
            }
            doc.moveToTrash();
          } catch (error) {
            console.error(error);
            const userFriendlyError = UserFriendlyError.fromAny(error);
            toast(t[`error.${userFriendlyError.name}`](userFriendlyError.data));
          }
        },
      });
    },
    [doc, guardService, onClick, openConfirmModal, t]
  );

  if (!quickTrash) {
    return null;
  }

  return (
    <IconButton
      onClick={onMoveToTrash}
      icon={<DeleteIcon />}
      variant="danger"
      data-testid="doc-list-operation-trash"
      {...iconButtonProps}
    />
  );
});

export const QuickSelect = memo(function QuickSelect({
  doc,
  onClick,
  ...iconButtonProps
}: QuickActionProps) {
  const contextValue = useContext(DocExplorerContext);
  const quickSelect = useLiveData(contextValue.quickSelect$);
  const selectedDocIds = useLiveData(contextValue.selectedDocIds$);

  const selected = selectedDocIds.includes(doc.id);

  const onChange = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      contextValue.selectMode$?.next(true);
      onClick?.(e);
      e.stopPropagation();
      e.preventDefault();
      contextValue.selectMode$?.next(true);
      contextValue.selectedDocIds$?.next(
        selected
          ? selectedDocIds.filter(id => id !== doc.id)
          : [...selectedDocIds, doc.id]
      );
    },
    [contextValue, doc.id, onClick, selected, selectedDocIds]
  );

  if (!quickSelect) {
    return null;
  }

  return (
    <IconButton
      onClick={onChange}
      icon={<Checkbox checked={selected} style={{ pointerEvents: 'none' }} />}
      {...iconButtonProps}
    />
  );
});

export const QuickDeletePermanently = memo(function QuickDeletePermanently({
  doc,
  onClick,
  ...iconButtonProps
}: QuickActionProps) {
  const t = useI18n();
  const guardService = useService(GuardService);
  const contextValue = useContext(DocExplorerContext);
  const { permanentlyDeletePage } = useBlockSuiteMetaHelper();
  const quickDeletePermanently = useLiveData(
    contextValue.quickDeletePermanently$
  );
  const { openConfirmModal } = useConfirmModal();

  const handleDeletePermanently = useCallback(() => {
    guardService
      .can('Doc_Delete', doc.id)
      .then(can => {
        if (can) {
          permanentlyDeletePage(doc.id);
          toast(t['com.affine.toastMessage.permanentlyDeleted']());
        } else {
          toast(t['com.affine.no-permission']());
        }
      })
      .catch(e => {
        console.error(e);
      });
  }, [doc.id, guardService, permanentlyDeletePage, t]);

  const handleConfirmDeletePermanently = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      e.stopPropagation();
      e.preventDefault();
      openConfirmModal({
        title: `${t['com.affine.trashOperation.deletePermanently']()}?`,
        description: t['com.affine.trashOperation.deleteDescription'](),
        cancelText: t['Cancel'](),
        confirmText: t['com.affine.trashOperation.delete'](),
        confirmButtonOptions: {
          variant: 'error',
        },
        onConfirm: handleDeletePermanently,
      });
    },
    [handleDeletePermanently, onClick, openConfirmModal, t]
  );

  if (!quickDeletePermanently) {
    return null;
  }

  return (
    <IconButton
      data-testid="delete-page-button"
      onClick={handleConfirmDeletePermanently}
      icon={<DeleteIcon />}
      variant="danger"
      {...iconButtonProps}
    />
  );
});

export const QuickRestore = memo(function QuickRestore({
  doc,
  onClick,
  ...iconButtonProps
}: QuickActionProps) {
  const t = useI18n();
  const contextValue = useContext(DocExplorerContext);
  const quickRestore = useLiveData(contextValue.quickRestore$);
  const { restoreFromTrash, permanentlyDeletePage } = useBlockSuiteMetaHelper();
  const guardService = useService(GuardService);
  const docsService = useService(DocsService);

  const handleRestore = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      e.stopPropagation();
      e.preventDefault();

      const can = await guardService.can('Doc_Delete', doc.id);
      if (!can) {
        toast(t['com.affine.no-permission']());
        return;
      }

      try {
        // Check if this is an attachment trash document
        const properties = doc.getProperties() as Record<string, unknown>;

        const metadata = parseAttachmentTrashMetadata(
          properties[ATTACHMENT_TRASH_CUSTOM_PROPERTY]
        );

        if (metadata) {
          // This is an attachment trash document - handle specially

          // Now restore the attachment to its original location
          const { docId: originalDocId, entry } = metadata;
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
          permanentlyDeletePage(doc.id);

          // Clear metadata
          doc.setCustomProperty(ATTACHMENT_TRASH_META_KEY, '');

          notify.success({
            title: 'Attachment restored',
            message:
              'The attachment has been restored to its original location',
          });
        } else {
          // Normal document - use standard restore
          restoreFromTrash(doc.id);
          toast(
            t['com.affine.toastMessage.restored']({
              title: doc.title$.value || 'Untitled',
            })
          );
        }
      } catch (error) {
        console.error('Failed to restore:', error);
        toast(t['com.affine.toastMessage.failed']?.() || 'Restore failed');
      }
    },
    [
      doc,
      docsService,
      guardService,
      onClick,
      permanentlyDeletePage,
      restoreFromTrash,
      t,
    ]
  );

  if (!quickRestore) {
    return null;
  }

  return (
    <IconButton
      data-testid="restore-page-button"
      onClick={e => {
        handleRestore(e).catch(console.error);
      }}
      icon={<ResetIcon />}
      {...iconButtonProps}
    />
  );
});
