import { LitElement, type TemplateResult } from 'lit';
import { customElement } from 'lit/decorators.js';
import React, { createElement, type ReactNode } from 'react';

import { createComponent } from './create-component';

@customElement('affine-lit-template-wrapper')
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
