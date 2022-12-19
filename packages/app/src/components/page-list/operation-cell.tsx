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
import { toast } from '@/components/toast';

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
            content: `${pageMeta.title || 'Untitled'} will be moved to Trash`,
            confirmText: 'Delete',
            confirmType: 'danger',
          }).then(confirm => {
            confirm && toggleDeletePage(id);
            toast('Moved to Trash');
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
        <IconButton darker={true}>
          <MoreVerticalIcon />
        </IconButton>
      </Menu>
    </Wrapper>
  );
};

export const TrashOperationCell = ({ pageMeta }: { pageMeta: PageMeta }) => {
  const { id } = pageMeta;
  const { permanentlyDeletePage, toggleDeletePage, openPage, getPageMeta } =
    useEditor();
  const { confirm } = useConfirm();

  return (
    <Wrapper>
      <IconButton
        darker={true}
        style={{ marginRight: '12px' }}
        onClick={() => {
          toggleDeletePage(id);
          toast(`${getPageMeta(id)?.title || 'Untitled'} restored`);
          openPage(id);
        }}
      >
        <RestoreIcon />
      </IconButton>
      <IconButton
        darker={true}
        onClick={() => {
          confirm({
            title: 'Delete permanently?',
            content: "Once deleted, you can't undo this action.",
            confirmText: 'Delete',
            confirmType: 'danger',
          }).then(confirm => {
            confirm && permanentlyDeletePage(id);
            toast('Permanently deleted');
          });
        }}
      >
        <DeleteIcon />
      </IconButton>
    </Wrapper>
  );
};
