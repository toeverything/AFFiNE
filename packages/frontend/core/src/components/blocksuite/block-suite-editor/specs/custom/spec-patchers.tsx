import {
  type ElementOrFactory,
  Input,
  notify,
  toast,
  type ToastOptions,
  toReactNode,
  type useConfirmModal,
} from '@affine/component';
import type { EditorService } from '@affine/core/modules/editor';
import { EditorSettingService } from '@affine/core/modules/editor-settting';
import { resolveLinkToDoc } from '@affine/core/modules/navigation';
import type { PeekViewService } from '@affine/core/modules/peek-view';
import type { ActivePeekView } from '@affine/core/modules/peek-view/entities/peek-view';
import {
  CreationQuickSearchSession,
  DocsQuickSearchSession,
  LinksQuickSearchSession,
  QuickSearchService,
  RecentDocsQuickSearchSession,
} from '@affine/core/modules/quicksearch';
import { ExternalLinksQuickSearchSession } from '@affine/core/modules/quicksearch/impls/external-links';
import { DebugLogger } from '@affine/debug';
import { track } from '@affine/track';
import {
  type BlockService,
  BlockViewIdentifier,
  type ExtensionType,
  type WidgetComponent,
} from '@blocksuite/block-std';
import { BlockServiceWatcher } from '@blocksuite/block-std';
import type {
  AffineReference,
  DocMode,
  DocModeProvider,
  QuickSearchResult,
  RootService,
} from '@blocksuite/blocks';
import {
  AffineSlashMenuWidget,
  DocModeExtension,
  EdgelessRootBlockComponent,
  EmbedLinkedDocBlockComponent,
  NotificationExtension,
  ParseDocUrlExtension,
  PeekViewExtension,
  QuickSearchExtension,
  ReferenceNodeConfigExtension,
} from '@blocksuite/blocks';
import { type BlockSnapshot, Text } from '@blocksuite/store';
import {
  AIChatBlockSchema,
  type DocProps,
  type DocService,
  DocsService,
  type FrameworkProvider,
  WorkspaceService,
} from '@toeverything/infra';
import { type TemplateResult } from 'lit';
import { customElement } from 'lit/decorators.js';
import { literal } from 'lit/static-html.js';
import { pick } from 'lodash-es';

export type ReferenceReactRenderer = (
  reference: AffineReference
) => React.ReactElement;

const logger = new DebugLogger('affine::spec-patchers');

function patchSpecService<Service extends BlockService = BlockService>(
  flavour: string,
  onMounted: (service: Service) => (() => void) | void,
  onWidgetConnected?: (component: WidgetComponent) => void
) {
  class TempServiceWatcher extends BlockServiceWatcher {
    static override readonly flavour = flavour;
    override mounted() {
      super.mounted();
      const disposable = onMounted(this.blockService as any);
      const disposableGroup = this.blockService.disposables;
      if (disposable) {
        disposableGroup.add(disposable);
      }

      if (onWidgetConnected) {
        disposableGroup.add(
          this.blockService.specSlots.widgetConnected.on(({ component }) => {
            onWidgetConnected(component);
          })
        );
      }
    }
  }
  return TempServiceWatcher;
}

/**
 * Patch the block specs with custom renderers.
 */
export function patchReferenceRenderer(
  reactToLit: (element: ElementOrFactory) => TemplateResult,
  reactRenderer: ReferenceReactRenderer
): ExtensionType {
  const litRenderer = (reference: AffineReference) => {
    const node = reactRenderer(reference);
    return reactToLit(node);
  };

  return ReferenceNodeConfigExtension({
    customContent: litRenderer,
  });
}

