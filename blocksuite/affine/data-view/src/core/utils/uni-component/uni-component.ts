import type {
  UniComponent,
  UniComponentReturn,
} from '@blocksuite/affine-shared/types';
import { SignalWatcher } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import type { Signal } from '@preact/signals-core';
import type { LitElement, PropertyValues, TemplateResult } from 'lit';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';
import { type StyleInfo, styleMap } from 'lit/directives/style-map.js';

export const renderUniLit = <Props, Expose extends NonNullable<unknown>>(
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

export class UniLit<
  Props,
  Expose extends NonNullable<unknown> = NonNullable<unknown>,
> extends ShadowlessElement {
  static override styles = css`
    uni-lit {
      display: contents;
    }
  `;

  uniReturn?: UniComponentReturn<Props>;

  private _expose?: Expose;

  get expose(): Expose | undefined {
    return this._expose;
  }

  private mount() {
    this.uniReturn = this.uni?.(this, this.props, value => {
      if (this.ref) {
        this.ref.value = value;
        this._expose = value;
      }
    });
  }

  private unmount() {
    this.uniReturn?.unmount();
  }

  override connectedCallback() {
    super.connectedCallback();
    this.mount();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.unmount();
  }

  protected override render(): unknown {
    return html``;
  }

  protected override updated(_changedProperties: PropertyValues) {
    super.updated(_changedProperties);
    if (_changedProperties.has('uni')) {
      this.unmount();
      this.mount();
    } else if (_changedProperties.has('props')) {
      this.uniReturn?.update(this.props);
    }
  }

  @property({ attribute: false })
  accessor props!: Props;

  @property({ attribute: false })
  accessor ref: Signal<Expose | undefined> | undefined = undefined;

  @property({ attribute: false })
  accessor uni: UniComponent<Props, Expose> | undefined = undefined;
}

export const createUniComponentFromWebComponent = <
  T,
  Expose extends NonNullable<unknown> = NonNullable<unknown>,
>(
  component: typeof LitElement
): UniComponent<T, Expose> => {
  return (ele, props, expose) => {
    const ins = new component();
    Object.assign(ins, props);
    ele.append(ins);
    // @ts-expect-error ins.expose may not exist in all component instances
    expose(ins.expose);
    return {
      update: props => {
        Object.assign(ins, props);
        ins.requestUpdate();
      },
      unmount: () => {
        ins.remove();
      },
    };
  };
};

export class UniAnyRender<
  T,
  Expose extends NonNullable<unknown>,
> extends SignalWatcher(ShadowlessElement) {
  override render() {
    return this.renderTemplate(this.props, this.expose);
  }

  @property({ attribute: false })
  accessor expose!: Expose;

  @property({ attribute: false })
  accessor props!: T;

  @property({ attribute: false })
  accessor renderTemplate!: (props: T, expose: Expose) => TemplateResult;
}
export const defineUniComponent = <T, Expose extends NonNullable<unknown>>(
  renderTemplate: (props: T, expose: Expose) => TemplateResult
): UniComponent<T, Expose> => {
  return (ele, props, expose) => {
    const ins = new UniAnyRender<T, Expose>();
    ins.props = props;
    ins.expose = {} as Expose;
    ins.renderTemplate = renderTemplate;
    ele.append(ins);
    expose(ins.expose);
    return {
      update: props => {
        ins.props = props;
        ins.requestUpdate();
      },
      unmount: () => {
        ins.remove();
      },
    };
  };
};
