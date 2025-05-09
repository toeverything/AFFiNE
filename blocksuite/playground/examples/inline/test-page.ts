import '@shoelace-style/shoelace';

import { ShadowlessElement } from '@blocksuite/affine/std';
import { effects } from '@blocksuite/affine/std/effects';
import {
  type AttributeRenderer,
  InlineEditor,
  ZERO_WIDTH_FOR_EMBED_NODE,
} from '@blocksuite/affine/std/inline';
import {
  type BaseTextAttributes,
  baseTextAttributes,
} from '@blocksuite/affine/store';
import { effect } from '@preact/signals-core';
import { css, html, nothing } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import * as Y from 'yjs';
import { z } from 'zod';

effects();

function inlineTextStyles(
  props: BaseTextAttributes
): ReturnType<typeof styleMap> {
  let textDecorations = '';
  if (props.underline) {
    textDecorations += 'underline';
  }
  if (props.strike) {
    textDecorations += ' line-through';
  }

  let inlineCodeStyle = {};
  if (props.code) {
    inlineCodeStyle = {
      'font-family':
        '"SFMono-Regular", Menlo, Consolas, "PT Mono", "Liberation Mono", Courier, monospace',
      'line-height': 'normal',
      background: 'rgba(135,131,120,0.15)',
      color: '#EB5757',
      'border-radius': '3px',
      'font-size': '85%',
      padding: '0.2em 0.4em',
    };
  }

  return styleMap({
    'font-weight': props.bold ? 'bold' : 'normal',
    'font-style': props.italic ? 'italic' : 'normal',
    'text-decoration': textDecorations.length > 0 ? textDecorations : 'none',
    ...inlineCodeStyle,
  });
}

const attributeRenderer: AttributeRenderer = ({ delta, selected }) => {
  // @ts-expect-error ignore
  if (delta.attributes?.embed) {
    return html`<span
      style=${styleMap({
        padding: '0 0.4em',
        border: selected ? '1px solid #eb763a' : '',
        background: 'rgba(135,131,120,0.15)',
      })}
      >@flrande<v-text .str=${ZERO_WIDTH_FOR_EMBED_NODE}></v-text
    ></span>`;
  }

  const style = delta.attributes
    ? inlineTextStyles(delta.attributes)
    : styleMap({});

  return html`<span style=${style}
    ><v-text .str=${delta.insert}></v-text
  ></span>`;
};

function toggleStyle(
  inlineEditor: InlineEditor,
  attrs: NonNullable<BaseTextAttributes>
): void {
  const inlineRange = inlineEditor.getInlineRange();
  if (!inlineRange) {
    return;
  }

  const root = inlineEditor.rootElement;
  if (!root) {
    return;
  }

  const deltas = inlineEditor.getDeltasByInlineRange(inlineRange);
  let oldAttributes: NonNullable<BaseTextAttributes> = {};

  for (const [delta] of deltas) {
    const attributes = delta.attributes;

    if (!attributes) {
      continue;
    }

    oldAttributes = { ...attributes };
  }

  const newAttributes = Object.fromEntries(
    Object.entries(attrs).map(([k, v]) => {
      if (
        typeof v === 'boolean' &&
        v === (oldAttributes as Record<string, unknown>)[k]
      ) {
        return [k, null];
      } else {
        return [k, v];
      }
    })
  );

  inlineEditor.formatText(inlineRange, newAttributes, {
    mode: 'merge',
  });
  root.blur();

  inlineEditor.setInlineRange(inlineRange);
}

@customElement('test-rich-text')
export class TestRichText extends ShadowlessElement {
  override firstUpdated() {
    this.contentEditable = 'true';
    this.style.outline = 'none';
    this.inlineEditor.mount(this._container, this);

    this.inlineEditor.slots.textChange.subscribe(() => {
      const el = this.querySelector('.y-text');
      if (el) {
        const text = this.inlineEditor.yText.toDelta();
        const span = document.createElement('span');
        span.innerHTML = JSON.stringify(text);
        el.replaceChildren(span);
      }
    });
    effect(() => {
      const inlineRange = this.inlineEditor.inlineRange$.value;
      const el = this.querySelector('.v-range');
      if (el && inlineRange) {
        const span = document.createElement('span');
        span.innerHTML = JSON.stringify(inlineRange);
        el.replaceChildren(span);
      }
    });
  }

