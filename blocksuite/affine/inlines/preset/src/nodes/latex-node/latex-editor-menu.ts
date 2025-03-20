import { ColorScheme } from '@blocksuite/affine-model';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { unsafeCSSVar } from '@blocksuite/affine-shared/theme';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { type BlockStdScope, ShadowlessElement } from '@blocksuite/block-std';
import { InlineManagerExtension } from '@blocksuite/block-std/inline';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { noop } from '@blocksuite/global/utils';
import { DoneIcon } from '@blocksuite/icons/lit';
import { effect, type Signal, signal } from '@preact/signals-core';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';
import { codeToTokensBase, type ThemedToken } from 'shiki';
import * as Y from 'yjs';

import { LatexEditorUnitSpecExtension } from '../../inline-spec';

export const LatexEditorInlineManagerExtension =
  InlineManagerExtension<AffineTextAttributes>({
    id: 'latex-inline-editor',
    enableMarkdown: false,
    specs: [LatexEditorUnitSpecExtension.identifier],
  });

export class LatexEditorMenu extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .latex-editor-container {
      display: grid;
      grid-template-columns: 1fr auto;
      grid-template-rows: auto auto;
      grid-template-areas:
        'editor-box confirm-box'
        'hint-box hint-box';

      padding: 8px;
      border-radius: 8px;
      border: 0.5px solid ${unsafeCSSVar('borderColor')};
      background: ${unsafeCSSVar('backgroundOverlayPanelColor')};

      /* light/toolbarShadow */
      box-shadow: 0px 6px 16px 0px rgba(0, 0, 0, 0.14);
    }

    .latex-editor {
      grid-area: editor-box;
      width: 280px;
      padding: 4px 10px;

      border-radius: 4px;
      background: ${unsafeCSSVar('white10')};

      /* light/activeShadow */
      box-shadow: 0px 0px 0px 2px rgba(30, 150, 235, 0.3);

      font-family: ${unsafeCSSVar('fontCodeFamily')};
      border: 1px solid transparent;
    }
    .latex-editor:focus-within {
      border: 1px solid ${unsafeCSSVar('blue700')};
    }

    .latex-editor-confirm {
      grid-area: confirm-box;
      display: flex;
      align-items: flex-end;
      padding-left: 10px;
    }

    .latex-editor-hint {
      grid-area: hint-box;
      padding-top: 6px;

      color: ${unsafeCSSVar('placeholderColor')};

      /* MobileTypeface/caption */
      font-family: 'SF Pro Text';
      font-size: 12px;
      font-style: normal;
      font-weight: 400;
      line-height: 16px; /* 133.333% */
      letter-spacing: -0.24px;
    }
  `;

  highlightTokens$: Signal<ThemedToken[][]> = signal([]);

  yText!: Y.Text;

  get inlineManager() {
    return this.std.get(LatexEditorInlineManagerExtension.identifier);
  }

  get richText() {
    return this.querySelector('rich-text');
  }

  private _updateHighlightTokens(text: string) {
    const editorTheme = this.std.get(ThemeProvider).theme;
    const theme = editorTheme === ColorScheme.Dark ? 'dark-plus' : 'light-plus';

    codeToTokensBase(text, {
      lang: 'latex',
      theme,
    })
      .then(token => {
        this.highlightTokens$.value = token;
      })
      .catch(console.error);
  }

  override connectedCallback(): void {
    super.connectedCallback();

    const doc = new Y.Doc();
    this.yText = doc.getText('latex');
    this.yText.insert(0, this.latexSignal.value);

    const yTextObserver = () => {
      const text = this.yText.toString();
      this.latexSignal.value = text;

      this._updateHighlightTokens(text);
    };
    this.yText.observe(yTextObserver);
    this.disposables.add(() => {
      this.yText.unobserve(yTextObserver);
    });

    this.disposables.add(
      effect(() => {
        noop(this.highlightTokens$.value);
        this.richText?.inlineEditor?.render();
      })
    );

    this.disposables.add(
      this.std.get(ThemeProvider).theme$.subscribe(() => {
        this._updateHighlightTokens(this.yText.toString());
      })
    );

    this.disposables.addFromEvent(this, 'keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        this.abortController.abort();
      }
    });

    this.disposables.addFromEvent(this, 'pointerdown', e => {
      e.stopPropagation();
    });
    this.disposables.addFromEvent(this, 'pointerup', e => {
      e.stopPropagation();
    });

    this.updateComplete
      .then(async () => {
        await this.richText?.updateComplete;

        setTimeout(() => {
          this.richText?.inlineEditor?.focusEnd();
        });
      })
      .catch(console.error);
  }

  override render() {
    return html`<div class="latex-editor-container">
      <div class="latex-editor">
        <rich-text
          .yText=${this.yText}
          .attributesSchema=${this.inlineManager.getSchema()}
          .attributeRenderer=${this.inlineManager.getRenderer()}
        ></rich-text>
      </div>
      <div class="latex-editor-confirm">
        <span @click=${() => this.abortController.abort()}
          >${DoneIcon({
            width: '24',
            height: '24',
          })}</span
        >
      </div>
      <div class="latex-editor-hint">Shift Enter to line break</div>
    </div>`;
  }

  @property({ attribute: false })
  accessor abortController!: AbortController;

  @property({ attribute: false })
  accessor latexSignal!: Signal<string>;

  @property({ attribute: false })
  accessor std!: BlockStdScope;
}
