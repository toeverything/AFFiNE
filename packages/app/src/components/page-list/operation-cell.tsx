import { PageMeta, useEditor } from '@/providers/editor-provider';
import { useConfirm } from '@/providers/confirm-provider';
import { Menu, MenuItem } from '@/ui/menu';
import { Wrapper } from '@/ui/layout';
import { IconButton } from '@/ui/button';
import { MoreVerticalIcon, RestoreIcon, DeleteIcon } from '@blocksuite/icons';
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
      >
        {favorite ? 'Remove' : 'Add'} to favourites
      </MenuItem>
      <MenuItem
        onClick={() => {
          openPage(id);
        }}
      >
        Open in new tab
      </MenuItem>
      <MenuItem
        onClick={() => {
          confirm({
            title: 'Delete',
            content:
              'Deleted items will be moved to Trash Bin. Do you confirm?',
            confirmText: 'Delete',
            confirmType: 'danger',
          }).then(confirm => {
            confirm && toggleDeletePage(id);
          });
        }}
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
