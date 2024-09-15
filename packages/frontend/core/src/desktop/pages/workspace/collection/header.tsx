import { IconButton } from '@affine/component';
import { PageDisplayMenu } from '@affine/core/components/page-list';
import { Header } from '@affine/core/components/pure/header';
import { WorkspaceModeFilterTab } from '@affine/core/components/pure/workspace-mode-filter-tab';
import { PlusIcon } from '@blocksuite/icons/rc';
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
        <>
          <IconButton
            size="16"
            icon={<PlusIcon />}
            onClick={onCreate}
            className={clsx(
              styles.headerCreateNewButton,
              styles.headerCreateNewCollectionIconButton,
              !showCreateNew && styles.headerCreateNewButtonHidden
            )}
          />
          <PageDisplayMenu />
        </>
      }
      center={<WorkspaceModeFilterTab activeFilter={'collections'} />}
    />
  );
};
