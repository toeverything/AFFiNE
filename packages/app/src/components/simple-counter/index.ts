import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import * as React from 'react';

export const tagName = 'simple-counter';

// Adapt React in order to be able to use custom tags properly
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [tagName]: PersonInfoProps;
    }
  }
}

interface PersonInfoProps
  extends React.DetailedHTMLProps<
    React.HTMLAttributes<HTMLElement>,
    HTMLElement
  > {
  name?: string;
}
// ===================== Adapt end ====================

@customElement(tagName)
export class Counter extends LitElement {
  static styles = css`
    .counter-container {
      display: flex;
      color: var(--affine-text-color);
    }
    button {
      margin: 0 5px;
    }
  `;

  @property()
  name?: string = '';

  @state()
  count = 0;
  // Render the UI as a function of component state
  render() {
    return html`<div class="counter-container">
      <div class="name">${this.name}</div>
      <button @click=${this._subtract}>-</button>
      <div>${this.count}</div>
      <button @click="${this._increment}">+</button>
    </div>`;
  }

  private _increment(e: Event) {
    this.count++;
  }
  private _subtract(e: Event) {
    this.count--;
  }
}
