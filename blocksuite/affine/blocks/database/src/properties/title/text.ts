import { playCheckAnimation } from '@blocksuite/affine-components/icons';
import { DefaultInlineManagerExtension } from '@blocksuite/affine-inline-preset';
import type { RichText } from '@blocksuite/affine-rich-text';
import {
  ParseDocUrlProvider,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import { getViewportElement } from '@blocksuite/affine-shared/utils';
import { BaseCellRenderer } from '@blocksuite/data-view';
import { IS_MAC } from '@blocksuite/global/env';
import {
  CheckBoxCheckSolidIcon,
  CheckBoxUnIcon,
  LinkedPageIcon,
} from '@blocksuite/icons/lit';
import type { BlockSnapshot, DeltaInsert, Text } from '@blocksuite/store';
import { computed, signal } from '@preact/signals-core';
import { property } from 'lit/decorators.js';
import { createRef, ref } from 'lit/directives/ref.js';
import { html } from 'lit/static-html.js';

import { EditorHostKey } from '../../context/host-context.js';
import type { DatabaseBlockComponent } from '../../database-block.js';
import { getSingleDocIdFromText } from '../../utils/title-doc.js';
import { analyzeTextForUrlPaste, insertUrlTextSegments } from '../paste-url.js';
import {
  headerAreaIconStyle,
  titleCellStyle,
  titleRichTextStyle,
  titleTaskCheckboxStyle,
} from './cell-renderer-css.js';
import { createTapToggle } from './tap-toggle.js';

type TaskStatusDataSource = {
  ensureRowAsTodoList?: (rowId: string) => boolean;
  getTaskStatusColumn?: () => { id: string } | undefined;
  getTaskStatusInfo?: (
    rowId: string,
    propertyId?: string
  ) => { checked: boolean } | null;
  getTodoListRowChecked?: (rowId: string) => boolean | undefined;
  cellValueGet?: (rowId: string, propertyId: string) => unknown;
  setTaskStatusChecked?: (
    rowId: string,
    checked: boolean,
    propertyId?: string
  ) => void;
  setTodoListRowChecked?: (rowId: string, checked: boolean) => void;
};

export class HeaderAreaTextCell extends BaseCellRenderer<Text, string> {
  activity = true;

  docId$ = signal<string>();

  get host() {
    return this.view.serviceGet(EditorHostKey);
  }

  get inlineEditor() {
    return this.richText.value?.inlineEditor;
  }

  get inlineManager() {
    return this.host?.std.get(DefaultInlineManagerExtension.identifier);
  }

  get topContenteditableElement() {
    const databaseBlock =
      this.closest<DatabaseBlockComponent>('affine-database');
    return databaseBlock?.topContenteditableElement;
  }

  get std() {
    return this.view.serviceGet(EditorHostKey)?.std;
  }

  private ensureTodoListRowWhenMounted() {
    if (this.view.type !== 'list') {
      return false;
    }
    const dataSource = this.view.manager.dataSource as TaskStatusDataSource;
    if (dataSource.ensureRowAsTodoList?.(this.cell.rowId)) {
      this.requestUpdate();
      return true;
    }
    return false;
  }

  private readonly _onCopy = (e: ClipboardEvent) => {
    const inlineEditor = this.inlineEditor;
    if (!inlineEditor) return;

    const inlineRange = inlineEditor.getInlineRange();
    if (!inlineRange) return;

    const text = inlineEditor.yTextString.slice(
      inlineRange.index,
      inlineRange.index + inlineRange.length
    );

    e.clipboardData?.setData('text/plain', text);
    e.preventDefault();
    e.stopPropagation();
  };

  private readonly _onCut = (e: ClipboardEvent) => {
    const inlineEditor = this.inlineEditor;
    if (!inlineEditor) return;

    const inlineRange = inlineEditor.getInlineRange();
    if (!inlineRange) return;

    const text = inlineEditor.yTextString.slice(
      inlineRange.index,
      inlineRange.index + inlineRange.length
    );
    inlineEditor.deleteText(inlineRange);
    inlineEditor.setInlineRange({
      index: inlineRange.index,
      length: 0,
    });

    e.clipboardData?.setData('text/plain', text);
    e.preventDefault();
    e.stopPropagation();
  };

  private readonly _onPaste = (e: ClipboardEvent) => {
    const inlineEditor = this.inlineEditor;
    const inlineRange = inlineEditor?.getInlineRange();
    if (!inlineEditor || !inlineRange) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.clipboardData) {
      try {
        const getDeltas = (snapshot: BlockSnapshot): DeltaInsert[] => {
          // @ts-expect-error FIXME: ts error
          const text = snapshot.props?.text?.delta;
          return text
            ? [...text, ...(snapshot.children?.flatMap(getDeltas) ?? [])]
            : snapshot.children?.flatMap(getDeltas);
        };
        const snapshot = this.std?.clipboard?.readFromClipboard(
          e.clipboardData
        )['BLOCKSUITE/SNAPSHOT'];
        const deltas = (
          JSON.parse(snapshot).snapshot.content as BlockSnapshot[]
        ).flatMap(getDeltas);
        deltas.forEach(delta => this.insertDelta(delta));
        return;
      } catch {
        //
      }
    }
    const text = e.clipboardData
      ?.getData('text/plain')
      ?.replace(/\r?\n|\r/g, '\n');
    if (!text) return;
    const { segments, singleUrl } = analyzeTextForUrlPaste(text);
    if (singleUrl) {
      const std = this.std;
      const result = std
        ?.getOptional(ParseDocUrlProvider)
        ?.parseDocUrl(singleUrl);
      if (result) {
        const text = ' ';
        inlineEditor.insertText(inlineRange, text, {
          reference: {
            type: 'LinkedPage',
            pageId: result.docId,
            params: {
              blockIds: result.blockIds,
              elementIds: result.elementIds,
              mode: result.mode,
            },
          },
        });
        inlineEditor.setInlineRange({
          index: inlineRange.index + text.length,
          length: 0,
        });

        // Track when a linked doc is created in database title column
        std?.getOptional(TelemetryProvider)?.track('LinkedDocCreated', {
          module: 'database title cell',
          type: 'paste',
          segment: 'database',
          parentFlavour: 'affine:database',
        });
        return;
      }
    }
    insertUrlTextSegments(inlineEditor, inlineRange, segments);
  };

  insertDelta = (delta: DeltaInsert) => {
    const inlineEditor = this.inlineEditor;
    const range = inlineEditor?.getInlineRange();
    if (!range || !delta.insert) {
      return;
    }
    inlineEditor?.insertText(range, delta.insert, delta.attributes);
    inlineEditor?.setInlineRange({
      index: range.index + delta.insert.length,
      length: 0,
    });
  };

  override connectedCallback() {
    super.connectedCallback();
    this.classList.add(titleCellStyle);

    this.ensureTodoListRowWhenMounted();

    const yText = this.value?.yText;
    if (yText) {
      const cb = () => {
        const id = getSingleDocIdFromText(this.value);
        this.docId$.value = id;
      };
      cb();
      if (this.activity) {
        yText.observe(cb);
        this.disposables.add(() => {
          yText.unobserve(cb);
        });
      }
    }

    const selectAll = (e: KeyboardEvent) => {
      // `toLowerCase()`, not `=== 'a'`: a real Cmd/Ctrl+A delivers `key: 'a'`,
      // but the identical keystroke delivers `key: 'A'` (with `shiftKey`
      // still false) when Caps Lock is on, and a case-sensitive match left
      // those users with no select-all at all. Mirrors the `key.toLowerCase()`
      // comparison `_handleKeyDown` below already uses for Mod-z/Mod-y.
      if (e.key.toLowerCase() === 'a' && (IS_MAC ? e.metaKey : e.ctrlKey)) {
        e.stopPropagation();
        e.preventDefault();
        this.inlineEditor?.selectAll();
      }
    };

    // CAPTURE phase is load-bearing, not a detail. This listener sits on the
    // cell, but the cell's own child `<rich-text>` handles keydown first in
    // bubble phase (`_onRichTextKeyDown` -> `_handleKeyDown` below) and calls
    // `event.stopPropagation()` for every key except Escape/Mod-z/Mod-y. A
    // bubble-phase listener here therefore never ran for Cmd/Ctrl+A at all —
    // confirmed live: a probe on this element saw the capture-phase keydown
    // but never the bubble-phase one, and `selectAll()` was called zero times.
    //
    // The user-visible result was that Cmd/Ctrl+A silently collapsed the caret
    // to index 0 instead of selecting the title, so Backspace appeared to do
    // nothing (nothing sits behind index 0) while Delete forward-deleted a
    // single character. Capture runs parent-before-child, so this now fires
    // before `<rich-text>` can stop the event.
    // Regression test: tests/affine-local/e2e/row-delete-select-all.spec.ts
    this.disposables.addFromEvent(this, 'keydown', selectAll, true);
  }

  private readonly _handleKeyDown = (event: KeyboardEvent) => {
    if (
      this.view.type === 'list' &&
      (event.key === 'Enter' || event.key === 'Tab')
    ) {
      return;
    }
    if (event.key !== 'Escape') {
      if (event.key === 'Tab') {
        event.preventDefault();
        return;
      }
      // WR-02: narrowly scoped to the actual hotkeys this fix targets --
      // `PageKeyboardManager`'s `Mod-z`/`Shift-Mod-z`/`Control-y` global
      // bindings (keyboard-manager.ts) -- rather than letting every
      // Ctrl/Cmd-modified key bubble past the title cell (which would also
      // let unrelated global hotkeys like `Mod-Shift-l` reach the document
      // dispatcher from inside a database title cell edit session).
      const key = event.key.toLowerCase();
      if (
        (IS_MAC ? event.metaKey : event.ctrlKey) &&
        (key === 'z' || (key === 'y' && !IS_MAC))
      ) {
        return;
      }
      event.stopPropagation();
    }
  };

  private readonly _onRichTextKeyDown = (event: KeyboardEvent) => {
    this._handleKeyDown(event);
  };

  override firstUpdated(props: Map<string, unknown>) {
    super.firstUpdated(props);
    this.richText.value?.updateComplete
      .then(() => {
        if (this.richText.value) {
          this.disposables.addFromEvent(
            this.richText.value,
            'copy',
            this._onCopy
          );
          this.disposables.addFromEvent(
            this.richText.value,
            'cut',
            this._onCut
          );
          this.disposables.addFromEvent(
            this.richText.value,
            'paste',
            this._onPaste,
            true
          );
          const inlineEditor = this.inlineEditor;
          if (inlineEditor) {
            this.disposables.add(
              inlineEditor.slots.keydown.subscribe(this._handleKeyDown)
            );
          }
        }
      })
      .catch(console.error);
  }

  override afterEnterEditingMode() {
    this.inlineEditor?.focusEnd();
  }

  protected override render(): unknown {
    // `contentEditable` here is load-bearing, not decoration -- mirrors
    // `NoteBlockComponent`'s own boundary (see its `renderBlock()` doc
    // comment): the page root is always `contenteditable="false"`, so this
    // title cell needs its own `true` to restore editability for its
    // descendant rich-text div, which independently sets its own
    // `contenteditable="true"` (`rich-text.ts`). A previous version of this
    // fix set `false` HERE (gated to `IS_MOBILE`) to resolve the original
    // MOBILE-14 tap hit-testing jump -- but that isolated each row's title
    // from its siblings and blocked native cross-row/cross-block
    // drag-selection. The page-root-level fix removes the ambiguous tap
    // target at its source, so this cell just needs ordinary editability.
    this.contentEditable = String(!this.readonly);
    return html`${this.renderTaskStatusCheckbox()}${this.renderIcon()}${this.renderBlockText()}`;
  }

  renderTaskStatusCheckbox() {
    const dataSource = this.view.manager.dataSource as TaskStatusDataSource;
    const statusColumn = dataSource.getTaskStatusColumn?.();
    let checked: boolean | undefined;
    let setChecked: ((checked: boolean) => void) | undefined;
    if (statusColumn && dataSource.getTaskStatusInfo) {
      void dataSource.cellValueGet?.(this.cell.rowId, statusColumn.id);
      const info = dataSource.getTaskStatusInfo(
        this.cell.rowId,
        statusColumn.id
      );
      if (info) {
        checked = info.checked;
        setChecked = next =>
          dataSource.setTaskStatusChecked?.(
            this.cell.rowId,
            next,
            statusColumn.id
          );
      }
    } else {
      checked = dataSource.getTodoListRowChecked?.(this.cell.rowId);
      setChecked = next =>
        dataSource.setTodoListRowChecked?.(this.cell.rowId, next);
    }
    if (checked == null || !setChecked) {
      return;
    }

    // 999.3: toggling goes through `_taskTap` (touch/pen pointerup + deduped
    // click) -- see tap-toggle.ts. Re-bound every render so it always acts
    // on this render's `checked`.
    this._taskToggle = target => {
      if (this.readonly) {
        return;
      }
      const next = !checked;
      setChecked(next);
      // Mirrors `affine:list` todo's own `playCheckAnimation` call in
      // `list-block.ts` — same shared spark-burst utility, only played on
      // the unchecked→checked transition, never on uncheck. This is the
      // one shared checkbox render path for every view type (list/table/
      // kanban), so this also covers Journal Todo (which is just a list
      // view over this same component) without any view-specific code.
      if (next && target) {
        const { width } = target.getBoundingClientRect();
        playCheckAnimation(target, { size: width || undefined }).catch(
          console.error
        );
      }
    };

    return html`<div
      contenteditable="false"
      class=${`${titleTaskCheckboxStyle} ${this.readonly ? 'readonly' : ''}`}
      data-testid="task-status-checkbox"
      data-title-leading
      @pointerdown=${(event: PointerEvent) =>
        this._taskTap.onPointerDown(event)}
      @pointerup=${(event: PointerEvent) => {
        this._taskTapTarget = event.currentTarget as HTMLElement;
        this._taskTap.onPointerUp(event);
      }}
      @pointercancel=${() => this._taskTap.onPointerCancel()}
      @touchend=${(event: TouchEvent) => this._taskTap.onTouchEnd(event)}
      @click=${(event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        this._taskTapTarget = event.currentTarget as HTMLElement;
        this._taskTap.onClick();
      }}
    >
      ${checked
        ? CheckBoxCheckSolidIcon({ style: 'color: #1E96EB' })
        : CheckBoxUnIcon()}
    </div>`;
  }

  renderBlockText() {
    return html` <rich-text
      ${ref(this.richText)}
      data-disable-ask-ai
      data-not-block-text
      .yText="${this.value}"
      .inlineEventSource="${this.topContenteditableElement}"
      .attributesSchema="${this.inlineManager?.getSchema()}"
      .attributeRenderer="${this.inlineManager?.getRenderer()}"
      .embedChecker="${this.inlineManager?.embedChecker}"
      .markdownMatches="${this.inlineManager?.markdownMatches}"
      .readonly="${!this.isEditing$.value}"
      .enableClipboard="${false}"
      .enableUndoRedo="${false}"
      @keydown=${this._onRichTextKeyDown}
      .verticalScrollContainerGetter="${() =>
        this.topContenteditableElement?.host
          ? getViewportElement(this.topContenteditableElement.host)
          : null}"
      data-parent-flavour="affine:database"
      class="${titleRichTextStyle}"
    ></rich-text>`;
  }
  icon$ = computed(() => {
    const iconColumn = this.view.mainProperties$.value.iconColumn;
    if (!iconColumn) return;

    const icon = this.view.cellGetOrCreate(this.cell.rowId, iconColumn).value$
      .value;
    if (!icon) return;
    return icon;
  });
  renderIcon() {
    if (!this.showIcon) {
      return;
    }
    if (this.docId$.value) {
      return html` <div class="${headerAreaIconStyle}" data-title-leading>
        ${LinkedPageIcon({})}
      </div>`;
    }
    const icon = this.icon$.value;
    if (!icon) return;

    return html` <div class="${headerAreaIconStyle}" data-title-leading>
      ${icon}
    </div>`;
  }

  private _taskToggle: ((target: HTMLElement | null) => void) | undefined;

  private _taskTapTarget: HTMLElement | null = null;

  private readonly _taskTap = createTapToggle(() => {
    this._taskToggle?.(this._taskTapTarget);
  });

  private readonly richText = createRef<RichText>();

  @property({ attribute: false })
  accessor showIcon = false;
}

declare global {
  interface HTMLElementTagNameMap {
    'data-view-header-area-text': HeaderAreaTextCell;
  }
}
