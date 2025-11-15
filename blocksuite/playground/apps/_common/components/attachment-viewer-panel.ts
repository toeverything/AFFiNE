import { getAttachmentFileIcon } from '@blocksuite/affine/components/icons';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import type { AttachmentBlockModel } from '@blocksuite/affine-model';
import { formatSize } from '@blocksuite/affine-shared/utils';
import {
  ArrowDownBigIcon,
  ArrowUpBigIcon,
  CloseIcon,
} from '@blocksuite/icons/lit';
import { signal } from '@preact/signals-core';
import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement, query } from 'lit/decorators.js';

import type { DocInfo, MessageData, MessageDataType } from './pdf/types.js';
import { MessageOp, RenderKind, State } from './pdf/types.js';

const DPI = window.devicePixelRatio;

type FileInfo = {
  name: string;
  size: string | null;
  isPDF: boolean;
  icon: TemplateResult;
};

@customElement('attachment-viewer-panel')
export class AttachmentViewerPanel extends SignalWatcher(
  WithDisposable(LitElement)
) {
  static override styles = css`
    :host {
      dialog {
        padding: 0;
        top: 50px;
        border: 1px solid var(--affine-border-color);
        border-radius: 8px;
        background: var(--affine-v2-dialog-background-primary);
        box-shadow: var(--affine-overlay-shadow);
        outline: none;
      }

      .dialog {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 700px;
        height: 900px;
        margin: 0 auto;
        overflow: hidden;

        & > .close {
          user-select: none;
          outline: none;
          position: absolute;
          right: 10px;
          top: 10px;
          border: none;
          background: transparent;
          z-index: 1;
        }

        header,
        footer {
          padding: 10px 20px;
        }

        footer {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          color: var(--affine-text-secondary-color);
        }

        h5 {
          display: flex;
          align-items: center;
          gap: 15px;
          margin: 0;

          .file-icon svg {
            width: 20px;
            height: 20px;
          }
        }

        .body {
          display: flex;
          flex: 1;
          align-items: center;
          overflow-y: auto;

          .page {
            width: calc(100% - 40px);
            height: auto;
            margin: 0 auto;
          }

          .error {
            margin: 0 auto;
          }
        }
      }

      .controls {
        position: absolute;
        bottom: 50px;
        right: 20px;
      }
    }
  `;

  readonly #cursor = signal<number>(0);

  readonly #docInfo = signal<DocInfo | null>(null);

  readonly #fileInfo = signal<FileInfo | null>(null);

  readonly #state = signal<State>(State.Connecting);

  #worker: Worker | null = null;

  clear = () => {
    this.#dialog.close();

    this.#state.value = State.IDLE;
    this.#worker?.terminate();
    this.#worker = null;

    this.#fileInfo.value = null;
    this.#docInfo.value = null;
    this.#cursor.value = 0;

    const canvas = this.#page;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  goto(at: number) {
    this.#cursor.value = at;
    this.post(MessageOp.Render, {
      index: at,
      scale: 1 * DPI,
      kind: RenderKind.Page,
    });
  }

  open(model: AttachmentBlockModel) {
    this.#dialog.showModal();

    const { name, size } = model.props;

    const fileType = name.split('.').pop() ?? '';
    const icon = getAttachmentFileIcon(fileType);
    const isPDF = fileType === 'pdf';

    this.#fileInfo.value = {
      name,
      icon,
      isPDF,
      size: formatSize(size),
    };

    if (!isPDF) return;
    if (!model.props.sourceId) return;
    if (this.#worker) return;

    const process = async ({ data }: MessageEvent<MessageData>) => {
      const { type } = data;

      switch (type) {
        case MessageOp.Init: {
          console.debug('connecting');
          this.#state.value = State.Connecting;
          break;
        }

        case MessageOp.Inited: {
          console.debug('connected');
          this.#state.value = State.Connected;

          const blob = await model.store.blobSync.get(model.props.sourceId!);

          if (!blob) return;
          const buffer = await blob.arrayBuffer();

          this.post(MessageOp.Open, buffer, [buffer]);
          break;
        }

        case MessageOp.Opened: {
          const info = data[type];
          this.#cursor.value = 0;
          this.#docInfo.value = info;
          this.#state.value = State.Opened;
          this.post(MessageOp.Render, {
            index: 0,
            scale: 1 * DPI,
            kind: RenderKind.Page,
          });
          break;
        }

        case MessageOp.Rendered: {
          const { index, kind, imageData } = data[type];

          if (index !== this.#cursor.value) return;

          const canvas = this.#page;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          console.debug('render page', index, kind);
          canvas.width = imageData.width;
          canvas.height = imageData.height;

          ctx.clearRect(0, 0, imageData.width, imageData.height);
          ctx.putImageData(imageData, 0, 0);
          break;
        }
      }
    };

    this.#worker = new Worker(new URL('./pdf/worker.ts', import.meta.url), {
      type: 'module',
    });

    this.#worker.addEventListener('message', event => {
      process(event).catch(console.error);
    });
  }

  post<T extends MessageOp>(
    type: T,
    data?: MessageDataType[T],
    transfers?: Transferable[]
  ) {
    if (!this.#worker) return;

    const message = { type, [type]: data };
    if (transfers?.length) {
      this.#worker?.postMessage(message, transfers);
      return;
    }

    this.#worker?.postMessage(message);
  }

  override render() {
    const fileInfo = this.#fileInfo.value;
    const isPDF = fileInfo?.isPDF ?? false;
    const docInfo = this.#docInfo.value;
    const cursor = this.#cursor.value;
    const total = docInfo ? docInfo.total : 0;
    const width = docInfo ? docInfo.width : 0;
    const height = docInfo ? docInfo.height : 0;
    const isEmpty = total === 0;
    const print = (n: number) => (isEmpty ? '-' : n);

    return html`
      <dialog>
        <div class="dialog">
          <header>
            <h5>
              <span>${fileInfo?.name}</span>
              <span>${fileInfo?.size}</span>
              <span class="file-icon">${fileInfo?.icon}</span>
            </h5>
          </header>
          <main class="body">
            ${isPDF
              ? html`<canvas class="page"></canvas>`
              : html`<p class="error">This file format is not supported.</p>`}
            <div class="controls">
              <icon-button
                .disabled=${isEmpty || cursor === 0}
                @click=${() => this.goto(cursor - 1)}
                >${ArrowUpBigIcon()}</icon-button
              >
              <icon-button
                .disabled=${isEmpty || cursor + 1 === total}
                @click=${() => this.goto(cursor + 1)}
                >${ArrowDownBigIcon()}</icon-button
              >
            </div>
          </main>
          <footer>
            <div>
              <span>${print(width)}</span>
              x
              <span>${print(height)}</span>
            </div>
            <div>
              <span>${print(cursor + 1)}</span>
              /
              <span>${print(total)}</span>
            </div>
          </footer>
          <icon-button class="close" @click=${this.clear}
            >${CloseIcon()}</icon-button
          >
        </div>
      </dialog>
    `;
  }

  @query('dialog')
  accessor #dialog!: HTMLDialogElement;

  @query('.page')
  accessor #page: HTMLCanvasElement | null = null;
}

declare global {
  interface HTMLElementTagNameMap {
    'attachment-viewer-panel': AttachmentViewerPanel;
  }
}
