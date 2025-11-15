import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { effect, type ReadonlySignal } from '@preact/signals-core';
import { property } from 'lit/decorators.js';

export class VirtualElementWrapper extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  @property({ attribute: false })
  accessor rect!: {
    left$: ReadonlySignal<number | undefined>;
    top$: ReadonlySignal<number | undefined>;
    width$: ReadonlySignal<number | undefined>;
    height$: ReadonlySignal<number | undefined>;
  };

  @property({ attribute: false })
  accessor updateHeight!: (height: number) => void;
  @property({ attribute: false })
  accessor element!: HTMLElement;

  override connectedCallback(): void {
    super.connectedCallback();
    this.style.position = 'absolute';
    this.disposables.add(
      effect(() => {
        this.style.left = `${this.rect.left$.value ?? -1000}px`;
        this.style.top = `${this.rect.top$.value ?? -1000}px`;
        if (this.rect.width$.value != null) {
          this.style.width = `${this.rect.width$.value}px`;
        }
        this.style.height = `${this.rect.height$.value ?? 0}px`;
      })
    );
    const resizeObserver = new ResizeObserver(() => {
      if (this.element.isConnected) {
        Promise.resolve()
          .then(() => {
            this.updateHeight(this.element.clientHeight);
          })
          .catch(e => {
            console.error(e);
          });
      }
    });
    resizeObserver.observe(this.element);
    this.disposables.add(() => {
      resizeObserver.disconnect();
    });
  }
  override render() {
    return this.element;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'virtual-element-wrapper': VirtualElementWrapper;
  }
}
