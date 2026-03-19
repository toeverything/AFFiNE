import { toast } from '@blocksuite/affine-components/toast';
import JSZip from 'jszip';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import type { AttachmentBlockComponent } from '../attachment-block';
import { isTextAttachment } from '../utils';

const EXCEL_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const SHARED_STRINGS_XML =
  '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"></sst>';
const CSV_NEWLINE_REGEX = /\r?\n/;

type FileKind = 'csv' | 'xlsx' | 'text' | 'unsupported';

@customElement('affine-attachment-editor-dialog')
export class AttachmentEditorDialogElement extends LitElement {
  static override styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.4);
    }

    .dialog {
      width: min(960px, 94vw);
      height: min(720px, 90vh);
      display: flex;
      flex-direction: column;
      border-radius: 12px;
      background: var(--affine-background-overlay-panel);
      box-shadow: var(--affine-v2-float-window-shadow);
      overflow: hidden;
      color: var(--affine-text-primary-color);
    }

    header {
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--affine-border-color);
      background: var(--affine-background-primary-color);
      font-size: 16px;
      font-weight: 600;
      flex-shrink: 0;
    }

    header span {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-right: 16px;
    }

    header button {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: var(--affine-text-secondary-color);
      cursor: pointer;
      font-size: 20px;
      line-height: 1;
      transition: all 0.15s ease;
      flex-shrink: 0;
    }

    header button:hover {
      background: var(--affine-hover-color);
      color: var(--affine-text-primary-color);
    }

    header button:active {
      background: var(--affine-background-secondary-color);
    }

    .body {
      flex: 1;
      overflow: auto;
      padding: 16px 24px;
      background: var(--affine-background-primary-color);
      display: flex;
      flex-direction: column;
    }

    .body.text-mode {
      padding: 0;
      overflow: hidden;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    thead th {
      background: var(--affine-background-secondary-color);
      position: sticky;
      top: 0;
      z-index: 2;
    }

    th,
    td {
      border: 1px solid var(--affine-border-color);
      padding: 4px;
      min-width: 80px;
    }

    th.index-cell {
      background: var(--affine-background-secondary-color);
      position: sticky;
      left: 0;
      z-index: 1;
      width: 48px;
    }

    td input {
      width: 100%;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      padding: 0;
      outline: none;
    }

    footer {
      border-top: 1px solid var(--affine-border-color);
      padding: 16px 24px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      background: var(--affine-background-primary-color);
      flex-shrink: 0;
    }

    .footer-actions {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    button.action {
      height: 32px;
      border-radius: 8px;
      padding: 0 16px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      border: none;
      outline: none;
      white-space: nowrap;
    }

    button.action.secondary {
      background: transparent;
      color: var(--affine-text-secondary-color);
      border: 1px solid var(--affine-border-color);
    }

    button.action.secondary:hover {
      background: var(--affine-hover-color);
      color: var(--affine-text-primary-color);
      border-color: var(--affine-border-color);
    }

    button.action.secondary:active {
      background: var(--affine-background-secondary-color);
    }

    button.action.primary {
      background: var(--affine-primary-color);
      color: var(--affine-white);
      border: 1px solid var(--affine-primary-color);
    }

    button.action.primary:hover {
      background: var(--affine-primary-color);
      opacity: 0.9;
    }

    button.action.primary:active {
      opacity: 0.8;
    }

    button.action[disabled] {
      opacity: 0.4;
      cursor: not-allowed;
      pointer-events: none;
    }

    .status {
      font-size: 13px;
      color: var(--affine-text-secondary-color);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .status.saved {
      color: var(--affine-success-color, #10a37f);
    }

    .error {
      color: var(--affine-error-color);
    }

    .empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--affine-text-secondary-color);
    }

    .text-editor {
      width: 100%;
      height: 100%;
      border: none;
      resize: none;
      background: transparent;
      color: inherit;
      font: 13px/1.5 var(--affine-font-family, monospace);
      outline: none;
      white-space: pre;
      overflow: auto;
      padding: 16px 24px;
    }
  `;

  @property({ attribute: false })
  accessor block!: AttachmentBlockComponent;

  @state()
  accessor _loading = true;

  @state()
  accessor _saving = false;

  @state()
  accessor _dirty = false;

  @state()
  accessor _error: string | null = null;

  @state()
  private accessor _rows: string[][] = [];

  @state()
  private accessor _fileKind: FileKind = 'unsupported';

  @state()
  private accessor _textContent = '';

  private _zip: JSZip | null = null;
  private _worksheetPath: string | null = null;
  private _worksheetDoc: Document | null = null;

  private readonly _keyListener = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._keyListener);

    // Stop all pointer events from bubbling to prevent peek view from opening
    this.addEventListener('click', e => e.stopPropagation());
    this.addEventListener('dblclick', e => e.stopPropagation());
    this.addEventListener('mousedown', e => e.stopPropagation());
    this.addEventListener('mouseup', e => e.stopPropagation());

    this._initialize().catch(error => {
      console.error('Initialization error:', error);
      this._error =
        error instanceof Error ? error.message : 'Failed to open attachment';
      this._loading = false;
    });
  }

  override disconnectedCallback() {
    document.removeEventListener('keydown', this._keyListener);
    super.disconnectedCallback();
  }

  private async _initialize() {
    this._loading = true;
    this._error = null;
    const model = this.block.model;
    const name = model.props.name;
    const type = model.props.type;
    const blob = await this.block.resourceController.blob();
    if (!blob) {
      throw new Error('Attachment data unavailable');
    }

    if (isCsvFile(type, name)) {
      const text = await blob.text();
      this._rows = ensureMatrix(parseCsv(text));
      this._fileKind = 'csv';
    } else if (isXlsxFile(type, name)) {
      const buffer = await blob.arrayBuffer();
      const { rows, zip, worksheetPath, worksheetDoc } = await loadXlsx(buffer);
      this._rows = ensureMatrix(rows);
      this._fileKind = 'xlsx';
      this._zip = zip;
      this._worksheetPath = worksheetPath;
      this._worksheetDoc = worksheetDoc;
    } else if (isTextAttachment(type, name)) {
      const text = await blob.text();
      this._textContent = text;
      this._fileKind = 'text';
    } else {
      this._fileKind = 'unsupported';
      throw new Error('Unsupported attachment type for editing');
    }

    this._loading = false;
    this.requestUpdate();
  }

  close() {
    this.remove();
  }

  private _handleMaskClick(event: MouseEvent) {
    // Prevent any events from bubbling to parent elements
    event.stopPropagation();
    event.preventDefault();

    if (event.target === this) {
      this.close();
    }
  }

  private _onCellInput(rowIndex: number, columnIndex: number, value: string) {
    this._rows = this._rows.map((row, ri) =>
      ri === rowIndex
        ? row.map((cell, ci) => (ci === columnIndex ? value : cell))
        : row
    );
    this._dirty = true;
  }

  private _onTextInput(value: string) {
    this._textContent = value;
    this._dirty = true;
  }

  private _addRow() {
    const columnCount = this._columnCount;
    const emptyRow = new Array(columnCount).fill('');
    this._rows = [...this._rows, emptyRow];
    this._dirty = true;
  }

  private _removeRow() {
    if (this._rows.length <= 1) return;
    this._rows = this._rows.slice(0, -1);
    this._dirty = true;
  }

  private _addColumn() {
    this._rows = this._rows.map(row => [...row, '']);
    this._dirty = true;
  }

  private _removeColumn() {
    if (this._columnCount <= 1) return;
    this._rows = this._rows.map(row => row.slice(0, -1));
    this._dirty = true;
  }

  private get _columnCount() {
    return Math.max(1, ...this._rows.map(row => row.length));
  }

  private get _fileName() {
    return this.block.model.props.name;
  }

  private get _fileType() {
    return this.block.model.props.type;
  }

  private async _save() {
    if (this._saving || this._fileKind === 'unsupported') {
      return;
    }

    this._saving = true;

    try {
      let blob: Blob;
      if (this._fileKind === 'csv') {
        const rows = ensureMatrix(this._rows);
        const csv = stringifyCsv(rows);
        blob = new Blob([csv], { type: this._fileType });
      } else if (this._fileKind === 'xlsx') {
        if (!this._zip || !this._worksheetPath || !this._worksheetDoc) {
          throw new Error('Workbook context missing');
        }
        const rows = ensureMatrix(this._rows);
        updateWorksheetDoc(this._worksheetDoc, rows);
        this._zip.file(
          this._worksheetPath,
          new XMLSerializer().serializeToString(this._worksheetDoc)
        );
        this._zip.file('xl/sharedStrings.xml', SHARED_STRINGS_XML);
        const arrayBuffer = await this._zip.generateAsync({
          type: 'arraybuffer',
        });
        blob = new Blob([arrayBuffer], { type: this._fileType });
      } else {
        const text = this._textContent ?? '';
        const type = this._fileType || 'text/plain';
        blob = new Blob([text], { type });
      }

      const fileType =
        this._fileKind === 'text' ? blob.type || 'text/plain' : this._fileType;
      const file = new File([blob], this._fileName, { type: fileType });
      const sourceId = await this.block.std.store.blobSync.set(file);
      const size = blob.size;

      this.block.std.store.captureSync();
      this.block.std.store.transact(() => {
        this.block.std.store.updateBlock(this.block.blockId, {
          sourceId,
          size,
          type: fileType,
        });
        this.block.reload();
      });

      toast(this.block.host, 'Attachment updated');
      this._dirty = false;
      this.close();
    } catch (error) {
      console.error(error);
      toast(
        this.block.host,
        error instanceof Error
          ? error.message
          : 'Failed to save attachment changes'
      );
    } finally {
      this._saving = false;
    }
  }

  override render() {
    return html`
      <div class="mask" @click=${this._handleMaskClick}></div>
      <div class="dialog">
        <header>
          <span>Edit ${this._fileName}</span>
          <button @click=${() => this.close()} aria-label="Close editor">
            ×
          </button>
        </header>
        <div class="body ${this._fileKind === 'text' ? 'text-mode' : ''}">
          ${this._loading
            ? html`<div class="empty">Loading attachment…</div>`
            : this._error
              ? html`<div class="empty error">${this._error}</div>`
              : this._fileKind === 'text'
                ? this._renderTextEditor()
                : this._renderTable()}
        </div>
        <footer>
          ${this._fileKind === 'text'
            ? nothing
            : html`
                <div class="footer-actions">
                  <button
                    class="action secondary"
                    @click=${() => this._addRow()}
                  >
                    Add row
                  </button>
                  <button
                    class="action secondary"
                    @click=${() => this._removeRow()}
                  >
                    Remove row
                  </button>
                  <button
                    class="action secondary"
                    @click=${() => this._addColumn()}
                  >
                    Add column
                  </button>
                  <button
                    class="action secondary"
                    @click=${() => this._removeColumn()}
                  >
                    Remove column
                  </button>
                </div>
              `}
          <div class="footer-actions">
            <span class="status ${!this._dirty ? 'saved' : ''}">
              ${this._dirty ? 'Unsaved changes' : 'All changes saved'}
            </span>
            <button class="action secondary" @click=${() => this.close()}>
              Cancel
            </button>
            <button
              class="action primary"
              @click=${() => this._save()}
              ?disabled=${!this._dirty || this._saving}
            >
              ${this._saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </footer>
      </div>
    `;
  }

  private _renderTable() {
    if (!this._rows.length) {
      return html`<div class="empty">No rows available</div>`;
    }

    const columnCount = this._columnCount;
    const header = Array.from({ length: columnCount }, (_, index) =>
      columnIndexToName(index)
    );

    return html`
      <table>
        <thead>
          <tr>
            <th class="index-cell"></th>
            ${header.map(col => html`<th>${col}</th>`)}
          </tr>
        </thead>
        <tbody>
          ${this._rows.map(
            (row, rowIndex) => html`
              <tr>
                <th class="index-cell">${rowIndex + 1}</th>
                ${row.map(
                  (value, columnIndex) => html`
                    <td>
                      <input
                        type="text"
                        .value=${value}
                        @input=${(event: Event) =>
                          this._onCellInput(
                            rowIndex,
                            columnIndex,
                            (event.target as HTMLInputElement).value
                          )}
                      />
                    </td>
                  `
                )}
                ${row.length < columnCount
                  ? Array.from({ length: columnCount - row.length }).map(
                      (_, columnIndex) => html`
                        <td>
                          <input
                            type="text"
                            .value=${''}
                            @input=${(event: Event) =>
                              this._onCellInput(
                                rowIndex,
                                row.length + columnIndex,
                                (event.target as HTMLInputElement).value
                              )}
                          />
                        </td>
                      `
                    )
                  : nothing}
              </tr>
            `
          )}
        </tbody>
      </table>
    `;
  }

  private _renderTextEditor() {
    return html`
      <textarea
        class="text-editor"
        .value=${this._textContent}
        @input=${(event: Event) =>
          this._onTextInput((event.target as HTMLTextAreaElement).value)}
      ></textarea>
    `;
  }
}

export function createAttachmentEditorDialog(block: AttachmentBlockComponent) {
  const element = document.createElement(
    'affine-attachment-editor-dialog'
  ) as AttachmentEditorDialogElement;
  element.block = block;
  document.body.append(element);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        const next = text[i + 1];
        if (next === '"') {
          currentValue += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i += 1;
          continue;
        }
      } else {
        currentValue += char;
        i += 1;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (char === ',') {
        currentRow.push(currentValue);
        currentValue = '';
        i += 1;
        continue;
      }
      if (char === '\r' || char === '\n') {
        currentRow.push(currentValue);
        rows.push(currentRow);
        currentRow = [];
        currentValue = '';
        if (char === '\r' && text[i + 1] === '\n') {
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }
      currentValue += char;
      i += 1;
      continue;
    }
  }

  currentRow.push(currentValue);
  rows.push(currentRow);
  return rows.length ? rows : [['']];
}

function stringifyCsv(rows: string[][]): string {
  const lines = rows.map(row =>
    row
      .map(value => {
        if (
          value.includes('"') ||
          value.includes(',') ||
          CSV_NEWLINE_REGEX.test(value)
        ) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      })
      .join(',')
  );
  return lines.join('\r\n');
}

function ensureMatrix(rows: string[][]): string[][] {
  if (!rows.length) {
    return [['']];
  }
  const columnCount = Math.max(1, ...rows.map(row => row.length));
  return rows.map(row => {
    if (row.length === columnCount) return [...row];
    const filled = [...row];
    while (filled.length < columnCount) {
      filled.push('');
    }
    return filled;
  });
}

function isCsvFile(type: string, name: string) {
  const lower = name.toLowerCase();
  return (
    type === 'text/csv' ||
    type === 'application/csv' ||
    lower.endsWith('.csv') ||
    lower.endsWith('.tsv')
  );
}

function isXlsxFile(type: string, name: string) {
  const lower = name.toLowerCase();
  return (
    type ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    lower.endsWith('.xlsx')
  );
}

function columnIndexToName(index: number): string {
  let result = '';
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function parseCellReference(ref: string): { row: number; column: number } {
  const match = /^([A-Za-z]+)(\d+)$/.exec(ref);
  if (!match) return { row: 0, column: 0 };
  const [, letters, row] = match;
  let column = 0;
  for (const char of letters.toUpperCase()) {
    column = column * 26 + (char.charCodeAt(0) - 64);
  }
  return { column: column - 1, row: Number(row) - 1 };
}

async function loadXlsx(buffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buffer);
  const worksheetPath = Object.keys(zip.files).find(path =>
    path.startsWith('xl/worksheets/sheet')
  );
  if (!worksheetPath) {
    throw new Error('No worksheet found in workbook');
  }
  const worksheetXml = await zip.file(worksheetPath)!.async('string');
  const worksheetDoc = new DOMParser().parseFromString(
    worksheetXml,
    'application/xml'
  );
  const sharedStrings = await loadSharedStrings(zip);

  const rows = extractRowsFromWorksheet(worksheetDoc, sharedStrings);

  return { rows, zip, worksheetPath, worksheetDoc };
}

async function loadSharedStrings(zip: JSZip): Promise<string[]> {
  const file = zip.file('xl/sharedStrings.xml');
  if (!file) return [];
  const xml = await file.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const siElements = getElements(doc, 'si');
  return siElements.map(si => {
    const t = getElements(si, 't')[0];
    if (t?.textContent) {
      return t.textContent;
    }
    return '';
  });
}

function extractRowsFromWorksheet(
  worksheetDoc: Document,
  sharedStrings: string[]
): string[][] {
  const sheetData = getElements(worksheetDoc, 'sheetData')[0];
  if (!sheetData) return [['']];
  const rows: string[][] = [];
  let maxColumn = 0;
  const rowElements = getElements(sheetData, 'row');
  for (const rowEl of rowElements) {
    const rowAttr = rowEl.getAttribute('r');
    const rowIndex = rowAttr ? Number(rowAttr) - 1 : rows.length;
    if (!rows[rowIndex]) {
      rows[rowIndex] = [];
    }
    const cellElements = getElements(rowEl, 'c');
    for (const cell of cellElements) {
      const ref = cell.getAttribute('r') ?? '';
      const { column } = parseCellReference(ref);
      const type = cell.getAttribute('t');
      let value = '';
      if (type === 'inlineStr') {
        const isEl = getElements(cell, 'is')[0];
        const tEl = isEl ? getElements(isEl, 't')[0] : undefined;
        value = tEl?.textContent ?? '';
      } else if (type === 's') {
        const vEl = getElements(cell, 'v')[0];
        const index = vEl ? Number(vEl.textContent ?? 0) : 0;
        value = sharedStrings[index] ?? '';
      } else {
        const vEl = getElements(cell, 'v')[0];
        value = vEl?.textContent ?? '';
      }
      rows[rowIndex][column] = value;
      if (column > maxColumn) {
        maxColumn = column;
      }
    }
  }

  const columnCount = maxColumn + 1;
  return ensureMatrix(rows.length ? rows : [['']]).map(row => {
    const copy = [...row];
    while (copy.length < columnCount) {
      copy.push('');
    }
    return copy;
  });
}

function updateWorksheetDoc(doc: Document, rows: string[][]) {
  const sheetData = getElements(doc, 'sheetData')[0];
  if (!sheetData) {
    throw new Error('Worksheet is missing sheetData element');
  }

  while (sheetData.firstChild) {
    sheetData.removeChild(sheetData.firstChild);
  }

  const columnCount = Math.max(1, ...rows.map(row => row.length));

  rows.forEach((row, rowIndex) => {
    const rowEl = doc.createElementNS(EXCEL_NS, 'row');
    rowEl.setAttribute('r', String(rowIndex + 1));
    row.forEach((value, columnIndex) => {
      const cellEl = doc.createElementNS(EXCEL_NS, 'c');
      const cellRef = `${columnIndexToName(columnIndex)}${rowIndex + 1}`;
      cellEl.setAttribute('r', cellRef);
      cellEl.setAttribute('t', 'inlineStr');
      const isEl = doc.createElementNS(EXCEL_NS, 'is');
      const tEl = doc.createElementNS(EXCEL_NS, 't');
      tEl.textContent = value;
      isEl.appendChild(tEl);
      cellEl.appendChild(isEl);
      rowEl.appendChild(cellEl);
    });
    sheetData.appendChild(rowEl);
  });

  const dimension = getElements(doc, 'dimension')[0];
  if (dimension) {
    if (rows.length === 0 || columnCount === 0) {
      dimension.setAttribute('ref', 'A1');
    } else {
      dimension.setAttribute(
        'ref',
        `A1:${columnIndexToName(columnCount - 1)}${rows.length}`
      );
    }
  }
}

function getElements(root: Document | Element, tag: string): Element[] {
  const namespaceList =
    (root as Document).getElementsByTagNameNS?.('*', tag) ??
    (root as Element).getElementsByTagNameNS?.('*', tag);
  if (namespaceList && namespaceList.length) {
    return Array.from(namespaceList);
  }
  const withoutNs =
    (root as Document).getElementsByTagName?.(tag) ??
    (root as Element).getElementsByTagName?.(tag);
  return withoutNs ? Array.from(withoutNs) : [];
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-attachment-editor-dialog': AttachmentEditorDialogElement;
  }
}
