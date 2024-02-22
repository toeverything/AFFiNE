import { usePageMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { useJournalHelper } from '@affine/core/hooks/use-journal';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { LinkedPageIcon, TodayIcon } from '@blocksuite/icons';
import type { Workspace } from '@blocksuite/store';
import type { PropsWithChildren } from 'react';
import { Link } from 'react-router-dom';

import * as styles from './styles.css';

export interface PageReferenceRendererOptions {
  pageId: string;
  pageMetaHelper: ReturnType<typeof usePageMetaHelper>;
  journalHelper: ReturnType<typeof useJournalHelper>;
  t: ReturnType<typeof useAFFiNEI18N>;
}
// use a function to be rendered in the lit renderer
export function pageReferenceRenderer({
  pageId,
  pageMetaHelper,
  journalHelper,
  t,
}: PageReferenceRendererOptions) {
  const { isPageJournal, getLocalizedJournalDateString } = journalHelper;
  const referencedPage = pageMetaHelper.getPageMeta(pageId);
  let title =
    referencedPage?.title ?? t['com.affine.editor.reference-not-found']();
  let icon = <LinkedPageIcon className={styles.pageReferenceIcon} />;
  const isJournal = isPageJournal(pageId);
  const localizedJournalDate = getLocalizedJournalDateString(pageId);
  if (isJournal && localizedJournalDate) {
    title = localizedJournalDate;
    icon = <TodayIcon className={styles.pageReferenceIcon} />;
  }
  return (
    <>
      {icon}
      <span className="affine-reference-title">{title}</span>
    </>
  );
}

export function AffinePageReference({
  pageId,
  workspace,
  wrapper: Wrapper,
}: {
  workspace: Workspace;
  pageId: string;
  wrapper?: React.ComponentType<PropsWithChildren>;
}) {
  const pageMetaHelper = usePageMetaHelper(workspace);
  const journalHelper = useJournalHelper(workspace);
  const t = useAFFiNEI18N();
  const el = pageReferenceRenderer({
    pageId,
    pageMetaHelper,
    journalHelper,
    t,
  });

  return (
    <Link
      to={`/workspace/${workspace.id}/${pageId}`}
      className={styles.pageReferenceLink}
    >
      {Wrapper ? <Wrapper>{el}</Wrapper> : el}
    </Link>
  );
}
