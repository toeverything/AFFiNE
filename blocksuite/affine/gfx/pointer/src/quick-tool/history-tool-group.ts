import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { RedoIcon, UndoIcon } from '@blocksuite/icons/lit';
import type { BlockComponent } from '@blocksuite/std';
import { effect } from '@preact/signals-core';
import { css, html, LitElement } from 'lit';
import { property, state } from 'lit/decorators.js';

export class EdgelessHistoryToolGroup extends SignalWatcher(
  WithDisposable(LitElement)
) {
  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 100%;
    }

    edgeless-tool-icon-button {
      flex: 0 0 auto;
    }
  `;

  private readonly _handleUndo = () => {
    if (!this.edgeless?.std.store.canUndo) return;
    this.edgeless.std.store.undo();
  };

  private readonly _handleRedo = () => {
    if (!this.edgeless?.std.store.canRedo) return;
    this.edgeless.std.store.redo();
  };

  override connectedCallback() {
    super.connectedCallback();
    if (!this.edgeless) {
      return;
    }

    this._disposables.add(
      effect(() => {
        this._canUndo = this.edgeless.std.store.history.canUndo$.value;
        this._canRedo = this.edgeless.std.store.history.canRedo$.value;
      })
    );
  }

  override render() {
    return html`
      <edgeless-tool-icon-button
        .tooltip=${'Undo'}
        .disabled=${!this._canUndo}
        .activeMode=${'background'}
        .iconContainerPadding=${8}
        .iconSize=${'20px'}
        @click=${this._handleUndo}
      >
        ${UndoIcon()}
      </edgeless-tool-icon-button>
      <edgeless-tool-icon-button
        .tooltip=${'Redo'}
        .disabled=${!this._canRedo}
        .activeMode=${'background'}
        .iconContainerPadding=${8}
        .iconSize=${'20px'}
        @click=${this._handleRedo}
      >
        ${RedoIcon()}
      </edgeless-tool-icon-button>
    `;
  }

  @property({ attribute: false })
  accessor edgeless!: BlockComponent;

  @state()
  private accessor _canRedo = false;

  @state()
  private accessor _canUndo = false;
}

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-history-tool-group': EdgelessHistoryToolGroup;
  }
}
