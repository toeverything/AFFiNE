import { IconButton } from '@affine/component';
import { Header } from '@affine/core/components/pure/header';
import { WorkspaceModeFilterTab } from '@affine/core/components/pure/workspace-mode-filter-tab';
import { PlusIcon } from '@blocksuite/icons';
import clsx from 'clsx';

import * as styles from './collection.css';

export const CollectionDetailHeader = ({
  showCreateNew,
  onCreate,
}: {
  showCreateNew: boolean;
  onCreate: () => void;
}) => {
  return (
    <Header
      right={
        <IconButton
          type="default"
          icon={<PlusIcon fontSize={16} />}
          onClick={onCreate}
          className={clsx(
            styles.headerCreateNewButton,
            styles.headerCreateNewCollectionIconButton,
            !showCreateNew && styles.headerCreateNewButtonHidden
          )}
        />
      }
      center={<WorkspaceModeFilterTab activeFilter={'collections'} />}
    />
  );
};
