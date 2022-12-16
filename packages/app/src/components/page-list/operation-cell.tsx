import { PageMeta, useEditor } from '@/providers/editor-provider';
import { useConfirm } from '@/providers/confirm-provider';
import { Menu, MenuItem } from '@/ui/menu';
import { Wrapper } from '@/ui/layout';
import { IconButton } from '@/ui/button';
import {
  MoreVerticalIcon,
  RestoreIcon,
  DeleteIcon,
  FavouritesIcon,
  FavouritedIcon,
  OpenInNewIcon,
  TrashIcon,
} from '@blocksuite/icons';
import React from 'react';

export const OperationCell = ({ pageMeta }: { pageMeta: PageMeta }) => {
  const { id, favorite } = pageMeta;
  const { openPage, toggleFavoritePage, toggleDeletePage } = useEditor();
  const { confirm } = useConfirm();

  const OperationMenu = (
    <>
      <MenuItem
        onClick={() => {
          toggleFavoritePage(id);
        }}
        icon={favorite ? <FavouritedIcon /> : <FavouritesIcon />}
      >
        {favorite ? 'Remove' : 'Add'} to favourites
      </MenuItem>
      <MenuItem
        onClick={() => {
          openPage(id);
        }}
        icon={<OpenInNewIcon />}
      >
        Open in new tab
      </MenuItem>
      <MenuItem
        onClick={() => {
          confirm({
            title: 'Delete page?',
            content: `${pageMeta.title} will be moved to Trash`,
            confirmText: 'Delete',
            confirmType: 'danger',
          }).then(confirm => {
            confirm && toggleDeletePage(id);
          });
        }}
        icon={<TrashIcon />}
      >
        Delete
      </MenuItem>
    </>
  );
  return (
    <Wrapper alignItems="center" justifyContent="center">
      <Menu content={OperationMenu} placement="bottom-end" disablePortal={true}>
        <IconButton hoverBackground="#E0E6FF">
          <MoreVerticalIcon />
        </IconButton>
      </Menu>
    </Wrapper>
  );
};

export const TrashOperationCell = ({ pageMeta }: { pageMeta: PageMeta }) => {
  const { id } = pageMeta;
  const { permanentlyDeletePage, toggleDeletePage } = useEditor();
  const { confirm } = useConfirm();

  return (
    <Wrapper>
      <IconButton
        hoverBackground="#E0E6FF"
        style={{ marginRight: '12px' }}
        onClick={() => {
          toggleDeletePage(id);
        }}
      >
        <RestoreIcon />
      </IconButton>
      <IconButton
        hoverBackground="#E0E6FF"
        onClick={() => {
          confirm({
            title: 'Permanently delete',
            content:
              "Once deleted, you can't undo this action. Do you confirm?",
            confirmText: 'Delete',
            confirmType: 'danger',
          }).then(confirm => {
            confirm && permanentlyDeletePage(id);
          });
        }}
      >
        <DeleteIcon />
      </IconButton>
    </Wrapper>
  );
};
