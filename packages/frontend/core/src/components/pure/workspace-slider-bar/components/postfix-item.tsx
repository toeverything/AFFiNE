import { toast } from '@affine/component';
import { RenameModal } from '@affine/component/rename-modal';
import { useDocMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { DocCollection } from '@blocksuite/store';
import { useCallback, useState } from 'react';

import { AddFavouriteButton } from '../favorite/add-favourite-button';
import * as styles from '../favorite/styles.css';
import { OperationMenuButton } from './operation-menu-button';

type PostfixItemProps = {
  docCollection: DocCollection;
  pageId: string;
  pageTitle: string;
  inFavorites?: boolean;
  isReferencePage?: boolean;
  inAllowList?: boolean;
  removeFromAllowList?: (id: string) => void;
};

export const PostfixItem = ({ ...props }: PostfixItemProps) => {
  const { docCollection, pageId, pageTitle } = props;
  const t = useAFFiNEI18N();
  const [open, setOpen] = useState(false);
  const { setDocTitle } = useDocMetaHelper(docCollection);

  const handleRename = useCallback(
    (newName: string) => {
      setDocTitle(pageId, newName);
      setOpen(false);
      toast(t['com.affine.toastMessage.rename']());
    },
    [pageId, setDocTitle, t]
  );

  return (
    <div
      className={styles.favoritePostfixItem}
      onMouseDown={e => {
        // prevent drag
        e.stopPropagation();
      }}
      onClick={e => {
        // prevent jump to page
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <AddFavouriteButton {...props} />
      <OperationMenuButton
        setRenameModalOpen={() => {
          setOpen(true);
        }}
        {...props}
      />
      <RenameModal
        open={open}
        onOpenChange={setOpen}
        onRename={handleRename}
        currentName={pageTitle}
      />
    </div>
  );
};
