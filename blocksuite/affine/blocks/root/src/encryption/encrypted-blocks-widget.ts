import type { RootBlockModel } from '@blocksuite/affine-model';
import {
  getBlockEncryptedPreview,
  getBlockEncryptionState,
  getUnlockedBlockTexts,
  isBlockEncrypted,
  isBlockLocallyUnlocked,
  persistUnlockedBlockEdits,
  unlockBlockWithPassword,
} from '@blocksuite/affine-shared/encryption';
import { NotificationProvider } from '@blocksuite/affine-shared/services';
import { stopPropagation } from '@blocksuite/affine-shared/utils';
import {
  BLOCK_ID_ATTR,
  WidgetComponent,
  WidgetViewExtension,
} from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';
import { effect } from '@preact/signals-core';
import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { literal, unsafeStatic } from 'lit/static-html.js';

export const AFFINE_ENCRYPTED_BLOCKS_WIDGET = 'affine-encrypted-blocks-widget';

type EncryptedBlockOverlay = {
  id: string;
  flavour: string;
  preview: string;
  top: number;
  left: number;
  width: number;
  height: number;
  unlocked: boolean;
};

const LOCKED_MIN_HEIGHT = 104;
const UNLOCKED_MARKER_HEIGHT = 18;
const UNLOCKED_MARKER_STYLE_ID = 'affine-encrypted-block-unlocked-marker-style';

export class AffineEncryptedBlocksWidget extends WidgetComponent<RootBlockModel> {
  static override styles = css`
    :host {
      position: absolute;
      inset: 0;
      z-index: var(--affine-z-index-popover);
      pointer-events: none;
    }

    .affine-encrypted-block-overlay {
      box-sizing: border-box;
      position: absolute;
      border: 1px solid var(--affine-border-color);
      border-radius: 8px;
      background: var(--affine-background-secondary-color);
      color: var(--affine-text-primary-color);
      padding: 12px;
      pointer-events: auto;
    }

    .affine-encrypted-block-overlay-header {
      align-items: center;
      display: flex;
      gap: 8px;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .affine-encrypted-block-overlay-title {
      font-weight: 600;
      line-height: 22px;
    }

    .affine-encrypted-block-overlay-flavour {
      color: var(--affine-text-secondary-color);
      font-family: var(--affine-font-code-family);
      font-size: 12px;
    }

    .affine-encrypted-block-preview {
      overflow: hidden;
      border: 1px solid var(--affine-border-color);
      border-radius: 6px;
      background: var(--affine-code-block-background);
      color: var(--affine-text-secondary-color);
      font-family: var(--affine-font-code-family);
      font-size: 12px;
      line-height: 18px;
      margin-bottom: 10px;
      max-height: 38px;
      padding: 8px;
      text-overflow: ellipsis;
      word-break: break-all;
    }

    .affine-encrypted-block-actions {
      display: flex;
      gap: 8px;
    }

    .affine-encrypted-block-overlay button {
      border: 1px solid var(--affine-border-color);
      border-radius: 6px;
      background: var(--affine-background-primary-color);
      color: var(--affine-text-primary-color);
      cursor: pointer;
      font: inherit;
      height: 32px;
      padding: 0 12px;
      white-space: nowrap;
    }

    .affine-encrypted-block-overlay button:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    .affine-encrypted-block-error {
      color: var(--affine-error-color);
      font-size: 13px;
      line-height: 20px;
      margin-top: 8px;
    }
  `;

  private _raf = 0;

  private readonly _styledBlockIds = new Set<string>();

  private readonly _autoEncryptDisposables = new Map<string, (() => void)[]>();

  private readonly _pendingEncryptTimers = new Map<string, number>();

  private _unlockingBlockId: string | null = null;

  private _setParentPositioned() {
    const parent = this.parentElement;
    if (!parent || parent.dataset.affineEncryptedLayerParent === 'true') {
      return;
    }

    const style = getComputedStyle(parent);
    if (style.position === 'static') {
      parent.dataset.affineEncryptedLayerParent = 'true';
      parent.style.position = 'relative';
    }
  }