export function patchNotificationService({
  closeConfirmModal,
  openConfirmModal,
}: ReturnType<typeof useConfirmModal>) {
  return NotificationExtension({
    confirm: async ({ title, message, confirmText, cancelText, abort }) => {
      return new Promise<boolean>(resolve => {
        openConfirmModal({
          title: toReactNode(title),
          description: toReactNode(message),
          confirmText,
          confirmButtonOptions: {
            variant: 'primary',
          },
          cancelText,
          onConfirm: () => {
            resolve(true);
          },
          onCancel: () => {
            resolve(false);
          },
        });
        abort?.addEventListener('abort', () => {
          resolve(false);
          closeConfirmModal();
        });
      });
    },
    prompt: async ({
      title,
      message,
      confirmText,
      placeholder,
      cancelText,
      autofill,
      abort,
    }) => {
      return new Promise<string | null>(resolve => {
        let value = autofill || '';
        const description = (
          <div>
            <span style={{ marginBottom: 12 }}>{toReactNode(message)}</span>
            <Input
              placeholder={placeholder}
              defaultValue={value}
              onChange={e => (value = e)}
              ref={input => input?.select()}
            />
          </div>
        );
        openConfirmModal({
          title: toReactNode(title),
          description: description,
          confirmText: confirmText ?? 'Confirm',
          confirmButtonOptions: {
            variant: 'primary',
          },
          cancelText: cancelText ?? 'Cancel',
          onConfirm: () => {
            resolve(value);
          },
          onCancel: () => {
            resolve(null);
          },
        });
        abort?.addEventListener('abort', () => {
          resolve(null);
          closeConfirmModal();
        });
      });
    },
    toast: (message: string, options: ToastOptions) => {
      return toast(message, options);
    },
    notify: notification => {
      const accentToNotify = {
        error: notify.error,
        success: notify.success,
        warning: notify.warning,
        info: notify,
      };

      const fn = accentToNotify[notification.accent || 'info'];
      if (!fn) {
        throw new Error('Invalid notification accent');
      }

      const toastId = fn(
        {
          title: toReactNode(notification.title),
          message: toReactNode(notification.message),
          action: notification.action?.onClick
            ? {
                label: toReactNode(notification.action?.label),
                onClick: notification.action.onClick,
              }
            : undefined,
          onDismiss: notification.onClose,
        },
        {
          duration: notification.duration || 0,
          onDismiss: notification.onClose,
          onAutoClose: notification.onClose,
        }
      );

      notification.abort?.addEventListener('abort', () => {
        notify.dismiss(toastId);
      });
    },
  });
}

export function patchPeekViewService(service: PeekViewService) {
  return PeekViewExtension({
    peek: (target: ActivePeekView['target'], template?: TemplateResult) => {
      logger.debug('center peek', target, template);
      return service.peekView.open(target, template);
    },
  });
}

export function patchDocModeService(
  docService: DocService,
  docsService: DocsService,
  editorService: EditorService
): ExtensionType {
  const DEFAULT_MODE = 'page';
  class AffineDocModeService implements DocModeProvider {
    setEditorMode = (mode: DocMode) => {
      editorService.editor.setMode(mode);
    };
    getEditorMode = () => {
      return editorService.editor.mode$.value;
    };
    setPrimaryMode = (mode: DocMode, id?: string) => {
      if (id) {
        docsService.list.setPrimaryMode(id, mode);
      } else {
        docService.doc.setPrimaryMode(mode);
      }
    };
    getPrimaryMode = (id?: string) => {
      const mode = id
        ? docsService.list.getPrimaryMode(id)
        : docService.doc.getPrimaryMode();
      return (mode || DEFAULT_MODE) as DocMode;
    };
    togglePrimaryMode = (id?: string) => {
      const mode = id
        ? docsService.list.togglePrimaryMode(id)
        : docService.doc.togglePrimaryMode();
      return (mode || DEFAULT_MODE) as DocMode;
    };
    onPrimaryModeChange = (handler: (mode: DocMode) => void, id?: string) => {
      // eslint-disable-next-line rxjs/finnish
      const mode$ = id
        ? docsService.list.primaryMode$(id)
        : docService.doc.primaryMode$;
      const sub = mode$.subscribe(m => handler((m || DEFAULT_MODE) as DocMode));
      return {
        dispose: sub.unsubscribe,
      };
    };
  }

  const docModeExtension = DocModeExtension(new AffineDocModeService());

  return docModeExtension;
}

