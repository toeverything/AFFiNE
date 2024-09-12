import { useDocMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { useJournalHelper } from '@affine/core/hooks/use-journal';
import { track } from '@affine/core/mixpanel';
import {
  PeekViewService,
  useInsidePeekView,
} from '@affine/core/modules/peek-view';
import { WorkbenchLink } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import type { DocMode } from '@blocksuite/blocks';
import {
  BlockLinkIcon,
  DeleteIcon,
  LinkedEdgelessIcon,
  LinkedPageIcon,
  TodayIcon,
} from '@blocksuite/icons/rc';
import type { DocCollection } from '@blocksuite/store';
import { useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import {
  type PropsWithChildren,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';

import * as styles from './styles.css';

export interface PageReferenceRendererOptions {
  pageId: string;
  docCollection: DocCollection;
  pageMetaHelper: ReturnType<typeof useDocMetaHelper>;
  journalHelper: ReturnType<typeof useJournalHelper>;
  t: ReturnType<typeof useI18n>;
  docMode?: DocMode;
  // Link to block or element
  linkToNode?: boolean;
}
// use a function to be rendered in the lit renderer
export function pageReferenceRenderer({
  pageId,
  pageMetaHelper,
  journalHelper,
  t,
  docMode,
  linkToNode = false,
}: PageReferenceRendererOptions) {
  const { isPageJournal, getLocalizedJournalDateString } = journalHelper;
  const referencedPage = pageMetaHelper.getDocMeta(pageId);
  let title =
    referencedPage?.title ?? t['com.affine.editor.reference-not-found']();

  let Icon = DeleteIcon;

  if (referencedPage) {
    if (docMode === 'edgeless') {
      Icon = LinkedEdgelessIcon;
    } else {
      Icon = LinkedPageIcon;
    }
    if (linkToNode) {
      Icon = BlockLinkIcon;
    }
  }

  const isJournal = isPageJournal(pageId);
  const localizedJournalDate = getLocalizedJournalDateString(pageId);
  if (isJournal && localizedJournalDate) {
    title = localizedJournalDate;
    Icon = TodayIcon;
  }

  return (
    <>
      <Icon className={styles.pageReferenceIcon} />
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
  mode = 'page',
  params,
}: {
  pageId: string;
  docCollection: DocCollection;
  wrapper?: React.ComponentType<PropsWithChildren>;
  mode?: DocMode;
  params?: URLSearchParams;
}) {
  const pageMetaHelper = useDocMetaHelper();
  const journalHelper = useJournalHelper(docCollection);
  const t = useI18n();

  let linkWithMode: DocMode | null = null;
  let linkToNode = false;
  if (params) {
    linkWithMode = params.get('mode') as DocMode;
    linkToNode = params.has('blockIds') || params.has('elementIds');
  }

  const el = pageReferenceRenderer({
    docMode: linkWithMode ?? mode,
    pageId,
    pageMetaHelper,
    journalHelper,
    docCollection,
    t,
    linkToNode,
  });

  const ref = useRef<HTMLAnchorElement>(null);

  const [refreshKey, setRefreshKey] = useState<string>(() => nanoid());

  const peekView = useService(PeekViewService).peekView;
  const isInPeekView = useInsidePeekView();
  const isJournal = journalHelper.isPageJournal(pageId);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (isJournal) {
        track.doc.editor.pageRef.navigate({
          to: 'journal',
        });
      }

      if (e.shiftKey && ref.current) {
        e.preventDefault();
        e.stopPropagation();
        peekView.open(ref.current).catch(console.error);
      }

      if (isInPeekView) {
        peekView.close();
      }

      // update refresh key
      setRefreshKey(nanoid());

      return;
    },
    [isInPeekView, isJournal, peekView]
  );

  const query = useMemo(() => {
    // A block/element reference link
    let str = params?.toString() ?? '';
    if (str.length) str += '&';
    str += `refreshKey=${refreshKey}`;
    return '?' + str;
  }, [params, refreshKey]);

  return (
    <WorkbenchLink
      ref={ref}
      to={`/${pageId}${query}`}
      onClick={onClick}
      className={styles.pageReferenceLink}
    >
      {Wrapper ? <Wrapper>{el}</Wrapper> : el}
    </WorkbenchLink>
  );
}
