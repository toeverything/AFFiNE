import {
  IconButton,
  MenuIcon,
  MenuItem,
  MenuSeparator,
  toast,
  useConfirmModal,
} from '@affine/component';
import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { mixpanel } from '@affine/core/mixpanel';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/properties';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import {
  DeleteIcon,
  FavoritedIcon,
  FavoriteIcon,
  InformationIcon,
  LinkedPageIcon,
  OpenInNewIcon,
  PlusIcon,
  SplitViewIcon,
} from '@blocksuite/icons/rc';
import { DocsService, useLiveData, useServices } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import type { NodeOperation } from '../../tree/types';

export const useExplorerDocNodeOperations = (
  docId: string,
  options: {
    openInfoModal: () => void;
    openNodeCollapsed: () => void;
  }
): NodeOperation[] => {
  const t = useI18n();
  const { appSettings } = useAppSettingHelper();
  const { workbenchService, docsService, compatibleFavoriteItemsAdapter } =
    useServices({
      DocsService,
      WorkbenchService,
      CompatibleFavoriteItemsAdapter,
    });
  const { openConfirmModal } = useConfirmModal();

  const docRecord = useLiveData(docsService.list.doc$(docId));

  const favorite = useLiveData(
    useMemo(() => {
      return compatibleFavoriteItemsAdapter.isFavorite$(docId, 'doc');
    }, [docId, compatibleFavoriteItemsAdapter])
  );

  const handleMoveToTrash = useCallback(() => {
    if (!docRecord) {
      return;
    }
    openConfirmModal({
      title: t['com.affine.moveToTrash.title'](),
      description: t['com.affine.moveToTrash.confirmModal.description']({
        title: docRecord.title$.value,
      }),
      confirmText: t['com.affine.moveToTrash.confirmModal.confirm'](),
      cancelText: t['com.affine.moveToTrash.confirmModal.cancel'](),
      confirmButtonOptions: {
        variant: 'error',
      },
      onConfirm() {
        docRecord.moveToTrash();
        mixpanel.track('DocMovedTrash', {
          page: 'sidebar',
          module: 'doc',
          control: 'move to trash button',
        });
        toast(t['com.affine.toastMessage.movedTrash']());
      },
    });
  }, [docRecord, openConfirmModal, t]);

  const handleOpenInNewTab = useCallback(() => {
    workbenchService.workbench.openDoc(docId, {
      at: 'new-tab',
    });
    mixpanel.track('OpenInNewTab', {
      page: 'sidebar',
      module: 'doc',
      control: 'open in new tab button',
    });
  }, [docId, workbenchService]);

  const handleOpenInSplitView = useCallback(() => {
    workbenchService.workbench.openDoc(docId, {
      at: 'beside',
    });
    mixpanel.track('OpenInSplitView', {
      page: 'sidebar',
      module: 'doc',
      control: 'open in split view button',
    });
  }, [docId, workbenchService]);

  const handleAddLinkedPage = useAsyncCallback(async () => {
    const newDoc = docsService.createDoc();
    // TODO: handle timeout & error
    await docsService.addLinkedDoc(docId, newDoc.id);
    mixpanel.track('DocCreated', {
      page: 'sidebar',
      module: 'doc',
      control: 'add linked doc button',
    });
    mixpanel.track('LinkedDocCreated', {
      page: 'sidebar',
      module: 'doc',
      control: 'add linked doc button',
    });
    workbenchService.workbench.openDoc(newDoc.id);
    options.openNodeCollapsed();
  }, [docId, options, docsService, workbenchService.workbench]);

  const handleToggleFavoriteDoc = useCallback(() => {
    compatibleFavoriteItemsAdapter.toggle(docId, 'doc');
    mixpanel.track('ToggleFavorite', {
      page: 'sidebar',
      module: 'doc',
      control: 'toggle favorite button',
      type: 'doc',
      id: docId,
    });
  }, [docId, compatibleFavoriteItemsAdapter]);

  return useMemo(
    () => [
      {
        index: 0,
        inline: true,
        view: (
          <IconButton
            size="16"
            icon={<PlusIcon />}
            tooltip={t['com.affine.rootAppSidebar.explorer.doc-add-tooltip']()}
            onClick={handleAddLinkedPage}
          />
        ),
      },
      ...(runtimeConfig.enableInfoModal
        ? [
            {
              index: 50,
              view: (
                <MenuItem
                  preFix={
                    <MenuIcon>
                      <InformationIcon />
                    </MenuIcon>
                  }
                  onClick={options.openInfoModal}
                >
                  {t['com.affine.page-properties.page-info.view']()}
                </MenuItem>
              ),
            },
          ]
        : []),
      {
        index: 99,
        view: (
          <MenuItem
            preFix={
              <MenuIcon>
                <LinkedPageIcon />
              </MenuIcon>
            }
            onClick={handleAddLinkedPage}
          >
            {t['com.affine.page-operation.add-linked-page']()}
          </MenuItem>
        ),
      },
      {
        index: 99,
        view: (
          <MenuItem
            preFix={
              <MenuIcon>
                <OpenInNewIcon />
              </MenuIcon>
            }
            onClick={handleOpenInNewTab}
          >
            {t['com.affine.workbench.tab.page-menu-open']()}
          </MenuItem>
        ),
      },
      ...(appSettings.enableMultiView
        ? [
            {
              index: 100,
              view: (
                <MenuItem
                  preFix={
                    <MenuIcon>
                      <SplitViewIcon />
                    </MenuIcon>
                  }
                  onClick={handleOpenInSplitView}
                >
                  {t['com.affine.workbench.split-view.page-menu-open']()}
                </MenuItem>
              ),
            },
          ]
        : []),
      {
        index: 199,
        view: (
          <MenuItem
            preFix={
              <MenuIcon>
                {favorite ? (
                  <FavoritedIcon
                    style={{ color: 'var(--affine-primary-color)' }}
                  />
                ) : (
                  <FavoriteIcon />
                )}
              </MenuIcon>
            }
            onClick={handleToggleFavoriteDoc}
          >
            {favorite
              ? t['com.affine.favoritePageOperation.remove']()
              : t['com.affine.favoritePageOperation.add']()}
          </MenuItem>
        ),
      },
      {
        index: 9999,
        view: <MenuSeparator key="menu-separator" />,
      },
      {
        index: 10000,
        view: (
          <MenuItem
            type={'danger'}
            preFix={
              <MenuIcon>
                <DeleteIcon />
              </MenuIcon>
            }
            onClick={handleMoveToTrash}
          >
            {t['com.affine.moveToTrash.title']()}
          </MenuItem>
        ),
      },
    ],
    [
      appSettings.enableMultiView,
      favorite,
      handleAddLinkedPage,
      handleMoveToTrash,
      handleOpenInNewTab,
      handleOpenInSplitView,
      handleToggleFavoriteDoc,
      options.openInfoModal,
      t,
    ]
  );
};
