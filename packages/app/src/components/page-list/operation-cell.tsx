import { useConfirm } from '@/providers/confirm-provider';
import { PageMeta } from '@/providers/app-state-provider';
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
import { toast } from '@/ui/toast';
import { usePageHelper } from '@/hooks/use-page-helper';

export const OperationCell = ({ pageMeta }: { pageMeta: PageMeta }) => {
  const { id, favorite } = pageMeta;
  const { openPage } = usePageHelper();
  const { toggleFavoritePage, toggleDeletePage } = usePageHelper();
  const { confirm } = useConfirm();

  const OperationMenu = (
    <>
      <MenuItem
        onClick={() => {
          toggleFavoritePage(id);
          toast(!favorite ? 'Removed to Favourites' : 'Added to Favourites');
        }}
        icon={favorite ? <FavouritedIcon /> : <FavouritesIcon />}
      >
        {favorite ? 'Remove' : 'Add'} to favourites
      </MenuItem>
      <MenuItem
        onClick={() => {
          openPage(id, {}, true);
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
  const { openPage, getPageMeta } = usePageHelper();
  const { toggleDeletePage, permanentlyDeletePage } = usePageHelper();
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
