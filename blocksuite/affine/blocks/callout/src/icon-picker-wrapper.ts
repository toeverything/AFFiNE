import type { IconData } from '@blocksuite/affine-shared/services';
import type { UniComponent } from '@blocksuite/affine-shared/types';
import { ShadowlessElement } from '@blocksuite/std';
import { type Signal } from '@preact/signals-core';
import { html, type TemplateResult } from 'lit';
import { type StyleInfo, styleMap } from 'lit/directives/style-map.js';

// Copy of renderUniLit from callout-block.ts
const renderUniLit = <Props, Expose extends NonNullable<unknown>>(
  uni: UniComponent<Props, Expose> | undefined,
  props?: Props,
  options?: {
    ref?: Signal<Expose | undefined>;
    style?: Readonly<StyleInfo>;
    class?: string;
  }
): TemplateResult => {
  return html` <uni-lit
    .uni="${uni}"
    .props="${props}"
    .ref="${options?.ref}"
    style=${options?.style ? styleMap(options?.style) : ''}
  ></uni-lit>`;
};

export interface IconPickerWrapperProps {
  onSelect?: (iconData?: IconData) => void;
  onClose?: () => void;
}

export class IconPickerWrapper extends ShadowlessElement {
  iconPickerComponent?: UniComponent<IconPickerWrapperProps, any>;
  props?: IconPickerWrapperProps;

  constructor() {
    super();
  }

  override render() {
    if (!this.iconPickerComponent) {
      return html``;
    }

    return renderUniLit(this.iconPickerComponent, this.props);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'icon-picker-wrapper': IconPickerWrapper;
  }
}
