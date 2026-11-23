import { DefaultTheme } from '@blocksuite/affine-model';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import type { ColorEvent } from '@blocksuite/affine-shared/utils';
import { EdgelessToolbarToolMixin } from '@blocksuite/affine-widget-edgeless-toolbar';
import { computed } from '@preact/signals-core';
import { css, html, LitElement, nothing } from 'lit';
import { property } from 'lit/decorators.js';

import { TextTool } from '../tool';

export class EdgelessTextMenu extends EdgelessToolbarToolMixin(LitElement) {
  static override styles = css`
    :host {
      display: flex;
      position: absolute;
      z-index: -1;
    }
  `;

  private readonly _theme$ = computed(() => {
    return this.edgeless.std.get(ThemeProvider).theme$.value;
  });

  override type = TextTool;

  override render() {
    if (this.edgelessTool.toolType !== TextTool) return nothing;

    return html`
      <edgeless-slide-menu>
        <div class="menu-content">
          <edgeless-color-panel
            class="one-way"
            .value=${this.color}
            .theme=${this._theme$.value}
            .palettes=${DefaultTheme.StrokeColorShortPalettes}
            @select=${(e: ColorEvent) => this.onChange({ color: e.detail })}
          ></edgeless-color-panel>
        </div>
      </edgeless-slide-menu>
    `;
  }

  @property({ attribute: false })
  accessor color!: string;

  @property({ attribute: false })
  accessor onChange!: (props: Record<string, unknown>) => void;
}
