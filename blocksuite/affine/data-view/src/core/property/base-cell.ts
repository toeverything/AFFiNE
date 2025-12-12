import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { computed, type ReadonlySignal } from '@preact/signals-core';
import type { PropertyValues } from 'lit';
import { property } from 'lit/decorators.js';

import type { Cell } from '../view-manager/cell.js';
import type { CellRenderProps, DataViewCellLifeCycle } from './manager.js';

export abstract class BaseCellRenderer<
  RawValue = unknown,
  JsonValue = unknown,
  Data extends Record<string, unknown> = Record<string, unknown>,
>
  extends SignalWatcher(WithDisposable(ShadowlessElement))
  implements DataViewCellLifeCycle, CellRenderProps<Data, RawValue, JsonValue>
{
  get expose() {
    return this;
  }

  @property({ attribute: false })
  accessor cell!: Cell<RawValue, JsonValue, Data>;

  readonly$ = computed(() => {
    return this.cell.property.readonly$.value;
  });

  value$ = computed(() => {
    return this.cell.value$.value;
  });

  get property() {
    return this.cell.property;
  }

  get readonly() {
    return this.readonly$.value;
  }

  get row() {
    return this.cell.row;
  }

  get value() {
    return this.value$.value;
  }

  get view() {
    return this.cell.view;
  }

  beforeEnterEditMode(): boolean {
    return true;
  }

  blurCell() {
    return true;
  }

  type: string | undefined;

  protected override shouldUpdate(_changedProperties: PropertyValues): boolean {
    return this.cell.property.type$.value === this.type;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.type = this.cell.property.type$.value;
    this.dataset.testid = this.type;
    this.style.width = '100%';
    this._disposables.addFromEvent(this, 'click', e => {
      if (this.isEditing$.value) {
        e.stopPropagation();
      }
    });

    this._disposables.addFromEvent(this, 'copy', e => {
      if (!this.isEditing$.value) return;
      e.stopPropagation();
      this.onCopy(e);
    });

    this._disposables.addFromEvent(this, 'cut', e => {
      if (!this.isEditing$.value) return;
      e.stopPropagation();
      this.onCut(e);
    });

    this._disposables.addFromEvent(this, 'paste', e => {
      if (!this.isEditing$.value) return;
      e.stopPropagation();
      this.onPaste(e);
    });
  }

  focusCell() {
    return true;
  }

  forceUpdate(): void {
    this.requestUpdate();
  }

  valueSetImmediate(value: RawValue | undefined): void {
    this.cell.valueSet(value);
  }

  valueSetNextTick(value: RawValue | undefined) {
    requestAnimationFrame(() => {
      this.cell.valueSet(value);
    });
  }

  onCopy(_e: ClipboardEvent) {}

  onCut(_e: ClipboardEvent) {}

  afterEnterEditingMode(): void {
    // do nothing
  }

  beforeExitEditingMode() {
    // do nothing
  }

  onPaste(_e: ClipboardEvent) {}

  @property({ attribute: false })
  accessor isEditing$!: ReadonlySignal<boolean>;

  @property({ attribute: false })
  accessor selectCurrentCell!: (editing: boolean) => void;
}