  override render() {
    return html`<style>
        test-rich-text {
          display: grid;
          grid-template-rows: minmax(0, 3fr) minmax(0, 1fr) minmax(0, 1fr);
          grid-template-columns: minmax(0, 1fr);
          width: 100%;
        }

        .rich-text-container {
          outline: none;
        }

        code {
          font-family:
            'SFMono-Regular', Menlo, Consolas, 'PT Mono', 'Liberation Mono',
            Courier, monospace;
          line-height: normal;
          background: rgba(135, 131, 120, 0.15);
          color: #eb5757;
          border-radius: 3px;
          font-size: 85%;
          padding: 0.2em 0.4em;
        }

        .v-range,
        .y-text {
          font-family:
            'SFMono-Regular', Menlo, Consolas, 'PT Mono', 'Liberation Mono',
            Courier, monospace;
          line-height: normal;
          background: rgba(135, 131, 120, 0.15);
        }

        .v-range,
        .y-text > span {
          display: block;
          word-wrap: break-word;
        }
      </style>
      <div class="rich-text-container"></div>
      <div contenteditable="false" class="v-range"></div>
      <div contenteditable="false" class="y-text"></div>`;
  }

  @query('.rich-text-container')
  private accessor _container!: HTMLDivElement;

  @property({ attribute: false })
  accessor inlineEditor!: InlineEditor;

  @property({ attribute: false })
  accessor undoManager!: Y.UndoManager;
}

const TEXT_ID = 'inline-editor';
const yDocA = new Y.Doc();
const yDocB = new Y.Doc();

yDocA.on('update', update => {
  Y.applyUpdate(yDocB, update);
});

yDocB.on('update', update => {
  Y.applyUpdate(yDocA, update);
});

@customElement('custom-toolbar')
export class CustomToolbar extends ShadowlessElement {
  static override styles = css`
    .custom-toolbar {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      grid-template-rows: repeat(2, minmax(0, 1fr));
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this.addEventListener('pointerdown', e => {
      e.preventDefault();
    });
  }

  override firstUpdated() {
    const boldButton = this.querySelector('.bold');
    const italicButton = this.querySelector('.italic');
    const underlineButton = this.querySelector('.underline');
    const strikeButton = this.querySelector('.strike');
    const code = this.querySelector('.code');
    const embed = this.querySelector('.embed');
    const resetButton = this.querySelector('.reset');
    const undoButton = this.querySelector('.undo');
    const redoButton = this.querySelector('.redo');

    if (
      !boldButton ||
      !italicButton ||
      !underlineButton ||
      !strikeButton ||
      !code ||
      !embed ||
      !resetButton ||
      !undoButton ||
      !redoButton
    ) {
      throw new Error('Cannot find button');
    }

    const undoManager = new Y.UndoManager(this.inlineEditor.yText, {
      trackedOrigins: new Set([this.inlineEditor.yText.doc?.clientID]),
    });

    addEventListener('keydown', e => {
      if (
        e instanceof KeyboardEvent &&
        (e.ctrlKey || e.metaKey) &&
        e.key === 'z'
      ) {
        e.preventDefault();
        if (e.shiftKey) {
          undoManager.redo();
        } else {
          undoManager.undo();
        }
      }
    });

    undoButton.addEventListener('click', () => {
      undoManager.undo();
    });
    redoButton.addEventListener('click', () => {
      undoManager.redo();
    });

    boldButton.addEventListener('click', () => {
      undoManager.stopCapturing();
      toggleStyle(this.inlineEditor, { bold: true });
    });
    italicButton.addEventListener('click', () => {
      undoManager.stopCapturing();
      toggleStyle(this.inlineEditor, { italic: true });
    });
    underlineButton.addEventListener('click', () => {
      undoManager.stopCapturing();
      toggleStyle(this.inlineEditor, { underline: true });
    });
    strikeButton.addEventListener('click', () => {
      undoManager.stopCapturing();
      toggleStyle(this.inlineEditor, { strike: true });
    });
    code.addEventListener('click', () => {
      undoManager.stopCapturing();
      toggleStyle(this.inlineEditor, { code: true });
    });
    embed.addEventListener('click', () => {
      undoManager.stopCapturing();
      // @ts-expect-error ignore
      toggleStyle(this.inlineEditor, { embed: true });
    });
    resetButton.addEventListener('click', () => {
      undoManager.stopCapturing();
      const rangeStatic = this.inlineEditor.getInlineRange();
      if (!rangeStatic) {
        return;
      }
      this.inlineEditor.resetText(rangeStatic);
    });
  }

  override render() {
    return html`
      <div class="custom-toolbar">
        <sl-button class="bold">bold</sl-button>
        <sl-button class="italic">italic</sl-button>
        <sl-button class="underline">underline</sl-button>
        <sl-button class="strike">strike</sl-button>
        <sl-button class="code">code</sl-button>
        <sl-button class="embed">embed</sl-button>
        <sl-button class="reset">reset</sl-button>
        <sl-button class="undo">undo</sl-button>
        <sl-button class="redo">redo</sl-button>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor inlineEditor!: InlineEditor;