  private _installUnlockedMarkerStyle() {
    if (document.getElementById(UNLOCKED_MARKER_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = UNLOCKED_MARKER_STYLE_ID;
    style.textContent = `
      [${BLOCK_ID_ATTR}][data-affine-encrypted-unlocked="true"] {
        margin-bottom: ${UNLOCKED_MARKER_HEIGHT}px;
        position: relative;
      }

      [${BLOCK_ID_ATTR}][data-affine-encrypted-unlocked="true"]::after {
        bottom: -${UNLOCKED_MARKER_HEIGHT}px;
        box-sizing: border-box;
        color: var(--affine-text-secondary-color);
        content: 'Encrypted';
        font-size: 12px;
        left: 0;
        line-height: ${UNLOCKED_MARKER_HEIGHT}px;
        pointer-events: none;
        position: absolute;
        right: 0;
        text-align: center;
      }
    `;
    document.head.append(style);
  }

  private _clearLockedBlockStyles(blockId: string) {
    const blockElement = this._getBlockElement(blockId);
    if (!blockElement) return;

    if (blockElement.dataset.affineEncryptedLocked === 'true') {
      blockElement.style.removeProperty('visibility');
      blockElement.style.removeProperty('min-height');
      delete blockElement.dataset.affineEncryptedLocked;
    }
  }

  private _clearUnlockedBlockStyles(blockId: string) {
    const blockElement = this._getBlockElement(blockId);
    if (!blockElement) return;

    if (blockElement.dataset.affineEncryptedUnlocked === 'true') {
      delete blockElement.dataset.affineEncryptedUnlocked;
    }
  }

  private _clearBlockEncryptionStyles(blockId: string) {
    this._clearLockedBlockStyles(blockId);
    this._clearUnlockedBlockStyles(blockId);
  }

  private _syncLockedHeights() {
    let needsRefresh = false;

    this.renderRoot
      .querySelectorAll<HTMLElement>('[data-encrypted-overlay-id]')
      .forEach(overlay => {
        const blockId = overlay.dataset.encryptedOverlayId;
        if (!blockId) return;

        const blockElement = this._getBlockElement(blockId);
        if (!blockElement) return;

        const height = Math.ceil(overlay.getBoundingClientRect().height);
        const nextMinHeight = `${height}px`;
        if (blockElement.style.minHeight !== nextMinHeight) {
          blockElement.style.minHeight = nextMinHeight;
          needsRefresh = true;
        }
      });

    if (needsRefresh) {
      this._scheduleRefresh();
    }
  }

  private _getBlockElement(blockId: string) {
    return this.std.host.querySelector<HTMLElement>(
      `[${BLOCK_ID_ATTR}="${blockId}"]`
    );
  }

  private _getEncryptedModels() {
    return this.store
      .getAllModels()
      .filter(model => model.role === 'content' && isBlockEncrypted(model));
  }

  private _clearAutoEncrypt(model: BlockModel) {
    this._autoEncryptDisposables.get(model.id)?.forEach(dispose => {
      dispose();
    });
    this._autoEncryptDisposables.delete(model.id);

    const timer = this._pendingEncryptTimers.get(model.id);
    if (timer) {
      window.clearTimeout(timer);
      this._pendingEncryptTimers.delete(model.id);
    }
  }

  private _ensureAutoEncrypt(model: BlockModel) {
    if (this._autoEncryptDisposables.has(model.id)) return;

    const disposables = getUnlockedBlockTexts(model).map(text =>
      effect(() => {
        const deltas = text.deltas$.value;
        if (deltas) {
          this._schedulePersistUnlockedEdits(model);
        }
      })
    );
    const encryptedKeys = new Set(
      getBlockEncryptionState(model)?.encryptedKeys ?? []
    );
    const subscription = model.propsUpdated.subscribe(({ key }) => {
      if (encryptedKeys.has(key)) {
        this._schedulePersistUnlockedEdits(model);
      }
    });
    disposables.push(() => {
      subscription.unsubscribe();
    });

    this._autoEncryptDisposables.set(model.id, disposables);
  }

  private _schedulePersistUnlockedEdits(model: BlockModel) {
    const existingTimer = this._pendingEncryptTimers.get(model.id);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const timer = window.setTimeout(() => {
      this._pendingEncryptTimers.delete(model.id);
      persistUnlockedBlockEdits(this.store, model).catch(console.error);
    }, 600);
    this._pendingEncryptTimers.set(model.id, timer);
  }

  private readonly _scheduleRefresh = () => {
    if (this._raf) return;

    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._refresh();
    });
  };

  private _refresh() {
    const overlays: EncryptedBlockOverlay[] = [];
    const encryptedIds = new Set<string>();
    const containerRect = this.parentElement?.getBoundingClientRect();
    if (!containerRect) return;

    this._getEncryptedModels().forEach(model => {
      encryptedIds.add(model.id);
      const blockElement = this._getBlockElement(model.id);
      if (!blockElement) return;

      const unlocked = isBlockLocallyUnlocked(model);
      if (unlocked) {
        this._clearLockedBlockStyles(model.id);
        blockElement.dataset.affineEncryptedUnlocked = 'true';
        this._ensureAutoEncrypt(model);
      } else {
        this._clearAutoEncrypt(model);
        this._clearUnlockedBlockStyles(model.id);
        blockElement.dataset.affineEncryptedLocked = 'true';
        blockElement.style.visibility = 'hidden';
        blockElement.style.minHeight = `${LOCKED_MIN_HEIGHT}px`;
      }

      const rect = blockElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      overlays.push({
        id: model.id,
        flavour: model.flavour,
        preview: getBlockEncryptedPreview(model),
        top: rect.top - containerRect.top,
        left: rect.left - containerRect.left,
        width: rect.width,
        height: Math.max(rect.height, LOCKED_MIN_HEIGHT),
        unlocked,
      });
    });

    this._styledBlockIds.forEach(blockId => {
      if (!encryptedIds.has(blockId)) {
        this._clearBlockEncryptionStyles(blockId);
        const model = this.store.getModelById(blockId);
        if (model) {
          this._clearAutoEncrypt(model);
        }
      }
    });
    this._styledBlockIds.clear();
    encryptedIds.forEach(id => this._styledBlockIds.add(id));

    this._overlays = overlays;
  }

