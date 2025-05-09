import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { property } from 'lit/decorators.js';

import type { DataViewSelection } from '../types.js';
import type { SingleView } from '../view-manager/single-view.js';
import type { DataViewInstance, DataViewProps } from './types.js';

export abstract class DataViewBase<
  T extends SingleView = SingleView,
  Selection extends DataViewSelection = DataViewSelection,
> extends SignalWatcher(WithDisposable(ShadowlessElement)) {
  abstract expose: DataViewInstance;

  @property({ attribute: false })
  accessor props!: DataViewProps<T, Selection>;
}
