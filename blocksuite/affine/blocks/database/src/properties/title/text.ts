import { DefaultInlineManagerExtension } from '@blocksuite/affine-inline-preset';
import type { RichText } from '@blocksuite/affine-rich-text';
import {
  ParseDocUrlProvider,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import {
  getViewportElement,
  isValidUrl,
} from '@blocksuite/affine-shared/utils';
import { BaseCellRenderer } from '@blocksuite/data-view';
import { IS_MAC } from '@blocksuite/global/env';
import { LinkedPageIcon } from '@blocksuite/icons/lit';
import type { BlockSnapshot, DeltaInsert, Text } from '@blocksuite/store';
import { computed, signal } from '@preact/signals-core';
import { property } from 'lit/decorators.js';
import { createRef, ref } from 'lit/directives/ref.js';
import { html } from 'lit/static-html.js';

import { EditorHostKey } from '../../context/host-context.js';
import type { DatabaseBlockComponent } from '../../database-block.js';
import { getSingleDocIdFromText } from '../../utils/title-doc.js';
import {
  headerAreaIconStyle,
  titleCellStyle,
  titleRichTextStyle,
} from './cell-renderer-css.js';

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
    if (!inlineRange) return;
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
    e.preventDefault();
    e.stopPropagation();
    if (isValidUrl(text)) {
      const std = this.std;
      const result = std?.getOptional(ParseDocUrlProvider)?.parseDocUrl(text);
      if (result) {
        const text = ' ';
        inlineEditor?.insertText(inlineRange, text, {
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
        inlineEditor?.setInlineRange({
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
      } else {
        inlineEditor?.insertText(inlineRange, text, {
          link: text,
        });
        inlineEditor?.setInlineRange({
          index: inlineRange.index + text.length,
          length: 0,
        });
      }
    } else {
      inlineEditor?.insertText(inlineRange, text);
      inlineEditor?.setInlineRange({
        index: inlineRange.index + text.length,
        length: 0,
      });
    }
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
      if (e.key === 'a' && (IS_MAC ? e.metaKey : e.ctrlKey)) {
        e.stopPropagation();
        e.preventDefault();
        this.inlineEditor?.selectAll();
      }
    };

    this.disposables.addFromEvent(this, 'keydown', selectAll);
  }

  private readonly _handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') {
      if (event.key === 'Tab') {
        event.preventDefault();
        return;
      }
      event.stopPropagation();
    }
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
            this._onPaste
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
    return html`${this.renderIcon()}${this.renderBlockText()}`;
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
      return html` <div class="${headerAreaIconStyle}">
        ${LinkedPageIcon({})}
      </div>`;
    }
    const icon = this.icon$.value;
    if (!icon) return;

    return html` <div class="${headerAreaIconStyle}">${icon}</div>`;
  }

  private readonly richText = createRef<RichText>();

  @property({ attribute: false })
  accessor showIcon = false;
}

declare global {
  interface HTMLElementTagNameMap {
    'data-view-header-area-text': HeaderAreaTextCell;
  }
}