  private async _unlock(model: BlockModel) {
    if (this._unlockingBlockId) return;

    const notification = this.std.getOptional(NotificationProvider);
    const password = await notification?.prompt({
      title: 'Decrypt block',
      message: 'Use the block password. This password is not stored.',
      placeholder: 'Password',
      confirmText: 'Decrypt',
    });

    if (!password) return;

    this._unlockingBlockId = model.id;
    this._error = '';
    this._errorBlockId = null;
    this.requestUpdate();

    try {
      await unlockBlockWithPassword(model, password);
      this._scheduleRefresh();
    } catch (error) {
      console.error(error);
      this._error = 'Unable to decrypt with this password.';
      this._errorBlockId = model.id;
    } finally {
      this._unlockingBlockId = null;
      this.requestUpdate();
    }
  }

  private _renderLockedOverlay(overlay: EncryptedBlockOverlay) {
    const model = this.store.getModelById(overlay.id);
    if (!model) return nothing;

    return html`
      <div
        class="affine-encrypted-block-overlay"
        data-encrypted-overlay-id=${overlay.id}
        data-range-sync-exclude="true"
        contenteditable="false"
        style=${styleMap({
          top: `${overlay.top}px`,
          left: `${overlay.left}px`,
          width: `${overlay.width}px`,
          minHeight: `${overlay.height}px`,
        })}
        @pointerdown=${stopPropagation}
        @click=${stopPropagation}
        @dblclick=${stopPropagation}
        @cut=${stopPropagation}
        @copy=${stopPropagation}
        @paste=${stopPropagation}
        @keydown=${stopPropagation}
        @keyup=${stopPropagation}
      >
        <div class="affine-encrypted-block-overlay-header">
          <span class="affine-encrypted-block-overlay-title">
            Encrypted block
          </span>
          <code class="affine-encrypted-block-overlay-flavour">
            ${overlay.flavour}
          </code>
        </div>
        <div class="affine-encrypted-block-preview">${overlay.preview}</div>
        <div class="affine-encrypted-block-actions">
          <button
            ?disabled=${this._unlockingBlockId === overlay.id}
            @click=${(event: Event) => {
              event.stopPropagation();
              void this._unlock(model).catch(console.error);
            }}
          >
            Decrypt
          </button>
        </div>
        ${this._error && this._errorBlockId === overlay.id
          ? html`<div class="affine-encrypted-block-error">${this._error}</div>`
          : nothing}
      </div>
    `;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.contentEditable = 'false';
    this._setParentPositioned();
    this._installUnlockedMarkerStyle();

    this.disposables.add(
      this.store.slots.blockUpdated.subscribe(() => {
        this._scheduleRefresh();
      })
    );

    window.addEventListener('resize', this._scheduleRefresh);
    window.addEventListener('scroll', this._scheduleRefresh, true);
    this.disposables.add(() => {
      window.removeEventListener('resize', this._scheduleRefresh);
      window.removeEventListener('scroll', this._scheduleRefresh, true);
      if (this._raf) {
        cancelAnimationFrame(this._raf);
      }
      this._styledBlockIds.forEach(blockId => {
        this._clearBlockEncryptionStyles(blockId);
        const model = this.store.getModelById(blockId);
        if (model) {
          this._clearAutoEncrypt(model);
        }
      });
      this._styledBlockIds.clear();
      if (this.parentElement?.dataset.affineEncryptedLayerParent === 'true') {
        this.parentElement.style.removeProperty('position');
        delete this.parentElement.dataset.affineEncryptedLayerParent;
      }
    });

    this.updateComplete
      .then(() => {
        this._scheduleRefresh();
      })
      .catch(console.error);
  }

  override updated() {
    this._syncLockedHeights();
  }

  override render() {
    return html`
      ${repeat(
        this._overlays,
        overlay => `${overlay.id}:${overlay.unlocked ? 'u' : 'l'}`,
        overlay =>
          overlay.unlocked ? nothing : this._renderLockedOverlay(overlay)
      )}
    `;
  }

  @state()
  private accessor _error = '';

  @state()
  private accessor _errorBlockId: string | null = null;

  @state()
  private accessor _overlays: EncryptedBlockOverlay[] = [];
}

export const encryptedBlocksWidget = WidgetViewExtension(
  'affine:page',
  AFFINE_ENCRYPTED_BLOCKS_WIDGET,
  literal`${unsafeStatic(AFFINE_ENCRYPTED_BLOCKS_WIDGET)}`
);

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_ENCRYPTED_BLOCKS_WIDGET]: AffineEncryptedBlocksWidget;
  }
}
