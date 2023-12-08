import { IconButton } from '@affine/component';
import {
  appSidebarFloatingAtom,
  appSidebarOpenAtom,
  SidebarSwitch,
} from '@affine/component/app-sidebar';
import type { AllWorkspace } from '@affine/core/shared';
import { RightSidebarIcon } from '@blocksuite/icons';
import type { Page } from '@blocksuite/store';
import { useAtomValue, useSetAtom } from 'jotai';

import { SharePageButton } from '../../../components/affine/share-page-modal';
import { BlockSuiteHeaderTitle } from '../../../components/blocksuite/block-suite-header-title';
import { HeaderDivider } from '../../../components/pure/header';
import { WindowsAppControls } from '../../../components/pure/header/windows-app-controls';
import * as styles from './detail-page-header.css';
import { ExtensionTabs } from './editor-sidebar';
import {
  editorSidebarOpenAtom,
  editorSidebarToggleAtom,
} from './editor-sidebar/atoms';

interface PageHeaderRightProps {
  showSidebarSwitch?: boolean;
}

const ToggleSidebarButton = () => {
  const toggle = useSetAtom(editorSidebarToggleAtom);
  return (
    <IconButton size="large" onClick={toggle}>
      <RightSidebarIcon />
    </IconButton>
  );
};
const isWindowsDesktop = environment.isDesktop && environment.isWindows;

const WindowsMainPageHeaderRight = ({
  showSidebarSwitch,
}: PageHeaderRightProps) => {
  const editorSidebarOpen = useAtomValue(editorSidebarOpenAtom);

  if (editorSidebarOpen) {
    return null;
  }

  return (
    <>
      <HeaderDivider />
      <div
        className={styles.mainHeaderRight}
        style={{
          marginRight: editorSidebarOpen ? 0 : -16,
        }}
      >
        {showSidebarSwitch ? <ToggleSidebarButton /> : null}
        <WindowsAppControls />
      </div>
    </>
  );
};

const NonWindowsMainPageHeaderRight = ({
  showSidebarSwitch,
}: PageHeaderRightProps) => {
  const editorSidebarOpen = useAtomValue(editorSidebarOpenAtom);

  if (editorSidebarOpen || !showSidebarSwitch) {
    return null;
  }

  return (
    <>
      <HeaderDivider />
      <div className={styles.mainHeaderRight}>
        <ToggleSidebarButton />
      </div>
    </>
  );
};

function Header({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const appSidebarFloating = useAtomValue(appSidebarFloatingAtom);
  return (
    <div
      data-testid="header"
      style={style}
      className={className}
      data-sidebar-floating={appSidebarFloating}
    >
      {children}
    </div>
  );
}

export function DetailPageHeader({
  page,
  workspace,
  showSidebarSwitch = true,
}: {
  page: Page;
  workspace: AllWorkspace;
  showSidebarSwitch?: boolean;
}) {
  const leftSidebarOpen = useAtomValue(appSidebarOpenAtom);
  const RightHeader = isWindowsDesktop
    ? WindowsMainPageHeaderRight
    : NonWindowsMainPageHeaderRight;
  return (
    <Header className={styles.mainHeader}>
      <SidebarSwitch show={!leftSidebarOpen} />
      {!leftSidebarOpen ? <HeaderDivider /> : null}
      <BlockSuiteHeaderTitle pageId={page.id} workspace={workspace} />
      <div className={styles.spacer} />
      {page ? <SharePageButton workspace={workspace} page={page} /> : null}
      <RightHeader showSidebarSwitch={showSidebarSwitch} />
    </Header>
  );
}

function WindowsSidebarHeader() {
  return (
    <>
      <Header className={styles.sidebarHeader} style={{ paddingRight: 0 }}>
        <div className={styles.spacer} />
        <ToggleSidebarButton />
        <WindowsAppControls />
      </Header>
      <div className={styles.standaloneExtensionSwitcherWrapper}>
        <ExtensionTabs />
      </div>
    </>
  );
}

function NonWindowsSidebarHeader() {
  return (
    <Header className={styles.sidebarHeader}>
      <ExtensionTabs />
      <div className={styles.spacer} />
      <ToggleSidebarButton />
    </Header>
  );
}

export function RightSidebarHeader() {
  return isWindowsDesktop ? (
    <WindowsSidebarHeader />
  ) : (
    <NonWindowsSidebarHeader />
  );
}
