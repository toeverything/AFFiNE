import { type SurfaceRefBlockModel } from '@blocksuite/affine-model';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { BlockComponent, BlockSelection } from '@blocksuite/std';
import { GfxControllerIdentifier, type GfxModel } from '@blocksuite/std/gfx';
import { css, html } from 'lit';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

export class EdgelessSurfaceRefBlockComponent extends BlockComponent<SurfaceRefBlockModel> {
  static override styles = css`
    affine-edgeless-surface-ref {
      position: relative;
      overflow: hidden;
    }

    .affine-edgeless-surface-ref-container {
      border-radius: 8px;
      border: 1px solid
        ${unsafeCSSVarV2('layer/insideBorder/border', '#e6e6e6')};
      margin: 18px 0;
    }

    .affine-edgeless-surface-ref-container.focused {
      border-color: ${unsafeCSSVarV2('edgeless/frame/border/active')};
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();

    const elementModel = this.gfx.getElementById(
      this.model.props.reference
    ) as GfxModel;

    this._referenceModel = elementModel;
    this._initSelection();
  }

  private _initSelection() {
    const selection = this.std.selection;
    this._disposables.add(
      selection.slots.changed.subscribe(selList => {
        this._focused = selList.some(
          sel => sel.blockId === this.blockId && sel.is(BlockSelection)
        );
      })
    );
  }

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  @state()
  accessor _referenceModel: GfxModel | null = null;

  @state()
  accessor _focused = false;

  override renderBlock() {
    return html` <div
      class=${classMap({
        'affine-edgeless-surface-ref-container': true,
        focused: this._focused,
      })}
    >
      <surface-ref-placeholder
        .referenceModel=${this._referenceModel}
        .refFlavour=${this.model.props.refFlavour$.value}
        .inEdgeless=${true}
      ></surface-ref-placeholder>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-edgeless-surface-ref': EdgelessSurfaceRefBlockComponent;
  }
}
