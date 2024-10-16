import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { JournalService } from '@affine/core/modules/journal';
import { PeekViewService } from '@affine/core/modules/peek-view/services/peek-view';
import { useInsidePeekView } from '@affine/core/modules/peek-view/view/modal-container';
import { WorkbenchLink } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import type { DocMode } from '@blocksuite/affine/blocks';
import type { DocCollection } from '@blocksuite/affine/store';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { nanoid } from 'nanoid';
import {
  type PropsWithChildren,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';

import * as styles from './styles.css';

export function AffinePageReference({
  pageId,
  wrapper: Wrapper,
  params,
  className,
}: {
  pageId: string;
  wrapper?: React.ComponentType<PropsWithChildren>;
  params?: URLSearchParams;
  className?: string;
}) {
  const docDisplayMetaService = useService(DocDisplayMetaService);
  const journalService = useService(JournalService);
  const isJournal = !!useLiveData(journalService.journalDate$(pageId));
  const i18n = useI18n();

  let linkWithMode: DocMode | null = null;
  let linkToNode = false;
  if (params) {
    const m = params.get('mode');
    if (m && (m === 'page' || m === 'edgeless')) {
      linkWithMode = m as DocMode;
    }
    linkToNode = params.has('blockIds') || params.has('elementIds');
  }

  const Icon = useLiveData(
    docDisplayMetaService.icon$(pageId, {
      mode: linkWithMode ?? undefined,
      reference: true,
      referenceToNode: linkToNode,
    })
  );
  const title = useLiveData(
    docDisplayMetaService.title$(pageId, { reference: true })
  );

  const el = (
    <>
      <Icon className={styles.pageReferenceIcon} />
      <span className="affine-reference-title">{i18n.t(title)}</span>
    </>
  );

  const ref = useRef<HTMLAnchorElement>(null);

  const [refreshKey, setRefreshKey] = useState<string>(() => nanoid());

  const peekView = useService(PeekViewService).peekView;
  const isInPeekView = useInsidePeekView();

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
      className={clsx(styles.pageReferenceLink, className)}
    >
      {Wrapper ? <Wrapper>{el}</Wrapper> : el}
    </WorkbenchLink>
  );
}

export function AffineSharedPageReference({
  pageId,
  docCollection,
  wrapper: Wrapper,
  params,
}: {
  pageId: string;
  docCollection: DocCollection;
  wrapper?: React.ComponentType<PropsWithChildren>;
  params?: URLSearchParams;
}) {
  const docDisplayMetaService = useService(DocDisplayMetaService);
  const journalService = useService(JournalService);
  const isJournal = !!useLiveData(journalService.journalDate$(pageId));
  const i18n = useI18n();

  let linkWithMode: DocMode | null = null;
  let linkToNode = false;
  if (params) {
    const m = params.get('mode');
    if (m && (m === 'page' || m === 'edgeless')) {
      linkWithMode = m as DocMode;
    }
    linkToNode = params.has('blockIds') || params.has('elementIds');
  }

  const Icon = useLiveData(
    docDisplayMetaService.icon$(pageId, {
      mode: linkWithMode ?? undefined,
      reference: true,
      referenceToNode: linkToNode,
    })
  );
  const title = useLiveData(docDisplayMetaService.title$(pageId));
  const el = (
    <>
      <Icon className={styles.pageReferenceIcon} />
      <span className="affine-reference-title">{i18n.t(title)}</span>
    </>
  );

  const ref = useRef<HTMLAnchorElement>(null);

  const [refreshKey, setRefreshKey] = useState<string>(() => nanoid());

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (isJournal) {
        track.doc.editor.pageRef.navigate({
          to: 'journal',
        });
      }

      // update refresh key
      setRefreshKey(nanoid());

      // Prevent blocksuite link clicked behavior
      e.stopPropagation();

      return;
    },
    [isJournal]
  );

  const query = useMemo(() => {
    // A block/element reference link
    let str = params?.toString() ?? '';
    if (str.length) str += '&';
    str += `refreshKey=${refreshKey}`;
    return '?' + str;
  }, [params, refreshKey]);

  return (
    <Link
      ref={ref}
      to={`/workspace/${docCollection.id}/${pageId}${query}`}
      onClick={onClick}
      className={styles.pageReferenceLink}
    >
      {Wrapper ? <Wrapper>{el}</Wrapper> : el}
    </Link>
  );
}
