import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { property } from 'lit/decorators.js';

import type { DataViewUILogicBase } from '../view/data-view-base.js';
import type { DataViewWidgetProps } from './types.js';

export class WidgetBase<
  ViewLogic extends DataViewUILogicBase = DataViewUILogicBase,
>
  extends SignalWatcher(WithDisposable(ShadowlessElement))
  implements DataViewWidgetProps<ViewLogic>
{
  get dataSource() {
    return this.viewManager.dataSource;
  }

  get view() {
    return this.dataViewLogic.view;
  }

  get viewManager() {
    return this.view.manager;
  }

  @property({ attribute: false })
  accessor dataViewLogic!: ViewLogic;
}
