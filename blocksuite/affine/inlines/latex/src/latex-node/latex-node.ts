import { createLitPortal } from '@blocksuite/affine-components/portal';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import {
  type BlockComponent,
  type BlockStdScope,
  ShadowlessElement,
} from '@blocksuite/std';
import {
  type InlineEditor,
  ZERO_WIDTH_FOR_EMBED_NODE,
  ZERO_WIDTH_FOR_EMPTY_LINE,
} from '@blocksuite/std/inline';
import type { DeltaInsert } from '@blocksuite/store';
import { signal } from '@preact/signals-core';
import katex from 'katex';
import { css, html, render } from 'lit';
import { property } from 'lit/decorators.js';

export class AffineLatexNode extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    affine-latex-node {
      display: inline-block;
    }

    affine-latex-node .affine-latex {
      white-space: nowrap;
      word-break: break-word;
      color: ${unsafeCSSVar('textPrimaryColor')};
      fill: var(--affine-icon-color);
      border-radius: 4px;
      text-decoration: none;
      cursor: pointer;
      user-select: none;
      padding: 1px 2px 1px 0;
      display: grid;
      grid-template-columns: auto 0;
      place-items: center;
      padding: 0 4px;
      margin: 0 2px;
    }
    affine-latex-node .affine-latex:hover {
      background: ${unsafeCSSVar('hoverColor')};
    }
    affine-latex-node .affine-latex[data-selected='true'] {
      background: ${unsafeCSSVar('hoverColor')};
    }

    affine-latex-node .error-placeholder {
      display: inline-flex;
      padding: 2px 4px;
      justify-content: center;
      align-items: flex-start;
      gap: 4px;

      border-radius: 4px;
      background: ${unsafeCSSVarV2('chip/label/red')};
      border: 1px solid ${unsafeCSSVarV2('text/highlight/fg/red')};

      color: ${unsafeCSSVarV2('text/highlight/fg/red')};
      font-family: Inter;
      font-size: 12px;
      font-weight: 500;
      line-height: normal;
      cursor: pointer;
      max-width: 100%;
      overflow: hidden;
    }

    affine-latex-node .error-placeholder__icon {
      flex-shrink: 0;
      font-style: normal;
    }

    affine-latex-node .error-placeholder__source {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 11px;
      opacity: 0.85;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 200px;
    }

    affine-latex-node .placeholder {
      display: flex;
      padding: 2px 4px;
      justify-content: center;
      align-items: flex-start;

      border-radius: 4px;
      background: ${unsafeCSSVarV2('layer/background/secondary')};

      color: ${unsafeCSSVarV2('text/secondary')};
      font-family: Inter;
      font-size: 12px;
      font-weight: 500;
      line-height: normal;
    }
  `;

  private _editorAbortController: AbortController | null = null;

  readonly latex$ = signal('');

  readonly latexEditorSignal = signal('');

  get deltaLatex() {
    return this.delta.attributes?.latex as string;
  }

  get latexContainer() {
    return this.querySelector<HTMLElement>('.latex-container');
  }

  override connectedCallback() {
    const result = super.connectedCallback();

    this.latex$.value = this.deltaLatex;
    this.latexEditorSignal.value = this.deltaLatex;

    this.disposables.add(
      this.latex$.subscribe(latex => {
        this.latexEditorSignal.value = latex;
        if (latex !== this.deltaLatex) {
          this.editor.formatText(
            {
              index: this.startOffset,
              length: this.endOffset - this.startOffset,
            },
            {
              latex,
            }
          );
        }
      })
    );

    this.disposables.add(
      this.latexEditorSignal.subscribe(latex => {
        this.updateComplete
          .then(() => {
            const latexContainer = this.latexContainer;
            if (!latexContainer) return;

            latexContainer.replaceChildren();
            // @ts-expect-error lit hack won't fix
            delete latexContainer['_$litPart$'];

            if (latex.length === 0) {
              render(
                html`<span class="placeholder">Equation</span>`,
                latexContainer
              );
            } else {
              try {
                katex.render(latex, latexContainer, {
                  displayMode: false,
                });
              } catch (err) {
                latexContainer.replaceChildren();
                // @ts-expect-error lit hack won't fix
                delete latexContainer['_$litPart$'];
                // FR-017 + FR-054: show raw LaTeX source and KaTeX error
                // message alongside a non-colour error indicator (⚠ icon).
                const errMsg =
                  err instanceof Error
                    ? err.message.split('\n')[0].slice(0, 120)
                    : 'Invalid LaTeX';
                render(
                  html`<span
                    class="error-placeholder"
                    title="${errMsg}"
                    aria-label="LaTeX error: ${errMsg}"
                    role="img"
                  >
                    <!-- Non-colour indicator (FR-054 WCAG AA): warning triangle -->
                    <span class="error-placeholder__icon" aria-hidden="true"
                      >⚠</span
                    >
                    <span class="error-placeholder__source">${latex}</span>
                  </span>`,
                  latexContainer
                );
              }
            }
          })
          .catch(console.error);
      })
    );

    this._editorAbortController?.abort();
    this._editorAbortController = new AbortController();
    this.disposables.add(() => {
      this._editorAbortController?.abort();
    });

    this.disposables.addFromEvent(this, 'click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (this.readonly) {
        return;
      }
      this.toggleEditor();
    });

    return result;
  }

  override render() {
    return html`<span class="affine-latex" data-selected=${this.selected}
      ><div class="latex-container"></div>
      <v-text .str=${ZERO_WIDTH_FOR_EMBED_NODE}></v-text
    ></span>`;
  }

  toggleEditor() {
    const blockComponent = this.closest<BlockComponent>('[data-block-id]');
    if (!blockComponent) return;

    this._editorAbortController?.abort();
    this._editorAbortController = new AbortController();

    blockComponent.selection.setGroup('note', []);

    const { portal } = createLitPortal({
      template: html`<latex-editor-menu
        .std=${this.std}
        .latexSignal=${this.latexEditorSignal}
        .abortController=${this._editorAbortController}
      ></latex-editor-menu>`,
      container: blockComponent.host,
      computePosition: {
        referenceElement: this,
        placement: 'bottom-start',
        autoUpdate: {
          animationFrame: true,
        },
      },
      closeOnClickAway: true,
      abortController: this._editorAbortController,
      shadowDom: false,
      portalStyles: {
        zIndex: 'var(--affine-z-index-popover)',
      },
    });

    this._editorAbortController.signal.addEventListener(
      'abort',
      () => {
        portal.remove();
        const latex = this.latexEditorSignal.peek();
        this.latex$.value = latex;

        if (latex !== this.deltaLatex) {
          this.editor.formatText(
            {
              index: this.startOffset,
              length: this.endOffset - this.startOffset,
            },
            {
              latex,
            }
          );
          this.editor.setInlineRange({
            index: this.endOffset,
            length: 0,
          });
        }
      },
      { once: true }
    );
  }

  get readonly() {
    return this.std.store.readonly;
  }

  @property({ attribute: false })
  accessor delta: DeltaInsert<AffineTextAttributes> = {
    insert: ZERO_WIDTH_FOR_EMPTY_LINE,
  };

  @property({ attribute: false })
  accessor editor!: InlineEditor<AffineTextAttributes>;

  @property({ attribute: false })
  accessor endOffset!: number;

  @property({ attribute: false })
  accessor selected = false;

  @property({ attribute: false })
  accessor startOffset!: number;

  @property({ attribute: false })
  accessor std!: BlockStdScope;
}
