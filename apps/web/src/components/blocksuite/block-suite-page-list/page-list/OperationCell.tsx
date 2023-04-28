import {
  Confirm,
  FlexWrapper,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
} from '@affine/component';
import { useTranslation } from '@affine/i18n';
import {
  DeletePermanentlyIcon,
  FavoritedIcon,
  FavoriteIcon,
  MoreVerticalIcon,
  OpenInNewIcon,
  ResetIcon,
} from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import type React from 'react';
import { useState } from 'react';

import type { BlockSuiteWorkspace } from '../../../../shared';
import { toast } from '../../../../utils';
import {
  DisablePublicSharing,
  MoveToTrash,
} from '../../../affine/operation-menu-items';

export type OperationCellProps = {
  pageMeta: PageMeta;
  metas: PageMeta[];
  blockSuiteWorkspace: BlockSuiteWorkspace;
  onOpenPageInNewTab: (pageId: string) => void;
  onToggleFavoritePage: (pageId: string) => void;
  onToggleTrashPage: (pageId: string, isTrash: boolean) => void;
};

export const OperationCell: React.FC<OperationCellProps> = ({
  pageMeta,
  blockSuiteWorkspace,
  onOpenPageInNewTab,
  onToggleFavoritePage,
  onToggleTrashPage,
}) => {
  const { id, favorite, isPublic } = pageMeta;
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [openDisableShared, setOpenDisableShared] = useState(false);

  const page = blockSuiteWorkspace.getPage(id);
  assertExists(page);

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
        onClick={() => {
          onToggleFavoritePage(id);
          toast(
            favorite ? t('Removed from Favorites') : t('Added to Favorites')
          );
        }}
        icon={
          favorite ? (
            <FavoritedIcon style={{ color: 'var(--affine-primary-color)' }} />
          ) : (
            <FavoriteIcon />
          )
        }
      >
        {favorite ? t('Remove from favorites') : t('Add to Favorites')}
      </MenuItem>
      {!environment.isDesktop && (
        <MenuItem
          onClick={() => {
            onOpenPageInNewTab(id);
          }}
          icon={<OpenInNewIcon />}
        >
          {t('Open in new tab')}
        </MenuItem>
      )}
      {!pageMeta.isRootPinboard && (
        <MoveToTrash
          testId="move-to-trash"
          onItemClick={() => {
            setOpen(true);
          }}
        />
      )}
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
        meta={pageMeta}
        onConfirm={() => {
          onToggleTrashPage(id, true);
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
      <DisablePublicSharing.DisablePublicSharingModal
        page={page}
        open={openDisableShared}
        onClose={() => {
          setOpenDisableShared(false);
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
}) => {
  const { id, title } = pageMeta;
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <FlexWrapper>
      <Tooltip content={t('Restore it')} placement="top-start">
        <IconButton
          style={{ marginRight: '12px' }}
          onClick={() => {
            onRestorePage(id);
            toast(t('restored', { title: title || 'Untitled' }));
          }}
        >
          <ResetIcon />
        </IconButton>
      </Tooltip>
      <Tooltip content={t('Delete permanently')} placement="top-start">
        <IconButton
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
