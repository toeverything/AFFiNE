import {
  type ElementOrFactory,
  Input,
  notify,
  toast,
  type ToastOptions,
  toReactNode,
  type useConfirmModal,
} from '@affine/component';
import { track } from '@affine/core/mixpanel';
import { DocsSearchService } from '@affine/core/modules/docs-search';
import { resolveLinkToDoc } from '@affine/core/modules/navigation';
import type { PeekViewService } from '@affine/core/modules/peek-view';
import type { ActivePeekView } from '@affine/core/modules/peek-view/entities/peek-view';
import {
  CreationQuickSearchSession,
  DocsQuickSearchSession,
  type QuickSearchItem,
  QuickSearchService,
  RecentDocsQuickSearchSession,
} from '@affine/core/modules/quicksearch';
import { DebugLogger } from '@affine/debug';
import type { BlockSpec, WidgetComponent } from '@blocksuite/block-std';
import {
  type AffineReference,
  AffineSlashMenuWidget,
  EdgelessRootBlockComponent,
  EmbedLinkedDocBlockComponent,
  type ParagraphBlockService,
  type RootService,
} from '@blocksuite/blocks';
import { LinkIcon } from '@blocksuite/icons/rc';
import { AIChatBlockSchema } from '@blocksuite/presets';
import type { BlockSnapshot } from '@blocksuite/store';
import {
  type DocMode,
  type DocService,
  DocsService,
  type FrameworkProvider,
} from '@toeverything/infra';
import { type TemplateResult } from 'lit';
import { customElement } from 'lit/decorators.js';
import { literal } from 'lit/static-html.js';

export type ReferenceReactRenderer = (
  reference: AffineReference
) => React.ReactElement;

const logger = new DebugLogger('affine::spec-patchers');

function patchSpecService<Spec extends BlockSpec>(
  spec: Spec,
  onMounted: (
    service: Spec extends BlockSpec<any, infer BlockService>
      ? BlockService
      : never
  ) => (() => void) | void,
  onWidgetConnected?: (component: WidgetComponent) => void
) {
  const oldSetup = spec.setup;
  spec.setup = (slots, disposableGroup) => {
    oldSetup?.(slots, disposableGroup);
    disposableGroup.add(
      slots.mounted.on(({ service }) => {
        const disposable = onMounted(service as any);
        if (disposable) {
          disposableGroup.add(disposable);
        }
      })
    );

    onWidgetConnected &&
      disposableGroup.add(
        slots.widgetConnected.on(({ component }) => {
          onWidgetConnected(component);
        })
      );
  };
  return spec;
}

/**
 * Patch the block specs with custom renderers.
 */
export function patchReferenceRenderer(
  specs: BlockSpec[],
  reactToLit: (element: ElementOrFactory) => TemplateResult,
  reactRenderer: ReferenceReactRenderer
) {
  const litRenderer = (reference: AffineReference) => {
    const node = reactRenderer(reference);
    return reactToLit(node);
  };

  return specs.map(spec => {
    if (
      ['affine:paragraph', 'affine:list', 'affine:database'].includes(
        spec.schema.model.flavour
      )
    ) {
      spec = patchSpecService(
        spec as BlockSpec<string, ParagraphBlockService>,
        service => {
          service.referenceNodeConfig.setCustomContent(litRenderer);
          return () => {
            service.referenceNodeConfig.setCustomContent(null);
          };
        }
      );
    }

    return spec;
  });
}

export function patchNotificationService(
  specs: BlockSpec[],
  { closeConfirmModal, openConfirmModal }: ReturnType<typeof useConfirmModal>
) {
  const rootSpec = specs.find(
    spec => spec.schema.model.flavour === 'affine:page'
  ) as BlockSpec<string, RootService>;

  if (!rootSpec) {
    return specs;
  }

  patchSpecService(rootSpec, service => {
    service.notificationService = {
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
    };
  });
  return specs;
}

