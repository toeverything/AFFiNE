import { keepColor } from '@blocksuite/affine-components/color-picker';
import {
  EditPropsStore,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import { EdgelessToolbarToolMixin } from '@blocksuite/affine-widget-edgeless-toolbar';
import { SignalWatcher } from '@blocksuite/global/lit';
import { computed, signal } from '@preact/signals-core';
import { css, html, LitElement, nothing } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { when } from 'lit/directives/when.js';

import { BrushTool } from '../../../brush-tool';
import { HighlighterTool } from '../../../highlighter-tool';
import { penIconMap, penInfoMap } from './consts';
import type { Pen } from './types';

export class EdgelessPenToolButton extends EdgelessToolbarToolMixin(
  SignalWatcher(LitElement)
) {
  static override styles = css`
    :host {
      display: flex;
      height: 100%;
      overflow-y: hidden;
    }
    .edgeless-pen-button {
      height: 100%;
    }
    .pen-wrapper {
      width: 35px;
      height: 64px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    .pen-wrapper svg {
      transition-property: color, transform;
      transition-duration: 300ms;
      transition-timing-function: ease-in-out;
      transform: translateY(8px);
    }
    .edgeless-pen-button:hover .pen-wrapper svg,
    .pen-wrapper.active svg {
      transform: translateY(0);
    }
  `;

  get themeProvider() {
    return this.edgeless.std.get(ThemeProvider);
  }

  get settings() {
    return this.edgeless.std.get(EditPropsStore);
  }

  private readonly colors$ = computed(() => {
    const theme = this.themeProvider.theme$.value;
    const brush = this.settings.lastProps$.value.brush.color;
    const highlighter = this.settings.lastProps$.value.highlighter.color;
    return {
      brush: keepColor(
        this.themeProvider.generateColorProperty(brush, undefined, theme)
      ),
      highlighter: keepColor(
        this.themeProvider.generateColorProperty(highlighter, undefined, theme)
      ),
    };
  });

  private readonly color$ = computed(() => {
    const pen = this.pen$.value;
    return this.colors$.value[pen];
  });

  private readonly lineWidths$ = computed(() => {
    const brush = this.settings.lastProps$.value.brush.lineWidth;
    const highlighter = this.settings.lastProps$.value.highlighter.lineWidth;
    return {
      brush,
      highlighter,
    };
  });

  private readonly lineWidth$ = computed(() => {
    const pen = this.pen$.value;
    return this.lineWidths$.value[pen];
  });

  private readonly penIconMap$ = computed(() => {
    const theme = this.themeProvider.app$.value;
    return penIconMap[theme];
  });

  private readonly penIcon$ = computed(() => {
    const pen = this.pen$.value;
    return this.penIconMap$.value[pen];
  });

  private readonly penInfo$ = computed(() => {
    const type = this.pen$.value;
    return {
      ...penInfoMap[type],
      type: this.pen$.value,
      icon: this.penIcon$.value,
      color: this.color$.value,
      lineWidth: this.lineWidth$.value,
    };
  });

  private readonly pen$ = signal<Pen>('brush');

  override enableActiveBackground = true;

  override type = [BrushTool, HighlighterTool];

  override firstUpdated() {
    this.disposables.add(
      this.gfx.tool.currentToolName$.subscribe(name => {
        const tool = this.type.find(t => t.toolName === name);
        if (!tool) {
          this.tryDisposePopper();
          return;
        }

        if (tool.toolName !== this.pen$.peek()) {
          this.pen$.value = tool.toolName as Pen;
        }

        if (this.active) return;

        this._togglePenMenu();
      })
    );
  }

  private _togglePenMenu() {
    if (this.tryDisposePopper()) return;
    const setPenByType = (pen: Pen) => {
      if (pen === 'brush') {
        this.setEdgelessTool(BrushTool);
      } else {
        this.setEdgelessTool(HighlighterTool);
      }
    };
    if (!this.active) {
      const pen = this.pen$.peek();
      setPenByType(pen);
    }
    const menu = this.createPopper('edgeless-pen-menu', this);
    Object.assign(menu.element, {
      colors$: this.colors$,
      penIconMap$: this.penIconMap$,
      pen$: this.pen$,
      penInfo$: this.penInfo$,
      edgeless: this.edgeless,
      onChange: (props: Record<string, unknown>) => {
        const pen = this.pen$.peek();
        this.edgeless.std.get(EditPropsStore).recordLastProps(pen, props);
        setPenByType(pen);
      },
    });
  }

  override render() {
    const {
      active,
      penInfo$: {
        value: { type, color, icon, tip, shortcut },
      },
    } = this;

    return html`
      <edgeless-toolbar-button
        class="edgeless-pen-button"
        data-drawing-tool="${type}"
        .tooltip=${when(
          this.popper,
          () => nothing,
          () =>
            html`<affine-tooltip-content-with-shortcut
              data-tip="${tip}"
              data-shortcut="${shortcut}"
            ></affine-tooltip-content-with-shortcut>`
        )}
        .tooltipOffset=${4}
        .active=${active}
        .withHover=${true}
        @click=${() => this._togglePenMenu()}
      >
        <div style=${styleMap({ color })} class="pen-wrapper">${icon}</div>
      </edgeless-toolbar-button>
    `;
  }
}
