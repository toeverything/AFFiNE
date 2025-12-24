import { IconButton } from '@affine/component';
import { DocService } from '@affine/core/modules/doc';
import { EditorService } from '@affine/core/modules/editor';
import { useInsidePeekView } from '@affine/core/modules/peek-view/view/modal-container';
import { extractEmojiIcon } from '@affine/core/utils';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { Bound } from '@blocksuite/affine/global/gfx';
import { type NoteBlockModel } from '@blocksuite/affine/model';
import { GfxControllerIdentifier } from '@blocksuite/affine/std/gfx';
import {
  ExpandFullIcon,
  ToggleDownIcon,
  ToggleRightIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CopyLinkButton, DocInfoButton } from './common';
import * as styles from './edgeless-block-header.css';

const EdgelessNoteToggleButton = ({ note }: { note: NoteBlockModel }) => {
  const t = useI18n();
  const [collapsed, setCollapsed] = useState(note.props.edgeless.collapse);
  const editor = useService(EditorService).editor;
  const editorContainer = useLiveData(editor.editorContainer$);
  const gfx = editorContainer?.std.get(GfxControllerIdentifier);
  const { doc } = useService(DocService);

  const title = useLiveData(doc.title$);
  // only render emoji if it exists (mode or journal icon will not be rendered)
  const { emoji, rest: titleWithoutEmoji } = useMemo(
    () => extractEmojiIcon(title),
    [title]
  );

  useEffect(() => {
    return note.props.edgeless$.subscribe(({ collapse, collapsedHeight }) => {
      if (
        collapse &&
        collapsedHeight &&
        Math.abs(collapsedHeight - styles.headerHeight) < 1
      ) {
        setCollapsed(true);
      } else {
        setCollapsed(false);
      }
    });
  }, [note.props.edgeless$]);

  useEffect(() => {
    if (!gfx) return;

    const { selection } = gfx;

    const dispose = selection.slots.updated.subscribe(() => {
      if (selection.has(note.id) && selection.editing) {
        note.store.transact(() => {
          note.props.edgeless.collapse = false;
        });
      }
    });

    return () => dispose.unsubscribe();
  }, [gfx, note]);

  const toggle = useCallback(() => {
    track.edgeless.pageBlock.headerToolbar.toggle({
      type: collapsed ? 'expand' : 'collapse',
    });
    note.store.transact(() => {
      if (collapsed) {
        note.props.edgeless.collapse = false;
      } else {
        const bound = Bound.deserialize(note.props.xywh);
        bound.h = styles.headerHeight * (note.props.edgeless.scale ?? 1);
        note.props.xywh = bound.serialize();
        note.props.edgeless.collapse = true;
        note.props.edgeless.collapsedHeight = styles.headerHeight;
        gfx?.selection.clear();
      }
    });
  }, [collapsed, gfx, note]);

  return (
    <>
      <IconButton
        className={styles.button}
        size={styles.iconSize}
        tooltip={t['com.affine.editor.edgeless-note-header.fold-page-block']()}
        data-testid="edgeless-note-toggle-button"
        onClick={toggle}
      >
        {collapsed ? <ToggleRightIcon /> : <ToggleDownIcon />}
      </IconButton>
      <div className={styles.titleContainer} data-testid="edgeless-note-title">
        {collapsed && (
          <>
            {emoji && <span>{emoji}</span>}
            <span className={styles.noteTitle}>{titleWithoutEmoji}</span>
          </>
        )}
      </div>
    </>
  );
};

const OpenInPageButton = () => {
  const t = useI18n();
  const editor = useService(EditorService).editor;

  const openInPage = useCallback(() => {
    track.edgeless.pageBlock.headerToolbar.switchPageMode();
    editor.setMode('page');
  }, [editor]);

  return (
    <IconButton
      className={styles.button}
      size={styles.iconSize}
      tooltip={t['com.affine.editor.edgeless-note-header.open-in-page']()}
      data-testid="edgeless-note-view-in-page-button"
      onClick={openInPage}
    >
      <ExpandFullIcon />
    </IconButton>
  );
};

const PageBlockInfoButton = ({ note }: { note: NoteBlockModel }) => {
  const trackFn = useCallback(() => {
    track.edgeless.pageBlock.headerToolbar.openDocInfo();
  }, []);

  return (
    <DocInfoButton
      docId={note.store.id}
      trackFn={trackFn}
      data-testid="edgeless-note-info-button"
    />
  );
};

const NoteCopyLinkButton = ({ note }: { note: NoteBlockModel }) => {
  const trackFn = useCallback(() => {
    track.edgeless.pageBlock.headerToolbar.copyBlockToLink();
  }, []);

  return (
    <CopyLinkButton
      pageId={note.store.id}
      blockId={note.id}
      mode="edgeless"
      trackFn={trackFn}
      data-testid="edgeless-note-link-button"
    />
  );
};

export const EdgelessNoteHeader = ({ note }: { note: NoteBlockModel }) => {
  const insidePeekView = useInsidePeekView();

  if (!note.isPageBlock()) return null;

  return (
    <div className={styles.header} data-testid="edgeless-page-block-header">
      <EdgelessNoteToggleButton note={note} />
      <OpenInPageButton />
      {!insidePeekView && <PageBlockInfoButton note={note} />}
      <NoteCopyLinkButton note={note} />
    </div>
  );
};
