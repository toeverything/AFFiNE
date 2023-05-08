import {
  Confirm,
  FlexWrapper,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
} from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  DeletePermanentlyIcon,
  FavoritedIcon,
  FavoriteIcon,
  MoreVerticalIcon,
  OpenInNewIcon,
  ResetIcon,
} from '@blocksuite/icons';
import type React from 'react';
import { useState } from 'react';

import { DisablePublicSharing, MoveToTrash } from './operation-menu-items';

export type OperationCellProps = {
  title: string;
  favorite: boolean;
  isPublic: boolean;
  onOpenPageInNewTab: () => void;
  onToggleFavoritePage: () => void;
  onRemoveToTrash: () => void;
  onDisablePublicSharing: () => void;
};

export const OperationCell: React.FC<OperationCellProps> = ({
  title,
  favorite,
  isPublic,
  onOpenPageInNewTab,
  onToggleFavoritePage,
  onRemoveToTrash,
  onDisablePublicSharing,
}) => {
  const t = useAFFiNEI18N();
  const [open, setOpen] = useState(false);
  const [openDisableShared, setOpenDisableShared] = useState(false);

  const OperationMenu = (
    <>
      {isPublic && (
        <DisablePublicSharing
          testId="disable-public-sharing"
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
      {!environment.isDesktop && (
        <MenuItem onClick={onOpenPageInNewTab} icon={<OpenInNewIcon />}>
          {t['Open in new tab']()}
        </MenuItem>
      )}
      <MoveToTrash
        testId="move-to-trash"
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

export type TrashOperationCellProps = {
  onPermanentlyDeletePage: () => void;
  onRestorePage: () => void;
  onOpenPage: () => void;
};

export const TrashOperationCell: React.FC<TrashOperationCellProps> = ({
  onPermanentlyDeletePage,
  onRestorePage,
}) => {
  const t = useAFFiNEI18N();
  const [open, setOpen] = useState(false);
  return (
    <FlexWrapper>
      <Tooltip content={t['Restore it']()} placement="top-start">
        <IconButton
          style={{ marginRight: '12px' }}
          onClick={() => {
            onRestorePage();
          }}
        >
          <ResetIcon />
        </IconButton>
      </Tooltip>
      <Tooltip content={t['Delete permanently']()} placement="top-start">
        <IconButton
          onClick={() => {
            setOpen(true);
          }}
        >
          <DeletePermanentlyIcon />
        </IconButton>
      </Tooltip>
      <Confirm
        title={t['Delete permanently?']()}
        content={t['TrashButtonGroupDescription']()}
        confirmText={t['Delete']()}
        confirmType="danger"
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
