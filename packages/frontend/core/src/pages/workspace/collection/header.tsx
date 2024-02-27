import { IconButton } from '@affine/component';
import { Header } from '@affine/core/components/pure/header';
import { WindowsAppControls } from '@affine/core/components/pure/header/windows-app-controls';
import { WorkspaceModeFilterTab } from '@affine/core/components/pure/workspace-mode-filter-tab';
import { PlusIcon } from '@blocksuite/icons';
import clsx from 'clsx';
import { useMemo } from 'react';

import * as styles from '../all-page/all-page.css';

export const CollectionDetailHeader = ({
  showCreateNew,
  onCreate,
}: {
  showCreateNew: boolean;
  onCreate: () => void;
}) => {
  const isWindowsDesktop = environment.isDesktop && environment.isWindows;

  const renderRightItem = useMemo(() => {
    return (
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
    );
  }, [onCreate, showCreateNew]);

  return (
    <Header
      right={
        <div
          className={styles.headerRightWindows}
          data-is-windows-desktop={isWindowsDesktop}
        >
          {renderRightItem}
          {isWindowsDesktop ? <WindowsAppControls /> : null}
        </div>
      }
      center={<WorkspaceModeFilterTab activeFilter={'collections'} />}
    />
  );
};
