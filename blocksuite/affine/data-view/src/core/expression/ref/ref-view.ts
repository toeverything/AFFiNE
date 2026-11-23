import {
  menu,
  popFilterableSimpleMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';

import { renderUniLit } from '../../utils/uni-component/uni-component.js';
import type { Variable, VariableRef } from '../types.js';

export class VariableRefView extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    variable-ref-view {
      font-size: 12px;
      line-height: 20px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 4px;
      border-radius: 4px;
      cursor: pointer;
    }

    variable-ref-view:hover {
      background-color: var(--affine-hover-color);
    }

    variable-ref-view svg {
      width: 16px;
      height: 16px;
      fill: var(--affine-icon-color);
      color: var(--affine-icon-color);
    }
  `;

  get field() {
    if (!this.data) {
      return;
    }
    return this.data.name;
  }

  get fieldData() {
    const id = this.field;
    if (!id) {
      return;
    }
    return this.vars.find(v => v.id === id);
  }

  override connectedCallback() {
    super.connectedCallback();
    this.disposables.addFromEvent(this, 'click', e => {
      popFilterableSimpleMenu(
        popupTargetFromElement(e.target as HTMLElement),
        this.vars.map(v =>
          menu.action({
            name: v.name,
            prefix: renderUniLit(v.icon, {}),
            select: () => {
              this.setData({
                type: 'ref',
                name: v.id,
              });
            },
          })
        )
      );
    });
  }

  override render() {
    const data = this.fieldData;
    return html` ${renderUniLit(data?.icon, {})} ${data?.name} `;
  }

  @property({ attribute: false })
  accessor data: VariableRef | undefined = undefined;

  @property({ attribute: false })
  accessor setData!: (filter: VariableRef) => void;

  @property({ attribute: false })
  accessor vars!: Variable[];
}

declare global {
  interface HTMLElementTagNameMap {
    'variable-ref-view': VariableRefView;
  }
}
