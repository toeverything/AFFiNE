import type {
  DatabaseAllEvents,
  EventTraceFn,
} from '@blocksuite/affine-shared/services';
import type { DisposableMember } from '@blocksuite/global/disposable';
import { IS_MOBILE } from '@blocksuite/global/env';
import { BlockSuiteError } from '@blocksuite/global/exceptions';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import {
  type Clipboard,
  type EventName,
  ShadowlessElement,
  type UIEventHandler,
} from '@blocksuite/std';
import { computed, type ReadonlySignal, signal } from '@preact/signals-core';
import { css, unsafeCSS } from 'lit';
import { property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { ref } from 'lit/directives/ref.js';
import { html } from 'lit/static-html.js';

import { dataViewCommonStyle } from './common/css-variable.js';
import type { DataSource } from './data-source/index.js';
import type { DataViewSelection } from './types.js';
import { cacheComputed } from './utils/cache.js';
import { renderUniLit } from './utils/uni-component/index.js';
import type { DataViewUILogicBase } from './view/data-view-base.js';
import type { SingleView } from './view-manager/single-view.js';
import type { DataViewWidget } from './widget/index.js';

export type DataViewRendererConfig = {
  clipboard: Clipboard;
  onDrag?: (evt: MouseEvent, id: string) => () => void;
  notification: {
    toast: (message: string) => void;
  };
  virtualPadding$: ReadonlySignal<number>;
  headerWidget: DataViewWidget | undefined;
  handleEvent: (name: EventName, handler: UIEventHandler) => DisposableMember;
  bindHotkey: (hotkeys: Record<string, UIEventHandler>) => DisposableMember;
  dataSource: DataSource;
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

export class DataViewRootUILogic {
  private get dataSource() {
    return this.config.dataSource;
  }
  private get viewManager() {
    return this.dataSource.viewManager;
  }
  private createDataViewUILogic(viewId: string): DataViewUILogicBase {
    const view = this.viewManager.viewGet(viewId);
    if (!view) {
      throw new BlockSuiteError(
        BlockSuiteError.ErrorCode.DatabaseBlockError,
        `View ${viewId} not found`
      );
    }

    const pcLogic = view.meta.renderer.pcLogic;
    const mobileLogic = view.meta.renderer.mobileLogic;
    const logic = (IS_MOBILE ? mobileLogic : pcLogic) ?? pcLogic;

    return new (logic(view))(this, view);
  }
  private readonly views$ = cacheComputed(this.viewManager.views$, viewId =>
    this.createDataViewUILogic(viewId)
  );
  private readonly viewsMap$ = computed(() => {
    return Object.fromEntries(
      this.views$.list.value.map(logic => [logic.view.id, logic])
    );
  });
  private readonly _uiRef = signal<DataViewRootUI>();

  get selection$() {
    return this.config.selection$;
  }

  setSelection(selection?: DataViewSelection) {
    this.config.setSelection(selection);
  }

  constructor(public readonly config: DataViewRendererConfig) {}

  get dataViewRenderer() {
    return this._uiRef.value;
  }

  readonly currentViewId$ = computed(() => {
    return this.dataSource.viewManager.currentViewId$.value;
  });

  readonly currentView$ = computed(() => {
    const currentViewId = this.currentViewId$.value;
    if (!currentViewId) {
      return;
    }
    return this.viewsMap$.value[currentViewId];
  });

  focusFirstCell = () => {
    this.currentView$.value?.focusFirstCell();
  };

  openDetailPanel = (ops: {
    view: SingleView;
    rowId: string;
    onClose?: () => void;
  }) => {
    const openDetailPanel = this.config.detailPanelConfig.openDetailPanel;
    const target = this.dataViewRenderer;
    if (openDetailPanel && target) {
      openDetailPanel(target, {
        view: ops.view,
        rowId: ops.rowId,
      })
        .catch(console.error)
        .finally(ops.onClose);
    }
  };

  setupViewChangeListener() {
    let preId: string | undefined = undefined;
    return this.currentViewId$.subscribe(current => {
      if (current !== preId) {
        this.config.setSelection(undefined);
      }
      preId = current;
    });
  }

  render() {
    return html` <affine-data-view-renderer
      ${ref(this._uiRef)}
      .logic="${this}"
    ></affine-data-view-renderer>`;
  }
}

export class DataViewRootUI extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    ${unsafeCSS(dataViewCommonStyle('affine-data-view-renderer'))}
    affine-data-view-renderer {
      background-color: var(--affine-background-primary-color);
      display: contents;
    }
  `;

  @property({ attribute: false })
  accessor logic!: DataViewRootUILogic;

  @state()
  accessor currentView: string | undefined = undefined;

  focusFirstCell = () => {
    this.logic.focusFirstCell();
  };

  openDetailPanel = (ops: {
    view: SingleView;
    rowId: string;
    onClose?: () => void;
  }) => {
    this.logic.openDetailPanel(ops);
  };

  override connectedCallback() {
    super.connectedCallback();
    this.disposables.add(this.logic.setupViewChangeListener());
  }

  override render() {
    const containerClass = classMap({
      'toolbar-hover-container': true,
      'data-view-root': true,
      'prevent-reference-popup': true,
    });
    const currentView = this.logic.currentView$.value;
    if (!currentView) {
      return;
    }
    return html`
      <div style="display: contents" class="${containerClass}">
        ${renderUniLit(currentView.renderer, {
          logic: currentView,
        })}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-data-view-renderer': DataViewRootUI;
  }
}