  @property({ attribute: false })
  accessor undoManager!: Y.UndoManager;
}

@customElement('test-page')
export class TestPage extends ShadowlessElement {
  static override styles = css`
    .container {
      display: grid;
      height: 100vh;
      width: 100vw;
      justify-content: center;
      align-items: center;
    }

    .editors {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      padding: 20px;
      background-color: #202124;
      border-radius: 10px;
      color: #fff;
      grid-gap: 20px;
    }

    .editors > div {
      height: 600px;
      max-width: 400px;
      display: grid;
      grid-template-rows: 150px minmax(0, 1fr);
      grid-template-columns: minmax(0, 1fr);
      overflow-y: scroll;
    }
  `;

  private _editorA: InlineEditor | null = null;

  private _editorB: InlineEditor | null = null;

  private _undoManagerA: Y.UndoManager | null = null;

  private _undoManagerB: Y.UndoManager | null = null;

  override firstUpdated() {
    const textA = yDocA.getText(TEXT_ID);
    this._editorA = new InlineEditor<
      BaseTextAttributes & {
        embed?: true;
      }
    >(textA, {
      isEmbed: delta => !!delta.attributes?.embed,
    });
    this._editorA.setAttributeSchema(
      baseTextAttributes.extend({
        embed: z.literal(true).optional().catch(undefined),
      })
    );
    this._editorA.setAttributeRenderer(attributeRenderer);
    this._undoManagerA = new Y.UndoManager(textA, {
      trackedOrigins: new Set([textA.doc?.clientID]),
    });

    const textB = yDocB.getText(TEXT_ID);
    this._editorB = new InlineEditor(textB);
    this._undoManagerB = new Y.UndoManager(textB, {
      trackedOrigins: new Set([textB.doc?.clientID]),
    });

    this.requestUpdate();
  }

  override render() {
    if (!this._editorA) {
      return nothing;
    }

    return html`
      <div class="container">
        <div class="editors">
          <div class="doc-a">
            <custom-toolbar
              .inlineEditor=${this._editorA}
              .undoManager=${this._undoManagerA}
            ></custom-toolbar>
            <test-rich-text
              .inlineEditor=${this._editorA}
              .undoManager=${this._undoManagerA!}
            ></test-rich-text>
          </div>
          <div class="doc-b">
            <custom-toolbar
              .inlineEditor=${this._editorB}
              .undoManager=${this._undoManagerB!}
            ></custom-toolbar>
            <test-rich-text
              .inlineEditor=${this._editorB}
              .undoManager=${this._undoManagerB}
            ></test-rich-text>
          </div>
        </div>
      </div>
    `;
  }
}
