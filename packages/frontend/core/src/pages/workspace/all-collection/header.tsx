import { IconButton } from '@affine/component';
import { Header } from '@affine/core/components/pure/header';
import { WorkspaceModeFilterTab } from '@affine/core/components/pure/workspace-mode-filter-tab';
import { PlusIcon } from '@blocksuite/icons';
import clsx from 'clsx';

import * as styles from './header.css';

export const AllCollectionHeader = ({
  showCreateNew,
  onCreateCollection,
}: {
  showCreateNew: boolean;
  onCreateCollection?: () => void;
}) => {
  return (
    <Header
      right={
        <IconButton
          type="default"
          icon={<PlusIcon fontSize={16} />}
          onClick={onCreateCollection}
          className={clsx(
            styles.headerCreateNewCollectionIconButton,
            !showCreateNew && styles.headerCreateNewButtonHidden
          )}
        />
      }
      center={<WorkspaceModeFilterTab activeFilter={'collections'} />}
    />
  );
};
