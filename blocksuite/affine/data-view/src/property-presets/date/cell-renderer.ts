import {
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { DatePicker } from '@blocksuite/affine-components/date-picker';
import { createLitPortal } from '@blocksuite/affine-components/portal';
import { IS_MOBILE } from '@blocksuite/global/env';
import { flip, offset } from '@floating-ui/dom';
import { computed, signal } from '@preact/signals-core';
import { format } from 'date-fns/format';
import { html } from 'lit';

import { BaseCellRenderer } from '../../core/property/index.js';
import { createFromBaseCellRenderer } from '../../core/property/renderer.js';
import { createIcon } from '../../core/utils/uni-icon.js';
import {
  dateCellStyle,
  datePickerContainerStyle,
  dateValueContainerStyle,
} from './cell-renderer-css.js';
import { datePropertyModelConfig } from './define.js';

export class DateCell extends BaseCellRenderer<number, number> {
  private _prevPortalAbortController: AbortController | null = null;

  private readonly openDatePicker = () => {
    if (
      this._prevPortalAbortController &&
      !this._prevPortalAbortController.signal.aborted
    )
      return;

    this.tempValue$.value = this.value ? new Date(this.value) : undefined;

    this._prevPortalAbortController?.abort();
    const abortController = new AbortController();
    abortController.signal.addEventListener(
      'abort',
      () => {
        this.selectCurrentCell(false);
      },
      { once: true }
    );
    this._prevPortalAbortController = abortController;
    if (IS_MOBILE) {
      popMenu(popupTargetFromElement(this), {
        options: {
          title: {
            text: this.property.name$.value,
          },
          onClose: () => {
            abortController.abort();
          },
          items: [
            () =>
              html` <div class="${dateValueContainerStyle}">
                ${this.formattedTempValue$.value}
              </div>`,
            () => {
              const datePicker = new DatePicker();
              datePicker.padding = 0;
              datePicker.value = this.tempValue$.value?.getTime() ?? Date.now();
              datePicker.onChange = (date: Date) => {
                this.tempValue$.value = date;
              };
              datePicker.onClear = () => {
                this.tempValue$.value = undefined;
              };
              datePicker.onEscape = () => {
                abortController.abort();
              };
              requestAnimationFrame(() => datePicker.focusDateCell());
              return html` <div class="${datePickerContainerStyle}">
                ${datePicker}
              </div>`;
            },
          ],
        },
      });
    } else {
      const { portal } = createLitPortal({
        abortController,
        closeOnClickAway: true,
        computePosition: {
          referenceElement: this,
          placement: 'bottom',
          middleware: [offset(10), flip()],
        },
        template: () => {
          const datePicker = new DatePicker();
          datePicker.value = this.tempValue$.value?.getTime() ?? Date.now();
          datePicker.popup = true;
          datePicker.onClear = () => {
            this.tempValue$.value = undefined;
          };
          datePicker.onChange = (date: Date) => {
            this.tempValue$.value = date;
          };
          datePicker.onEscape = () => {
            abortController.abort();
          };
          requestAnimationFrame(() => datePicker.focusDateCell());
          return datePicker;
        },
      });
      // TODO: use z-index from variable,
      //       for now the slide-layout-modal's z-index is `1001`
      //       the z-index of popover should be higher than it
      // root.style.zIndex = 'var(--affine-z-index-popover)';
      portal.style.zIndex = '1002';
    }
  };

  private readonly updateValue = () => {
    const tempValue = this.tempValue$.value;
    const currentValue = this.value;

    if (
      (!tempValue && !currentValue) ||
      (tempValue && currentValue && tempValue.getTime() === currentValue)
    ) {
      return;
    }

    const time = tempValue?.getTime();
    this.valueSetNextTick(time);
    this.tempValue$.value = undefined;
  };

  tempValue$ = signal<Date | undefined>();

  format(value?: Date) {
    return value ? format(value, 'yyyy/MM/dd') : '';
  }

  formattedTempValue$ = computed(() => {
    return this.format(this.tempValue$.value);
  });
  formattedValue$ = computed(() => {
    return (
      this.formattedTempValue$.value ||
      this.format(this.value ? new Date(this.value) : undefined)
    );
  });

  override afterEnterEditingMode() {
    this.openDatePicker();
  }

  override beforeExitEditingMode() {
    this.updateValue();
    this._prevPortalAbortController?.abort();
  }

  override render() {
    return html` <div class="${dateCellStyle} date">
      ${this.formattedValue$.value}
    </div>`;
  }
}

export const datePropertyConfig = datePropertyModelConfig.createPropertyMeta({
  icon: createIcon('DateTimeIcon'),
  cellRenderer: {
    view: createFromBaseCellRenderer(DateCell),
  },
});
