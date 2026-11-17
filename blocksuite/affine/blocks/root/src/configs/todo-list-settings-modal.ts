import { stopPropagation } from '@blocksuite/affine-shared/utils';
import { css, html, LitElement } from 'lit';
import { property, state } from 'lit/decorators.js';

export type TodoFieldDef = {
  key: string;
  label: string;
  type: TodoFieldType;
};

export const TODO_FIELD_TYPES = [
  'text',
  'number',
  'date',
  'select',
  'multi_select',
  'progress',
] as const;

export type TodoFieldType = (typeof TODO_FIELD_TYPES)[number];

export const TODO_FIELD_TYPES_LABEL = TODO_FIELD_TYPES.join('|');

const normalizeTodoFieldType = (type: string): TodoFieldType => {
  const normalized = type.trim().replaceAll('-', '_');
  return TODO_FIELD_TYPES.includes(normalized as TodoFieldType)
    ? (normalized as TodoFieldType)
    : 'text';
};

const isValidTodoFieldKey = (key: string) => /^[A-Za-z0-9_-]+$/.test(key);

export const parseTodoFieldDefs = (value: string): TodoFieldDef[] => {
  const seenKeys = new Set<string>();
  return value
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .map(item => {
      const [rawKey, rawType = 'text', ...labelParts] = item
        .split(':')
        .map(v => v.trim());
      if (!rawKey || !isValidTodoFieldKey(rawKey)) return null;
      if (seenKeys.has(rawKey)) return null;
      seenKeys.add(rawKey);
      return {
        key: rawKey,
        label: labelParts.join(':').trim() || rawKey,
        type: normalizeTodoFieldType(rawType),
      } satisfies TodoFieldDef;
    })
    .filter((v): v is TodoFieldDef => v !== null);
};

export const serializeTodoFieldDefs = (fields: TodoFieldDef[]) =>
  fields
    .map(field =>
      field.label === field.key
        ? `${field.key}:${field.type}`
        : `${field.key}:${field.type}:${field.label}`
    )
    .join(', ');

export class TodoListSettingsModal extends LitElement {
  static override styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: var(--affine-z-index-popover);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 72px;
      background: rgba(0, 0, 0, 0.08);
    }

    .panel {
      width: min(520px, calc(100vw - 24px));
      border-radius: 10px;
      border: 1px solid var(--affine-border-color);
      background: var(--affine-background-primary-color);
      box-shadow: var(--affine-shadow-2);
      padding: 16px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .title {
      font-size: var(--affine-font-sm);
      font-weight: 600;
      color: var(--affine-text-primary-color);
    }

    .label {
      font-size: var(--affine-font-xs);
      color: var(--affine-text-secondary-color);
    }

    textarea,
    select,
    input {
      width: 100%;
      font: inherit;
      font-size: var(--affine-font-xs);
      border: 1px solid var(--affine-border-color);
      border-radius: 8px;
      background: var(--affine-background-primary-color);
      color: var(--affine-text-primary-color);
      padding: 8px 10px;
      box-sizing: border-box;
      outline: none;
    }

    textarea {
      min-height: 88px;
      resize: vertical;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    button {
      border: 1px solid var(--affine-border-color);
      border-radius: 8px;
      background: var(--affine-background-primary-color);
      color: var(--affine-text-primary-color);
      padding: 6px 12px;
      font-size: var(--affine-font-xs);
      cursor: pointer;
    }

    .primary {
      background: var(--affine-primary-color);
      color: var(--affine-white);
      border-color: var(--affine-primary-color);
    }
  `;

  @property({ attribute: false }) accessor initialFields: TodoFieldDef[] = [];
  @property({ attribute: false }) accessor initialLayout:
    | 'inline'
    | 'aligned'
    | 'right' = 'aligned';
  @property({ attribute: false }) accessor onSave:
    | ((payload: {
        fields: TodoFieldDef[];
        layout: 'inline' | 'aligned' | 'right';
        statusMapping: {
          statusColumnName: string;
          doneTagLabel: string;
          notDoneTagLabel?: string;
        };
      }) => void)
    | undefined;
  @property({ attribute: false }) accessor initialStatusColumnName = 'Status';
  @property({ attribute: false }) accessor initialDoneTagLabel = 'Done';
  @property({ attribute: false }) accessor initialNotDoneTagLabel = '';

  @state() private accessor _fieldsText = '';
  @state() private accessor _layout: 'inline' | 'aligned' | 'right' = 'aligned';
  @state() private accessor _statusColumnName = 'Status';
  @state() private accessor _doneTagLabel = 'Done';
  @state() private accessor _notDoneTagLabel = '';

  override connectedCallback(): void {
    super.connectedCallback();
    this._fieldsText = serializeTodoFieldDefs(this.initialFields);
    this._layout = this.initialLayout;
    this._statusColumnName = this.initialStatusColumnName;
    this._doneTagLabel = this.initialDoneTagLabel;
    this._notDoneTagLabel = this.initialNotDoneTagLabel;
  }

  private readonly _close = () => {
    this.remove();
  };

  private readonly _save = () => {
    const fields = parseTodoFieldDefs(this._fieldsText);

    this.onSave?.({
      fields,
      layout: this._layout,
      statusMapping: {
        statusColumnName: this._statusColumnName.trim() || 'Status',
        doneTagLabel: this._doneTagLabel.trim() || 'Done',
        notDoneTagLabel: this._notDoneTagLabel.trim() || undefined,
      },
    });
    this._close();
  };

  setFieldDraftForTesting(value: string) {
    this._fieldsText = value;
  }

  saveForTesting() {
    this._save();
  }

  override render() {
    return html`<div class="panel" @click=${stopPropagation}>
      <div class="title">Todo List Settings</div>
      <div class="label">
        Fields (comma-separated key:type or key:type:label, type is
        ${TODO_FIELD_TYPES_LABEL}). Keys cannot contain spaces; use label for
        display names.
      </div>
      <textarea
        .value=${this._fieldsText}
        @input=${(e: InputEvent) => {
          this._fieldsText = (e.target as HTMLTextAreaElement).value;
        }}
      ></textarea>
      <div class="label">Layout</div>
      <select
        .value=${this._layout}
        @change=${(e: Event) => {
          this._layout = (e.target as HTMLSelectElement).value as
            | 'inline'
            | 'aligned'
            | 'right';
        }}
      >
        <option value="inline">Inline</option>
        <option value="aligned">Aligned</option>
        <option value="right">Right</option>
      </select>
      <div class="label">Database status column name</div>
      <input
        .value=${this._statusColumnName}
        @input=${(e: InputEvent) => {
          this._statusColumnName = (e.target as HTMLInputElement).value;
        }}
      />
      <div class="label">Done tag label in database status</div>
      <input
        .value=${this._doneTagLabel}
        @input=${(e: InputEvent) => {
          this._doneTagLabel = (e.target as HTMLInputElement).value;
        }}
      />
      <div class="label">
        Not-done tag label (empty leaves unchecked TODOs unmapped)
      </div>
      <input
        .value=${this._notDoneTagLabel}
        @input=${(e: InputEvent) => {
          this._notDoneTagLabel = (e.target as HTMLInputElement).value;
        }}
      />
      <div class="actions">
        <button @click=${this._close}>Cancel</button>
        <button class="primary" @click=${this._save}>Save</button>
      </div>
    </div>`;
  }
}

customElements.define('todo-list-settings-modal', TodoListSettingsModal);
