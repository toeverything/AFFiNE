import '@blocksuite/affine-shared/commands';

import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import { playCheckAnimation } from '@blocksuite/affine-components/icons';
import { TOGGLE_BUTTON_PARENT_CLASS } from '@blocksuite/affine-components/toggle-button';
import { DefaultInlineManagerExtension } from '@blocksuite/affine-inline-preset';
import type { ListBlockModel } from '@blocksuite/affine-model';
import type { RichText } from '@blocksuite/affine-rich-text';
import {
  BLOCK_CHILDREN_CONTAINER_PADDING_LEFT,
  EDGELESS_TOP_CONTENTEDITABLE_SELECTOR,
} from '@blocksuite/affine-shared/consts';
import {
  DocModeProvider,
  EditorSettingProvider,
  TaskWorkflowDefaultsSchema,
} from '@blocksuite/affine-shared/services';
import {
  computeTodoParentCheckedFromChildModels,
  createTodoCheckedTransitionTracker,
  createTodoTaskInteropLink,
  getViewportElement,
  TASK_INTEROP_UPDATED_EVENT,
  type TaskInteropUpdatedDetail,
} from '@blocksuite/affine-shared/utils';
import type { BlockComponent } from '@blocksuite/std';
import { BlockSelection, TextSelection } from '@blocksuite/std';
import {
  getInlineRangeProvider,
  type InlineRangeProvider,
} from '@blocksuite/std/inline';
import type { BaseSelection } from '@blocksuite/store';
import { effect } from '@preact/signals-core';
import { html, nothing, type TemplateResult } from 'lit';
import { query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { correctNumberedListsOrderToPrev } from './commands/utils.js';
import { listBlockStyles } from './styles.js';
import { getTodoConfigFromProvider } from './todo-config.js';
import { getListIcon } from './utils/get-list-icon.js';

export class ListBlockComponent extends CaptionedBlockComponent<ListBlockModel> {
  static override styles = listBlockStyles;
  private readonly _todoCheckedTracker = createTodoCheckedTransitionTracker();

  private dispatchTaskInteropCheckedUpdated(model: ListBlockModel) {
    const costValue = model.props.todoFieldValues?.cost;
    const cost = typeof costValue === 'number' ? costValue : undefined;
    this.dispatchEvent(
      new CustomEvent<TaskInteropUpdatedDetail>(TASK_INTEROP_UPDATED_EVENT, {
        detail: {
          link: createTodoTaskInteropLink({
            docId: this.store.id,
            blockId: model.id,
            title: this.getTodoListRoot(model).props.todoListTitle,
            cost,
          }),
          changed: ['checked'],
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  private recomputeTodoAncestorsFrom(
    model: ListBlockModel,
    changedModelChecked?: boolean
  ) {
    let parent = this.store.getParent(model) as ListBlockModel | null;
    while (parent) {
      if (parent.flavour !== 'affine:list' || parent.props.type !== 'todo') {
        parent = this.store.getParent(parent) as ListBlockModel | null;
        continue;
      }

      const todoChildren = parent.children.filter(
        child =>
          child.flavour === 'affine:list' &&
          (child as ListBlockModel).props.type === 'todo'
      ) as ListBlockModel[];
      const parentChecked = computeTodoParentCheckedFromChildModels(
        todoChildren.map(child => ({
          id: child.id,
          checked: child.props.checked,
        })),
        changedModelChecked !== undefined
          ? { id: model.id, checked: changedModelChecked }
          : undefined
      );

      if (parentChecked !== null && parentChecked !== parent.props.checked) {
        this.store.updateBlock(parent, { checked: parentChecked });
        this.dispatchTaskInteropCheckedUpdated(parent);
      }
      parent = this.store.getParent(parent) as ListBlockModel | null;
    }
  }

  private _inlineRangeProvider: InlineRangeProvider | null = null;

  private readonly _onClickIcon = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (this.model.props.type === 'toggle') {
      if (this.store.readonly) {
        this._readonlyCollapsed = !this._readonlyCollapsed;
      } else {
        this.store.captureSync();
        this.store.updateBlock(this.model, {
          collapsed: !this.model.props.collapsed,
        });
      }

      return;
    } else if (this.model.props.type === 'todo') {
      if (this.store.readonly) return;

      this.store.captureSync();
      const checkedPropObj = { checked: !this.model.props.checked };
      this.store.updateBlock(this.model, checkedPropObj);
      if (this.model.props.checked) {
        const checkEl = this.querySelector('.affine-list-block__todo-prefix');
        if (checkEl) {
          playCheckAnimation(checkEl).catch(console.error);
        }
      }
      return;
    }
    this._select();
  };

  private getTodoListRoot(model: ListBlockModel) {
    let current: ListBlockModel = model;
    let parent = this.store.getParent(current) as ListBlockModel | null;
    while (parent?.flavour === 'affine:list' && parent.props.type === 'todo') {
      current = parent as ListBlockModel;
      parent = this.store.getParent(current) as ListBlockModel | null;
    }
    return current;
  }

  private getTodoRootGroup(root: ListBlockModel) {
    const parentContainer = this.store.getParent(root);
    const siblingModels = parentContainer?.children ?? [];
    const rootIndex = siblingModels.findIndex(v => v.id === root.id);
    const group: ListBlockModel[] = [];
    if (rootIndex < 0) return [root];

    for (let i = rootIndex; i >= 0; i--) {
      const model = siblingModels[i] as ListBlockModel | undefined;
      if (
        !model ||
        model.flavour !== 'affine:list' ||
        model.props.type !== 'todo'
      ) {
        break;
      }
      group.unshift(model);
    }
    for (let i = rootIndex + 1; i < siblingModels.length; i++) {
      const model = siblingModels[i] as ListBlockModel | undefined;
      if (
        !model ||
        model.flavour !== 'affine:list' ||
        model.props.type !== 'todo'
      ) {
        break;
      }
      group.push(model);
    }
    return group.length > 0 ? group : [root];
  }

  private getTodoGroupConfig(model: ListBlockModel) {
    const root = this.getTodoListRoot(model);
    const group = this.getTodoRootGroup(root);
    const provider =
      group.find(v => (v.props.todoFieldDefs?.length ?? 0) > 0) ?? root;
    // `EditorSettingProvider` is only registered on the real, top-level
    // editor scope — a nested `BlockStdScope` (e.g. a cross-doc
    // `note-ref`/`database-ref` preview, which renders todo-mode `affine:
    // list` blocks straight through) has no such provider, so `getOptional`
    // returns `undefined` here and the chain short-circuits to `undefined`
    // rather than `{}`. Falling back to `{}` matches every other call site
    // of this same schema (`commands.ts`'s own identical fallback) and lets
    // `TaskWorkflowDefaultsSchema`'s own per-field defaults apply, instead
    // of throwing a `ZodError` the moment a todo list renders inside a
    // reference.
    const defaults = TaskWorkflowDefaultsSchema.parse(
      this.std.getOptional(EditorSettingProvider)?.setting$.peek()
        .taskWorkflowDefaults ?? {}
    );
    return getTodoConfigFromProvider(provider, defaults.list);
  }

  private readonly _stopInputEvent = (e: Event) => {
    e.stopPropagation();
  };

  private readonly _onTodoCostInput = (e: InputEvent) => {
    const target = e.target as HTMLInputElement;
    const key = target.dataset.todoFieldKey;
    const type = target.dataset.todoFieldType as
      | 'text'
      | 'number'
      | 'date'
      | 'select'
      | 'multi_select'
      | 'progress'
      | undefined;
    if (
      this.store.readonly ||
      this.model.props.type !== 'todo' ||
      !key ||
      !type
    ) {
      return;
    }
    const raw = target.value.trim();
    const currentValues = { ...this.model.props.todoFieldValues };
    if (raw.length === 0) {
      delete currentValues[key];
    } else if (type === 'number' || type === 'progress') {
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      if (type === 'progress' && (n < 0 || n > 100)) return;
      currentValues[key] = n;
    } else {
      currentValues[key] = raw;
    }
    this.store.captureSync();
    this.store.updateBlock(this.model, {
      todoFieldValues:
        Object.keys(currentValues).length > 0 ? currentValues : undefined,
    });
  };

  private getTodoFieldInputSize(value: unknown, placeholder: string) {
    const valueLength = String(value ?? '').length;
    const placeholderLength = placeholder.length;
    return Math.max(
      6,
      Math.min(36, Math.max(valueLength, placeholderLength) + 1)
    );
  }

  get attributeRenderer() {
    return this.inlineManager.getRenderer();
  }

  get attributesSchema() {
    return this.inlineManager.getSchema();
  }

  get embedChecker() {
    return this.inlineManager.embedChecker;
  }

  get inlineManager() {
    return this.std.get(DefaultInlineManagerExtension.identifier);
  }

  override get topContenteditableElement() {
    if (this.std.get(DocModeProvider).getEditorMode() === 'edgeless') {
      return this.closest<BlockComponent>(
        EDGELESS_TOP_CONTENTEDITABLE_SELECTOR
      );
    }
    return this.rootComponent;
  }

  private _select() {
    const selection = this.host.selection;
    selection.update(selList => {
      return selList
        .filter<BaseSelection>(
          sel => !sel.is(TextSelection) && !sel.is(BlockSelection)
        )
        .concat(selection.create(BlockSelection, { blockId: this.blockId }));
    });
  }

  override connectedCallback() {
    super.connectedCallback();

    this._inlineRangeProvider = getInlineRangeProvider(this);

    this.disposables.add(
      effect(() => {
        const collapsed = this.model.props.collapsed$.value;
        this._readonlyCollapsed = collapsed;
      })
    );

    this.disposables.add(
      effect(() => {
        const type = this.model.props.type$.value;
        const order = this.model.props.order$.value;
        // old numbered list has no order
        if (type === 'numbered' && !Number.isInteger(order)) {
          correctNumberedListsOrderToPrev(this.store, this.model, false);
        }
        // if list is not numbered, order should be null
        if (type !== 'numbered' && order !== null) {
          this.model.props.order = null;
        }
      })
    );

    this.disposables.add(
      effect(() => {
        const type = this.model.props.type$.value;
        const checked = this.model.props.checked$.value;
        if (!this._todoCheckedTracker.shouldRecompute(type, checked)) {
          return;
        }
        this.dispatchTaskInteropCheckedUpdated(this.model);
        this.recomputeTodoAncestorsFrom(this.model, checked);
      })
    );
  }

  override async getUpdateComplete() {
    const result = await super.getUpdateComplete();
    await this._richTextElement?.updateComplete;
    return result;
  }

  override renderBlock(): TemplateResult<1> {
    const { model, _onClickIcon } = this;
    const widgets = html`${repeat(
      Object.entries(this.widgets),
      ([id]) => id,
      ([_, widget]) => widget
    )}`;
    const collapsed = this.store.readonly
      ? this._readonlyCollapsed
      : model.props.collapsed;

    const listIcon = getListIcon(model, !collapsed, _onClickIcon);
    const todoConfig =
      this.model.props.type === 'todo'
        ? this.getTodoGroupConfig(this.model)
        : null;
    const todoFieldDefs = todoConfig?.fieldDefs ?? [];
    const todoFieldLayout = todoConfig?.layout ?? 'inline';

    const textAlignStyle = styleMap({
      textAlign: this.model.props.textAlign$?.value,
    });

    const childrenId = `list-children-${this.model.id}`;
    const children = html`<div
      id=${childrenId}
      class="affine-block-children-container"
      style=${styleMap({
        paddingLeft: `${BLOCK_CHILDREN_CONTAINER_PADDING_LEFT}px`,
        display: collapsed ? 'none' : undefined,
      })}
    >
      ${this.renderChildren(this.model)}
    </div>`;

    return html`
      <div class=${'affine-list-block-container'} style="${textAlignStyle}">
        <div
          data-todo-layout=${this.model.props.type === 'todo'
            ? todoFieldLayout
            : ''}
          class=${classMap({
            'affine-list-rich-text-wrapper': true,
            'affine-list--checked':
              this.model.props.type === 'todo' && this.model.props.checked,
            [TOGGLE_BUTTON_PARENT_CLASS]: true,
          })}
        >
          ${
            this.model.children.length > 0
              ? html`
                  <blocksuite-toggle-button
                    .collapsed=${collapsed}
                    .controls=${childrenId}
                    .updateCollapsed=${(value: boolean) => {
                      if (this.store.readonly) {
                        this._readonlyCollapsed = value;
                      } else {
                        this.store.captureSync();
                        this.store.updateBlock(this.model, {
                          collapsed: value,
                        });
                      }
                    }}
                  ></blocksuite-toggle-button>
                `
              : nothing
          }
          ${listIcon}
          <rich-text
            .yText=${this.model.props.text.yText}
            .inlineEventSource=${this.topContenteditableElement ?? nothing}
            .undoManager=${this.store.history.undoManager}
            .attributeRenderer=${this.attributeRenderer}
            .attributesSchema=${this.attributesSchema}
            .markdownMatches=${this.inlineManager?.markdownMatches}
            .embedChecker=${this.embedChecker}
            .readonly=${this.store.readonly}
            .inlineRangeProvider=${this._inlineRangeProvider}
            .enableClipboard=${false}
            .enableUndoRedo=${false}
            .verticalScrollContainerGetter=${() =>
              getViewportElement(this.host)}
          ></rich-text>
          ${this.model.props.type === 'todo'
            ? html`<span
                class="affine-list-todo-fields"
                data-layout=${todoFieldLayout}
                style=${styleMap({
                  '--affine-todo-field-count': String(
                    Math.max(todoFieldDefs.length, 1)
                  ),
                })}
                contenteditable="false"
                @mousedown=${this._stopInputEvent}
                @click=${this._stopInputEvent}
              >
                ${repeat(
                  todoFieldDefs,
                  field => field.key,
                  field =>
                    html`<input
                      class=${field.type === 'number' ||
                      field.type === 'progress'
                        ? 'affine-list-todo-field-input affine-list-todo-field-input-number'
                        : 'affine-list-todo-field-input'}
                      data-todo-field-key=${field.key}
                      data-todo-field-type=${field.type}
                      .value=${String(
                        this.model.props.todoFieldValues?.[field.key] ?? ''
                      )}
                      .size=${todoFieldLayout === 'inline'
                        ? this.getTodoFieldInputSize(
                            this.model.props.todoFieldValues?.[field.key],
                            field.label
                          )
                        : 1}
                      placeholder=${field.label}
                      inputmode=${field.type === 'number' ||
                      field.type === 'progress'
                        ? 'decimal'
                        : 'text'}
                      @input=${this._onTodoCostInput}
                    />`
                )}
              </span>`
            : nothing}
        </div>

        ${children} ${widgets}
      </div>
    `;
  }

  @state()
  private accessor _readonlyCollapsed = false;

  @query('rich-text')
  private accessor _richTextElement: RichText | null = null;

  override accessor blockContainerStyles = {
    margin: 'var(--affine-list-margin, 10px 0)',
  };
}
