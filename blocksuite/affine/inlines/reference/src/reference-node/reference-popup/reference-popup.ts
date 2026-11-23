import type { EditorIconButton } from '@blocksuite/affine-components/toolbar';
import type { ReferenceInfo } from '@blocksuite/affine-model';
import { REFERENCE_NODE } from '@blocksuite/affine-shared/consts';
import {
  type LinkEventType,
  type TelemetryEvent,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import { fontXSStyle, panelBaseStyle } from '@blocksuite/affine-shared/styles';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { stopPropagation } from '@blocksuite/affine-shared/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { DoneIcon, ResetIcon } from '@blocksuite/icons/lit';
import { type BlockStdScope, ShadowlessElement } from '@blocksuite/std';
import type { InlineEditor, InlineRange } from '@blocksuite/std/inline';
import { computePosition, inline, offset, shift } from '@floating-ui/dom';
import { signal } from '@preact/signals-core';
import { css, html } from 'lit';
import { property, query } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';

export class ReferencePopup extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    :host {
      box-sizing: border-box;
    }

    .overlay-mask {
      position: fixed;
      z-index: var(--affine-z-index-popover);
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
    }

    ${panelBaseStyle('.popover-container')}
    .popover-container {
      position: absolute;
      display: flex;
      gap: 8px;
      box-sizing: content-box;
      justify-content: space-between;
      align-items: center;
      animation: affine-popover-fade-in 0.2s ease;
      z-index: var(--affine-z-index-popover);
    }

    @keyframes affine-popover-fade-in {
      from {
        opacity: 0;
        transform: translateY(-3px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    input {
      display: flex;
      flex: 1;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--affine-text-primary-color);
    }
    ${fontXSStyle('input')}
    input::placeholder {
      color: var(--affine-placeholder-color);
    }
    input:focus {
      outline: none;
    }

    ${fontXSStyle('editor-icon-button.save .label')}
    editor-icon-button.save .label {
      color: inherit;
      text-transform: none;
    }
  `;

  private readonly _onSave = () => {
    const title = this.title$.value.trim();
    if (!title) {
      this.remove();
      return;
    }

    this._setTitle(title);

    track(this.std, 'SavedAlias', { control: 'save' });

    this.remove();
  };

  private readonly _updateTitle = (e: InputEvent) => {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    this.title$.value = value;
  };

  private _onKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (!e.isComposing) {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.remove();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        this._onSave();
      }
    }
  }

  private _onReset() {
    this.title$.value = this.docTitle;

    this._setTitle();

    track(this.std, 'ResetedAlias', { control: 'reset' });

    this.remove();
  }

  private _setTitle(title?: string) {
    const reference: AffineTextAttributes['reference'] = {
      type: 'LinkedPage',
      ...this.referenceInfo,
    };

    if (title) {
      reference.title = title;
    } else {
      delete reference.title;
      delete reference.description;
    }

    this.inlineEditor.insertText(this.inlineRange, REFERENCE_NODE, {
      reference,
    });
    this.inlineEditor.setInlineRange({
      index: this.inlineRange.index + REFERENCE_NODE.length,
      length: 0,
    });
  }

  override connectedCallback() {
    super.connectedCallback();

    this.title$.value = this.referenceInfo.title ?? this.docTitle;
  }

  override firstUpdated() {
    this.disposables.addFromEvent(this, 'keydown', this._onKeydown);

    this.disposables.addFromEvent(this, 'copy', stopPropagation);
    this.disposables.addFromEvent(this, 'cut', stopPropagation);
    this.disposables.addFromEvent(this, 'paste', stopPropagation);

    this.disposables.addFromEvent(this.overlayMask, 'click', e => {
      e.stopPropagation();
      this.remove();
    });

    this.inputElement.focus();
    this.inputElement.select();
  }

  override render() {
    return html`
      <div class="overlay-root">
        <div class="overlay-mask"></div>
        <div class="popover-container">
          <input
            id="alias-title"
            type="text"
            placeholder="Add a custom title"
            .value=${live(this.title$.value)}
            @input=${this._updateTitle}
          />
          <editor-icon-button
            aria-label="Reset"
            class="reset"
            .iconContainerPadding=${4}
            .tooltip=${'Reset'}
            @click=${this._onReset}
          >
            ${ResetIcon({ width: '16px', height: '16px' })}
          </editor-icon-button>
          <editor-toolbar-separator></editor-toolbar-separator>
          <editor-icon-button
            aria-label="Save"
            class="save"
            .active=${true}
            @click=${this._onSave}
          >
            ${DoneIcon({ width: '16px', height: '16px' })}
            <span class="label">Save</span>
          </editor-icon-button>
        </div>
      </div>
    `;
  }

  override updated() {
    const range = this.inlineEditor.toDomRange(this.inlineRange);
    if (!range) return;

    const visualElement = {
      getBoundingClientRect: () => range.getBoundingClientRect(),
      getClientRects: () => range.getClientRects(),
    };
    const popover = this.popoverContainer;

    computePosition(visualElement, popover, {
      middleware: [
        offset(10),
        inline(),
        shift({
          padding: 6,
        }),
      ],
    })
      .then(({ x, y }) => {
        popover.style.left = `${x}px`;
        popover.style.top = `${y}px`;
      })
      .catch(console.error);
  }

  @property({ attribute: false })
  accessor abortController!: AbortController;

  @property({ attribute: false })
  accessor docTitle!: string;

  @property({ attribute: false })
  accessor inlineEditor!: InlineEditor<AffineTextAttributes>;

  @property({ attribute: false })
  accessor inlineRange!: InlineRange;

  @query('input#alias-title')
  accessor inputElement!: HTMLInputElement;

  @query('.overlay-mask')
  accessor overlayMask!: HTMLDivElement;

  @query('.popover-container')
  accessor popoverContainer!: HTMLDivElement;

  @property({ type: Object })
  accessor referenceInfo!: ReferenceInfo;

  @query('editor-icon-button.save')
  accessor saveButton!: EditorIconButton;

  @property({ attribute: false })
  accessor std!: BlockStdScope;

  accessor title$ = signal<string>('');
}

function track(
  std: BlockStdScope,
  event: LinkEventType,
  props: Partial<TelemetryEvent>
) {
  std.getOptional(TelemetryProvider)?.track(event, {
    segment: 'doc',
    page: 'doc editor',
    module: 'toolbar',
    category: 'linked doc',
    type: 'inline view',
    ...props,
  });
}
