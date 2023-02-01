import { useConfirm } from '@/providers/ConfirmProvider';
import { PageMeta } from '@/providers/app-state-provider';
import { Menu, MenuItem } from '@/ui/menu';
import { FlexWrapper } from '@/ui/layout';
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
import { useTranslation } from '@affine/i18n';
export const OperationCell = ({ pageMeta }: { pageMeta: PageMeta }) => {
  const { id, favorite } = pageMeta;
  const { openPage } = usePageHelper();
  const { toggleFavoritePage, toggleDeletePage } = usePageHelper();
  const { confirm } = useConfirm();
  const { t } = useTranslation();
  const OperationMenu = (
    <>
      <MenuItem
        onClick={() => {
          toggleFavoritePage(id);
          toast(
            favorite ? t('Removed from Favourites') : t('Added to Favourites')
          );
        }}
        icon={favorite ? <FavouritedIcon /> : <FavouritesIcon />}
      >
        {favorite ? t('Remove from favourites') : t('Add to favourites')}
      </MenuItem>
      <MenuItem
        onClick={() => {
          openPage(id, {}, true);
        }}
        icon={<OpenInNewIcon />}
      >
        {t('Open in new tab')}
      </MenuItem>
      <MenuItem
        onClick={() => {
          confirm({
            title: t('Delete page?'),
            content: t('will be moved to Trash', {
              title: pageMeta.title || 'Untitled',
            }),
            confirmText: t('Delete'),
            confirmType: 'danger',
          }).then(confirm => {
            confirm && toggleDeletePage(id);
            toast(t('Moved to Trash'));
          });
        }}
        icon={<TrashIcon />}
      >
        {t('Delete')}
      </MenuItem>
    </>
  );
  return (
    <FlexWrapper alignItems="center" justifyContent="center">
      <Menu content={OperationMenu} placement="bottom-end" disablePortal={true}>
        <IconButton darker={true}>
          <MoreVerticalIcon />
        </IconButton>
      </Menu>
    </FlexWrapper>
  );
};

export const TrashOperationCell = ({ pageMeta }: { pageMeta: PageMeta }) => {
  const { id } = pageMeta;
  const { openPage, getPageMeta } = usePageHelper();
  const { toggleDeletePage, permanentlyDeletePage } = usePageHelper();
  const { confirm } = useConfirm();
  const { t } = useTranslation();
  return (
    <FlexWrapper>
      <IconButton
        darker={true}
        style={{ marginRight: '12px' }}
        onClick={() => {
          toggleDeletePage(id);
          toast(t('restored', { title: getPageMeta(id)?.title || 'Untitled' }));
          openPage(id);
        }}
      >
        <RestoreIcon />
      </IconButton>
      <IconButton
        darker={true}
        onClick={() => {
          confirm({
            title: t('Delete permanently?'),
            content: t("Once deleted, you can't undo this action."),
            confirmText: t('Delete'),
            confirmType: 'danger',
          }).then(confirm => {
            confirm && permanentlyDeletePage(id);
            toast(t('Permanently deleted'));
          });
        }}
      >
        <DeleteIcon />
      </IconButton>
    </FlexWrapper>
  );
};