export function patchPeekViewService(
  specs: BlockSpec[],
  service: PeekViewService
) {
  const rootSpec = specs.find(
    spec => spec.schema.model.flavour === 'affine:page'
  ) as BlockSpec<string, RootService>;

  if (!rootSpec) {
    return specs;
  }

  patchSpecService(rootSpec, pageService => {
    pageService.peekViewService = {
      peek: (target: ActivePeekView['target'], template?: TemplateResult) => {
        logger.debug('center peek', target, template);
        return service.peekView.open(target, template);
      },
    };
  });

  return specs;
}

export function patchDocModeService(
  specs: BlockSpec[],
  docService: DocService,
  docsService: DocsService
) {
  const rootSpec = specs.find(
    spec => spec.schema.model.flavour === 'affine:page'
  ) as BlockSpec<string, RootService>;

  if (!rootSpec) {
    return specs;
  }

  patchSpecService(rootSpec, pageService => {
    const DEFAULT_MODE = 'page';
    pageService.docModeService = {
      setMode: (mode: DocMode, id?: string) => {
        if (id) {
          docsService.list.setMode(id, mode);
        } else {
          docService.doc.setMode(mode);
        }
      },
      getMode: (id?: string) => {
        const mode = id
          ? docsService.list.getMode(id)
          : docService.doc.getMode();
        return mode || DEFAULT_MODE;
      },
      toggleMode: (id?: string) => {
        const mode = id
          ? docsService.list.toggleMode(id)
          : docService.doc.toggleMode();
        return mode || DEFAULT_MODE;
      },
      onModeChange: (handler: (mode: DocMode) => void, id?: string) => {
        // eslint-disable-next-line rxjs/finnish
        const mode$ = id
          ? docsService.list.observeMode(id)
          : docService.doc.observeMode();
        const sub = mode$.subscribe(m => handler(m || DEFAULT_MODE));
        return {
          dispose: sub.unsubscribe,
        };
      },
    };
  });

  return specs;
}

export function patchQuickSearchService(
  specs: BlockSpec[],
  framework: FrameworkProvider
) {
  const rootSpec = specs.find(
    spec => spec.schema.model.flavour === 'affine:page'
  ) as BlockSpec<string, RootService>;

  if (!rootSpec) {
    return specs;
  }

  patchSpecService(
    rootSpec,
    pageService => {
      pageService.quickSearchService = {
        async searchDoc(options) {
          let searchResult:
            | { docId: string; isNewDoc?: boolean }
            | { userInput: string }
            | null = null;
          if (options.skipSelection) {
            const query = options.userInput;
            if (!query) {
              logger.error('No user input provided');
            } else {
              const resolvedDoc = resolveLinkToDoc(query);
              if (resolvedDoc) {
                searchResult = {
                  docId: resolvedDoc.docId,
                };
              } else if (
                query.startsWith('http://') ||
                query.startsWith('https://')
              ) {
                searchResult = {
                  userInput: query,
                };
              } else {
                const searchedDoc = (
                  await framework.get(DocsSearchService).search(query)
                ).at(0);
                if (searchedDoc) {
                  searchResult = {
                    docId: searchedDoc.docId,
                  };
                }
              }
            }
          } else {
            searchResult = await new Promise(resolve =>
              framework.get(QuickSearchService).quickSearch.show(
                [
                  framework.get(RecentDocsQuickSearchSession),
                  framework.get(DocsQuickSearchSession),
                  framework.get(CreationQuickSearchSession),
                  (query: string) => {
                    if (
                      (query.startsWith('http://') ||
                        query.startsWith('https://')) &&
                      resolveLinkToDoc(query) === null
                    ) {
                      return [
                        {
                          id: 'link',
                          source: 'link',
                          icon: LinkIcon,
                          label: {
                            key: 'com.affine.cmdk.affine.insert-link',
                          },
                          payload: { url: query },
                        } as QuickSearchItem<'link', { url: string }>,
                      ];
                    }
                    return [];
                  },
                ],
                result => {
                  if (result === null) {
                    resolve(null);
                    return;
                  }
                  if (
                    result.source === 'docs' ||
                    result.source === 'recent-doc'
                  ) {
                    resolve({
                      docId: result.payload.docId,
                    });
                  } else if (result.source === 'link') {
                    resolve({
                      userInput: result.payload.url,
                    });
                  } else if (result.source === 'creation') {
                    const docsService = framework.get(DocsService);
                    const mode =
                      result.id === 'creation:create-edgeless'
                        ? 'edgeless'
                        : 'page';
                    const newDoc = docsService.createDoc({
                      mode,
                      title: result.payload.title,
                    });
                    resolve({
                      docId: newDoc.id,
                      isNewDoc: true,
                    });
                  }
                },
                {
                  defaultQuery: options.userInput,
                  label: {
                    key: 'com.affine.cmdk.insert-links',
                  },
                  placeholder: {
                    key: 'com.affine.cmdk.docs.placeholder',
                  },
                }
              )
            );
          }

          return searchResult;
        },
      };
    },
    (component: WidgetComponent) => {
      if (component instanceof AffineSlashMenuWidget) {
        component.config.items.forEach(item => {
          if (
            'action' in item &&
            (item.name === 'Linked Doc' || item.name === 'Link')
          ) {
            const oldAction = item.action;
            item.action = async ({ model, rootComponent }) => {
              const { host, service, std } = rootComponent;
              const { quickSearchService } = service;

              if (!quickSearchService)
                return oldAction({ model, rootComponent });

              const result = await quickSearchService.searchDoc({});
              if (result === null) return;

              if ('docId' in result) {
                const linkedDoc = std.collection.getDoc(result.docId);
                if (!linkedDoc) return;

                host.doc.addSiblingBlocks(model, [
                  {
                    flavour: 'affine:embed-linked-doc',
                    pageId: linkedDoc.id,
                  },
                ]);
                if (result.isNewDoc) {
                  track.doc.editor.slashMenu.createDoc({ control: 'linkDoc' });
                  track.doc.editor.slashMenu.linkDoc({ control: 'createDoc' });
                }
                track.doc.editor.slashMenu.linkDoc({ control: 'linkDoc' });
              } else if ('userInput' in result) {
                const embedOptions = service.getEmbedBlockOptions(
                  result.userInput
                );
                if (!embedOptions) return;

                host.doc.addSiblingBlocks(model, [
                  {
                    flavour: embedOptions.flavour,
                    url: result.userInput,
                  },
                ]);
              }
            };
          }
        });
      }
    }
  );

  return specs;
}

