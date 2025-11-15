import { RefNodeSlotsProvider } from '@blocksuite/affine-inline-reference';
import { ParseDocUrlProvider } from '@blocksuite/affine-shared/services';
import {
  isValidUrl,
  normalizeUrl,
  stopPropagation,
} from '@blocksuite/affine-shared/utils';
import {
  BaseCellRenderer,
  createFromBaseCellRenderer,
  createIcon,
} from '@blocksuite/data-view';
import { EditIcon } from '@blocksuite/icons/lit';
import { computed } from '@preact/signals-core';
import { html, nothing, type PropertyValues } from 'lit';
import { createRef, ref } from 'lit/directives/ref.js';

import { EditorHostKey } from '../../context/host-context.js';
import {
  inlineLinkNodeStyle,
  linkCellStyle,
  linkContainerStyle,
  linkedDocStyle,
  linkEditingStyle,
  linkIconContainerStyle,
  linkIconStyle,
  normalTextStyle,
  showLinkIconStyle,
} from './cell-renderer-css.js';
import { linkPropertyModelConfig } from './define.js';

export class LinkCell extends BaseCellRenderer<string, string> {
  protected override firstUpdated(_changedProperties: PropertyValues) {
    super.firstUpdated(_changedProperties);
    this.classList.add(linkCellStyle);
  }

  private readonly _onEdit = (e: Event) => {
    e.stopPropagation();
    this.selectCurrentCell(true);
    this.selectCurrentCell(true);
  };

  private readonly _focusEnd = () => {
    const ele = this._container.value;
    if (!ele) {
      return;
    }
    const end = ele?.value.length;
    ele?.focus();
    ele?.setSelectionRange(end, end);
  };

  private readonly _onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.isComposing) {
      this.selectCurrentCell(false);
    }
  };

  private readonly _setValue = (
    value: string = this._container.value?.value ?? ''
  ) => {
    let url = value;
    if (isValidUrl(value)) {
      url = normalizeUrl(value);
    }

    this.valueSetNextTick(url);
    if (this._container.value) {
      this._container.value.value = url;
    }
  };

  openDoc = (e: MouseEvent) => {
    e.stopPropagation();
    if (!this.docId$.value) {
      return;
    }
    const std = this.std;
    if (!std) {
      return;
    }

    std.getOptional(RefNodeSlotsProvider)?.docLinkClicked.next({
      pageId: this.docId$.value,
      host: std.host,
    });
  };

  get std() {
    const host = this.view.serviceGet(EditorHostKey);
    return host?.std;
  }

  docId$ = computed(() => {
    if (!this.value || !isValidUrl(this.value)) {
      return;
    }
    return this.parseDocUrl(this.value)?.docId;
  });

  private readonly _container = createRef<HTMLInputElement>();

  override afterEnterEditingMode() {
    this._focusEnd();
  }

  override beforeExitEditingMode() {
    this._setValue();
  }

  parseDocUrl(url: string) {
    return this.std?.getOptional(ParseDocUrlProvider)?.parseDocUrl(url);
  }

  docName$ = computed(() => {
    const title =
      this.docId$.value &&
      this.std?.workspace.getDoc(this.docId$.value)?.meta?.title;
    if (title == null) {
      return;
    }
    return title || 'Untitled';
  });

  renderLink() {
    const linkText = this.value ?? '';
    const docName = this.docName$.value;
    const isDoc = !!docName;
    const isLink = !!linkText;
    const hasLink = isDoc || isLink;
    return html`
      <div>
        <div class="${linkContainerStyle}">
          ${isDoc
            ? html`<span class="${linkedDocStyle}" @click="${this.openDoc}"
                >${docName}</span
              >`
            : isValidUrl(linkText)
              ? html`<a
                  data-testid="property-link-a"
                  class="${inlineLinkNodeStyle}"
                  href="${linkText}"
                  rel="noopener noreferrer"
                  target="_blank"
                  >${linkText}</a
                >`
              : html`<span class="${normalTextStyle}">${linkText}</span>`}
        </div>
        ${hasLink
          ? html` <div class="${linkIconContainerStyle} ${showLinkIconStyle}">
              <div
                class="${linkIconStyle}"
                data-testid="edit-link-button"
                @click="${this._onEdit}"
              >
                ${EditIcon()}
              </div>
            </div>`
          : nothing}
      </div>
    `;
  }

  override render() {
    if (this.isEditing$.value) {
      const linkText = this.value ?? '';
      return html`<input
        class="${linkEditingStyle} link"
        ${ref(this._container)}
        .value="${linkText}"
        @keydown="${this._onKeydown}"
        @pointerdown="${stopPropagation}"
      />`;
    } else {
      return this.renderLink();
    }
  }
}

export const linkColumnConfig = linkPropertyModelConfig.createPropertyMeta({
  icon: createIcon('LinkIcon'),
  cellRenderer: {
    view: createFromBaseCellRenderer(LinkCell),
  },
});
