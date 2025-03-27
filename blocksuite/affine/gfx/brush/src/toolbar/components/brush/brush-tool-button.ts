import {
  EditPropsStore,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import { EdgelessToolbarToolMixin } from '@blocksuite/affine-widget-edgeless-toolbar';
import { SignalWatcher } from '@blocksuite/global/lit';
import { computed } from '@preact/signals-core';
import { css, html, LitElement } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

import { EdgelessPenDarkIcon, EdgelessPenLightIcon } from './icons.js';

export class EdgelessBrushToolButton extends EdgelessToolbarToolMixin(
  SignalWatcher(LitElement)
) {
  static override styles = css`
    :host {
      display: flex;
      height: 100%;
      overflow-y: hidden;
    }
    .edgeless-brush-button {
      height: 100%;
    }
    .pen-wrapper {
      width: 35px;
      height: 64px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    #edgeless-pen-icon {
      transition: transform 0.3s ease-in-out;
      transform: translateY(8px);
    }
    .edgeless-brush-button:hover #edgeless-pen-icon,
    .pen-wrapper.active #edgeless-pen-icon {
      transform: translateY(0);
    }
  `;

  private readonly _color$ = computed(() => {
    const theme = this.edgeless.std.get(ThemeProvider).theme$.value;
    return this.edgeless.std
      .get(ThemeProvider)
      .generateColorProperty(
        this.edgeless.std.get(EditPropsStore).lastProps$.value.brush.color,
        undefined,
        theme
      );
  });

  override enableActiveBackground = true;

  override type = 'brush' as const;

  private _toggleBrushMenu() {
    if (this.tryDisposePopper()) return;
    !this.active && this.setEdgelessTool(this.type);
    const menu = this.createPopper('edgeless-brush-menu', this);
    Object.assign(menu.element, {
      edgeless: this.edgeless,
      onChange: (props: Record<string, unknown>) => {
        this.edgeless.std.get(EditPropsStore).recordLastProps('brush', props);
        this.setEdgelessTool('brush');
      },
    });
  }

  override render() {
    const { active } = this;
    const appTheme = this.edgeless.std.get(ThemeProvider).app$.value;
    const icon =
      appTheme === 'dark' ? EdgelessPenDarkIcon : EdgelessPenLightIcon;
    const color = this._color$.value;

    return html`
      <edgeless-toolbar-button
        class="edgeless-brush-button"
        .tooltip=${this.popper
          ? ''
          : html`<affine-tooltip-content-with-shortcut
              data-tip="${'Pen'}"
              data-shortcut="${'P'}"
            ></affine-tooltip-content-with-shortcut>`}
        .tooltipOffset=${4}
        .active=${active}
        .withHover=${true}
        @click=${() => this._toggleBrushMenu()}
      >
        <div style=${styleMap({ color })} class="pen-wrapper">${icon}</div>
      </edgeless-toolbar-button>
    `;
  }
}
