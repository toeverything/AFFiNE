import { LitDocEditor, type PageEditor } from '@affine/core/blocksuite/editors';
import { SnapshotHelper } from '@affine/core/modules/comment/services/snapshot-helper';
import { focusTextModel, type RichText } from '@blocksuite/affine/rich-text';
import { ViewportElementExtension } from '@blocksuite/affine/shared/services';
import { type DocSnapshot, Store } from '@blocksuite/affine/store';
import { ArrowUpBigIcon } from '@blocksuite/icons/rc';
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

    useImperativeHandle(
      ref,
      () => ({
        getSnapshot: () => {
          if (!doc) {
            return null;
          }
          return snapshotHelper.getSnapshot(doc);
        },
      }),
      [doc, snapshotHelper]
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

            // Finally focus the inline editor
            const inlineEditor = richText.inlineEditor;
            richText.focus();

            richText.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });

            // fixme: the following does not work
            inlineEditor?.focusEnd();
          })
          .catch(console.error);
      }
      return () => {
        cancel = true;
      };
    }, [autoFocus, doc]);

    useEffect(() => {
      if (doc && onChange) {
        const subscription = doc.slots.blockUpdated.subscribe(() => {
          const snapshot = snapshotHelper.getSnapshot(doc);
          if (snapshot) {
            onChange?.(snapshot);
          }
        });
        return () => {
          subscription?.unsubscribe();
        };
      }
      return;
    }, [doc, onChange, snapshotHelper]);

    // Add keydown handler to commit on Enter key
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (readonly) return;

        // Only handle Enter if focus is within the editor
        const activeElement = document.activeElement;
        if (!editorRef.current?.contains(activeElement)) return;

        // If Enter is pressed without Shift key, commit the comment
        if (e.key === 'Enter' && !e.shiftKey) {
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
        if (editorRef.current) {
          const lastChild = editorRef.current.std.store.root?.lastChild();
          if (lastChild) {
            focusTextModel(editorRef.current.std, lastChild.id);
          }
        }
      },
      [editorRef]
    );

    return (
      <div
        onClick={readonly ? undefined : handleClickEditor}
        onKeyDown={handleKeyDown}
        data-readonly={!!readonly}
        className={clsx(styles.container, 'comment-editor-viewport')}
      >
        {doc && <LitDocEditor ref={editorRef} specs={specs} doc={doc} />}
        {!readonly && (
          <div className={styles.footer}>
            <button onClick={onCommit} className={styles.commitButton}>
              <ArrowUpBigIcon />
            </button>
          </div>
        )}
      </div>
    );
  }
);
