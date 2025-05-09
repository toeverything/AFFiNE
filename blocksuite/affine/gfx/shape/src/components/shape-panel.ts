import { ShapeStyle } from '@blocksuite/affine-model';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { Subject } from 'rxjs';

import type { ShapeTool } from '../shape-tool';
import { ShapeComponentConfig } from '../toolbar/shape-menu-config';

export class EdgelessShapePanel extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
  `;

  slots = {
    select: new Subject<ShapeTool['activatedOption']['shapeName']>(),
  };

  private _onSelect(value: ShapeTool['activatedOption']['shapeName']) {
    this.selectedShape = value;
    this.slots.select.next(value);
  }

  override disconnectedCallback(): void {
    this.slots.select.complete();
    super.disconnectedCallback();
  }

  override render() {
    return repeat(
      ShapeComponentConfig,
      item => item.name,
      ({ name, generalIcon, scribbledIcon, tooltip, disabled }) =>
        html`<edgeless-tool-icon-button
          .disabled=${disabled}
          .tooltip=${tooltip}
          .active=${this.selectedShape === name}
          .activeMode=${'background'}
          .iconSize=${'20px'}
          @click=${() => {
            if (disabled) return;
            this._onSelect(name);
          }}
        >
          ${this.shapeStyle === ShapeStyle.General
            ? generalIcon
            : scribbledIcon}
        </edgeless-tool-icon-button>`
    );
  }

  @property({ attribute: false })
  accessor selectedShape:
    | ShapeTool['activatedOption']['shapeName']
    | null
    | undefined = undefined;

  @property({ attribute: false })
  accessor shapeStyle: ShapeStyle = ShapeStyle.Scribbled;
}
