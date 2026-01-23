import { type ShapeName, ShapeType } from '@blocksuite/affine-model';
import { EdgelessToolbarToolMixin } from '@blocksuite/affine-widget-edgeless-toolbar';
import { SignalWatcher } from '@blocksuite/global/lit';
import { css, html, LitElement } from 'lit';

import { ShapeTool } from '../shape-tool.js';
import type { DraggableShape } from './utils.js';

export class EdgelessShapeToolButton extends EdgelessToolbarToolMixin(
  SignalWatcher(LitElement)
) {
  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    edgeless-toolbar-button,
    .shapes {
      width: 100%;
      height: 64px;
    }
  `;

  private readonly _handleShapeClick = (shape: DraggableShape) => {
    this.setEdgelessTool(this.type, {
      shapeName: shape.name,
    });
    if (!this.popper) this._toggleMenu();
  };

  private readonly _handleWrapperClick = () => {
    if (this.tryDisposePopper()) return;

    this.setEdgelessTool(this.type, {
      shapeName: ShapeType.Rect,
    });
    if (!this.popper) this._toggleMenu();
  };

  override type = ShapeTool;

  private _toggleMenu() {
    this.createPopper('edgeless-shape-menu', this, {
      setProps: ele => {
        ele.edgeless = this.edgeless;
        ele.onChange = (shapeName: ShapeName) => {
          this.setEdgelessTool(this.type, {
            shapeName,
          });
          this._updateOverlay();
        };
        ele.onMoreClick = () => {
          this._showShapeBrowser();
        };
      },
    });
  }

  private _showShapeBrowser() {
    // Close the current menu first
    if (this.popper) {
      this.popper.dispose();
      this.popper = null;
    }
    // Show the shape browser panel
    this.createPopper('edgeless-shape-browser-panel', this, {
      setProps: ele => {
        ele.slots.select.subscribe((shapeName: ShapeName) => {
          this.setEdgelessTool(this.type, {
            shapeName,
          });
          this._updateOverlay();
          // Close the browser after selection
          if (this.popper) {
            this.popper.dispose();
            this.popper = null;
          }
        });
        ele.slots.close.subscribe(() => {
          if (this.popper) {
            this.popper.dispose();
            this.popper = null;
          }
        });
      },
    });
  }

  private _updateOverlay() {
    const controller = this.gfx.tool.currentTool$.peek();
    if (controller instanceof ShapeTool) {
      controller.createOverlay();
    }
  }

  override render() {
    const { active } = this;

    return html`
      <edgeless-toolbar-button
        class="edgeless-shape-button"
        .tooltip=${this.popper
          ? ''
          : html`<affine-tooltip-content-with-shortcut
              data-tip="${'Shape'}"
              data-shortcut="${'S'}"
            ></affine-tooltip-content-with-shortcut>`}
        .tooltipOffset=${5}
        .active=${active}
      >
        <edgeless-toolbar-shape-draggable
          .edgeless=${this.edgeless}
          .toolbarContainer=${this.toolbarContainer}
          class="shapes"
          @click=${this._handleWrapperClick}
          .onShapeClick=${this._handleShapeClick}
        >
        </edgeless-toolbar-shape-draggable>
      </edgeless-toolbar-button>
    `;
  }
}
