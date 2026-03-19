import { notify } from '@affine/component';
import { EditorLoading } from '@affine/component/page-detail-skeleton';
import type {
  EdgelessEditor,
  PageEditor,
} from '@affine/core/blocksuite/editors';
import { ServerService } from '@affine/core/modules/cloud';
import { DocsService } from '@affine/core/modules/doc';
import {
  EditorSettingService,
  fontStyleOptions,
} from '@affine/core/modules/editor-setting';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { WorkspaceService } from '@affine/core/modules/workspace';
import track from '@affine/track';
import { appendParagraphCommand } from '@blocksuite/affine/blocks/paragraph';
import type { DocTitle } from '@blocksuite/affine/fragments/doc-title';
import { DisposableGroup } from '@blocksuite/affine/global/disposable';
import { IS_LINUX } from '@blocksuite/affine/global/env';
import type { DocMode, RootBlockModel } from '@blocksuite/affine/model';
import {
  customImageProxyMiddleware,
  ImageProxyService,
} from '@blocksuite/affine/shared/adapters';
import { focusBlockEnd } from '@blocksuite/affine/shared/commands';
import { getLastNoteBlock } from '@blocksuite/affine/shared/utils';
import type { BlockStdScope, EditorHost } from '@blocksuite/affine/std';
import type { Store } from '@blocksuite/affine/store';
import { Slot } from '@radix-ui/react-slot';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import clsx from 'clsx';
import type { CSSProperties, HTMLAttributes } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DefaultOpenProperty } from '../../components/properties';
import {
  ATTACHMENT_TRASH_CUSTOM_PROPERTY,
  ATTACHMENT_TRASH_EVENT,
  ATTACHMENT_TRASH_META_KEY,
  type AttachmentTrashEventDetail,
  serializeAttachmentTrashMetadata,
} from './attachment-trash';
import { BlocksuiteDocEditor, BlocksuiteEdgelessEditor } from './lit-adaper';
import * as styles from './styles.css';

export interface AffineEditorContainer extends HTMLElement {
  page: Store;
  doc: Store;
  docTitle: DocTitle;
  host?: EditorHost;
  model: RootBlockModel | null;
  updateComplete: Promise<boolean>;
  mode: DocMode;
  origin: HTMLDivElement;
  std: BlockStdScope;
}

export interface EditorProps extends HTMLAttributes<HTMLDivElement> {
  page: Store;
  mode: DocMode;
  shared?: boolean;
  readonly?: boolean;
  defaultOpenProperty?: DefaultOpenProperty;
  // on Editor ready
  onEditorReady?: (editor: AffineEditorContainer) => (() => void) | void;
}

