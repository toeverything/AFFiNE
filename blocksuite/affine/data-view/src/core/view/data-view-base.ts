import type {
  DatabaseAllEvents,
  DatabaseAllViewEvents,
  EventTraceFn,
} from '@blocksuite/affine-shared/services';
import type { UniComponent } from '@blocksuite/affine-shared/types';
import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import type { DisposableMember } from '@blocksuite/global/disposable';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import {
  type EventName,
  ShadowlessElement,
  type UIEventHandler,
} from '@blocksuite/std';
import { computed } from '@preact/signals-core';
import { property } from 'lit/decorators.js';

import type { DataViewRootUILogic } from '../data-view.js';
import type { DataViewSelection } from '../types.js';
import type { SingleView } from '../view-manager/single-view.js';
import type { DataViewWidget } from '../widget/index.js';
import type { DataViewInstance, DataViewProps } from './types.js';

export abstract class DataViewBase<
  Selection extends DataViewSelection = DataViewSelection,
> extends SignalWatcher(WithDisposable(ShadowlessElement)) {
  abstract expose: DataViewInstance;

  @property({ attribute: false })
  accessor props!: DataViewProps<Selection>;
}
export abstract class DataViewUIBase<
  Logic extends DataViewUILogicBase = DataViewUILogicBase,
> extends SignalWatcher(WithDisposable(ShadowlessElement)) {
  @property({ attribute: false })
  accessor logic!: Logic;
}

export abstract class DataViewUILogicBase<
  T extends SingleView = SingleView,
  Selection extends DataViewSelection = DataViewSelection,
> {
  constructor(
    public readonly root: DataViewRootUILogic,
    public readonly view: T
  ) {}

  get headerWidget(): DataViewWidget | undefined {
    return this.root.config.headerWidget;
  }
  bindHotkey(hotkeys: Record<string, UIEventHandler>): DisposableMember {
    return this.root.config.bindHotkey(
      Object.fromEntries(
        Object.entries(hotkeys).map(([key, fn]) => [
          key,
          ctx => {
            return fn(ctx);
          },
        ])
      )
    );
  }
  handleEvent(name: EventName, handler: UIEventHandler): DisposableMember {
    return this.root.config.handleEvent(name, context => {
      return handler(context);
    });
  }
  setSelection(selection?: Selection) {
    this.root.setSelection(selection);
  }

  selection$ = computed<Selection | undefined>(() => {
    const selection$ = this.root.selection$;
    if (selection$.value?.viewId === this.view.id) {
      return selection$.value as Selection | undefined;
    }
    return;
  });

  eventTrace: EventTraceFn<DatabaseAllViewEvents> = (key, params) => {
    this.root.config.eventTrace(key, {
      ...(params as DatabaseAllEvents[typeof key]),
      viewId: this.view.id,
      viewType: this.view.type,
    });
  };

  abstract clearSelection: () => void;
  abstract addRow: (position: InsertToPosition) => string | undefined;
  abstract focusFirstCell: () => void;
  abstract showIndicator: (evt: MouseEvent) => boolean;
  abstract hideIndicator: () => void;
  abstract moveTo: (id: string, evt: MouseEvent) => void;

  abstract renderer: UniComponent<{
    logic: DataViewUILogicBase<T, Selection>;
  }>;
}

type Constructor<T extends abstract new (...args: any) => any> = new (
  ...args: ConstructorParameters<T>
) => InstanceType<T>;

export type DataViewUILogicBaseConstructor = Constructor<
  typeof DataViewUILogicBase
>;
