import { useI18n } from '@affine/i18n';

import {
  RenameDialog,
  type RenameDialogProps,
  RenameSubMenu,
  type RenameSubMenuProps,
} from '../../../rename';

export const CollectionRenameSubMenu = ({
  title,
  text,
  ...props
}: RenameSubMenuProps) => {
  const t = useI18n();
  return (
    <RenameSubMenu
      title={title || t['com.affine.m.explorer.collection.rename-menu-title']()}
      text={text || t['com.affine.m.explorer.collection.rename']()}
      {...props}
    />
  );
};

const CollectionDesc = () => {
  const t = useI18n();
  return t['com.affine.collection.emptyCollectionDescription']();
};

export const CollectionRenameDialog = ({
  title,
  confirmText,
  ...props
}: RenameDialogProps) => {
  return (
    <RenameDialog
      title={title}
      confirmText={confirmText}
      {...props}
      descRenderer={CollectionDesc}
    />
  );
};