const BlockSuiteEditorImpl = ({
  mode,
  page,
  className,
  shared,
  readonly,
  style,
  onEditorReady,
  defaultOpenProperty,
  ...props
}: EditorProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PageEditor>(null);
  const docTitleRef = useRef<DocTitle>(null);
  const edgelessRef = useRef<EdgelessEditor>(null);
  // Note: attachmentRestoreSubscriptions removed as it's no longer used
  // Attachment restoration is now handled directly in the trash page UI
  const featureFlags = useService(FeatureFlagService).flags;
  const enableEditorRTL = useLiveData(featureFlags.enable_editor_rtl.$);
  const editorSetting = useService(EditorSettingService).editorSetting;
  const server = useService(ServerService).server;
  const docsService = useService(DocsService);

  const { enableMiddleClickPaste } = useLiveData(
    editorSetting.settings$.selector(s => ({
      enableMiddleClickPaste: s.enableMiddleClickPaste,
    }))
  );

  const createAttachmentTrashDoc = useCallback(
    async (detail: AttachmentTrashEventDetail) => {
      try {
        const attachmentName =
          (detail.entry.props.name as string | undefined)?.toString() ||
          'Attachment';
        const docRecord = docsService.createDoc({ title: attachmentName });
        docRecord.setMeta({ title: attachmentName });

        const { doc, release } = docsService.open(docRecord.id);
        try {
          await doc.waitForSyncReady();
          const note =
            doc.blockSuiteDoc.getModelsByFlavour('affine:note')[0] ?? null;
          const attachmentProps = cloneAttachmentProps(detail.entry.props);
          // Remove id from props as BlockSuite generates its own IDs
          delete attachmentProps.id;

          doc.blockSuiteDoc.captureSync();
          doc.blockSuiteDoc.transact(() => {
            doc.blockSuiteDoc.addBlock(
              'affine:attachment',
              attachmentProps as Record<string, unknown>,
              note?.id ?? doc.blockSuiteDoc.root?.id ?? undefined
            );
          });
        } finally {
          release();
        }

        // Set custom property AFTER doc content is created and synced
        const serializedMetadata = serializeAttachmentTrashMetadata(detail);
        docRecord.setCustomProperty(
          ATTACHMENT_TRASH_META_KEY,
          serializedMetadata
        );

        docRecord.moveToTrash();
        notify.success({
          title: 'Moved to Trash',
          message: 'Attachment has been moved to Trash',
        });
      } catch (error) {
        console.error('Failed to move attachment to trash', error);
        notify.error({
          title: 'Failed to move to Trash',
          message: 'Could not move attachment to Trash',
        });
      }
    },
    [docsService]
  );

  // Note: restoreAttachmentFromTrashDoc removed as it's no longer used
  // Attachment restoration is now handled directly in the trash page UI
  // The logic has been moved to packages/frontend/core/src/components/explorer/docs-view/quick-actions.tsx

  /**
   * mimic an AffineEditorContainer using proxy
   */
  const affineEditorContainerProxy = useMemo(() => {
    const api = {
      get page() {
        return page;
      },
      get doc() {
        return page;
      },
      get docTitle() {
        return docTitleRef.current;
      },
      get host() {
        return (
          (mode === 'page'
            ? docRef.current?.host
            : edgelessRef.current?.host) ?? null
        );
      },
      get model() {
        return page.root as any;
      },
      get updateComplete() {
        return mode === 'page'
          ? docRef.current?.updateComplete
          : edgelessRef.current?.updateComplete;
      },
      get mode() {
        return mode;
      },
      get origin() {
        return rootRef.current;
      },
      get std() {
        return mode === 'page' ? docRef.current?.std : edgelessRef.current?.std;
      },
    };

    const proxy = new Proxy(api, {
      has(_, prop) {
        return (
          Reflect.has(api, prop) ||
          (rootRef.current ? Reflect.has(rootRef.current, prop) : false)
        );
      },
      get(_, prop) {
        if (Reflect.has(api, prop)) {
          return api[prop as keyof typeof api];
        }
        if (rootRef.current && Reflect.has(rootRef.current, prop)) {
          const maybeFn = Reflect.get(rootRef.current, prop);
          if (typeof maybeFn === 'function') {
            return maybeFn.bind(rootRef.current);
          } else {
            return maybeFn;
          }
        }
        return undefined;
      },
    }) as AffineEditorContainer;

    return proxy;
  }, [mode, page]);

  const handleClickPageModeBlank = useCallback(() => {
    if (shared || readonly || page.readonly) return;
    const std = affineEditorContainerProxy.host?.std;
    if (!std) {
      return;
    }
    const note = getLastNoteBlock(page);
    if (note) {
      const lastBlock = note.lastChild();
      if (
        lastBlock &&
        lastBlock.flavour === 'affine:paragraph' &&
        lastBlock.text?.length === 0
      ) {
        const focusBlock = std.view.getBlock(lastBlock.id) ?? undefined;
        std.command.exec(focusBlockEnd, {
          focusBlock,
          force: true,
        });
        return;
      }
    }

    std.command.exec(appendParagraphCommand);
  }, [affineEditorContainerProxy.host?.std, page, readonly, shared]);

  useEffect(() => {
    const editorContainer = rootRef.current;
    if (editorContainer) {
      const handleMiddleClick = (e: MouseEvent) => {
        if (
          e.target instanceof HTMLElement &&
          (e.target.closest('affine-reference') ||
            e.target.closest('affine-link'))
        ) {
          return;
        }
        if (!enableMiddleClickPaste && IS_LINUX && e.button === 1) {
          e.preventDefault();
        }
      };
      editorContainer.addEventListener('pointerup', handleMiddleClick, {
        capture: true,
      });
      editorContainer.addEventListener('auxclick', handleMiddleClick, {
        capture: true,
      });
      return () => {
        editorContainer?.removeEventListener('pointerup', handleMiddleClick, {
          capture: true,
        });
        editorContainer?.removeEventListener('auxclick', handleMiddleClick, {
          capture: true,
        });
      };
    }
    return;
  }, [enableMiddleClickPaste]);

  useEffect(() => {
    const record = docsService.list.doc$(page.id).value;
    const properties = record?.getProperties() as Record<
      string,
      unknown
    > | null;
    const isAttachmentTrashDoc = Boolean(
      properties?.[ATTACHMENT_TRASH_CUSTOM_PROPERTY]
    );
    if (isAttachmentTrashDoc) {
      return;
    }

    // Listen for the attachment trash event dispatched from the block component
    const handleAttachmentTrash = (event: Event) => {
      const customEvent = event as CustomEvent<AttachmentTrashEventDetail>;
      createAttachmentTrashDoc(customEvent.detail).catch(console.error);
    };

    // Use a timeout to ensure the editor host is available
    const timeoutId = setTimeout(() => {
      const editorHost = affineEditorContainerProxy?.host;
      if (editorHost) {
        editorHost.addEventListener(
          ATTACHMENT_TRASH_EVENT as any,
          handleAttachmentTrash
        );
      }
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      const editorHost = affineEditorContainerProxy?.host;
      if (editorHost) {
        editorHost.removeEventListener(
          ATTACHMENT_TRASH_EVENT as any,
          handleAttachmentTrash
        );
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affineEditorContainerProxy?.host, createAttachmentTrashDoc, page.id]);

  // Disabled: Attachment restoration is now handled directly in the trash page UI
  // This subscription was causing the trash doc to appear in "All docs" briefly
  // useEffect(() => {
  //   const subscriptions = attachmentRestoreSubscriptions.current;
  //   const docsSubscription = docsService.list.docs$.subscribe(records => {
  //     const seen = new Set<string>();

  //     records.forEach(record => {
  //       const properties = record.getProperties() as Record<string, unknown>;
  //       const hasMetadata = Boolean(
  //         properties[ATTACHMENT_TRASH_CUSTOM_PROPERTY]
  //       );

  //       if (hasMetadata) {
  //         if (!subscriptions.has(record.id)) {
  //           const sub = record.trash$.subscribe(isTrashed => {
  //             if (!isTrashed) {
  //               restoreAttachmentFromTrashDoc(record).catch(console.error);
  //             }
  //           });
  //           subscriptions.set(record.id, () => sub.unsubscribe());
  //         }
  //       } else if (subscriptions.has(record.id)) {
  //         subscriptions.get(record.id)!();
  //         subscriptions.delete(record.id);
  //       }

  //       seen.add(record.id);
  //     });

  //     for (const id of Array.from(subscriptions.keys())) {
  //       if (!seen.has(id)) {
  //         subscriptions.get(id)!();
  //         subscriptions.delete(id);
  //       }
  //     }
  //   });

  //   return () => {
  //     docsSubscription.unsubscribe();
  //     subscriptions.forEach(dispose => dispose());
  //     subscriptions.clear();
  //   };
  // }, [docsService, restoreAttachmentFromTrashDoc]);

  useEffect(() => {
    const editor = affineEditorContainerProxy;
    globalThis.currentEditor = editor;
    const disposableGroup = new DisposableGroup();
    let canceled = false;

    // provide image proxy endpoint to blocksuite
    const imageProxyUrl = new URL(
      BUILD_CONFIG.imageProxyUrl,
      server.baseUrl
    ).toString();

    editor.std.clipboard.use(customImageProxyMiddleware(imageProxyUrl));
    page.get(ImageProxyService).setImageProxyURL(imageProxyUrl);

    editor.updateComplete
      .then(() => {
        if (onEditorReady && !canceled) {
          const dispose = onEditorReady(editor);
          if (dispose) {
            disposableGroup.add(dispose);
          }
        }
      })
      .catch(error => {
        console.error('Error updating editor', error);
      });

    return () => {
      canceled = true;
      disposableGroup.dispose();
    };
  }, [affineEditorContainerProxy, onEditorReady, page, server]);

  return (
    <div
      {...props}
      data-testid={`editor-${page.id}`}
      dir={enableEditorRTL ? 'rtl' : 'ltr'}
      className={clsx(
        `editor-wrapper ${mode}-mode`,
        styles.docEditorRoot,
        className
      )}
      style={style}
      data-affine-editor-container
      ref={rootRef}
    >
      {mode === 'page' ? (
        <BlocksuiteDocEditor
          shared={shared}
          page={page}
          ref={docRef}
          readonly={readonly}
          titleRef={docTitleRef}
          onClickBlank={handleClickPageModeBlank}
          defaultOpenProperty={defaultOpenProperty}
        />
      ) : (
        <BlocksuiteEdgelessEditor
          shared={shared}
          page={page}
          ref={edgelessRef}
        />
      )}
    </div>
  );
};

function cloneAttachmentProps(props: Record<string, unknown>) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(props);
    } catch (error) {
      console.warn('structuredClone failed for attachment props', error);
    }
  }
  return JSON.parse(JSON.stringify(props));
}

