import { LitDocEditor, type PageEditor } from '@affine/core/blocksuite/editors';
import { SnapshotHelper } from '@affine/core/modules/comment/services/snapshot-helper';
import { type RichText, selectTextModel } from '@blocksuite/affine/rich-text';
import { ViewportElementExtension } from '@blocksuite/affine/shared/services';
import { type DocSnapshot, Store } from '@blocksuite/affine/store';
import { ArrowUpBigIcon } from '@blocksuite/icons/rc';
import type { TextSelection } from '@blocksuite/std';
import { useFramework, useService } from '@toeverything/infra';
import clsx from 'clsx';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAsyncCallback } from '../../hooks/affine-async-hooks';
import { getCommentEditorViewManager } from './specs';
import * as styles from './style.css';

const usePatchSpecs = (readonly: boolean) => {
  const framework = useFramework();
  // const confirmModal = useConfirmModal();

  const patchedSpecs = useMemo(() => {
    const manager = getCommentEditorViewManager(framework);
    return manager
      .get(readonly ? 'preview-page' : 'page')
      .concat([ViewportElementExtension('.comment-editor-viewport')]);
  }, [framework, readonly]);

  return patchedSpecs;
};

interface CommentEditorProps {
  readonly?: boolean;
  doc?: Store;
  defaultSnapshot?: DocSnapshot;
  // for performance, we only update the snapshot when the editor blurs
  onChange?: (snapshot: DocSnapshot) => void;
  onCommit?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export interface CommentEditorRef {
  getSnapshot: () => DocSnapshot | null | undefined;
  focus: () => void;
}

// todo: get rid of circular data changes
const useSnapshotDoc = (
  defaultSnapshotOrDoc: DocSnapshot | Store,
  readonly?: boolean
) => {
  const snapshotHelper = useService(SnapshotHelper);
  const [doc, setDoc] = useState<Store | undefined>(
    defaultSnapshotOrDoc instanceof Store ? defaultSnapshotOrDoc : undefined
  );

  useEffect(() => {
    if (defaultSnapshotOrDoc instanceof Store) {
      return;
    }

    snapshotHelper
      .createStore(defaultSnapshotOrDoc)
      .then(d => {
        if (d) {
          setDoc(d);
          d.readonly = readonly ?? false;
        }
      })
      .catch(e => {
        console.error(e);
      });
  }, [defaultSnapshotOrDoc, readonly, snapshotHelper]);

  return doc;
};

export const CommentEditor = forwardRef<CommentEditorRef, CommentEditorProps>(
  function CommentEditor(
    { readonly, defaultSnapshot, doc: userDoc, onChange, onCommit, autoFocus },
    ref
  ) {
    const defaultSnapshotOrDoc = defaultSnapshot ?? userDoc;
    if (!defaultSnapshotOrDoc) {
      throw new Error('Either defaultSnapshot or doc must be provided');
    }
    const specs = usePatchSpecs(!!readonly);
    const doc = useSnapshotDoc(defaultSnapshotOrDoc, readonly);
    const snapshotHelper = useService(SnapshotHelper);
    const editorRef = useRef<PageEditor>(null);

    const [empty, setEmpty] = useState(true);

    const focusEditor = useAsyncCallback(async () => {
      if (editorRef.current) {
        const selectionService = editorRef.current.std.selection;
        const selection = selectionService.value.at(-1) as TextSelection;
        editorRef.current.std.event.active = true;
        await editorRef.current.host?.updateComplete;
        if (selection) {
          selectTextModel(
            editorRef.current.std,
            selection.blockId,
            selection.from.index,
            selection.from.length
          );
        } else {
          const richTexts = Array.from(
            editorRef.current?.querySelectorAll('rich-text') ?? []
          ) as unknown as RichText[];

          const lastRichText = richTexts.at(-1);
          if (lastRichText) {
            lastRichText.inlineEditor?.focusEnd();
          }
        }
      }
    }, [editorRef]);

    useImperativeHandle(
      ref,
      () => ({
        getSnapshot: () => {
          if (!doc) {
            return null;
          }
          return snapshotHelper.getSnapshot(doc);
        },
        focus: focusEditor,
      }),
      [doc, focusEditor, snapshotHelper]
    );

    useEffect(() => {
      let cancel = false;
      if (autoFocus && editorRef.current && doc) {
        // Wait for editor to be fully loaded before focusing
        editorRef.current.updateComplete
          .then(async () => {
            if (cancel) return;
            const richText = editorRef.current?.querySelector(
              'rich-text'
            ) as unknown as RichText;
            if (!richText) return;
            richText.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });
            // Finally focus the inline editor
            richText.focus();
            focusEditor();
          })
          .catch(console.error);
      }
      return () => {
        cancel = true;
      };
    }, [autoFocus, doc, focusEditor]);

    useEffect(() => {
      if (doc) {
        const subscription = doc.slots.blockUpdated.subscribe(() => {
          if (onChange) {
            const snapshot = snapshotHelper.getSnapshot(doc);
            if (snapshot) {
              onChange?.(snapshot);
            }
          }
          setEmpty(snapshotHelper.isDocEmpty(doc));
        });
        return () => {
          subscription?.unsubscribe();
        };
      }
      return;
    }, [doc, onChange, snapshotHelper]);

    // Add keydown handler to commit on CMD/CTRL + Enter key
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (readonly) return;

        // Only handle Enter if focus is within the editor
        const activeElement = document.activeElement;
        if (!editorRef.current?.contains(activeElement)) return;

        // If Enter is pressed with CMD/CTRL key, commit the comment
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.stopPropagation();
          onCommit?.();
        }
      },
      [onCommit, readonly]
    );

    const handleClickEditor = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        focusEditor();
      },
      [focusEditor]
    );

    return (
      <div
        onClick={readonly ? undefined : handleClickEditor}
        onKeyDown={handleKeyDown}
        data-readonly={!!readonly}
        className={clsx(styles.container, 'comment-editor-viewport')}
      >
        {doc && (
          <LitDocEditor key={doc.id} ref={editorRef} specs={specs} doc={doc} />
        )}
        {!readonly && (
          <div className={styles.footer}>
            <button
              onClick={onCommit}
              className={styles.commitButton}
              disabled={empty}
            >
              <ArrowUpBigIcon />
            </button>
          </div>
        )}
      </div>
    );
  }
);
