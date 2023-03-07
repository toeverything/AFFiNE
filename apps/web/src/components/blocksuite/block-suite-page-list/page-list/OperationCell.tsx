import {
  Confirm,
  FlexWrapper,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
} from '@affine/component';
import { toast } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import {
  DeletePermanentlyIcon,
  DeleteTemporarilyIcon,
  FavoritedIcon,
  FavoriteIcon,
  MoreVerticalIcon,
  OpenInNewIcon,
  ResetIcon,
} from '@blocksuite/icons';
import { PageMeta } from '@blocksuite/store';
import React, { useState } from 'react';

export type OperationCellProps = {
  pageMeta: PageMeta;
  onOpenPageInNewTab: (pageId: string) => void;
  onToggleFavoritePage: (pageId: string) => void;
  onToggleTrashPage: (pageId: string) => void;
};
export const OperationCell: React.FC<OperationCellProps> = ({
  pageMeta,
  onOpenPageInNewTab,
  onToggleFavoritePage,
  onToggleTrashPage,
}) => {
  const { id, favorite } = pageMeta;
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const OperationMenu = (
    <>
      <MenuItem
        onClick={() => {
          onToggleFavoritePage(id);
          toast(
            favorite ? t('Removed from Favorites') : t('Added to Favorites')
          );
        }}
        icon={favorite ? <FavoritedIcon /> : <FavoriteIcon />}
      >
        {favorite ? t('Remove from favorites') : t('Add to Favorites')}
      </MenuItem>
      <MenuItem
        onClick={() => {
          onOpenPageInNewTab(id);
        }}
        icon={<OpenInNewIcon />}
      >
        {t('Open in new tab')}
      </MenuItem>
      <MenuItem
        onClick={() => {
          setOpen(true);
        }}
        icon={<DeleteTemporarilyIcon />}
      >
        {t('Delete')}
      </MenuItem>
    </>
  );
  return (
    <>
      <FlexWrapper alignItems="center" justifyContent="center">
        <Menu
          content={OperationMenu}
          placement="bottom-end"
          disablePortal={true}
          trigger="click"
        >
          <IconButton darker={true}>
            <MoreVerticalIcon />
          </IconButton>
        </Menu>
      </FlexWrapper>
      <Confirm
        open={open}
        title={t('Delete page?')}
        content={t('will be moved to Trash', {
          title: pageMeta.title || 'Untitled',
        })}
        confirmText={t('Delete')}
        confirmType="danger"
        onConfirm={() => {
          onToggleTrashPage(id);
          toast(t('Deleted'));
          setOpen(false);
        }}
        onClose={() => {
          setOpen(false);
        }}
        onCancel={() => {
          setOpen(false);
        }}
      />
    </>
  );
};

export type TrashOperationCellProps = {
  pageMeta: PageMeta;
  onPermanentlyDeletePage: (pageId: string) => void;
  onRestorePage: (pageId: string) => void;
  onOpenPage: (pageId: string) => void;
};

export const TrashOperationCell: React.FC<TrashOperationCellProps> = ({
  pageMeta,
  onPermanentlyDeletePage,
  onRestorePage,
  onOpenPage,
}) => {
  const { id, title } = pageMeta;
  // const { openPage, getPageMeta } = usePageHelper();
  // const { toggleDeletePage, permanentlyDeletePage } = usePageHelper();
  // const confirm = useConfirm(store => store.confirm);
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <FlexWrapper>
      <Tooltip content={t('Restore it')} placement="top-start">
        <IconButton
          darker={true}
          style={{ marginRight: '12px' }}
          onClick={() => {
            onRestorePage(id);
            toast(t('restored', { title: title || 'Untitled' }));
            onOpenPage(id);
          }}
        >
          <ResetIcon />
        </IconButton>
      </Tooltip>
      <Tooltip content={t('Delete permanently')} placement="top-start">
        <IconButton
          darker={true}
          onClick={() => {
            setOpen(true);
          }}
        >
          <DeletePermanentlyIcon />
        </IconButton>
      </Tooltip>
      <Confirm
        title={t('Delete permanently?')}
        content={t("Once deleted, you can't undo this action.")}
        confirmText={t('Delete')}
        confirmType="danger"
        open={open}
        onConfirm={() => {
          onPermanentlyDeletePage(id);
          toast(t('Permanently deleted'));
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
