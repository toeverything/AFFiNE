import { EdgelessCRUDIdentifier } from '@blocksuite/affine-block-surface';
import {
  packColorsWith,
  type PickColorEvent,
  preprocessColor,
} from '@blocksuite/affine-components/color-picker';
import type { LineDetailType } from '@blocksuite/affine-components/edgeless-line-styles-panel';
import type { SliderSelectEvent } from '@blocksuite/affine-components/slider';
import {
  DefaultTheme,
  NoteBlockModel,
  type NoteProps,
  type NoteShadow,
  resolveColor,
} from '@blocksuite/affine-model';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import {
  type ColorEvent,
  getMostCommonResolvedValue,
  stopPropagation,
} from '@blocksuite/affine-shared/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ArrowLeftSmallIcon, PaletteIcon } from '@blocksuite/icons/lit';
import { BlockStdScope, PropTypes, requiredProperties } from '@blocksuite/std';
import { css, html, LitElement } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { choose } from 'lit/directives/choose.js';

@requiredProperties({
  notes: PropTypes.arrayOf(model => model instanceof NoteBlockModel),
  std: PropTypes.instanceOf(BlockStdScope),
})
export class EdgelessNoteStylePanel extends SignalWatcher(
  WithDisposable(LitElement)
) {
  @property({ attribute: false })
  accessor notes!: NoteBlockModel[];

  @property({ attribute: false })
  accessor std!: BlockStdScope;

  @state()
  accessor tabType: 'style' | 'customColor' = 'style';

  @query('div.edgeless-note-style-panel-container')
  accessor container!: HTMLDivElement;

  static override styles = css`
    .edgeless-note-style-panel {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }

    .edgeless-note-style-section {
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }

    .edgeless-note-style-section-title {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      gap: 4px;
      height: 22px;
      align-self: stretch;
      color: ${unsafeCSSVarV2('text/secondary')};
      font-feature-settings:
        'liga' off,
        'clig' off;

      /* Client/sm */
      font-family: var(--affine-font-family);
      font-size: 14px;
      font-style: normal;
      font-weight: 400;
      line-height: 22px; /* 157.143% */
    }

    edgeless-line-styles-panel {
      display: flex;
      flex-direction: row;
      gap: 8px;
    }

    .edgeless-note-corner-radius-panel {
      display: flex;
      flex-direction: row;
      align-items: stretch;
      gap: 8px;

      affine-slider {
        width: 168px;
      }

      input {
        border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
        border-radius: 4px;
        text-indent: 4px;
        box-sizing: border-box;
        width: 88px;
        color: ${unsafeCSSVarV2('text/placeholder')};
      }

      input:focus {
        outline: none;
        border-color: ${unsafeCSSVarV2('input/border/active')};
        color: ${unsafeCSSVarV2('text/primary')};
      }
    }

    .edgeless-note-style-custom-color-panel {
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }

    .edgeless-note-custom-color-picker {
      padding-top: 0px;
    }
  `;

  private _styleChanged = false;

  private _beforeChange() {
    if (!this._styleChanged) {
      // record the history
      this.std.store.captureSync();
      this._styleChanged = true;
    }
  }

  private get _theme() {
    return this.std.get(ThemeProvider).edgeless$.value;
  }

  private get _background() {
    return (
      getMostCommonResolvedValue(
        this.notes.map(model => model.props),
        'background',
        background => resolveColor(background, this._theme)
      ) ?? resolveColor(DefaultTheme.noteBackgrounColor, this._theme)
    );
  }

  private get _originalBackground() {
    return this.notes[0].props.background;
  }

  private get _shadow() {
    return this.notes[0].props.edgeless.style.shadowType;
  }

  private get _borderSize() {
    return this.notes[0].props.edgeless.style.borderSize;
  }

  private get _borderStyle() {
    return this.notes[0].props.edgeless.style.borderStyle;
  }

  private get _borderRadius() {
    return this.notes[0].props.edgeless.style.borderRadius;
  }

  private readonly _switchToCustomColorTab = () => {
    this.tabType = 'customColor';
  };

  private readonly _switchToStyleTab = () => {
    this.tabType = 'style';
  };

  private readonly _selectColor = (e: ColorEvent) => {
    this._beforeChange();
    const color = e.detail.value;
    const crud = this.std.get(EdgelessCRUDIdentifier);
    this.notes.forEach(note => {
      crud.updateElement(note.id, {
        background: color,
      } satisfies Partial<NoteProps>);
    });
  };

  private readonly _pickColor = (e: PickColorEvent) => {
    switch (e.type) {
      case 'pick':
        {
          const color = e.detail.value;
          const crud = this.std.get(EdgelessCRUDIdentifier);
          this.notes.forEach(note => {
            crud.updateElement(note.id, {
              background: color,
            } satisfies Partial<NoteProps>);
          });
        }
        break;
      case 'start':
        this._beforeChange();
        this.notes.forEach(note => {
          note.stash('background');
        });
        break;
      case 'end':
        this.std.store.transact(() => {
          this.notes.forEach(note => {
            note.pop('background');
          });
        });
        break;
    }
  };

  private readonly _selectShadow = (e: CustomEvent<NoteShadow>) => {
    this._beforeChange();
    const shadowType = e.detail;
    const crud = this.std.get(EdgelessCRUDIdentifier);
    this.notes.forEach(note => {
      crud.updateElement(note.id, {
        edgeless: {
          ...note.props.edgeless,
          style: {
            ...note.props.edgeless.style,
            shadowType,
          },
        },
      } satisfies Partial<NoteProps>);
    });
  };

  private readonly _selectBorder = (e: CustomEvent<LineDetailType>) => {
    this._beforeChange();

    const { type, value } = e.detail;
    const crud = this.std.get(EdgelessCRUDIdentifier);
    if (type === 'size') {
      const borderSize = value;
      this.notes.forEach(note => {
        const edgeless = note.props.edgeless;
        crud.updateElement(note.id, {
          edgeless: {
            ...edgeless,
            style: {
              ...edgeless.style,
              borderSize,
            },
          },
        } satisfies Partial<NoteProps>);
      });
    } else {
      const borderStyle = value;
      this.notes.forEach(note => {
        const edgeless = note.props.edgeless;
        crud.updateElement(note.id, {
          edgeless: { ...edgeless, style: { ...edgeless.style, borderStyle } },
        } satisfies Partial<NoteProps>);
      });
    }
  };

  private readonly _selectBorderRadius = (
    e: SliderSelectEvent | InputEvent
  ) => {
    this._beforeChange();

    let borderRadius = this._borderRadius;
    if (e instanceof InputEvent) {
      const target = e.target as HTMLInputElement;
      const value = parseInt(target.value);
      if (isNaN(value)) {
        return;
      }
      borderRadius = value;
    } else {
      borderRadius = e.detail.value;
    }
    const crud = this.std.get(EdgelessCRUDIdentifier);
    this.notes.forEach(note => {
      crud.updateElement(note.id, {
        edgeless: {
          ...note.props.edgeless,
          style: { ...note.props.edgeless.style, borderRadius },
        },
      } satisfies Partial<NoteProps>);
    });
  };

  private _renderStylePanel() {
    return html`<div class="edgeless-note-style-panel">
      <div class="edgeless-note-style-section">
        <div class="edgeless-note-style-section-title">Fill color</div>
        <edgeless-color-panel
          role="listbox"
          .value=${this._background}
          .theme=${this._theme}
          .palettes=${DefaultTheme.NoteBackgroundColorPalettes}
          .hasTransparent=${false}
          .columns=${DefaultTheme.NoteBackgroundColorPalettes.length + 1}
          @select=${this._selectColor}
        >
          <edgeless-color-custom-button
            slot="custom"
            @click=${this._switchToCustomColorTab}
          ></edgeless-color-custom-button>
        </edgeless-color-panel>
      </div>
      <div class="edgeless-note-style-section">
        <div class="edgeless-note-style-section-title">Shadow</div>
        <edgeless-note-shadow-menu
          .background=${this._background}
          .theme=${this._theme}
          .value=${this._shadow}
          @select=${this._selectShadow}
        ></edgeless-note-shadow-menu>
      </div>
      <div
        class="edgeless-note-style-section"
        data-testid="affine-note-border-style-panel"
      >
        <div class="edgeless-note-style-section-title">Border</div>
        <edgeless-line-styles-panel
          .lineSize=${this._borderSize}
          .lineStyle=${this._borderStyle}
          @select=${this._selectBorder}
        ></edgeless-line-styles-panel>
      </div>
      <div
        class="edgeless-note-style-section"
        data-testid="affine-note-corner-radius-panel"
      >
        <div class="edgeless-note-style-section-title">Corner Radius</div>
        <div class="edgeless-note-corner-radius-panel">
          <affine-slider
            .value=${this._borderRadius}
            .range=${{
              points: [0, 4, 8, 16, 24, 32],
            }}
            @select=${this._selectBorderRadius}
          ></affine-slider>

          <editor-toolbar-separator></editor-toolbar-separator>

          <input
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            min="0"
            max="32"
            .value=${this._borderRadius}
            @input=${this._selectBorderRadius}
            @click=${stopPropagation}
            @pointerdown=${stopPropagation}
            @cut=${stopPropagation}
            @copy=${stopPropagation}
            @paste=${stopPropagation}
          />
        </div>
      </div>
    </div>`;
  }

  private _renderCustomColorPanel() {
    const packed = packColorsWith(
      this._theme,
      this._background,
      this._originalBackground
    );
    const type = packed.type === 'palette' ? 'normal' : packed.type;
    const modes = packed.colors.map(
      preprocessColor(window.getComputedStyle(this))
    );

    return html`<div class="edgeless-note-style-custom-color-panel">
      <div class="edgeless-note-style-section-title">
        <editor-icon-button
          aria-label="Back"
          .iconSize=${'16px'}
          @click=${this._switchToStyleTab}
        >
          ${ArrowLeftSmallIcon()}
        </editor-icon-button>
        Custom color
      </div>
      <edgeless-color-picker
        class="edgeless-note-custom-color-picker"
        .pick=${this._pickColor}
        .colors=${{ type, modes }}
      ></edgeless-color-picker>
    </div>`;
  }

  override firstUpdated() {
    if (this.container) {
      this.disposables.addFromEvent(this.container, 'click', e => {
        e.stopPropagation();
      });
    }
  }

  override render() {
    return html`
      <editor-menu-button
        .contentPadding=${'8px'}
        .button=${html`
          <editor-icon-button aria-label="Note Style" .tooltip=${'Note Style'}>
            ${PaletteIcon()}
          </editor-icon-button>
        `}
        @toggle=${(e: CustomEvent<boolean>) => {
          if (!e.detail) {
            this.tabType = 'style';
          }
        }}
      >
        <div class="edgeless-note-style-panel-container">
          ${choose(this.tabType, [
            ['style', () => this._renderStylePanel()],
            ['customColor', () => this._renderCustomColorPanel()],
          ])}
        </div>
      </editor-menu-button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-note-style-panel': EdgelessNoteStylePanel;
  }
}
