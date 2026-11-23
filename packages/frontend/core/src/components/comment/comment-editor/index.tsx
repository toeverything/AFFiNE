import { IconButton, notify, toast } from '@affine/component';
import { LitDocEditor, type PageEditor } from '@affine/core/blocksuite/editors';
import { SnapshotHelper } from '@affine/core/modules/comment/services/snapshot-helper';
import type { CommentAttachment } from '@affine/core/modules/comment/types';
import { PeekViewService } from '@affine/core/modules/peek-view';
import { downloadResourceWithUrl } from '@affine/core/utils/resource';
import { DebugLogger } from '@affine/debug';
import { getAttachmentFileIconRC } from '@blocksuite/affine/components/icons';
import { type RichText, selectTextModel } from '@blocksuite/affine/rich-text';
import { ViewportElementExtension } from '@blocksuite/affine/shared/services';
import { openFilesWith } from '@blocksuite/affine/shared/utils';
import { type DocSnapshot, nanoid, Store } from '@blocksuite/affine/store';
import {
  ArrowUpBigIcon,
  AttachmentIcon,
  CloseIcon,
} from '@blocksuite/icons/rc';
import type { TextSelection } from '@blocksuite/std';
import { useFramework, useService } from '@toeverything/infra';
import bytes from 'bytes';
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

const MAX_ATTACHMENT_COUNT = 10;
const logger = new DebugLogger('CommentEditor');

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

interface EditorAttachment extends CommentAttachment {
  status?: 'uploading' | 'success' | 'error';
  file?: File;
  localUrl?: string; // for previewing
}

interface CommentEditorProps {
  readonly?: boolean;
  doc?: Store;
  defaultSnapshot?: DocSnapshot;
  // for performance, we only update the snapshot when the editor blurs
  onChange?: (snapshot: DocSnapshot) => void;
  onCommit?: () => void;
  onCancel?: () => void;

