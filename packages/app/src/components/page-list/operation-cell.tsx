import { useRouter } from 'next/router';
import { PageMeta, useEditor } from '@/providers/editor-provider';
import { useConfirm } from '@/providers/confirm-provider';
import { useAppState } from '@/providers/app-state-provider/context';
import { useGoToPage } from '@/providers/app-state-provider/hooks';
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
  const goToPage = useGoToPage();
  const { toggleFavoritePage, toggleDeletePage } = useAppState();
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
          goToPage(id);
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
  const goToPage = useGoToPage();
  const { getPageMeta, toggleDeletePage } = useAppState();
  const { permanentlyDeletePage } = useEditor();
  const { confirm } = useConfirm();

  return (
    <Wrapper>
      <IconButton
        darker={true}
        style={{ marginRight: '12px' }}
        onClick={() => {
          toggleDeletePage(id);
          toast(`${getPageMeta(id)?.title || 'Untitled'} restored`);
          goToPage(id);
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
