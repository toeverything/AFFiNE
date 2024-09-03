import { useDocMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { useJournalHelper } from '@affine/core/hooks/use-journal';
import {
  PeekViewService,
  useInsidePeekView,
} from '@affine/core/modules/peek-view';
import { WorkbenchLink } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import type { BlockStdScope } from '@blocksuite/block-std';
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
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import * as styles from './styles.css';
import { scrollAnchoring } from './utils';

export interface PageReferenceRendererOptions {
  pageId: string;
  docCollection: DocCollection;
  pageMetaHelper: ReturnType<typeof useDocMetaHelper>;
  journalHelper: ReturnType<typeof useJournalHelper>;
  t: ReturnType<typeof useI18n>;
  docMode?: DocMode;
  // linking doc with block or element
  blockIds?: string[];
  elementIds?: string[];
}
// use a function to be rendered in the lit renderer
export function pageReferenceRenderer({
  pageId,
  pageMetaHelper,
  journalHelper,
  t,
  docMode,
  blockIds,
  elementIds,
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
    if (blockIds?.length || elementIds?.length) {
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
  params = {},
  isSameDoc = false,
  std,
}: {
  pageId: string;
  docCollection: DocCollection;
  wrapper?: React.ComponentType<PropsWithChildren>;
  mode?: DocMode;
  params?: {
    mode?: DocMode;
    blockIds?: string[];
    elementIds?: string[];
  };
  isSameDoc?: boolean;
  std?: BlockStdScope;
}) {
  const pageMetaHelper = useDocMetaHelper(docCollection);
  const journalHelper = useJournalHelper(docCollection);
  const t = useI18n();
  const [anchor, setAnchor] = useState<{
    mode: DocMode;
    id: string;
  } | null>(null);

  const { mode: linkedWithMode, blockIds, elementIds } = params;

  const el = pageReferenceRenderer({
    docMode: linkedWithMode ?? mode,
    pageId,
    pageMetaHelper,
    journalHelper,
    docCollection,
    t,
    blockIds,
    elementIds,
  });

  const ref = useRef<HTMLAnchorElement>(null);

  const peekView = useService(PeekViewService).peekView;
  const isInPeekView = useInsidePeekView();

  useEffect(() => {
    if (isSameDoc) {
      if (mode === 'edgeless' && elementIds?.length) {
        setAnchor({ mode, id: elementIds[0] });
      } else if (blockIds?.length) {
        setAnchor({ mode, id: blockIds[0] });
      }
    } else {
      setAnchor(null);
    }
  }, [std, isSameDoc, mode, blockIds, elementIds]);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.shiftKey && ref.current) {
        e.preventDefault();
        e.stopPropagation();
        peekView.open(ref.current).catch(console.error);
      }

      if (std && anchor) {
        e.preventDefault();
        e.stopPropagation();
        const { mode, id } = anchor;
        scrollAnchoring(std, mode, id);
      } else if (isInPeekView) {
        peekView.close();
      }

      return;
    },
    [isInPeekView, peekView, anchor, std]
  );

  // A block/element reference link
  const search = new URLSearchParams();
  if (linkedWithMode) {
    search.set('mode', linkedWithMode);
  }
  if (blockIds?.length) {
    search.set('blockIds', blockIds.join(','));
  }
  if (elementIds?.length) {
    search.set('elementIds', elementIds.join(','));
  }

  const query = search.size > 0 ? `?${search.toString()}` : '';

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
