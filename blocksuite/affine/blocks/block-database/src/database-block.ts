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
import { NOTE_SELECTOR } from '@blocksuite/affine-shared/consts';
import {
  DocModeProvider,
  NotificationProvider,
  type TelemetryEventMap,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import { getDropResult } from '@blocksuite/affine-widget-drag-handle';
import { type BlockComponent } from '@blocksuite/block-std';
import { RANGE_SYNC_EXCLUDE_ATTR } from '@blocksuite/block-std/inline';
import {
  createRecordDetail,
  createUniComponentFromWebComponent,
  DataView,
  dataViewCommonStyle,
  type DataViewInstance,
  type DataViewProps,
  type DataViewSelection,
  type DataViewWidget,
  type DataViewWidgetProps,
  defineUniComponent,
  renderUniLit,
  type SingleView,
  uniMap,
} from '@blocksuite/data-view';
import { widgetPresets } from '@blocksuite/data-view/widget-presets';
import { Rect } from '@blocksuite/global/gfx';
import {
  CopyIcon,
  DeleteIcon,
  MoreHorizontalIcon,
} from '@blocksuite/icons/lit';
import { Slice } from '@blocksuite/store';
import { autoUpdate } from '@floating-ui/dom';
import { computed, signal } from '@preact/signals-core';
import { css, html, nothing, unsafeCSS } from 'lit';

import { popSideDetail } from './components/layout.js';
import {
  DatabaseConfigExtension,
  type DatabaseOptionsConfig,
} from './config.js';
import { HostContextKey } from './context/host-context.js';
import { DatabaseBlockDataSource } from './data-source.js';
import { BlockRenderer } from './detail-panel/block-renderer.js';
import { NoteRenderer } from './detail-panel/note-renderer.js';
import { DatabaseSelection } from './selection.js';
import { currentViewStorage } from './utils/current-view.js';
import { getSingleDocIdFromText } from './utils/title-doc.js';

export class DatabaseBlockComponent extends CaptionedBlockComponent<DatabaseBlockModel> {
  static override styles = css`
    ${unsafeCSS(dataViewCommonStyle('affine-database'))}
    affine-database {
      display: block;
      border-radius: 8px;
      background-color: var(--affine-background-primary-color);
      padding: 8px;
      margin: 8px -8px -8px;
    }

    .database-block-selected {
      background-color: var(--affine-hover-color);
      border-radius: 4px;
    }

    .database-ops {
      padding: 2px;
      border-radius: 4px;
      display: flex;
      cursor: pointer;
      align-items: center;
      height: max-content;
    }

    .database-ops svg {
      width: 16px;
      height: 16px;
      color: var(--affine-icon-color);
    }

    .database-ops:hover {
      background-color: var(--affine-hover-color);
    }

    @media print {
      .database-ops {
        display: none;
      }

      .database-header-bar {
        display: none !important;
      }
    }
  `;

  private readonly _clickDatabaseOps = (e: MouseEvent) => {
    const options = this.optionsConfig.configure(this.model, {
      items: [
        menu.input({
          initialValue: this.model.props.title.toString(),
          placeholder: 'Untitled',
          onChange: text => {
            this.model.props.title.replace(
              0,
              this.model.props.title.length,
              text
            );
          },
        }),
        menu.action({
          prefix: CopyIcon(),
          name: 'Copy',
          select: () => {
            const slice = Slice.fromModels(this.doc, [this.model]);
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
                  this.doc.deleteBlock(block);
                });
                this.doc.deleteBlock(this.model);
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

  private _dataSource?: DatabaseBlockDataSource;

  private readonly dataView = new DataView();

  private readonly renderTitle = (dataViewMethod: DataViewInstance) => {
    const addRow = () => dataViewMethod.addRow?.('start');
    return html` <affine-database-title
      style="overflow: hidden"
      .titleText="${this.model.props.title}"
      .readonly="${this.dataSource.readonly$.value}"
      .onPressEnterKey="${addRow}"
    ></affine-database-title>`;
  };

  _bindHotkey: DataViewProps['bindHotkey'] = hotkeys => {
    return {
      dispose: this.host.event.bindHotkey(hotkeys, {
        blockId: this.topContenteditableElement?.blockId ?? this.blockId,
      }),
    };
  };

  _handleEvent: DataViewProps['handleEvent'] = (name, handler) => {
    return {
      dispose: this.host.event.add(name, handler, {
        blockId: this.blockId,
      }),
    };
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
        <div style="margin-bottom: 16px;display:flex;flex-direction: column">
          <div
            style="display:flex;gap:12px;margin-bottom: 8px;align-items: center"
          >
            ${this.renderTitle(props.dataViewInstance)}
            ${this.renderDatabaseOps()}
          </div>
          <div
            style="display:flex;align-items:center;justify-content: space-between;gap: 12px"
            class="database-header-bar"
          >
            <div style="flex:1">
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
        const model = this.doc.getBlock(id)?.model;
        const target = result.modelState.model;
        let parent = this.doc.getParent(target.id);
        const shouldInsertIn = result.placement === 'in';
        if (shouldInsertIn) {
          parent = target;
        }
        if (model && target && parent) {
          if (shouldInsertIn) {
            this.doc.moveBlocks([model], parent);
          } else {
            this.doc.moveBlocks(
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

  setSelection = (selection: DataViewSelection | undefined) => {
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

  toolsWidget: DataViewWidget = widgetPresets.createTools({
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

  viewSelection$ = computed(() => {
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

  virtualPadding$ = signal(0);

  get dataSource(): DatabaseBlockDataSource {
    if (!this._dataSource) {
      this._dataSource = new DatabaseBlockDataSource(this.model);
      this._dataSource.contextSet(HostContextKey, this.host);
      const id = currentViewStorage.getCurrentView(this.model.id);
      if (id && this.dataSource.viewManager.viewGet(id)) {
        this.dataSource.viewManager.setCurrentView(id);
      }
    }
    return this._dataSource;
  }

  get optionsConfig(): DatabaseOptionsConfig {
    return {
      configure: (_model, options) => options,
      ...this.std.getOptional(DatabaseConfigExtension.identifier),
    };
  }

  override get topContenteditableElement() {
    if (this.std.get(DocModeProvider).getEditorMode() === 'edgeless') {
      return this.closest<BlockComponent>(NOTE_SELECTOR);
    }
    return this.rootComponent;
  }

  get view() {
    return this.dataView.expose;
  }

  private renderDatabaseOps() {
    if (this.dataSource.readonly$.value) {
      return nothing;
    }
    return html` <div class="database-ops" @click="${this._clickDatabaseOps}">
      ${MoreHorizontalIcon()}
    </div>`;
  }

  override connectedCallback() {
    super.connectedCallback();

    this.setAttribute(RANGE_SYNC_EXCLUDE_ATTR, 'true');
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

  override renderBlock() {
    const peekViewService = this.std.getOptional(PeekViewProvider);
    const telemetryService = this.std.getOptional(TelemetryProvider);
    return html`
      <div
        contenteditable="false"
        style="position: relative;background-color: var(--affine-background-primary-color);border-radius: 4px"
      >
        ${this.dataView.render({
          virtualPadding$: this.virtualPadding$,
          bindHotkey: this._bindHotkey,
          handleEvent: this._handleEvent,
          selection$: this.viewSelection$,
          setSelection: this.setSelection,
          dataSource: this.dataSource,
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
            telemetryService?.track(key, {
              ...(params as TelemetryEventMap[typeof key]),
              blockId: this.blockId,
            });
          },
          detailPanelConfig: {
            openDetailPanel: (target, data) => {
              if (peekViewService) {
                const openDoc = (docId: string) => {
                  return peekViewService.peek({
                    docId,
                    databaseId: this.blockId,
                    databaseDocId: this.model.doc.id,
                    databaseRowId: data.rowId,
                    target: this,
                  });
                };
                const doc = getSingleDocIdFromText(
                  this.model.doc.getBlock(data.rowId)?.model?.text
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
        })}
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
