import { createReactComponentFromLit } from '@affine/component';
import { defaultBlockMarkdownAdapterMatchers } from '@blocksuite/affine/adapters';
import {
  BlockStdScope,
  BlockViewIdentifier,
  type EditorHost,
  ShadowlessElement,
} from '@blocksuite/affine/block-std';
import {
  defaultImageProxyMiddleware,
  ImageProxyService,
} from '@blocksuite/affine/blocks/image';
import { PageEditorBlockSpecs } from '@blocksuite/affine/extensions';
import { Container, type ServiceProvider } from '@blocksuite/affine/global/di';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import {
  InlineDeltaToMarkdownAdapterExtensions,
  MarkdownInlineToDeltaAdapterExtensions,
} from '@blocksuite/affine/inlines/preset';
import { codeBlockWrapMiddleware } from '@blocksuite/affine/shared/adapters';
import { LinkPreviewerService } from '@blocksuite/affine/shared/services';
import type {
  ExtensionType,
  Query,
  Schema,
  Store,
  TransformerMiddleware,
} from '@blocksuite/affine/store';
import { css, html, nothing, type PropertyValues } from 'lit';
import { property, query } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { keyed } from 'lit/directives/keyed.js';
import { literal } from 'lit/static-html.js';
import React from 'react';

import { markDownToDoc } from '../../utils';
import type {
  AffineAIPanelState,
  AffineAIPanelWidgetConfig,
} from '../widgets/ai-panel/type';

const customHeadingStyles = css`
  .custom-heading {
    .h1 {
      font-size: calc(var(--affine-font-h-1) - 2px);
      code {
        font-size: calc(var(--affine-font-base) + 6px);
      }
    }
    .h2 {
      font-size: calc(var(--affine-font-h-2) - 2px);
      code {
        font-size: calc(var(--affine-font-base) + 4px);
      }
    }
    .h3 {
      font-size: calc(var(--affine-font-h-3) - 2px);
      code {
        font-size: calc(var(--affine-font-base) + 2px);
      }
    }
    .h4 {
      font-size: calc(var(--affine-font-h-4) - 2px);
      code {
        font-size: var(--affine-font-base);
      }
    }
    .h5 {
      font-size: calc(var(--affine-font-h-5) - 2px);
      code {
        font-size: calc(var(--affine-font-base) - 2px);
      }
    }
    .h6 {
      font-size: calc(var(--affine-font-h-6) - 2px);
      code {
        font-size: calc(var(--affine-font-base) - 4px);
      }
    }
  }
`;

export type TextRendererOptions = {
  customHeading?: boolean;
  extensions?: ExtensionType[];
  additionalMiddlewares?: TransformerMiddleware[];
};

export const CustomPageEditorBlockSpecs: ExtensionType[] = [
  ...PageEditorBlockSpecs,
  {
    setup: di => {
      di.override(
        BlockViewIdentifier('affine:page'),
        () => literal`affine-page-root`
      );
    },
  },
];