export function patchEdgelessClipboard(specs: BlockSpec[]) {
  const rootSpec = specs.find(
    spec => spec.schema.model.flavour === 'affine:page'
  ) as BlockSpec<string, RootService>;

  if (!rootSpec) {
    return specs;
  }

  const oldSetup = rootSpec.setup;
  rootSpec.setup = (slots, disposableGroup) => {
    oldSetup?.(slots, disposableGroup);
    disposableGroup.add(
      slots.viewConnected.on(view => {
        const component = view.component;
        if (component instanceof EdgelessRootBlockComponent) {
          const AIChatBlockFlavour = AIChatBlockSchema.model.flavour;
          const createFunc = (blocks: BlockSnapshot[]) => {
            const blockIds = blocks.map(({ props }) => {
              const {
                xywh,
                scale,
                messages,
                sessionId,
                rootDocId,
                rootWorkspaceId,
              } = props;
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
            });
            return blockIds;
          };
          component.clipboardController.registerBlock(
            AIChatBlockFlavour,
            createFunc
          );
        }
      })
    );
  };

  return specs;
}

@customElement('affine-linked-doc-ref-block')
// @ts-expect-error ignore private warning for overriding _load
export class LinkedDocBlockComponent extends EmbedLinkedDocBlockComponent {
  override async _load() {
    this.isBannerEmpty = true;
  }
}

export function patchForSharedPage(specs: BlockSpec[]) {
  return specs.map(spec => {
    const linkedDocNames = [
      'affine:embed-linked-doc',
      'affine:embed-synced-doc',
    ];

    if (linkedDocNames.includes(spec.schema.model.flavour)) {
      spec = {
        ...spec,
        view: {
          component: literal`affine-linked-doc-ref-block`,
          widgets: {},
        },
      };
    }
    return spec;
  });
}
