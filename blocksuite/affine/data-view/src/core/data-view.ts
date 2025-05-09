import type {
  DatabaseAllEvents,
  EventTraceFn,
} from '@blocksuite/affine-shared/services';
import { IS_MOBILE } from '@blocksuite/global/env';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { computed, type ReadonlySignal, signal } from '@preact/signals-core';
import { css, unsafeCSS } from 'lit';
import { property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { keyed } from 'lit/directives/keyed.js';
import { createRef, ref } from 'lit/directives/ref.js';
import { html } from 'lit/static-html.js';

import { dataViewCommonStyle } from './common/css-variable.js';
import type { DataViewSelection, DataViewSelectionState } from './types.js';
import { renderUniLit } from './utils/uni-component/index.js';
import type { DataViewInstance, DataViewProps } from './view/types.js';
import type { SingleView } from './view-manager/single-view.js';

type ViewProps = {
  view: SingleView;
  selection$: ReadonlySignal<DataViewSelectionState>;
  setSelection: (selection?: DataViewSelectionState) => void;
  bindHotkey: DataViewProps['bindHotkey'];
  handleEvent: DataViewProps['handleEvent'];
};

export type DataViewRendererConfig = Pick<
  DataViewProps,
  | 'bindHotkey'
  | 'handleEvent'
  | 'virtualPadding$'
  | 'clipboard'
  | 'dataSource'
  | 'headerWidget'
  | 'onDrag'
  | 'notification'
> & {
  selection$: ReadonlySignal<DataViewSelection | undefined>;
  setSelection: (selection: DataViewSelection | undefined) => void;
  eventTrace: EventTraceFn<DatabaseAllEvents>;
  detailPanelConfig: {
    openDetailPanel: (
      target: HTMLElement,
      data: {
        view: SingleView;
        rowId: string;
      }
    ) => Promise<void>;
  };
};

export class DataViewRenderer extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    ${unsafeCSS(dataViewCommonStyle('affine-data-view-renderer'))}
    affine-data-view-renderer {
      background-color: var(--affine-background-primary-color);
      display: contents;
    }
  `;

  private readonly _view = signal<DataViewInstance>();

  @property({ attribute: false })
  accessor config!: DataViewRendererConfig;

  private readonly currentViewId$ = computed(() => {
    return this.config.dataSource.viewManager.currentViewId$.value;
  });

  viewMap$ = computed(() => {
    const manager = this.config.dataSource.viewManager;
    return Object.fromEntries(
      manager.views$.value.map(view => [view, manager.viewGet(view)])
    );
  });

  currentViewConfig$ = computed<ViewProps | undefined>(() => {
    const currentViewId = this.currentViewId$.value;
    if (!currentViewId) {
      return;
    }
    const view = this.viewMap$.value[currentViewId];
    if (!view) {
      return;
    }
    return {
      view: view,
      selection$: computed(() => {
        const selection$ = this.config.selection$;
        if (selection$.value?.viewId === currentViewId) {
          return selection$.value;
        }
        return;
      }),
      setSelection: selection => {
        this.config.setSelection(selection);
      },
      handleEvent: (name, handler) =>
        this.config.handleEvent(name, context => {
          return handler(context);
        }),
      bindHotkey: hotkeys =>
        this.config.bindHotkey(
          Object.fromEntries(
            Object.entries(hotkeys).map(([key, fn]) => [
              key,
              ctx => {
                return fn(ctx);
              },
            ])
          )
        ),
    };
  });

  focusFirstCell = () => {
    this.view?.focusFirstCell();
  };

  openDetailPanel = (ops: {
    view: SingleView;
    rowId: string;
    onClose?: () => void;
  }) => {
    const openDetailPanel = this.config.detailPanelConfig.openDetailPanel;
    if (openDetailPanel) {
      openDetailPanel(this, {
        view: ops.view,
        rowId: ops.rowId,
      })
        .catch(console.error)
        .finally(ops.onClose);
    }
  };

  get view() {
    return this._view.value;
  }

  private renderView(viewData?: ViewProps) {
    if (!viewData) {
      return;
    }
    const props: DataViewProps = {
      dataViewEle: this,
      headerWidget: this.config.headerWidget,
      onDrag: this.config.onDrag,
      dataSource: this.config.dataSource,
      virtualPadding$: this.config.virtualPadding$,
      clipboard: this.config.clipboard,
      notification: this.config.notification,
      view: viewData.view,
      selection$: viewData.selection$,
      setSelection: viewData.setSelection,
      bindHotkey: viewData.bindHotkey,
      handleEvent: viewData.handleEvent,
      eventTrace: (key, params) => {
        this.config.eventTrace(key, {
          ...(params as DatabaseAllEvents[typeof key]),
          viewId: viewData.view.id,
          viewType: viewData.view.type,
        });
      },
    };
    const renderer = viewData.view.meta.renderer;
    const view =
      (IS_MOBILE ? renderer.mobileView : renderer.view) ?? renderer.view;
    return keyed(
      viewData.view.id,
      renderUniLit(
        view,
        { props },
        {
          ref: this._view,
        }
      )
    );
  }

  override connectedCallback() {
    super.connectedCallback();
    let preId: string | undefined = undefined;
    this.disposables.add(
      this.currentViewId$.subscribe(current => {
        if (current !== preId) {
          this.config.setSelection(undefined);
        }
        preId = current;
      })
    );
  }

  override render() {
    const containerClass = classMap({
      'toolbar-hover-container': true,
      'data-view-root': true,
      'prevent-reference-popup': true,
    });
    return html`
      <div style="display: contents" class="${containerClass}">
        ${this.renderView(this.currentViewConfig$.value)}
      </div>
    `;
  }

  @state()
  accessor currentView: string | undefined = undefined;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-data-view-renderer': DataViewRenderer;
  }
}

export class DataView {
  private readonly _ref = createRef<DataViewRenderer>();

  get expose() {
    return this._ref.value?.view;
  }

  render(props: DataViewRendererConfig) {
    return html` <affine-data-view-renderer
      ${ref(this._ref)}
      .config="${props}"
    ></affine-data-view-renderer>`;
  }
}