// Note: resolveAttachmentParent removed as it's no longer used in this file
// It's duplicated in packages/frontend/core/src/components/explorer/docs-view/quick-actions.tsx
// where attachment restoration logic is now handled

export const BlockSuiteEditor = (props: EditorProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [longerLoading, setLongerLoading] = useState(false);
  // eslint-disable-next-line react-hooks/purity
  const [loadStartTime] = useState(Date.now());
  const workspaceService = useService(WorkspaceService);

  const editorSetting = useService(EditorSettingService).editorSetting;
  const settings = useLiveData(
    editorSetting.settings$.selector(s => ({
      fontFamily: s.fontFamily,
      customFontFamily: s.customFontFamily,
      fullWidthLayout: s.fullWidthLayout,
    }))
  );
  const fontFamily = useMemo(() => {
    const fontStyle = fontStyleOptions.find(
      option => option.key === settings.fontFamily
    );
    if (!fontStyle) {
      return cssVar('fontSansFamily');
    }
    const customFontFamily = settings.customFontFamily;

    return customFontFamily && fontStyle.key === 'Custom'
      ? `${customFontFamily}, ${fontStyle.value}`
      : fontStyle.value;
  }, [settings.customFontFamily, settings.fontFamily]);

  useEffect(() => {
    if (props.page.root) {
      setIsLoading(false);
      return;
    }

    const disposable = props.page.slots.rootAdded.subscribe(() => {
      disposable.unsubscribe();
      setIsLoading(false);
      setLongerLoading(false);
    });
    return () => {
      disposable.unsubscribe();
    };
  }, [loadStartTime, props.page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isLoading) {
        setLongerLoading(true);
      }
    }, 20 * 1000);
    const reportErrorTimer = setTimeout(() => {
      if (isLoading) {
        track.doc.$.$.loadDoc({
          workspaceId: props.page.workspace.id,
          docId: props.page.id,
          time: Date.now() - loadStartTime,
          success: false,
        });
      }
    }, 60 * 1000);
    return () => {
      clearTimeout(timer);
      clearTimeout(reportErrorTimer);
    };
  }, [isLoading, loadStartTime, props.page]);

  useEffect(() => {
    workspaceService.workspace.engine.doc
      .waitForDocLoaded(props.page.id)
      .then(() => {
        track.doc.$.$.loadDoc({
          workspaceId: props.page.workspace.id,
          docId: props.page.id,
          time: Date.now() - loadStartTime,
          success: true,
        });
      })
      .catch(() => {
        track.doc.$.$.loadDoc({
          workspaceId: props.page.workspace.id,
          docId: props.page.id,
          time: Date.now() - loadStartTime,
          success: false,
        });
      });
  }, [loadStartTime, props.page, workspaceService]);

  return (
    <Slot style={{ '--affine-font-family': fontFamily } as CSSProperties}>
      {isLoading ? (
        <EditorLoading longerLoading={longerLoading} />
      ) : (
        <BlockSuiteEditorImpl key={props.page.id} {...props} />
      )}
    </Slot>
  );
};
