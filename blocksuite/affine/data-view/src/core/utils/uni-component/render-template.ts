import { SignalWatcher } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import type { TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';

export class AnyRender<T> extends SignalWatcher(ShadowlessElement) {
  override render() {
    return this.renderTemplate(this.props);
  }

  @property({ attribute: false })
  accessor props!: T;

  @property({ attribute: false })
  accessor renderTemplate!: (props: T) => TemplateResult | symbol;
}

export const renderTemplate = <T>(
  renderTemplate: (props: T) => TemplateResult | symbol
) => {
  const ins = new AnyRender<T>();
  ins.renderTemplate = renderTemplate;
  return ins;
};
