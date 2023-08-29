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
import { Tooltip } from '@toeverything/components/tooltip';
import { useState } from 'react';

import { Confirm, FlexWrapper, Menu, MenuItem } from '../../..';
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
          onItemClick={() => {
            setOpenDisableShared(true);
          }}
        />
      )}
      <MenuItem
        onClick={onToggleFavoritePage}
        icon={
          favorite ? (
            <FavoritedIcon style={{ color: 'var(--affine-primary-color)' }} />
          ) : (
            <FavoriteIcon />
          )
        }
      >
        {favorite ? t['Remove from favorites']() : t['Add to Favorites']()}
      </MenuItem>
      {!isDesktop && (
        <MenuItem onClick={onOpenPageInNewTab} icon={<OpenInNewIcon />}>
          {t['Open in new tab']()}
        </MenuItem>
      )}
      <MoveToTrash
        data-testid="move-to-trash"
        onItemClick={() => {
          setOpen(true);
        }}
      />
    </>
  );
  return (
    <>
      <FlexWrapper alignItems="center" justifyContent="center">
        <Menu
          content={OperationMenu}
          placement="bottom"
          disablePortal={true}
          trigger="click"
        >
          <IconButton data-testid="page-list-operation-button">
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
      <Tooltip content={t['Restore it']()} side="top">
        <IconButton
          style={{ marginRight: '12px' }}
          onClick={() => {
            onRestorePage();
          }}
        >
          <ResetIcon />
        </IconButton>
      </Tooltip>
      <Tooltip content={t['Delete permanently']()} side="top" align="end">
        <IconButton
          onClick={() => {
            setOpen(true);
          }}
        >
          <DeletePermanentlyIcon />
        </IconButton>
      </Tooltip>
      <Confirm
        title={`${t['Delete permanently']()}?`}
        content={t['TrashButtonGroupDescription']()}
        confirmText={t['Delete']()}
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
