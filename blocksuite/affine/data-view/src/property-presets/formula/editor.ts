import {
  createPopup,
  type PopupTarget,
} from '@blocksuite/affine-components/context-menu';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { autoPlacement, offset, shift } from '@floating-ui/dom';
import { computed, signal } from '@preact/signals-core';
import { css, html, nothing } from 'lit';
import { property, query } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { renderUniLit } from '../../core/utils/uni-component/index.js';
import type { Property } from '../../core/view-manager/property.js';
import {
  evaluateFormulaForRow,
  FORMULA_PROPERTY_TYPE,
  FormulaErrorValue,
  formulaToDisplay,
  formulaToStorage,
  getFormulaExpression,
  inferFormulaResultType,
  resolveFormulaPropertyId,
} from './cell-value.js';
import {
  collectPropertyRefs,
  compileFormula,
  type FormulaFunction,
  formulaFunctions,
  type FormulaType,
  valueToText,
} from './engine/index.js';

const TYPE_LABELS: Record<FormulaType, string> = {
  number: 'Number',
  text: 'Text',
  boolean: 'Checkbox',
  date: 'Date',
  list: 'List',
  unknown: 'Mixed',
};

const CATEGORIES = ['Logic', 'Math', 'Text', 'Date'] as const;

type EditorStatus =
  | { kind: 'empty' }
  | { kind: 'error'; message: string; blocking: boolean }
  | { kind: 'ok'; type: FormulaType; preview?: string };

