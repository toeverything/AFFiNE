import { useDocMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { useJournalHelper } from '@affine/core/hooks/use-journal';
import {
  PeekViewService,
  useInsidePeekView,
} from '@affine/core/modules/peek-view';
import { WorkbenchLink } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import {
  DeleteIcon,
  LinkedEdgelessIcon,
  LinkedPageIcon,
  TodayIcon,
} from '@blocksuite/icons/rc';
import type { DocCollection } from '@blocksuite/store';
import {
  type DocMode,
  DocsService,
  LiveData,
  useLiveData,
  useService,
} from '@toeverything/infra';
import { type PropsWithChildren, useCallback, useRef } from 'react';

import * as styles from './styles.css';

export interface PageReferenceRendererOptions {
  docMode: DocMode | null;
  pageId: string;
  docCollection: DocCollection;
  pageMetaHelper: ReturnType<typeof useDocMetaHelper>;
  journalHelper: ReturnType<typeof useJournalHelper>;
  t: ReturnType<typeof useI18n>;
}
// use a function to be rendered in the lit renderer
export function pageReferenceRenderer({
  docMode,
  pageId,
  pageMetaHelper,
  journalHelper,
  t,
}: PageReferenceRendererOptions) {
  const { isPageJournal, getLocalizedJournalDateString } = journalHelper;
  const referencedPage = pageMetaHelper.getDocMeta(pageId);
  let title =
    referencedPage?.title ?? t['com.affine.editor.reference-not-found']();

  let icon = !referencedPage ? (
    <DeleteIcon className={styles.pageReferenceIcon} />
  ) : docMode === 'page' || docMode === null ? (
    <LinkedPageIcon className={styles.pageReferenceIcon} />
  ) : (
    <LinkedEdgelessIcon className={styles.pageReferenceIcon} />
  );

  const isJournal = isPageJournal(pageId);
  const localizedJournalDate = getLocalizedJournalDateString(pageId);
  if (isJournal && localizedJournalDate) {
    title = localizedJournalDate;
    icon = <TodayIcon className={styles.pageReferenceIcon} />;
  }

  return (
    <>
      {icon}
      <span className="affine-reference-title">
        {title ? title : t['Untitled']()}
      </span>
    </>
  );
}

export function AffinePageReference({
  pageId,
  docCollection,
  wrapper: Wrapper,
}: {
  docCollection: DocCollection;
  pageId: string;
  wrapper?: React.ComponentType<PropsWithChildren>;
}) {
  const pageMetaHelper = useDocMetaHelper(docCollection);
  const journalHelper = useJournalHelper(docCollection);
  const t = useI18n();

  const docsService = useService(DocsService);
  const mode$ = LiveData.from(docsService.list.observeMode(pageId), undefined);
  const docMode = useLiveData(mode$) ?? null;
  const el = pageReferenceRenderer({
    docMode,
    pageId,
    pageMetaHelper,
    journalHelper,
    docCollection,
    t,
  });

  const ref = useRef<HTMLAnchorElement>(null);

  const peekView = useService(PeekViewService).peekView;
  const isInPeekView = useInsidePeekView();

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.shiftKey && ref.current) {
        e.preventDefault();
        e.stopPropagation();
        peekView.open(ref.current).catch(console.error);
      }
      if (isInPeekView) {
        peekView.close();
      }
      return;
    },
    [isInPeekView, peekView]
  );

  return (
    <WorkbenchLink
      ref={ref}
      to={`/${pageId}`}
      onClick={onClick}
      className={styles.pageReferenceLink}
    >
      {Wrapper ? <Wrapper>{el}</Wrapper> : el}
    </WorkbenchLink>
  );
}
