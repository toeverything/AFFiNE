import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { DropIndicator } from '@blocksuite/affine-components/drop-indicator';
import { PeekViewProvider } from '@blocksuite/affine-components/peek';
import { toast } from '@blocksuite/affine-components/toast';
import type { DatabaseBlockModel } from '@blocksuite/affine-model';
import { EDGELESS_TOP_CONTENTEDITABLE_SELECTOR } from '@blocksuite/affine-shared/consts';
import {
  BlockCommentManager,
  CommentProviderIdentifier,
  DocModeProvider,
  NotificationProvider,
  type TelemetryEventMap,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import { getDropResult } from '@blocksuite/affine-widget-drag-handle';
import {
  createRecordDetail,
  createUniComponentFromWebComponent,
  DataViewRootUILogic,
  type DataViewSelection,
  type DataViewUILogicBase,
  type DataViewWidget,
  type DataViewWidgetProps,
  defineUniComponent,
  ExternalGroupByConfigProvider,
  lazy,
  renderUniLit,
  type SingleView,
  uniMap,
} from '@blocksuite/data-view';
import { widgetPresets } from '@blocksuite/data-view/widget-presets';
import { Rect } from '@blocksuite/global/gfx';
import {
  CommentIcon,
  CopyIcon,
  DeleteIcon,
  MoreHorizontalIcon,
} from '@blocksuite/icons/lit';
import { type BlockComponent, BlockSelection } from '@blocksuite/std';
import { RANGE_SYNC_EXCLUDE_ATTR } from '@blocksuite/std/inline';
import { Slice } from '@blocksuite/store';
import { autoUpdate } from '@floating-ui/dom';
import { computed, signal } from '@preact/signals-core';
import { html, nothing } from 'lit';

import { popSideDetail } from './components/layout.js';
import { DatabaseConfigExtension } from './config.js';
import { EditorHostKey } from './context/host-context.js';
import { DatabaseBlockDataSource } from './data-source.js';
import {
  databaseBlockStyles,
  databaseContentStyles,
  databaseHeaderBarStyles,
  databaseHeaderContainerStyles,
  databaseOpsStyles,
  databaseTitleRowStyles,
  databaseTitleStyles,
  databaseToolbarRowStyles,
  databaseViewBarContainerStyles,
} from './database-block-styles.js';
import { BlockRenderer } from './detail-panel/block-renderer.js';
import { NoteRenderer } from './detail-panel/note-renderer.js';
import { DatabaseSelection } from './selection.js';
import { currentViewStorage } from './utils/current-view.js';
import { getSingleDocIdFromText } from './utils/title-doc.js';
import type { DatabaseViewExtensionOptions } from './view';

export class DatabaseBlockComponent extends CaptionedBlockComponent<DatabaseBlockModel> {
  private readonly clickDatabaseOps = (e: MouseEvent) => {
    const options = this.optionsConfig.configure(this.model, {
      items: [
        menu.input({
          initialValue: this.model.props.title.toString(),
          placeholder: 'Database title',
          onChange: text => {
            this.model.props.title.replace(
              0,
              this.model.props.title.length,
              text
            );
          },
        }),
        menu.action({
          prefix: CommentIcon(),
          name: 'Comment',
          hide: () => !this.std.getOptional(CommentProviderIdentifier),
          select: () => {
            this.std.getOptional(CommentProviderIdentifier)?.addComment([
              new BlockSelection({
                blockId: this.blockId,
              }),
            ]);
          },
        }),
        menu.action({
          prefix: CopyIcon(),
          name: 'Copy',
          select: () => {
            const slice = Slice.fromModels(this.store, [this.model]);
            this.std.clipboard
              .copySlice(slice)
              .then(() => {
                toast(this.host, 'Copied to clipboard');
              })
              .catch(console.error);
          },
        }),
        menu.group({
          items: [
            menu.action({
              prefix: DeleteIcon(),
              class: {
                'delete-item': true,
              },
              name: 'Delete Database',
              select: () => {
                this.model.children.slice().forEach(block => {
                  this.store.deleteBlock(block);
                });
                this.store.deleteBlock(this.model);
              },
            }),
          ],
        }),
      ],
    });

    popMenu(popupTargetFromElement(e.currentTarget as HTMLElement), {
      options,
    });
  };

  private readonly dataSource = lazy(() => {
    const dataSource = new DatabaseBlockDataSource(this.model, dataSource => {
      dataSource.serviceSet(EditorHostKey, this.host);
      this.std.provider
        .getAll(ExternalGroupByConfigProvider)
        .forEach(config => {
          dataSource.serviceSet(
            ExternalGroupByConfigProvider(config.name),
            config
          );
        });
    });
    const id = currentViewStorage.getCurrentView(this.model.id);
    if (id && dataSource.viewManager.viewGet(id)) {
      dataSource.viewManager.setCurrentView(id);
    }
    return dataSource;
  });

  private readonly renderTitle = (dataViewLogic: DataViewUILogicBase) => {
    return html` <affine-database-title
      class="${databaseTitleStyles}"
      .titleText="${this.model.props.title}"
      .dataViewLogic="${dataViewLogic}"
    ></affine-database-title>`;
  };

  createTemplate = (
    data: {
      view: SingleView;
      rowId: string;
    },
    openDoc: (docId: string) => void
  ) => {
    return createRecordDetail({
      ...data,
      openDoc,
      detail: {
        header: uniMap(
          createUniComponentFromWebComponent(BlockRenderer),
          props => ({
            ...props,
            host: this.host,
          })
        ),
        note: uniMap(
          createUniComponentFromWebComponent(NoteRenderer),
          props => ({
            ...props,
            model: this.model,
            host: this.host,
          })
        ),
      },
    });
  };

  headerWidget: DataViewWidget = defineUniComponent(
    (props: DataViewWidgetProps) => {
      return html`
        <div class="${databaseHeaderContainerStyles}">
          <div class="${databaseTitleRowStyles}">
            ${this.renderTitle(props.dataViewLogic)} ${this.renderDatabaseOps()}
          </div>
          <div class="${databaseToolbarRowStyles} ${databaseHeaderBarStyles}">
            <div class="${databaseViewBarContainerStyles}">
              ${renderUniLit(widgetPresets.viewBar, {
                ...props,
                onChangeView: id => {
                  currentViewStorage.setCurrentView(this.blockId, id);
                },
              })}
            </div>
            ${renderUniLit(this.toolsWidget, props)}
          </div>
          ${renderUniLit(widgetPresets.quickSettingBar, props)}
        </div>
      `;
    }
  );

  indicator = new DropIndicator();

  onDrag = (evt: MouseEvent, id: string): (() => void) => {
    const result = getDropResult(evt);
    if (result && result.rect) {
      document.body.append(this.indicator);
      this.indicator.rect = Rect.fromLWTH(
        result.rect.left,
        result.rect.width,
        result.rect.top,
        result.rect.height
      );
      return () => {
        this.indicator.remove();
        const model = this.store.getBlock(id)?.model;
        const target = result.modelState.model;
        let parent = this.store.getParent(target.id);
        const shouldInsertIn = result.placement === 'in';
        if (shouldInsertIn) {
          parent = target;
        }
        if (model && target && parent) {
          if (shouldInsertIn) {
            this.store.moveBlocks([model], parent);
          } else {
            this.store.moveBlocks(
              [model],
              parent,
              target,
              result.placement === 'before'
            );
          }
        }
      };
    }
    this.indicator.remove();
    return () => {};
  };

  private readonly setSelection = (
    selection: DataViewSelection | undefined
  ) => {
    if (selection) {
      getSelection()?.removeAllRanges();
    }
    this.selection.setGroup(
      'note',
      selection
        ? [
            new DatabaseSelection({
              blockId: this.blockId,
              viewSelection: selection,
            }),
          ]
        : []
    );
  };

  private readonly toolsWidget: DataViewWidget = widgetPresets.createTools({
    table: [
      widgetPresets.tools.filter,
      widgetPresets.tools.sort,
      widgetPresets.tools.search,
      widgetPresets.tools.viewOptions,
      widgetPresets.tools.tableAddRow,
    ],
    kanban: [
      widgetPresets.tools.filter,
      widgetPresets.tools.sort,
      widgetPresets.tools.search,
      widgetPresets.tools.viewOptions,
      widgetPresets.tools.tableAddRow,
    ],
  });

  private readonly viewSelection$ = computed(() => {
    const databaseSelection = this.selection.value.find(
      (selection): selection is DatabaseSelection => {
        if (selection.blockId !== this.blockId) {
          return false;
        }
        return selection instanceof DatabaseSelection;
      }
    );
    return databaseSelection?.viewSelection;
  });

  private readonly virtualPadding$ = signal(0);

  get optionsConfig(): DatabaseViewExtensionOptions {
    return {
      configure: (_model, options) => options,
      ...this.std.getOptional(DatabaseConfigExtension.identifier),
    };
  }

  get isCommentHighlighted() {
    return (
      this.std
        .getOptional(BlockCommentManager)
        ?.isBlockCommentHighlighted(this.model) ?? false
    );
  }

  override get topContenteditableElement() {
    if (this.std.get(DocModeProvider).getEditorMode() === 'edgeless') {
      return this.closest<BlockComponent>(
        EDGELESS_TOP_CONTENTEDITABLE_SELECTOR
      );
    }
    return this.rootComponent;
  }

  private renderDatabaseOps() {
    if (this.dataSource.value.readonly$.value) {
      return nothing;
    }
    return html` <div
      data-testid="database-ops"
      class="${databaseOpsStyles}"
      @click="${this.clickDatabaseOps}"
    >
      ${MoreHorizontalIcon()}
    </div>`;
  }

  override connectedCallback() {
    super.connectedCallback();

    this.setAttribute(RANGE_SYNC_EXCLUDE_ATTR, 'true');
    this.classList.add(databaseBlockStyles);
    this.listenFullWidthChange();
  }

  listenFullWidthChange() {
    if (this.std.get(DocModeProvider).getEditorMode() === 'edgeless') {
      return;
    }
    this.disposables.add(
      autoUpdate(this.host, this, () => {
        const padding =
          this.getBoundingClientRect().left -
          this.host.getBoundingClientRect().left;
        this.virtualPadding$.value = Math.max(0, padding - 72);
      })
    );
  }
  private readonly dataViewRootLogic = lazy(
    () =>
      new DataViewRootUILogic({
        virtualPadding$: this.virtualPadding$,
        bindHotkey: hotkeys => {
          return {
            dispose: this.host.event.bindHotkey(hotkeys, {
              blockId: this.topContenteditableElement?.blockId ?? this.blockId,
            }),
          };
        },
        handleEvent: (name, handler) => {
          return {
            dispose: this.host.event.add(name, handler, {
              blockId: this.blockId,
            }),
          };
        },
        selection$: this.viewSelection$,
        setSelection: this.setSelection,
        dataSource: this.dataSource.value,
        headerWidget: this.headerWidget,
        onDrag: this.onDrag,
        clipboard: this.std.clipboard,
        notification: {
          toast: message => {
            const notification = this.std.getOptional(NotificationProvider);
            if (notification) {
              notification.toast(message);
            } else {
              toast(this.host, message);
            }
          },
        },
        eventTrace: (key, params) => {
          const telemetryService = this.std.getOptional(TelemetryProvider);
          telemetryService?.track(key, {
            ...(params as TelemetryEventMap[typeof key]),
            blockId: this.blockId,
          });
        },
        detailPanelConfig: {
          openDetailPanel: (target, data) => {
            const peekViewService = this.std.getOptional(PeekViewProvider);
            if (peekViewService) {
              const openDoc = (docId: string) => {
                return peekViewService.peek({
                  docId,
                  databaseId: this.blockId,
                  databaseDocId: this.model.store.id,
                  databaseRowId: data.rowId,
                  target: this,
                });
              };
              const doc = getSingleDocIdFromText(
                this.model.store.getBlock(data.rowId)?.model?.text
              );
              if (doc) {
                return openDoc(doc);
              }
              const abort = new AbortController();
              return new Promise<void>(focusBack => {
                peekViewService
                  .peek(
                    {
                      target,
                      template: this.createTemplate(data, docId => {
                        // abort.abort();
                        openDoc(docId).then(focusBack).catch(focusBack);
                      }),
                    },
                    { abortSignal: abort.signal }
                  )
                  .then(focusBack)
                  .catch(focusBack);
              });
            } else {
              return popSideDetail(
                this.createTemplate(data, () => {
                  //
                })
              );
            }
          },
        },
      })
  );
  override renderBlock() {
    return html`
      <div contenteditable="false" class="${databaseContentStyles}">
        ${this.dataViewRootLogic.value.render()}
      </div>
    `;
  }

  override accessor useZeroWidth = true;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-database': DatabaseBlockComponent;
  }
}
