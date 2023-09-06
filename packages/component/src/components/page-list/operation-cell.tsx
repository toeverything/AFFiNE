import { isDesktop } from '@affine/env/constant';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  DeletePermanentlyIcon,
  FavoritedIcon,
  FavoriteIcon,
  MoreVerticalIcon,
  OpenInNewIcon,
  ResetIcon,
} from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';
import { Menu, MenuIcon, MenuItem } from '@toeverything/components/menu';
import { Tooltip } from '@toeverything/components/tooltip';
import { useState } from 'react';

import { Confirm, FlexWrapper } from '../../..';
import { DisablePublicSharing, MoveToTrash } from './operation-menu-items';

export interface OperationCellProps {
  title: string;
  favorite: boolean;
  isPublic: boolean;
  onOpenPageInNewTab: () => void;
  onToggleFavoritePage: () => void;
  onRemoveToTrash: () => void;
  onDisablePublicSharing: () => void;
}

export const OperationCell = ({
  title,
  favorite,
  isPublic,
  onOpenPageInNewTab,
  onToggleFavoritePage,
  onRemoveToTrash,
  onDisablePublicSharing,
}: OperationCellProps) => {
  const t = useAFFiNEI18N();
  const [open, setOpen] = useState(false);
  const [openDisableShared, setOpenDisableShared] = useState(false);

  const OperationMenu = (
    <>
      {isPublic && (
        <DisablePublicSharing
          data-testid="disable-public-sharing"
          onSelect={() => {
            setOpenDisableShared(true);
          }}
        />
      )}
      <MenuItem
        onClick={onToggleFavoritePage}
        preFix={
          <MenuIcon>
            {favorite ? (
              <FavoritedIcon style={{ color: 'var(--affine-primary-color)' }} />
            ) : (
              <FavoriteIcon />
            )}
          </MenuIcon>
        }
      >
        {favorite
          ? t['com.affine.favoritePageOperation.remove']()
          : t['com.affine.favoritePageOperation.add']()}
      </MenuItem>
      {!isDesktop && (
        <MenuItem
          onClick={onOpenPageInNewTab}
          preFix={
            <MenuIcon>
              <OpenInNewIcon />
            </MenuIcon>
          }
        >
          {t['com.affine.openPageOperation.newTab']()}
        </MenuItem>
      )}
      <MoveToTrash
        data-testid="move-to-trash"
        onSelect={() => {
          setOpen(true);
        }}
      />
    </>
  );
  return (
    <>
      <FlexWrapper alignItems="center" justifyContent="center">
        <Menu items={OperationMenu}>
          <IconButton type="plain" data-testid="page-list-operation-button">
            <MoreVerticalIcon />
          </IconButton>
        </Menu>
      </FlexWrapper>
      <MoveToTrash.ConfirmModal
        open={open}
        title={title}
        onConfirm={() => {
          onRemoveToTrash();
          setOpen(false);
        }}
        onClose={() => {
          setOpen(false);
        }}
        onCancel={() => {
          setOpen(false);
        }}
      />
      <DisablePublicSharing.DisablePublicSharingModal
        onConfirmDisable={onDisablePublicSharing}
        open={openDisableShared}
        onClose={() => {
          setOpenDisableShared(false);
        }}
      />
    </>
  );
};

export interface TrashOperationCellProps {
  onPermanentlyDeletePage: () => void;
  onRestorePage: () => void;
  onOpenPage: () => void;
}

export const TrashOperationCell = ({
  onPermanentlyDeletePage,
  onRestorePage,
}: TrashOperationCellProps) => {
  const t = useAFFiNEI18N();
  const [open, setOpen] = useState(false);
  return (
    <FlexWrapper>
      <Tooltip content={t['com.affine.trashOperation.restoreIt']()} side="top">
        <IconButton
          style={{ marginRight: '12px' }}
          onClick={() => {
            onRestorePage();
          }}
        >
          <ResetIcon />
        </IconButton>
      </Tooltip>
      <Tooltip
        content={t['com.affine.trashOperation.deletePermanently']()}
        side="top"
        align="end"
      >
        <IconButton
          onClick={() => {
            setOpen(true);
          }}
        >
          <DeletePermanentlyIcon />
        </IconButton>
      </Tooltip>
      <Confirm
        title={`${t['com.affine.trashOperation.deletePermanently']()}?`}
        content={t['com.affine.trashOperation.deleteDescription']()}
        confirmText={t['com.affine.trashOperation.delete']()}
        confirmType="error"
        open={open}
        onConfirm={() => {
          onPermanentlyDeletePage();
          setOpen(false);
        }}
        onClose={() => {
          setOpen(false);
        }}
        onCancel={() => {
          setOpen(false);
        }}
      />
    </FlexWrapper>
  );
};
