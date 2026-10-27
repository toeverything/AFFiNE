import {
  BaseCellRenderer,
  createFromBaseCellRenderer,
  createIcon,
} from '@blocksuite/data-view';
import type { EditorHost } from '@blocksuite/std';
import { html } from 'lit';

import { EditorHostKey } from '../../context/host-context.js';
import {
  iconCellStyle,
  iconEmptyStyle,
  iconGlyphStyle,
} from './cell-renderer-css.js';
import { iconPropertyModelConfig, type IconValue } from './define.js';
import { openIconPicker } from './open-picker.js';
import { renderIconValue } from './render.js';

export class IconCell extends BaseCellRenderer<IconValue, string> {
  private closePicker?: () => void;

  private get std(): EditorHost['std'] | undefined {
    return this.view.serviceGet(EditorHostKey)?.std;
  }

  private showPicker(anchor: HTMLElement) {
    this.closePicker = openIconPicker(
      this.std,
      anchor,
      icon => {
        this.valueSetImmediate(icon ? (icon as unknown as IconValue) : null);
        this.selectCurrentCell(false);
      },
      () => {
        this.closePicker = undefined;
      }
    );
  }

  private readonly openPicker = (event: MouseEvent) => {
    event.stopPropagation();
    if (this.readonly) return;
    if (this.closePicker) {
      this.closePicker();
      this.closePicker = undefined;
      return;
    }
    this.showPicker((event.currentTarget as HTMLElement) ?? this);
  };

  /**
   * The keyboard route: Enter on a selected cell puts it in editing mode, and
   * that opens the picker, the same way a select cell opens its tag menu.
   */
  override afterEnterEditingMode() {
    if (this.readonly || this.closePicker) return;
    this.showPicker(this.querySelector<HTMLElement>('span') ?? this);
  }

  override beforeExitEditingMode() {
    this.closePicker?.();
    this.closePicker = undefined;
  }

  override disconnectedCallback() {
    this.closePicker?.();
    this.closePicker = undefined;
    super.disconnectedCallback();
  }

  override connectedCallback() {
    super.connectedCallback();
    this.classList.add(iconCellStyle);
  }

  override render() {
    const glyph = renderIconValue(this.value$.value);
    return html`<span
      class="${glyph ? iconGlyphStyle : iconEmptyStyle}"
      role="button"
      aria-label="${glyph ? 'Change icon' : 'Add icon'}"
      @click="${this.openPicker}"
      >${glyph ?? '+'}</span
    >`;
  }
}

export const iconColumnConfig = iconPropertyModelConfig.createPropertyMeta({
  icon: createIcon('SmileIcon'),
  cellRenderer: {
    view: createFromBaseCellRenderer(IconCell),
  },
});
