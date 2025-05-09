import {
  cleanSpecifiedTail,
  getTextContentFromInlineRange,
} from '@blocksuite/affine-rich-text';
import { VirtualKeyboardProvider } from '@blocksuite/affine-shared/services';
import { getViewportElement } from '@blocksuite/affine-shared/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { MoreHorizontalIcon } from '@blocksuite/icons/lit';
import { PropTypes, requiredProperties } from '@blocksuite/std';
import { signal } from '@preact/signals-core';
import { html, LitElement, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { join } from 'lit/directives/join.js';
import { repeat } from 'lit/directives/repeat.js';

import type {
  LinkedDocContext,
  LinkedMenuGroup,
  LinkedMenuItem,
} from './config.js';
import { mobileLinkedDocMenuStyles } from './styles.js';
import { resolveSignal } from './utils.js';

export const AFFINE_MOBILE_LINKED_DOC_MENU = 'affine-mobile-linked-doc-menu';

@requiredProperties({
  context: PropTypes.object,
})
export class AffineMobileLinkedDocMenu extends SignalWatcher(
  WithDisposable(LitElement)
) {
  static override styles = mobileLinkedDocMenuStyles;

  private readonly _expand = new Set<string>();

  private readonly _linkedDocGroup$ = signal<LinkedMenuGroup[]>([]);

  private readonly _renderGroup = (group: LinkedMenuGroup) => {
    let items = resolveSignal(group.items);

    const isOverflow = !!group.maxDisplay && items.length > group.maxDisplay;
    const expanded = this._expand.has(group.name);

    let moreItem = null;
    if (!expanded && isOverflow) {
      items = items.slice(0, group.maxDisplay);

      moreItem = html`<div
        class="mobile-linked-doc-menu-item"
        @click=${() => {
          this._expand.add(group.name);
          this.requestUpdate();
        }}
      >
        ${MoreHorizontalIcon()}
        <div class="text">${group.overflowText || 'more'}</div>
      </div>`;
    }

    return html`
      ${repeat(items, item => item.key, this._renderItem)} ${moreItem}
    `;
  };

  private readonly _renderItem = ({
    key,
    name,
    icon,
    action,
  }: LinkedMenuItem) => {
    return html`<button
      class="mobile-linked-doc-menu-item"
      data-id=${key}
      @pointerup=${() => {
        action()?.catch(console.error);
      }}
    >
      ${icon}
      <div class="text">${name}</div>
    </button>`;
  };

  private readonly _scrollInputToTop = () => {
    const { inlineEditor } = this.context;
    const { scrollContainer, scrollTopOffset } = this.context.config.mobile;

    let container = null;
    let containerScrollTop = 0;
    if (typeof scrollContainer === 'string') {
      container = document.querySelector(scrollContainer);
      containerScrollTop = container?.scrollTop ?? 0;
    } else if (scrollContainer instanceof HTMLElement) {
      container = scrollContainer;
      containerScrollTop = scrollContainer.scrollTop;
    } else if (scrollContainer === window) {
      container = window;
      containerScrollTop = scrollContainer.scrollY;
    } else {
      container = getViewportElement(this.context.std.host);
      containerScrollTop = container?.scrollTop ?? 0;
    }

    let offset = 0;
    if (typeof scrollTopOffset === 'function') {
      offset = scrollTopOffset();
    } else {
      offset = scrollTopOffset ?? 0;
    }

    if (!inlineEditor.rootElement || !container) return;
    container.scrollTo({
      top:
        inlineEditor.rootElement.getBoundingClientRect().top +
        containerScrollTop -
        offset,
      behavior: 'smooth',
    });
  };

  private readonly _updateLinkedDocGroup = async () => {
    if (this._updateLinkedDocGroupAbortController) {
      this._updateLinkedDocGroupAbortController.abort();
    }
    this._updateLinkedDocGroupAbortController = new AbortController();
    this._linkedDocGroup$.value = await this.context.config.getMenus(
      this._query ?? '',
      () => {
        this.context.close();
        cleanSpecifiedTail(
          this.context.std,
          this.context.inlineEditor,
          this.context.triggerKey + (this._query ?? '')
        );
      },
      this.context.std.host,
      this.context.inlineEditor,
      this._updateLinkedDocGroupAbortController.signal
    );
  };

  private _updateLinkedDocGroupAbortController: AbortController | null = null;

  private get _query() {
    return getTextContentFromInlineRange(
      this.context.inlineEditor,
      this.context.startRange
    );
  }

  get keyboard() {
    return this.context.std.get(VirtualKeyboardProvider);
  }

  override connectedCallback() {
    super.connectedCallback();

    const { inlineEditor, close } = this.context;

    this._updateLinkedDocGroup().catch(console.error);

    // prevent editor blur when click menu
    this._disposables.addFromEvent(this, 'pointerdown', e => {
      e.preventDefault();
    });

    // close menu when click outside
    this.disposables.addFromEvent(
      window,
      'pointerdown',
      e => {
        if (e.target === this) return;
        close();
      },
      true
    );

    // bind some key events
    {
      const { eventSource } = inlineEditor;
      if (!eventSource) return;

      const keydownObserverAbortController = new AbortController();
      this._disposables.add(() => keydownObserverAbortController.abort());

      // we need use beforeinput because the event.key of keypress event usually is `Unidentified` in Android
      this.disposables.addFromEvent(eventSource, 'beforeinput', () => {
        const curRange = inlineEditor.getInlineRange();
        if (curRange && curRange.index < this.context.startRange.index) {
          this.context.close();
          return;
        }
        this._updateLinkedDocGroup().catch(console.error);
      });
    }
  }

  override firstUpdated() {
    this._scrollInputToTop();
  }

  override render() {
    const groups = this._linkedDocGroup$.value;
    if (groups.length === 0) {
      return nothing;
    }

    this.style.bottom = `${this.keyboard.height$.value}px`;

    return html`
      ${join(groups.map(this._renderGroup), html`<div class="divider"></div>`)}
    `;
  }

  @property({ attribute: false })
  accessor context!: LinkedDocContext;
}
