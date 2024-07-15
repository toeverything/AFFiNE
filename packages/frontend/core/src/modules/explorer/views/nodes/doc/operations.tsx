import { MenuIcon, MenuItem, MenuSeparator } from '@affine/component';
import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { FavoriteItemsAdapter } from '@affine/core/modules/properties';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import {
  DeleteIcon,
  FavoritedIcon,
  FavoriteIcon,
  InformationIcon,
  LinkedPageIcon,
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
  const { workbenchService, docsService, favoriteItemsAdapter } = useServices({
    DocsService,
    WorkbenchService,
    FavoriteItemsAdapter,
  });

  const docRecord = useLiveData(docsService.list.doc$(docId));

  const favorite = useLiveData(
    useMemo(
      () => favoriteItemsAdapter.isFavorite$(docId, 'doc'),
      [docId, favoriteItemsAdapter]
    )
  );

  const handleMoveToTrash = useCallback(() => {
    docRecord?.moveToTrash();
  }, [docRecord]);

  const handleOpenInSplitView = useCallback(() => {
    workbenchService.workbench.openDoc(docId, {
      at: 'beside',
    });
  }, [docId, workbenchService]);

  const handleAddLinkedPage = useAsyncCallback(async () => {
    const newDoc = docsService.createDoc();
    // TODO: handle timeout & error
    await docsService.addLinkedDoc(docId, newDoc.id);
    workbenchService.workbench.openDoc(newDoc.id);
    options.openNodeCollapsed();
  }, [docId, options, docsService, workbenchService.workbench]);

  const handleToggleFavoriteDoc = useCallback(() => {
    favoriteItemsAdapter.toggle(docId, 'doc');
  }, [favoriteItemsAdapter, docId]);

  return useMemo(
    () => [
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
      handleOpenInSplitView,
      handleToggleFavoriteDoc,
      options.openInfoModal,
      t,
    ]
  );
};
