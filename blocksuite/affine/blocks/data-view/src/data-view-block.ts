import {
  BlockRenderer,
  DatabaseSelection,
  NoteRenderer,
} from '@blocksuite/affine-block-database';
import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { CopyIcon, DeleteIcon } from '@blocksuite/affine-components/icons';
import { PeekViewProvider } from '@blocksuite/affine-components/peek';
import { toast } from '@blocksuite/affine-components/toast';
import { EDGELESS_TOP_CONTENTEDITABLE_SELECTOR } from '@blocksuite/affine-shared/consts';
import {
  DocModeProvider,
  NotificationProvider,
  type TelemetryEventMap,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import {
  createRecordDetail,
  createUniComponentFromWebComponent,
  type DataSource,
  dataViewCommonStyle,
  type DataViewProps,
  DataViewRootUILogic,
  type DataViewSelection,
  type DataViewWidget,
  type DataViewWidgetProps,
  defineUniComponent,
  renderUniLit,
  uniMap,
} from '@blocksuite/data-view';
import { widgetPresets } from '@blocksuite/data-view/widget-presets';
import { MoreHorizontalIcon } from '@blocksuite/icons/lit';
import { type BlockComponent } from '@blocksuite/std';
import { RANGE_SYNC_EXCLUDE_ATTR } from '@blocksuite/std/inline';
import { Slice } from '@blocksuite/store';
import { computed, signal } from '@preact/signals-core';
import { css, nothing, unsafeCSS } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { html } from 'lit/static-html.js';

import { BlockQueryDataSource } from './data-source.js';
import type { DataViewBlockModel } from './data-view-model.js';

export class DataViewBlockComponent extends CaptionedBlockComponent<DataViewBlockModel> {
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
    popMenu(popupTargetFromElement(e.currentTarget as HTMLElement), {
      options: {
        items: [
          menu.input({
            initialValue: this.model.props.title,
            placeholder: 'Untitled',
            onChange: text => {
              this.model.props.title = text;
            },
          }),
          menu.action({
            prefix: CopyIcon,
            name: 'Copy',
            select: () => {
              const slice = Slice.fromModels(this.store, [this.model]);
              this.std.clipboard.copySlice(slice).catch(console.error);
            },
          }),
          menu.group({
            name: '',
            items: [
              menu.action({
                prefix: DeleteIcon,
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
      },
    });
  };

  private _dataSource?: DataSource;

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

  headerWidget: DataViewWidget = defineUniComponent(
    (props: DataViewWidgetProps) => {
      return html`
        <div style="margin-bottom: 16px;display:flex;flex-direction: column">
          <div style="display:flex;gap:8px;padding: 0 6px;margin-bottom: 8px;">
            <div>${this.model.props.title}</div>
            ${this.renderDatabaseOps()}
          </div>
          <div
            style="display:flex;align-items:center;justify-content: space-between;gap: 12px"
            class="database-header-bar"
          >
            <div style="flex:1">
              ${renderUniLit(widgetPresets.viewBar, props)}
            </div>
            ${renderUniLit(this.toolsWidget, props)}
          </div>
          ${renderUniLit(widgetPresets.quickSettingBar, props)}
        </div>
      `;
    }
  );

  selection$ = computed(() => {
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

  setSelection = (selection: DataViewSelection | undefined) => {
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
      widgetPresets.tools.search,
      widgetPresets.tools.viewOptions,
      widgetPresets.tools.tableAddRow,
    ],
    kanban: [
      widgetPresets.tools.filter,
      widgetPresets.tools.search,
      widgetPresets.tools.viewOptions,
    ],
  });

  get dataSource(): DataSource {
    if (!this._dataSource) {
      this._dataSource = new BlockQueryDataSource(this.host, this.model, {
        type: 'todo',
      });
    }
    return this._dataSource;
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
    if (this.store.readonly) {
      return nothing;
    }
    return html` <div class="database-ops" @click="${this._clickDatabaseOps}">
      ${MoreHorizontalIcon()}
    </div>`;
  }

  override connectedCallback() {
    super.connectedCallback();

    this.setAttribute(RANGE_SYNC_EXCLUDE_ATTR, 'true');
  }
  private readonly dataViewRootLogic = new DataViewRootUILogic({
    virtualPadding$: signal(0),
    bindHotkey: this._bindHotkey,
    handleEvent: this._handleEvent,
    selection$: this.selection$,
    setSelection: this.setSelection,
    dataSource: this.dataSource,
    headerWidget: this.headerWidget,
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
          const template = createRecordDetail({
            ...data,
            openDoc: () => {},
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
          return peekViewService.peek({ target, template });
        } else {
          return Promise.resolve();
        }
      },
    },
  });
  override renderBlock() {
    const widgets = html`${repeat(
      Object.entries(this.widgets),
      ([id]) => id,
      ([_, widget]) => widget
    )}`;

    return html`
      <div contenteditable="false" style="position: relative">
        ${this.dataViewRootLogic.render()} ${widgets}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-data-view': DataViewBlockComponent;
  }
}
