import { Header } from '@affine/core/components/pure/header';
import { WindowsAppControls } from '@affine/core/components/pure/header/windows-app-controls';
import { WorkspaceModeFilterTab } from '@affine/core/components/pure/workspace-mode-filter-tab';

import * as styles from '../all-page/all-page.css';

export const AllTagHeader = () => {
  const isWindowsDesktop = environment.isDesktop && environment.isWindows;

  return (
    <Header
      right={
        <div
          className={styles.headerRightWindows}
          data-is-windows-desktop={isWindowsDesktop}
        >
          {isWindowsDesktop ? <WindowsAppControls /> : null}
        </div>
      }
      center={<WorkspaceModeFilterTab activeFilter={'tags'} />}
    />
  );
};
