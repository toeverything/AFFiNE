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
import { ConfirmModal } from '@toeverything/components/modal';
import { Tooltip } from '@toeverything/components/tooltip';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { FavoriteTag } from './components/favorite-tag';
import { DisablePublicSharing, MoveToTrash } from './operation-menu-items';
import * as styles from './page-list.css';
import { ColWrapper, stopPropagationWithoutPrevent } from './utils';

export interface OperationCellProps {
  favorite: boolean;
  isPublic: boolean;
  link: string;
  onToggleFavoritePage: () => void;
  onRemoveToTrash: () => void;
  onDisablePublicSharing: () => void;
}

export const OperationCell = ({
  favorite,
  isPublic,
  link,
  onToggleFavoritePage,
  onRemoveToTrash,
  onDisablePublicSharing,
}: OperationCellProps) => {
  const t = useAFFiNEI18N();
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
      {!environment.isDesktop && (
        <Link
          onClick={stopPropagationWithoutPrevent}
          to={link}
          target={'_blank'}
          rel="noopener noreferrer"
        >
          <MenuItem
            style={{ marginBottom: 4 }}
            preFix={
              <MenuIcon>
                <OpenInNewIcon />
              </MenuIcon>
            }
          >
            {t['com.affine.openPageOperation.newTab']()}
          </MenuItem>
        </Link>
      )}
      <MoveToTrash data-testid="move-to-trash" onSelect={onRemoveToTrash} />
    </>
  );
  return (
    <>
      <ColWrapper
        hideInSmallContainer
        data-testid="page-list-item-favorite"
        data-favorite={favorite ? true : undefined}
        className={styles.favoriteCell}
      >
        <FavoriteTag onClick={onToggleFavoritePage} active={favorite} />
      </ColWrapper>
      <ColWrapper alignment="start">
        <Menu
          items={OperationMenu}
          contentOptions={{
            align: 'end',
          }}
        >
          <IconButton type="plain" data-testid="page-list-operation-button">
            <MoreVerticalIcon />
          </IconButton>
        </Menu>
      </ColWrapper>
      <DisablePublicSharing.DisablePublicSharingModal
        onConfirm={onDisablePublicSharing}
        open={openDisableShared}
        onOpenChange={setOpenDisableShared}
      />
    </>
  );
};

export interface TrashOperationCellProps {
  onPermanentlyDeletePage: () => void;
  onRestorePage: () => void;
}

export const TrashOperationCell = ({
  onPermanentlyDeletePage,
  onRestorePage,
}: TrashOperationCellProps) => {
  const t = useAFFiNEI18N();
  const [open, setOpen] = useState(false);
  return (
    <ColWrapper flex={1}>
      <Tooltip content={t['com.affine.trashOperation.restoreIt']()} side="top">
        <IconButton
          data-testid="restore-page-button"
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
          data-testid="delete-page-button"
          onClick={() => {
            setOpen(true);
          }}
        >
          <DeletePermanentlyIcon />
        </IconButton>
      </Tooltip>
      <ConfirmModal
        title={`${t['com.affine.trashOperation.deletePermanently']()}?`}
        description={t['com.affine.trashOperation.deleteDescription']()}
        cancelText={t['com.affine.confirmModal.button.cancel']()}
        confirmButtonOptions={{
          type: 'error',
          children: t['com.affine.trashOperation.delete'](),
        }}
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => {
          onPermanentlyDeletePage();
          setOpen(false);
        }}
      />
    </ColWrapper>
  );
};