export function patchQuickSearchService(framework: FrameworkProvider) {
  const QuickSearch = QuickSearchExtension({
    async openQuickSearch() {
      let searchResult: QuickSearchResult = null;
      searchResult = await new Promise(resolve =>
        framework.get(QuickSearchService).quickSearch.show(
          [
            framework.get(RecentDocsQuickSearchSession),
            framework.get(CreationQuickSearchSession),
            framework.get(DocsQuickSearchSession),
            framework.get(LinksQuickSearchSession),
            framework.get(ExternalLinksQuickSearchSession),
          ],
          result => {
            if (result === null) {
              resolve(null);
              return;
            }

            if (result.source === 'docs') {
              resolve({
                docId: result.payload.docId,
              });
              return;
            }

            if (result.source === 'recent-doc') {
              resolve({
                docId: result.payload.docId,
              });
              return;
            }

            if (result.source === 'link') {
              resolve({
                docId: result.payload.docId,
                params: pick(result.payload, [
                  'mode',
                  'blockIds',
                  'elementIds',
                ]),
              });
              return;
            }

            if (result.source === 'external-link') {
              const externalUrl = result.payload.url;
              resolve({ externalUrl });
              return;
            }

            if (result.source === 'creation') {
              const docsService = framework.get(DocsService);
              const editorSettingService = framework.get(EditorSettingService);
              const mode =
                result.id === 'creation:create-edgeless' ? 'edgeless' : 'page';
              const docProps: DocProps = {
                page: { title: new Text(result.payload.title) },
                note: editorSettingService.editorSetting.get('affine:note'),
              };
              const newDoc = docsService.createDoc({
                primaryMode: mode,
                docProps,
              });

              resolve({ docId: newDoc.id });
              return;
            }
          },
          {
            label: {
              key: 'com.affine.cmdk.insert-links',
            },
            placeholder: {
              key: 'com.affine.cmdk.docs.placeholder',
            },
          }
        )
      );

      return searchResult;
    },
  });

  const SlashMenuQuickSearchExtension = patchSpecService<RootService>(
    'affine:page',
    () => {},
    (component: WidgetComponent) => {
      if (component instanceof AffineSlashMenuWidget) {
        component.config.items.forEach(item => {
          if (
            'action' in item &&
            (item.name === 'Linked Doc' || item.name === 'Link')
          ) {
            item.action = async ({ rootComponent }) => {
              // TODO(@Mirone): fix the type
              // @ts-expect-error fixme
              const { success, insertedLinkType } =
                // @ts-expect-error fixme
                rootComponent.std.command.exec('insertLinkByQuickSearch');

              if (!success) return;

              // TODO(@Mirone): fix the type
              insertedLinkType
                ?.then(
                  (type: {
                    flavour?: 'affine:embed-linked-doc' | 'affine:bookmark';
                  }) => {
                    const flavour = type?.flavour;
                    if (!flavour) return;

                    if (flavour === 'affine:embed-linked-doc') {
                      track.doc.editor.slashMenu.linkDoc({
                        control: 'linkDoc',
                      });
                      return;
                    }

                    if (flavour === 'affine:bookmark') {
                      track.doc.editor.slashMenu.bookmark();
                      return;
                    }
                  }
                )
                .catch(console.error);
            };
          }
        });
      }
    }
  );
  return [QuickSearch, SlashMenuQuickSearchExtension];
}

export function patchParseDocUrlExtension(framework: FrameworkProvider) {
  const workspaceService = framework.get(WorkspaceService);
  const ParseDocUrl = ParseDocUrlExtension({
    parseDocUrl(url) {
      const info = resolveLinkToDoc(url);
      if (!info || info.workspaceId !== workspaceService.workspace.id) return;

      return {
        docId: info.docId,
        blockIds: info.blockIds,
        elementIds: info.elementIds,
        mode: info.mode,
      };
    },
  });

  return [ParseDocUrl];
}

export function patchEdgelessClipboard() {
  class EdgelessClipboardWatcher extends BlockServiceWatcher {
    static override readonly flavour = 'affine:page';

    override mounted() {
      super.mounted();
      this.blockService.disposables.add(
        this.blockService.specSlots.viewConnected.on(view => {
          const { component } = view;
          if (component instanceof EdgelessRootBlockComponent) {
            const AIChatBlockFlavour = AIChatBlockSchema.model.flavour;
            const createFunc = (block: BlockSnapshot) => {
              const {
                xywh,
                scale,
                messages,
                sessionId,
                rootDocId,
                rootWorkspaceId,
              } = block.props;
              const blockId = component.service.addBlock(
                AIChatBlockFlavour,
                {
                  xywh,
                  scale,
                  messages,
                  sessionId,
                  rootDocId,
                  rootWorkspaceId,
                },
                component.surface.model.id
              );
              return blockId;
            };
            component.clipboardController.registerBlock(
              AIChatBlockFlavour,
              createFunc
            );
          }
        })
      );
    }
  }

  return EdgelessClipboardWatcher;
}

@customElement('affine-linked-doc-ref-block')
export class LinkedDocBlockComponent extends EmbedLinkedDocBlockComponent {
  override getInitialState() {
    return {
      loading: false,
      isBannerEmpty: true,
    };
  }
}

export function patchForSharedPage() {
  const extension: ExtensionType = {
    setup: di => {
      di.override(
        BlockViewIdentifier('affine:embed-linked-doc'),
        () => literal`affine-linked-doc-ref-block`
      );
      di.override(
        BlockViewIdentifier('affine:embed-synced-doc'),
        () => literal`affine-linked-doc-ref-block`
      );
    },
  };
  return extension;
}