  /**
   * upload comment attachment to the server
   * @param file
   * @returns remote url of the attachment
   */
  uploadCommentAttachment?: (id: string, file: File) => Promise<string>;
  autoFocus?: boolean;
  attachments?: EditorAttachment[];
  onAttachmentsChange?: (atts: EditorAttachment[]) => void;
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

const isImageAttachment = (att: EditorAttachment) => {
  const type = att.mimeType || att.file?.type || '';
  if (type) return type.startsWith('image/');
  return !!att.url && /\.(png|jpe?g|gif|webp|svg)$/i.test(att.url);
};

const AttachmentPreviewItem: React.FC<{
  attachment: EditorAttachment;
  index: number;
  readonly?: boolean;
  handleAttachmentClick: (e: React.MouseEvent, index: number) => void;
  handleAttachmentRemove: (id: string) => void;
}> = ({
  attachment,
  index,
  readonly,
  handleAttachmentClick,
  handleAttachmentRemove,
}) => {
  const isImg = isImageAttachment(attachment);
  const Icon = !isImg
    ? getAttachmentFileIconRC(
        attachment.mimeType ||
          attachment.file?.type ||
          attachment.filename?.split('.').pop() ||
          'none'
      )
    : undefined;

  return (
    <div
      key={attachment.id}
      className={isImg ? styles.previewBox : styles.filePreviewBox}
      style={{
        backgroundImage: isImg
          ? `url(${attachment.localUrl ?? attachment.url})`
          : undefined,
      }}
      onClick={e => handleAttachmentClick(e, index)}
    >
      {!isImg && Icon && <Icon className={styles.fileIcon} />}
      {!isImg && (
        <div className={styles.fileInfo}>
          <span className={styles.fileName}>
            {attachment.filename || attachment.file?.name || 'File'}
          </span>
          <span className={styles.fileSize}>
            {attachment.size ? bytes(attachment.size) : ''}
          </span>
        </div>
      )}

      {!readonly && (
        <IconButton
          size={12}
          className={styles.attachmentButton}
          loading={attachment.status === 'uploading'}
          variant="danger"
          onClick={e => {
            e.stopPropagation();
            handleAttachmentRemove(attachment.id);
          }}
          icon={<CloseIcon />}
        />
      )}
    </div>
  );
};

export const CommentEditor = forwardRef<CommentEditorRef, CommentEditorProps>(
  function CommentEditor(
    {
      readonly,
      defaultSnapshot,
      doc: userDoc,
      onChange,
      onCommit,
      uploadCommentAttachment,
      autoFocus,
      attachments,
      onAttachmentsChange,
    },
    ref
  ) {
    const defaultSnapshotOrDoc = defaultSnapshot ?? userDoc;
    if (!defaultSnapshotOrDoc) {
      throw new Error('Either defaultSnapshot or doc must be provided');
    }
    const specs = usePatchSpecs(!!readonly);
    const doc = useSnapshotDoc(defaultSnapshotOrDoc, readonly);
    const snapshotHelper = useService(SnapshotHelper);
    const peekViewService = useService(PeekViewService);
    const editorRef = useRef<PageEditor>(null);
    const [empty, setEmpty] = useState(true);

    const setAttachments = useCallback(
      (updater: (prev: EditorAttachment[]) => EditorAttachment[]) => {
        const next = updater(attachments ?? []);
        onAttachmentsChange?.(next);
      },
      [attachments, onAttachmentsChange]
    );

    const isUploadDisabled = (attachments?.length ?? 0) >= MAX_ATTACHMENT_COUNT;
    const uploadingAttachments = attachments?.some(
      att => att.status === 'uploading'
    );
    const commitDisabled =
      (empty && (attachments?.length ?? 0) === 0) || uploadingAttachments;

    const addAttachments = useAsyncCallback(
      async (files: File[]) => {
        if (!uploadCommentAttachment) return;
        const remaining = MAX_ATTACHMENT_COUNT - (attachments?.length ?? 0);
        const valid = files.slice(0, remaining);
        if (!valid.length) return;
        logger.info('addAttachments', { files: valid });

        const pendingAttachments: EditorAttachment[] = valid.map(f => ({
          id: nanoid(),
          file: f,
          localUrl: URL.createObjectURL(f),
          status: 'uploading',
          filename: f.name,
          mimeType: f.type,
        }));

        setAttachments(prev => [...prev, ...pendingAttachments]);

        for (const pending of pendingAttachments) {
          if (!pending.file) continue; // should not happen
          try {
            const remoteUrl = await uploadCommentAttachment(
              pending.id,
              pending.file
            );
            logger.info('uploadCommentAttachment success', {
              remoteUrl,
            });
            pending.localUrl && URL.revokeObjectURL(pending.localUrl);
            setAttachments(prev => {
              const index = prev.findIndex(att => att.id === pending.id);
              if (index === -1) return prev;
              // create a shallow copy to trigger re-render
              const next = [...prev];
              next[index] = {
                ...next[index],
                status: 'success',
                url: remoteUrl,
              };
              return next;
            });
          } catch (e: any) {
            logger.error('uploadCommentAttachment failed', { error: e });
            notify.error({
              title: 'Failed to upload attachment',
              message: e.message,
            });
            pending.localUrl && URL.revokeObjectURL(pending.localUrl);
            setAttachments(prev => {
              const index = prev.findIndex(att => att.id === pending.id);
              if (index === -1) return prev;
              const next = [...prev];
              next[index] = { ...next[index], status: 'error' };
              return next;
            });
          }
        }
      },
      [attachments?.length, setAttachments, uploadCommentAttachment]
    );

    const handlePaste = useCallback(
      (event: React.ClipboardEvent) => {
        const items = event.clipboardData?.items;
        if (!items) return;
        const files: File[] = [];
        for (const index in items) {
          const item = items[index as any];
          if (item.kind === 'file') {
            const blob = item.getAsFile();
            if (blob) files.push(blob);
          }
        }
        if (files.length) {
          event.preventDefault();
          addAttachments(files);
        }
      },
      [addAttachments]
    );

    const handleDragOver = useCallback(
      (e: React.DragEvent) => {
        if (readonly) return;
        // Prevent default to allow drop
        e.preventDefault();
      },
      [readonly]
    );

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        if (readonly) return;
        e.preventDefault();
        e.stopPropagation();
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length) {
          addAttachments(files);
        }
      },
      [addAttachments, readonly]
    );

    const openFilePicker = useAsyncCallback(async () => {
      if (isUploadDisabled) return;
      const files = await openFilesWith('Any');
      if (files) {
        addAttachments(files);
      }
    }, [isUploadDisabled, addAttachments]);

    const handleAttachmentRemove = useCallback(
      (id: string) => {
        setAttachments(prev => {
          const att = prev.find(att => att.id === id);
          if (att?.localUrl) URL.revokeObjectURL(att.localUrl);
          return prev.filter(att => att.id !== id);
        });
      },
      [setAttachments]
    );

    const handleImagePreview = useCallback(
      (index: number) => {
        if (!attachments) return;
        const imageAttachments = attachments.filter(isImageAttachment);

        if (index >= imageAttachments.length) return;

        const getImageData = (currentIndex: number) => {
          const attachment = imageAttachments[currentIndex];
          if (!attachment) return undefined;

          return {
            index: currentIndex,
            url: attachment.url || attachment.localUrl || '',
            caption: attachment.file?.name || `Image ${currentIndex + 1}`,
            previous:
              currentIndex > 0
                ? () => getImageData(currentIndex - 1)
                : undefined,
            next:
              currentIndex < imageAttachments.length - 1
                ? () => getImageData(currentIndex + 1)
                : undefined,
          };
        };

        const imageData = getImageData(index);
        if (!imageData) return;

        peekViewService.peekView
          .open({
            type: 'image-list',
            data: {
              image: imageData,
              total: imageAttachments.length,
            },
          })
          .catch(error => {
            console.error('Failed to open image preview', error);
          });
      },
      [attachments, peekViewService]
    );

    const handleAttachmentClick = useCallback(
      (e: React.MouseEvent, index: number) => {
        e.stopPropagation();
        if (!attachments) return;
        const att = attachments[index];
        if (!att) return;
        if (isImageAttachment(att)) {
          // translate attachment index to image index
          const imageAttachments = attachments.filter(isImageAttachment);
          const imageIndex = imageAttachments.findIndex(i => i.id === att.id);
          if (imageIndex >= 0) {
            handleImagePreview(imageIndex);
          }
        } else if (att.url) {
          // todo: open attachment preview. for now, just download it
          downloadResourceWithUrl(
            att.url,
            att.filename ?? att.file?.name ?? 'attachment'
          ).catch(e => {
            console.error('Failed to download attachment', e);
            notify.error({
              title: 'Failed to download attachment',
              message: e.message,
            });
          });
          toast('The attachment is being downloaded to your computer.');
        }
      },
      [attachments, handleImagePreview]
    );

    // upload attachments and call original onCommit
    const handleCommit = useAsyncCallback(async () => {
      if (readonly || commitDisabled) return;
      onCommit?.();
      setAttachments(prev => {
        prev.forEach(att => att.localUrl && URL.revokeObjectURL(att.localUrl));
        return [];
      });
    }, [readonly, commitDisabled, onCommit, setAttachments]);

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

    // Add keydown handler to commit on Enter key
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (readonly) return;

        // Only handle Enter if focus is within the editor
        const activeElement = document.activeElement;
        if (!editorRef.current?.contains(activeElement)) return;

        // If Enter is pressed without CMD/CTRL key, commit the comment
        if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.stopPropagation();
          handleCommit();
        }
      },
      [handleCommit, readonly]
    );

    const handleClickEditor = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        focusEditor();
      },
      [focusEditor]
    );

    useEffect(() => {
      return () => {
        // Cleanup any remaining local URLs on unmount
        attachments?.forEach(att => {
          if (att.localUrl) URL.revokeObjectURL(att.localUrl);
        });
      };
    }, [attachments]);

    return (
      <div
        onClick={readonly ? undefined : handleClickEditor}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        data-readonly={!!readonly}
        className={clsx(styles.container, 'comment-editor-viewport')}
      >
        {attachments?.length && attachments.length > 0 ? (
          <div
            className={styles.previewRow}
            data-testid="comment-attachment-preview"
          >
            {attachments.map((att, index) => (
              <AttachmentPreviewItem
                key={att.id}
                attachment={att}
                index={index}
                readonly={readonly}
                handleAttachmentClick={handleAttachmentClick}
                handleAttachmentRemove={handleAttachmentRemove}
              />
            ))}
          </div>
        ) : null}

        {doc && (
          <LitDocEditor key={doc.id} ref={editorRef} specs={specs} doc={doc} />
        )}
        {!readonly && (
          <div className={styles.footer}>
            <IconButton
              icon={<AttachmentIcon />}
              onClick={openFilePicker}
              disabled={isUploadDisabled}
            />
            <button
              onClick={handleCommit}
              className={styles.commitButton}
              disabled={commitDisabled}
            >
              <ArrowUpBigIcon />
            </button>
          </div>
        )}
      </div>
    );
  }
);