const quote = (value: string) =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export class FormulaEditor extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    affine-database-formula-editor {
      position: absolute;
      z-index: 999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 420px;
      max-width: calc(100vw - 16px);
      padding: 12px;
      box-sizing: border-box;
      font-family: var(--affine-font-family);
      font-size: 14px;
      color: ${unsafeCSSVarV2('text/primary')};
      background-color: ${unsafeCSSVarV2('layer/background/overlayPanel')};
      border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      border-radius: 8px;
      box-shadow: ${unsafeCSSVar('overlayPanelShadow')};
    }

    .formula-editor-title {
      font-weight: 600;
    }

    .formula-editor-input {
      width: 100%;
      min-height: 64px;
      box-sizing: border-box;
      resize: vertical;
      padding: 8px;
      border-radius: 4px;
      border: 1px solid ${unsafeCSSVarV2('input/border/default')};
      background: transparent;
      color: inherit;
      font-family: var(--affine-font-code-family);
      font-size: 13px;
      line-height: 20px;
      outline: none;
    }

    .formula-editor-input:focus {
      border-color: ${unsafeCSSVarV2('input/border/active')};
    }

    .formula-editor-status {
      min-height: 20px;
      font-size: 12px;
      line-height: 20px;
      color: ${unsafeCSSVarV2('text/secondary')};
      word-break: break-word;
    }

    .formula-editor-status.error {
      color: ${unsafeCSSVarV2('status/error')};
    }

    .formula-editor-section {
      font-size: 12px;
      color: ${unsafeCSSVarV2('text/secondary')};
    }

    .formula-editor-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      max-height: 76px;
      overflow-y: auto;
    }

    .formula-editor-chip {
      display: flex;
      align-items: center;
      gap: 4px;
      max-width: 180px;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      background: transparent;
      color: inherit;
      font-size: 12px;
      cursor: pointer;
    }

    .formula-editor-chip span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .formula-editor-chip:hover,
    .formula-editor-function:hover {
      background-color: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
    }

    .formula-editor-chip-icon {
      display: flex;
      font-size: 14px;
      color: ${unsafeCSSVarV2('icon/primary')};
    }

    .formula-editor-functions {
      display: flex;
      flex-wrap: wrap;
      align-content: flex-start;
      gap: 2px;
      max-height: 148px;
      overflow-y: auto;
    }

    .formula-editor-category {
      flex-basis: 100%;
      padding: 4px 4px 0;
      font-size: 11px;
      color: ${unsafeCSSVarV2('text/secondary')};
    }

    .formula-editor-function {
      padding: 0 6px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: inherit;
      text-align: left;
      font-family: var(--affine-font-code-family);
      font-size: 12px;
      line-height: 20px;
      cursor: pointer;
    }

    .formula-editor-hint {
      min-height: 36px;
      font-size: 12px;
      line-height: 18px;
      color: ${unsafeCSSVarV2('text/secondary')};
    }

    .formula-editor-hint code {
      font-family: var(--affine-font-code-family);
      color: ${unsafeCSSVarV2('text/primary')};
    }

    .formula-editor-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .formula-editor-button {
      padding: 4px 12px;
      border-radius: 8px;
      border: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      background: transparent;
      color: inherit;
      font-size: 14px;
      line-height: 22px;
      cursor: pointer;
    }

    .formula-editor-button.primary {
      border-color: transparent;
      background-color: ${unsafeCSSVarV2('button/primary')};
      color: ${unsafeCSSVarV2('button/pureWhiteText')};
    }

    .formula-editor-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;

  private readonly text$ = signal('');

  private readonly caret$ = signal(0);

  private readonly hovered$ = signal<FormulaFunction | undefined>(undefined);

  private get dataSource() {
    return this.property.view.manager.dataSource;
  }

  private readonly properties$ = computed(() => {
    const dataSource = this.dataSource;
    return dataSource.properties$.value
      .filter(id => id !== this.property.id)
      .map(id => {
        const type = dataSource.propertyTypeGet(id);
        return {
          id,
          name: dataSource.propertyNameGet(id),
          icon: type
            ? dataSource.propertyMetaGet(type)?.renderer.icon
            : undefined,
        };
      })
      .filter(item => item.name);
  });

  // The identifier being typed at the caret, used to filter functions.
  private readonly word$ = computed(() => {
    const before = this.text$.value.slice(0, this.caret$.value);
    return /[A-Za-z_][A-Za-z0-9_]*$/.exec(before)?.[0] ?? '';
  });

  private readonly functions$ = computed(() => {
    const word = this.word$.value.toLowerCase();
    if (!word) return formulaFunctions;
    const matches = formulaFunctions.filter(fn =>
      fn.name.toLowerCase().startsWith(word)
    );
    return matches.length ? matches : formulaFunctions;
  });

  private readonly status$ = computed((): EditorStatus => {
    const text = this.text$.value;
    if (!text.trim()) return { kind: 'empty' };
    const compiled = compileFormula(text);
    if (!compiled.ok) {
      return { kind: 'error', message: compiled.error.message, blocking: true };
    }
    const dataSource = this.dataSource;
    for (const ref of collectPropertyRefs(compiled.ast)) {
      const id = resolveFormulaPropertyId(dataSource, ref);
      if (!id) {
        return {
          kind: 'error',
          message: `Unknown property "${ref}"`,
          blocking: false,
        };
      }
      if (id === this.property.id) {
        return {
          kind: 'error',
          message: 'A formula cannot reference itself',
          blocking: true,
        };
      }
    }
    const expression = formulaToStorage(dataSource, text);
    const type = inferFormulaResultType(dataSource, expression);
    const rowId = this.property.view.rows$.value[0]?.rowId;
    if (!rowId) return { kind: 'ok', type };
    const value = evaluateFormulaForRow(
      dataSource,
      rowId,
      expression,
      this.property.id
    );
    if (value instanceof FormulaErrorValue) {
      return {
        kind: 'error',
        message: `First row: ${value.message}`,
        blocking: false,
      };
    }
    return { kind: 'ok', type, preview: valueToText(value) };
  });

  private readonly hint$ = computed(() => {
    const hovered = this.hovered$.value;
    if (hovered) return hovered;
    const word = this.word$.value.toLowerCase();
    if (!word) return;
    return this.functions$.value.find(fn =>
      fn.name.toLowerCase().startsWith(word)
    );
  });

  override connectedCallback() {
    super.connectedCallback();
    this.text$.value = formulaToDisplay(
      this.dataSource,
      getFormulaExpression(this.property.data$.value)
    );
    this.caret$.value = this.text$.value.length;
  }

  override firstUpdated() {
    // The textarea owns its value while editing, so it's only set once.
    this.input.value = this.text$.value;
    requestAnimationFrame(() => {
      this.input.focus();
      this.input.setSelectionRange(this.caret$.value, this.caret$.value);
    });
  }

  private readonly syncFromInput = () => {
    this.text$.value = this.input.value;
    this.caret$.value = this.input.selectionStart;
  };

  private readonly onKeydown = (event: KeyboardEvent) => {
    // Keep keystrokes away from the editor and the database hotkeys.
    event.stopPropagation();
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.save();
    }
  };

  private readonly stopPropagation = (event: Event) => {
    event.stopPropagation();
  };

  private insert(text: string, caretOffset = text.length, replaceWord = false) {
    const input = this.input;
    let start = input.selectionStart;
    const end = input.selectionEnd;
    if (replaceWord && start === end) {
      start -= this.word$.value.length;
    }
    input.setRangeText(text, start, end, 'end');
    const caret = start + caretOffset;
    input.focus();
    input.setSelectionRange(caret, caret);
    this.syncFromInput();
  }

  private insertProperty(name: string) {
    this.insert(`prop(${quote(name)})`);
  }

  private insertFunction(fn: FormulaFunction) {
    const caret = fn.maxArgs === 0 ? fn.name.length + 2 : fn.name.length + 1;
    this.insert(`${fn.name}()`, caret, true);
  }

  private save() {
    const status = this.status$.value;
    if (status.kind === 'error' && status.blocking) return;
    const expression = formulaToStorage(
      this.dataSource,
      this.text$.value.trim()
    );
    this.property.dataUpdate(() => ({ expression }));
    this.close();
  }

  private close() {
    this.onClose?.();
  }

  private renderStatus() {
    const status = this.status$.value;
    if (status.kind === 'empty') {
      return html`<div class="formula-editor-status">
        Example: prop("Price") * prop("Quantity")
      </div>`;
    }
    if (status.kind === 'error') {
      return html`<div
        class="formula-editor-status error"
        data-testid="formula-editor-error"
      >
        ${status.message}
      </div>`;
    }
    return html`<div class="formula-editor-status">
      Result:
      ${TYPE_LABELS[status.type]}${
        status.preview != null
          ? html` · First row:
              <span data-testid="formula-editor-preview"
                >${status.preview || 'Empty'}</span
              >`
          : nothing
      }
    </div>`;
  }

  private renderFunctions() {
    const functions = this.functions$.value;
    return CATEGORIES.map(category => {
      const items = functions.filter(fn => fn.category === category);
      if (!items.length) return nothing;
      return html`
        <div class="formula-editor-category">${category}</div>
        ${repeat(
          items,
          fn => fn.name,
          fn => html`<button
            class="formula-editor-function"
            @mouseenter="${() => (this.hovered$.value = fn)}"
            @mouseleave="${() => (this.hovered$.value = undefined)}"
            @mousedown="${(e: MouseEvent) => e.preventDefault()}"
            @click="${() => this.insertFunction(fn)}"
          >
            <span>${fn.name}</span>
          </button>`
        )}
      `;
    });
  }

  override render() {
    const status = this.status$.value;
    const hint = this.hint$.value;
    return html`
      <div class="formula-editor-title">Formula</div>
      <textarea
        class="formula-editor-input"
        data-testid="formula-editor-input"
        spellcheck="false"
        placeholder='Type a formula, e.g. prop("Price") * 2'
        @input="${this.syncFromInput}"
        @click="${this.syncFromInput}"
        @keyup="${this.syncFromInput}"
        @keydown="${this.onKeydown}"
        @keypress="${this.stopPropagation}"
        @copy="${this.stopPropagation}"
        @cut="${this.stopPropagation}"
        @paste="${this.stopPropagation}"
      ></textarea>
      ${this.renderStatus()}
      <div class="formula-editor-section">Properties</div>
      <div class="formula-editor-chips">
        ${repeat(
          this.properties$.value,
          item => item.id,
          item => html`<button
            class="formula-editor-chip"
            title="${item.name}"
            @mousedown="${(e: MouseEvent) => e.preventDefault()}"
            @click="${() => this.insertProperty(item.name)}"
          >
            <span class="formula-editor-chip-icon"
              >${renderUniLit(item.icon)}</span
            >
            <span>${item.name}</span>
          </button>`
        )}
      </div>
      <div class="formula-editor-section">Functions</div>
      <div class="formula-editor-functions">${this.renderFunctions()}</div>
      <div class="formula-editor-hint">
        ${
          hint
            ? html`<code>${hint.signature}</code><br />${hint.description}`
            : 'Combine properties with + - * / ^ %, compare with == != < >, and use and, or, not.'
        }
      </div>
      <div class="formula-editor-actions">
        <button class="formula-editor-button" @click="${() => this.close()}">
          Cancel
        </button>
        <button
          class="formula-editor-button primary"
          data-testid="formula-editor-save"
          ?disabled="${status.kind === 'error' && status.blocking}"
          @click="${() => this.save()}"
        >
          Done
        </button>
      </div>
    `;
  }

  @query('textarea')
  accessor input!: HTMLTextAreaElement;

  @property({ attribute: false })
  accessor onClose: (() => void) | undefined;

  @property({ attribute: false })
  accessor property!: Property;
}

export const popFormulaEditor = (target: PopupTarget, property: Property) => {
  if (property.type$.value !== FORMULA_PROPERTY_TYPE) return;
  const editor = new FormulaEditor();
  editor.property = property;
  const popupEnd = target.popupStart();
  const close = createPopup(target, editor, {
    onClose: popupEnd,
    middleware: [
      autoPlacement({
        allowedPlacements: [
          'bottom-start',
          'bottom-end',
          'top-start',
          'top-end',
        ],
      }),
      offset(4),
      shift({ padding: 8 }),
    ],
  });
  editor.onClose = close;
  return close;
};

declare global {
  interface HTMLElementTagNameMap {
    'affine-database-formula-editor': FormulaEditor;
  }
}
