import { LitElement, type TemplateResult } from 'lit';
import React, { createElement, type ReactNode } from 'react';

import { createComponent } from './create-component';

export class LitTemplateWrapper extends LitElement {
  static override get properties() {
    return {
      template: { type: Object },
    };
  }
  template: TemplateResult | null = null;
  // do not enable shadow root
  override createRenderRoot() {
    return this;
  }

  override render() {
    return this.template;
  }
}

window.customElements.define('affine-lit-template-wrapper', LitTemplateWrapper);

const TemplateWrapper = createComponent({
  elementClass: LitTemplateWrapper,
  react: React,
});

export const toReactNode = (template?: TemplateResult | string): ReactNode => {
  if (!template) return null;
  return typeof template === 'string'
    ? template
    : createElement(TemplateWrapper, { template });
};
