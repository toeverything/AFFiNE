import { WithDisposable } from '@blocksuite/affine/global/lit';
import { css, html, LitElement } from 'lit';
import { property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

interface Version {
  blobId: string;
  size: number;
  createdAt: number;
}

/**
 * In-app version-history panel for an OnlyOffice-editable attachment. Rendered
 * via createLitPortal from the toolbar — same context as the editor, so it can
 * switch the attachment by calling back directly (no cross-window messaging).
 */
export class OnlyOfficeVersionPanel extends WithDisposable(LitElement) {
  static override styles = css`
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.32);
    }
    .panel {
      width: 360px;
      max-height: 70vh;
      overflow-y: auto;
      padding: 12px;
      border-radius: 10px;
      background: var(--affine-background-overlay-panel-color, #fff);
      box-shadow: var(--affine-shadow-3, 0 8px 30px rgba(0, 0, 0, 0.2));
      font-family: var(--affine-font-family, system-ui, sans-serif);
      color: var(--affine-text-primary-color, #1f2329);
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 4px 10px;
    }
    .title {
      font-size: 15px;
      font-weight: 600;
    }
    .close {
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      color: var(--affine-text-secondary-color, #8a8f99);
      padding: 2px 6px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border-radius: 6px;
    }
    .row:hover {
      background: var(--affine-hover-color, rgba(0, 0, 0, 0.04));
    }
    .meta {
      flex: 1;
      min-width: 0;
    }
    .when {
      font-size: 13px;
    }
    .sub {
      font-size: 12px;
      color: var(--affine-text-secondary-color, #8a8f99);
    }
    .cur {
      font-size: 11px;
      color: var(--affine-success-color, #1e9e6a);
      border: 1px solid currentColor;
      border-radius: 4px;
      padding: 1px 6px;
    }
    button.act {
      font: inherit;
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid var(--affine-border-color, #d0d5dd);
      background: transparent;
      cursor: pointer;
      color: inherit;
    }
    button.danger {
      color: var(--affine-error-color, #d92d20);
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .empty {
      padding: 12px 8px;
      font-size: 13px;
      color: var(--affine-text-secondary-color, #8a8f99);
    }
  `;

  @property({ attribute: false })
  accessor workspaceId!: string;

  @property({ attribute: false })
  accessor docId!: string;

  @property({ attribute: false })
  accessor blockId!: string;

  @property({ attribute: false })
  accessor blobId!: string;

  @property({ attribute: false })
  accessor currentBlobId!: string;

  // Called when the user picks a version to switch to.
  @property({ attribute: false })
  accessor onSwitch!: (blobId: string, size: number) => void;

  // Called to dismiss the modal (aborts the portal).
  @property({ attribute: false })
  accessor onClose: () => void = () => {};

  @state()
  accessor versions: Version[] | null = null;

  @state()
  accessor canWrite = false;

  @state()
  accessor error = '';

  override connectedCallback() {
    super.connectedCallback();
    this._load().catch(() => {});
  }

  private _api(path: string) {
    return `/api/workspaces/${encodeURIComponent(this.workspaceId)}/onlyoffice/${path}`;
  }

  private async _load() {
    try {
      const qs = new URLSearchParams({
        docId: this.docId,
        blockId: this.blockId,
      });
      const res = await fetch(
        `${this._api('versions/' + encodeURIComponent(this.blobId))}?${qs.toString()}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.canWrite = !!data.canWrite;
      this.versions = (data.versions ?? []) as Version[];
      this.error = ''; // clear any stale error after a successful (re)load
    } catch (e) {
      this.error = `Failed to load versions: ${e instanceof Error ? e.message : e}`;
    }
  }

  private _switch(v: Version) {
    this.onSwitch(v.blobId, v.size);
    this.currentBlobId = v.blobId;
  }

  private async _delete(v: Version, e: Event) {
    const btn = e.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    try {
      const qs = new URLSearchParams({
        docId: this.docId,
        blockId: this.blockId,
      });
      await fetch(
        `${this._api('delete-version/' + encodeURIComponent(v.blobId))}?${qs.toString()}`,
        { method: 'POST', credentials: 'include' }
      );
      await this._load();
    } catch {
      btn.disabled = false;
    }
  }

  private _fmtTime(ms: number) {
    try {
      return new Date(ms).toLocaleString();
    } catch {
      return String(ms);
    }
  }

  private _fmtSize(n: number) {
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < u.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(i ? 1 : 0)} ${u[i]}`;
  }

  override render() {
    return html`
      <div
        class="backdrop"
        @click=${(e: Event) => {
          if (e.target === e.currentTarget) this.onClose();
        }}
      >
        <div class="panel">
          <div class="head">
            <div class="title">Version history</div>
            <button class="close" @click=${() => this.onClose()}>×</button>
          </div>
          ${this.error
            ? html`<div class="empty">${this.error}</div>`
            : this.versions === null
              ? html`<div class="empty">Loading…</div>`
              : this.versions.length === 0
                ? html`<div class="empty">No saved versions yet.</div>`
                : repeat(
                    [...this.versions].reverse(),
                    v => v.blobId,
                    v => {
                      // With a single version there's nothing to switch to or
                      // delete; show it as the current state with no actions.
                      const single = (this.versions?.length ?? 0) <= 1;
                      const isCur = single || v.blobId === this.currentBlobId;
                      return html`
                        <div class="row">
                          <div class="meta">
                            <div class="when">
                              ${this._fmtTime(v.createdAt)}
                            </div>
                            <div class="sub">${this._fmtSize(v.size)}</div>
                          </div>
                          ${isCur
                            ? html`<span class="cur">Current</span>`
                            : this.canWrite
                              ? html`<button
                                  class="act"
                                  @click=${() => this._switch(v)}
                                >
                                  Switch to
                                </button>`
                              : ''}
                          ${this.canWrite && !isCur
                            ? html`<button
                                class="act danger"
                                @click=${(e: Event) => {
                                  this._delete(v, e).catch(() => {});
                                }}
                              >
                                Delete
                              </button>`
                            : ''}
                        </div>
                      `;
                    }
                  )}
        </div>
      </div>
    `;
  }
}

// Register the custom element once.
const TAG = 'affine-onlyoffice-version-panel';
if (!customElements.get(TAG)) {
  customElements.define(TAG, OnlyOfficeVersionPanel);
}