// todo: refactor it for more general purpose usage instead of AI only?
export class TextRenderer extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .ai-answer-text-editor.affine-page-viewport {
      background: transparent;
      font-family: var(--affine-font-family);
      margin-top: 0;
      margin-bottom: 0;
    }

    .ai-answer-text-editor .affine-page-root-block-container {
      padding: 0;
      margin: 0;
      line-height: var(--affine-line-height);
      color: var(--affine-text-primary-color);
      font-weight: 400;
    }

    .affine-paragraph-block-container {
      line-height: 22px;
    }

    .ai-answer-text-editor {
      .affine-note-block-container {
        > .affine-block-children-container {
          > :first-child,
          > :first-child * {
            margin-top: 0 !important;
          }
          > :last-child,
          > :last-child * {
            margin-bottom: 0 !important;
          }
        }
      }
    }

    .text-renderer-container {
      overflow-y: auto;
      overflow-x: hidden;
      padding: 0;
      overscroll-behavior-y: none;
    }
    .text-renderer-container.show-scrollbar::-webkit-scrollbar {
      width: 5px;
      height: 100px;
    }
    .text-renderer-container.show-scrollbar::-webkit-scrollbar-thumb {
      border-radius: 20px;
    }
    .text-renderer-container.show-scrollbar:hover::-webkit-scrollbar-thumb {
      background-color: var(--affine-black-30);
    }
    .text-renderer-container.show-scrollbar::-webkit-scrollbar-corner {
      display: none;
    }

    .text-renderer-container {
      rich-text .nowrap-lines v-text span,
      rich-text .nowrap-lines v-element span {
        white-space: pre;
      }
      editor-host:focus-visible {
        outline: none;
      }
      editor-host * {
        box-sizing: border-box;
      }
      editor-host {
        isolation: isolate;
      }
    }

    ${customHeadingStyles}
  `;

  private _answers: string[] = [];

  private _maxContainerHeight = 0;

  private readonly _clearTimer = () => {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  };

  private _doc: Store | null = null;

  private readonly _query: Query = {
    mode: 'strict',
    match: [
      'affine:page',
      'affine:note',
      'affine:table',
      'affine:surface',
      'affine:paragraph',
      'affine:code',
      'affine:list',
      'affine:divider',
      'affine:latex',
    ].map(flavour => ({ flavour, viewType: 'display' })),
  };

  private _timer?: ReturnType<typeof setInterval> | null = null;

  private readonly _updateDoc = () => {
    if (this._answers.length > 0) {
      const latestAnswer = this._answers.pop();
      this._answers = [];
      const schema = this.schema ?? this.host?.std.store.schema;
      let provider: ServiceProvider;
      if (this.host) {
        provider = this.host.std.provider;
      } else {
        const container = new Container();
        [
          ...MarkdownInlineToDeltaAdapterExtensions,
          ...defaultBlockMarkdownAdapterMatchers,
          ...InlineDeltaToMarkdownAdapterExtensions,
        ].forEach(ext => {
          ext.setup(container);
        });

        provider = container.provider();
      }
      if (latestAnswer && schema) {
        const middlewares = [
          defaultImageProxyMiddleware,
          codeBlockWrapMiddleware(true),
          ...(this.options.additionalMiddlewares ?? []),
        ];
        markDownToDoc(provider, schema, latestAnswer, middlewares)
          .then(doc => {
            this.disposeDoc();
            this._doc = doc.doc.getStore({
              query: this._query,
            });
            this.disposables.add(() => {
              doc.doc.clearQuery(this._query);
            });
            this._doc.readonly = true;
            this.requestUpdate();
            if (this.state !== 'generating') {
              this._clearTimer();
            }
          })
          .catch(console.error);
      }
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    this._answers.push(this.answer);

    this._updateDoc();
    if (this.state === 'generating') {
      this._timer = setInterval(this._updateDoc, 600);
    }

    // LinkPreviewerService & ImageProxyService config should read from host settings
    const linkPreviewerService = this.host?.std.store.get(LinkPreviewerService);
    const imageProxyService = this.host?.std.store.get(ImageProxyService);
    if (linkPreviewerService) {
      this._doc
        ?.get(LinkPreviewerService)
        .setEndpoint(linkPreviewerService.endpoint);
    }
    if (imageProxyService) {
      this._doc
        ?.get(ImageProxyService)
        .setImageProxyURL(imageProxyService.imageProxyURL);
    }
  }

  private disposeDoc() {
    this._doc?.dispose();
    this._doc?.workspace.dispose();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._clearTimer();
    this.disposeDoc();
  }

  override render() {
    if (!this._doc) {
      return nothing;
    }

    const { customHeading } = this.options;
    const classes = classMap({
      'text-renderer-container': true,
      'custom-heading': !!customHeading,
    });
    return html`
      <div class=${classes}>
        ${keyed(
          this._doc,
          html`<div class="ai-answer-text-editor affine-page-viewport">
            ${new BlockStdScope({
              store: this._doc,
              extensions: this.options.extensions ?? CustomPageEditorBlockSpecs,
            }).render()}
          </div>`
        )}
      </div>
    `;
  }

  override shouldUpdate(changedProperties: PropertyValues) {
    if (changedProperties.has('answer')) {
      this._answers.push(this.answer);
      return false;
    }

    return true;
  }

  override updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);
    requestAnimationFrame(() => {
      if (!this._container) return;
      // Track max height during generation
      if (this.state === 'generating') {
        this._maxContainerHeight = Math.max(
          this._maxContainerHeight,
          this._container.scrollHeight
        );
        // Apply min-height to prevent shrinking
        this._container.style.minHeight = `${this._maxContainerHeight}px`;
      } else {
        setTimeout(() => {
          this._maxContainerHeight = 0;
          this._container.style.minHeight = '';
        }, 500);
      }
    });
  }

  @query('.text-renderer-container')
  private accessor _container!: HTMLDivElement;

  @property({ attribute: false })
  accessor answer!: string;

  @property({ attribute: false })
  accessor host: EditorHost | null = null;

  @property({ attribute: false })
  accessor schema: Schema | null = null;

  @property({ attribute: false })
  accessor options!: TextRendererOptions;

  @property({ attribute: false })
  accessor state: AffineAIPanelState | undefined = undefined;
}

export const createTextRenderer: (
  host: EditorHost,
  options: TextRendererOptions
) => AffineAIPanelWidgetConfig['answerRenderer'] = (host, options) => {
  return (answer, state) => {
    return html`<text-renderer
      .host=${host}
      .answer=${answer}
      .state=${state}
      .options=${options}
    ></text-renderer>`;
  };
};

export const LitTextRenderer = createReactComponentFromLit({
  react: React,
  elementClass: TextRenderer,
});

declare global {
  interface HTMLElementTagNameMap {
    'text-renderer': TextRenderer;
  }
}
