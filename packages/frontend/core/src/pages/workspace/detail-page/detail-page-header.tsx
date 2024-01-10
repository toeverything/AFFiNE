import type { InlineEditHandle } from '@affine/component';
import { IconButton } from '@affine/component';
import {
  appSidebarFloatingAtom,
  appSidebarOpenAtom,
  SidebarSwitch,
} from '@affine/component/app-sidebar';
import { FavoriteButton } from '@affine/core/components/blocksuite/block-suite-header/favorite';
import { JournalWeekDatePicker } from '@affine/core/components/blocksuite/block-suite-header/journal/date-picker';
import { JournalTodayButton } from '@affine/core/components/blocksuite/block-suite-header/journal/today-button';
import { PageHeaderMenuButton } from '@affine/core/components/blocksuite/block-suite-header/menu';
import { EditorModeSwitch } from '@affine/core/components/blocksuite/block-suite-mode-switch';
import { useJournalInfoHelper } from '@affine/core/hooks/use-journal';
import type { BlockSuiteWorkspace } from '@affine/core/shared';
import type { Workspace } from '@affine/workspace';
import { RightSidebarIcon } from '@blocksuite/icons';
import type { Page } from '@blocksuite/store';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useRef } from 'react';

import { SharePageButton } from '../../../components/affine/share-page-modal';
import { BlocksuiteHeaderTitle } from '../../../components/blocksuite/block-suite-header/title/index';
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
      <div className={styles.mainHeaderRight} style={{ marginRight: -16 }}>
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

interface PageHeaderProps {
  page: Page;
  workspace: Workspace;
  showSidebarSwitch?: boolean;
}
const RightHeader = isWindowsDesktop
  ? WindowsMainPageHeaderRight
  : NonWindowsMainPageHeaderRight;
export function JournalPageHeader({
  page,
  workspace,
  showSidebarSwitch = true,
}: PageHeaderProps) {
  const leftSidebarOpen = useAtomValue(appSidebarOpenAtom);
  return (
    <Header className={styles.mainHeader}>
      <SidebarSwitch show={!leftSidebarOpen} />
      {!leftSidebarOpen ? <HeaderDivider /> : null}
      <EditorModeSwitch
        blockSuiteWorkspace={workspace.blockSuiteWorkspace}
        pageId={page?.id}
      />
      <div className={styles.journalWeekPicker}>
        <JournalWeekDatePicker
          workspace={workspace.blockSuiteWorkspace}
          page={page}
        />
      </div>
      <JournalTodayButton workspace={workspace.blockSuiteWorkspace} />
      <HeaderDivider />
      <PageHeaderMenuButton isJournal pageId={page?.id} />
      {page ? (
        <SharePageButton isJournal workspace={workspace} page={page} />
      ) : null}
      <RightHeader showSidebarSwitch={showSidebarSwitch} />
    </Header>
  );
}

export function NormalPageHeader({
  page,
  workspace,
  showSidebarSwitch = true,
}: PageHeaderProps) {
  const titleInputHandleRef = useRef<InlineEditHandle>(null);
  const leftSidebarOpen = useAtomValue(appSidebarOpenAtom);

  const onRename = useCallback(() => {
    setTimeout(() => titleInputHandleRef.current?.triggerEdit());
  }, []);
  return (
    <Header className={styles.mainHeader}>
      <SidebarSwitch show={!leftSidebarOpen} />
      {!leftSidebarOpen ? <HeaderDivider /> : null}
      <EditorModeSwitch
        blockSuiteWorkspace={workspace.blockSuiteWorkspace}
        pageId={page?.id}
      />
      <BlocksuiteHeaderTitle
        inputHandleRef={titleInputHandleRef}
        pageId={page?.id}
        blockSuiteWorkspace={workspace.blockSuiteWorkspace}
      />
      <PageHeaderMenuButton rename={onRename} pageId={page?.id} />
      <FavoriteButton pageId={page?.id} />
      <div className={styles.spacer} />
      {page ? <SharePageButton workspace={workspace} page={page} /> : null}
      <RightHeader showSidebarSwitch={showSidebarSwitch} />
    </Header>
  );
}

export function DetailPageHeader(props: PageHeaderProps) {
  const { page } = props;
  const { isJournal } = useJournalInfoHelper(page.workspace, page.id);
  const isInTrash = page.meta.trash;

  return isJournal && !isInTrash ? (
    <JournalPageHeader {...props} />
  ) : (
    <NormalPageHeader {...props} />
  );
}

interface SidebarHeaderProps {
  workspace: BlockSuiteWorkspace;
  page: Page;
}
function WindowsSidebarHeader(props: SidebarHeaderProps) {
  return (
    <>
      <Header className={styles.sidebarHeader} style={{ paddingRight: 0 }}>
        <div className={styles.spacer} />
        <ToggleSidebarButton />
        <WindowsAppControls />
      </Header>
      <div className={styles.standaloneExtensionSwitcherWrapper}>
        <ExtensionTabs {...props} />
      </div>
    </>
  );
}

function NonWindowsSidebarHeader(props: SidebarHeaderProps) {
  return (
    <Header className={styles.sidebarHeader}>
      <ExtensionTabs {...props} />
      <div className={styles.spacer} />
      <ToggleSidebarButton />
    </Header>
  );
}

export const RightSidebarHeader = isWindowsDesktop
  ? WindowsSidebarHeader
  : NonWindowsSidebarHeader;
