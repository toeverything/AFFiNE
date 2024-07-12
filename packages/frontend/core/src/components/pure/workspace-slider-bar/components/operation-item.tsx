import type { MenuItemProps } from '@affine/component';
import { MenuIcon, MenuItem, MenuSeparator } from '@affine/component';
import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import { useI18n } from '@affine/i18n';
import {
  DeleteIcon,
  EditIcon,
  FavoriteIcon,
  FilterMinusIcon,
  InformationIcon,
  LinkedPageIcon,
  SplitViewIcon,
} from '@blocksuite/icons/rc';
import type { ReactElement } from 'react';
import { useMemo } from 'react';

type OperationItemsProps = {
  inFavorites?: boolean;
  isReferencePage?: boolean;
  inAllowList?: boolean;
  onRemoveFromAllowList?: () => void;
  setRenameModalOpen?: () => void;
  onRename: () => void;
  onAddLinkedPage: () => void;
  onRemoveFromFavourites?: () => void;
  onDelete: () => void;
  onOpenInSplitView: () => void;
  onOpenInfoModal: () => void;
};

export const OperationItems = ({
  inFavorites,
  isReferencePage,
  inAllowList,
  onRemoveFromAllowList,
  onRename,
  onAddLinkedPage,
  onRemoveFromFavourites,
  onDelete,
  onOpenInSplitView,
  onOpenInfoModal,
}: OperationItemsProps) => {
  const { appSettings } = useAppSettingHelper();
  const t = useI18n();
  const actions = useMemo<
    Array<
      | {
          icon: ReactElement;
          name: string;
          click: () => void;
          type?: MenuItemProps['type'];
          element?: undefined;
        }
      | {
          element: ReactElement;
        }
    >
  >(
    () => [
      {
        icon: (
          <MenuIcon>
            <EditIcon />
          </MenuIcon>
        ),
        name: t['Rename'](),
        click: onRename,
      },
      ...(runtimeConfig.enableInfoModal
        ? [
            {
              icon: (
                <MenuIcon>
                  <InformationIcon />
                </MenuIcon>
              ),
              name: t['com.affine.page-properties.page-info.view'](),
              click: onOpenInfoModal,
            },
          ]
        : []),
      {
        icon: (
          <MenuIcon>
            <LinkedPageIcon />
          </MenuIcon>
        ),
        name: t['com.affine.page-operation.add-linked-page'](),
        click: onAddLinkedPage,
      },
      ...(inFavorites && onRemoveFromFavourites && !isReferencePage
        ? [
            {
              icon: (
                <MenuIcon>
                  <FavoriteIcon />
                </MenuIcon>
              ),
              name: t['Remove from favorites'](),
              click: onRemoveFromFavourites,
            },
          ]
        : []),
      ...(inAllowList && onRemoveFromAllowList
        ? [
            {
              icon: (
                <MenuIcon>
                  <FilterMinusIcon />
                </MenuIcon>
              ),
              name: t['Remove special filter'](),
              click: onRemoveFromAllowList,
            },
          ]
        : []),

      ...(appSettings.enableMultiView
        ? [
            // open split view
            {
              icon: (
                <MenuIcon>
                  <SplitViewIcon />
                </MenuIcon>
              ),
              name: t['com.affine.workbench.split-view.page-menu-open'](),
              click: onOpenInSplitView,
            },
          ]
        : []),

      {
        element: <MenuSeparator key="menu-separator" />,
      },
      {
        icon: (
          <MenuIcon>
            <DeleteIcon />
          </MenuIcon>
        ),
        name: t['com.affine.moveToTrash.title'](),
        click: onDelete,
        type: 'danger',
      },
    ],
    [
      t,
      onRename,
      onAddLinkedPage,
      inFavorites,
      onRemoveFromFavourites,
      isReferencePage,
      inAllowList,
      onRemoveFromAllowList,
      appSettings.enableMultiView,
      onOpenInSplitView,
      onOpenInfoModal,
      onDelete,
    ]
  );
  return (
    <>
      {actions.map(action => {
        if (action.element) {
          return action.element;
        }
        return (
          <MenuItem
            data-testid="sidebar-page-option-item"
            key={action.name}
            type={action.type}
            preFix={action.icon}
            onClick={action.click}
          >
            {action.name}
          </MenuItem>
        );
      })}
    </>
  );
};
