import {
  Divider,
  type InlineEditHandle,
  observeResize,
} from '@affine/component';
import { InfoModal } from '@affine/core/components/affine/page-properties';
import { openInfoModalAtom } from '@affine/core/components/atoms';
import { FavoriteButton } from '@affine/core/components/blocksuite/block-suite-header/favorite';
import { InfoButton } from '@affine/core/components/blocksuite/block-suite-header/info';
import { JournalWeekDatePicker } from '@affine/core/components/blocksuite/block-suite-header/journal/date-picker';
import { JournalTodayButton } from '@affine/core/components/blocksuite/block-suite-header/journal/today-button';
import { PageHeaderMenuButton } from '@affine/core/components/blocksuite/block-suite-header/menu';
import { DetailPageHeaderPresentButton } from '@affine/core/components/blocksuite/block-suite-header/present/detail-header-present-button';
import { EditorModeSwitch } from '@affine/core/components/blocksuite/block-suite-mode-switch';
import { useRegisterCopyLinkCommands } from '@affine/core/components/hooks/affine/use-register-copy-link-commands';
import { useDocCollectionPageTitle } from '@affine/core/components/hooks/use-block-suite-workspace-page-title';
import { useJournalInfoHelper } from '@affine/core/components/hooks/use-journal';
import { EditorService } from '@affine/core/modules/editor';
import { ViewIcon, ViewTitle } from '@affine/core/modules/workbench';
import type { Doc } from '@blocksuite/store';
import { useLiveData, useService, type Workspace } from '@toeverything/infra';
import { useAtom, useAtomValue } from 'jotai';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';

import { SharePageButton } from '../../../../components/affine/share-page-modal';
import { appSidebarFloatingAtom } from '../../../../components/app-sidebar';
import { BlocksuiteHeaderTitle } from '../../../../components/blocksuite/block-suite-header/title/index';
import { HeaderDivider } from '../../../../components/pure/header';
import * as styles from './detail-page-header.css';
import { useDetailPageHeaderResponsive } from './use-header-responsive';

const Header = forwardRef<
  HTMLDivElement,
  {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
  }
>(({ children, style, className }, ref) => {
  const appSidebarFloating = useAtomValue(appSidebarFloatingAtom);
  return (
    <div
      data-testid="header"
      style={style}
      className={className}
      ref={ref}
      data-sidebar-floating={appSidebarFloating}
    >
      {children}
    </div>
  );
});

Header.displayName = 'forwardRef(Header)';

interface PageHeaderProps {
  page: Doc;
  workspace: Workspace;
}
export function JournalPageHeader({ page, workspace }: PageHeaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return observeResize(container, entry => {
      setContainerWidth(entry.contentRect.width);
    });
  }, []);

  const { hideShare, hideToday } =
    useDetailPageHeaderResponsive(containerWidth);
  const title = useDocCollectionPageTitle(workspace.docCollection, page?.id);
  return (
    <Header className={styles.header} ref={containerRef}>
      <ViewTitle title={title} />
      <ViewIcon icon="journal" />
      <EditorModeSwitch />
      <div className={styles.journalWeekPicker}>
        <JournalWeekDatePicker
          docCollection={workspace.docCollection}
          page={page}
        />
      </div>
      {hideToday ? null : (
        <JournalTodayButton docCollection={workspace.docCollection} />
      )}
      <HeaderDivider />
      <PageHeaderMenuButton
        isJournal
        page={page}
        containerWidth={containerWidth}
      />
      {page && !hideShare ? (
        <SharePageButton workspace={workspace} page={page} />
      ) : null}
    </Header>
  );
}

export function NormalPageHeader({ page, workspace }: PageHeaderProps) {
  const titleInputHandleRef = useRef<InlineEditHandle>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return observeResize(container, entry => {
      setContainerWidth(entry.contentRect.width);
    });
  }, []);

  const { hideCollect, hideShare, hidePresent, showDivider } =
    useDetailPageHeaderResponsive(containerWidth);

  const onRename = useCallback(() => {
    setTimeout(
      () => titleInputHandleRef.current?.triggerEdit(),
      500 /* wait for menu animation end */
    );
  }, []);

  const title = useDocCollectionPageTitle(workspace.docCollection, page?.id);
  const editor = useService(EditorService).editor;
  const currentMode = useLiveData(editor.mode$);

  return (
    <Header className={styles.header} ref={containerRef}>
      <ViewTitle title={title} />
      <ViewIcon icon={currentMode ?? 'page'} />
      <EditorModeSwitch />
      <BlocksuiteHeaderTitle
        docId={page.id}
        inputHandleRef={titleInputHandleRef}
      />
      <div className={styles.iconButtonContainer}>
        {hideCollect ? null : (
          <>
            <FavoriteButton pageId={page?.id} />
            <InfoButton />
          </>
        )}
        <PageHeaderMenuButton
          rename={onRename}
          page={page}
          containerWidth={containerWidth}
        />
      </div>

      <div className={styles.spacer} />

      {!hidePresent ? <DetailPageHeaderPresentButton /> : null}

      {page && !hideShare ? (
        <SharePageButton workspace={workspace} page={page} />
      ) : null}

      {showDivider ? (
        <Divider orientation="vertical" style={{ height: 20, marginLeft: 4 }} />
      ) : null}
    </Header>
  );
}

export function DetailPageHeader(props: PageHeaderProps) {
  const { page, workspace } = props;
  const { isJournal } = useJournalInfoHelper(page.id);
  const isInTrash = page.meta?.trash;
  const [openInfoModal, setOpenInfoModal] = useAtom(openInfoModalAtom);

  useRegisterCopyLinkCommands({
    workspaceMeta: workspace.meta,
    docId: page.id,
  });

  return (
    <>
      {isJournal && !isInTrash ? (
        <JournalPageHeader {...props} />
      ) : (
        <NormalPageHeader {...props} />
      )}
      <InfoModal
        open={openInfoModal}
        onOpenChange={setOpenInfoModal}
        docId={page.id}
      />
    </>
  );
}
