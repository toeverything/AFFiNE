import { useConfirmModal, useLitPortalFactory } from '@affine/component';
import { LitDocEditor, type PageEditor } from '@affine/core/blocksuite/editors';
import { getViewManager } from '@affine/core/blocksuite/manager/view';
import { SnapshotHelper } from '@affine/core/modules/comment/services/snapshot-helper';
import { ViewportElementExtension } from '@blocksuite/affine/shared/services';
import { type DocSnapshot, Store } from '@blocksuite/affine/store';
import { ArrowUpBigIcon } from '@blocksuite/icons/rc';
import { useFramework, useService } from '@toeverything/infra';
import clsx from 'clsx';
import {
  forwardRef,
  Fragment,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import * as styles from './style.css';

const usePatchSpecs = (readonly: boolean) => {
  const [reactToLit, portals] = useLitPortalFactory();
  const framework = useFramework();
  const confirmModal = useConfirmModal();

  const patchedSpecs = useMemo(() => {
    const manager = getViewManager()
      .config.init()
      .foundation(framework)
      .theme(framework)
      .editorConfig(framework)
      .editorView({
        framework,
        reactToLit,
        confirmModal,
      })
      .linkedDoc(framework)
      .paragraph(false)
      .codeBlockHtmlPreview(framework).value;
    return manager
      .get(readonly ? 'preview-page' : 'page')
      .concat([ViewportElementExtension('.comment-editor-viewport')]);
  }, [confirmModal, framework, reactToLit, readonly]);

  return [
    patchedSpecs,
    useMemo(
      () => (
        <>
          {portals.map(p => (
            <Fragment key={p.id}>{p.portal}</Fragment>
          ))}
        </>
      ),
      [portals]
    ),
  ] as const;
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
    const [specs, portals] = usePatchSpecs(!!readonly);
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
        // fixme: the following does not work
        // Wait for editor to be fully loaded before focusing
        editorRef.current.updateComplete
          .then(async () => {
            if (cancel) return;
            const richText = editorRef.current?.querySelector('rich-text');
            if (!richText) return;

            // Wait for rich text component to be fully loaded
            await richText.updateComplete;

            // Finally focus the inline editor
            const inlineEditor = richText.inlineEditor;
            richText.focus();

            richText.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });

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
        const subscription = doc.slots.yBlockUpdated.subscribe(() => {
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

    const handleClickEditor = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        if (editorRef.current) {
          editorRef.current.focus();
        }
      },
      [editorRef]
    );

    return (
      <div
        onClick={handleClickEditor}
        data-readonly={!!readonly}
        className={clsx(styles.container, 'comment-editor-viewport')}
      >
        {doc && <LitDocEditor ref={editorRef} specs={specs} doc={doc} />}
        {portals}
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
