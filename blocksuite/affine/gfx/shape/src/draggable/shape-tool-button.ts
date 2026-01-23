import { type ShapeName, ShapeType } from '@blocksuite/affine-model';
import { once } from '@blocksuite/affine-shared/utils';
import { EdgelessToolbarToolMixin } from '@blocksuite/affine-widget-edgeless-toolbar';
import { SignalWatcher } from '@blocksuite/global/lit';
import {
  arrow,
  autoUpdate,
  computePosition,
  offset,
  shift,
} from '@floating-ui/dom';
import { css, html, LitElement } from 'lit';
import { state } from 'lit/decorators.js';

import type { EdgelessShapeBrowserPanel } from '../components/shape-browser-panel.js';
import { ShapeTool } from '../shape-tool.js';
import type { EdgelessShapeMenu } from './shape-menu.js';
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

  private _cleanup: (() => void) | null = null;
  private _autoUpdateCleanup: (() => void) | null = null;
  private _menuElement: EdgelessShapeMenu | null = null;

  @state()
  private accessor _browserOpen = false;

  @state()
  private accessor _openedBrowserPanel: EdgelessShapeBrowserPanel | null = null;

  override type = ShapeTool;

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

  override connectedCallback() {
    super.connectedCallback();
    this.disposables.add(() => this._autoUpdateCleanup?.());
  }

  private _toggleMenu() {
    this.createPopper('edgeless-shape-menu', this, {
      setProps: ele => {
        this._menuElement = ele;
        ele.edgeless = this.edgeless;
        ele.browserOpen = this._browserOpen;
        ele.onChange = (shapeName: ShapeName) => {
          this.setEdgelessTool(this.type, {
            shapeName,
          });
          this._updateOverlay();
        };
        ele.onMoreClick = () => {
          this._toggleShapeBrowser();
        };
      },
    });
  }

  private _toggleShapeBrowser() {
    if (this._openedBrowserPanel) {
      this._closeBrowser();
      return;
    }

    this._browserOpen = true;
    if (this._menuElement) {
      this._menuElement.browserOpen = true;
    }

    const panel = document.createElement('edgeless-shape-browser-panel');
    panel.edgeless = this.edgeless;

    this._cleanup = once(panel, 'closepanel', () => {
      this._closeBrowser();
    });

    // Handle shape selection
    panel.addEventListener('shapeselect', ((e: CustomEvent) => {
      const shapeName = e.detail.shapeName;
      this.setEdgelessTool(this.type, { shapeName });
      this._updateOverlay();
      this._closeBrowser();
    }) as EventListener);

    this._openedBrowserPanel = panel;
    document.body.append(panel);

    requestAnimationFrame(() => {
      // Find the More button in the shape menu as the positioning reference
      const moreButton = this._menuElement?.renderRoot.querySelector(
        '.more-shapes-button'
      ) as HTMLElement | null;
      const referenceEl = moreButton ?? this._menuElement ?? this;

      const arrowEl = panel.renderRoot.querySelector('.arrow') as HTMLElement;
      this._autoUpdateCleanup?.();
      this._autoUpdateCleanup = autoUpdate(referenceEl, panel, () => {
        computePosition(referenceEl, panel, {
          placement: 'top',
          middleware: [offset(20), arrow({ element: arrowEl }), shift()],
        })
          .then(({ x, y, middlewareData }) => {
            panel.style.left = `${x}px`;
            panel.style.top = `${y}px`;

            if (arrowEl) {
              arrowEl.style.left = `${
                (middlewareData.arrow?.x ?? 0) - (middlewareData.shift?.x ?? 0)
              }px`;
            }
          })
          .catch(e => {
            console.warn("Can't compute position", e);
          });
      });
    });
  }

  private _closeBrowser() {
    if (this._openedBrowserPanel) {
      this._openedBrowserPanel.remove();
      this._openedBrowserPanel = null;
      this._cleanup?.();
      this._cleanup = null;
      this._autoUpdateCleanup?.();
      this._autoUpdateCleanup = null;
      this._browserOpen = false;
      if (this._menuElement) {
        this._menuElement.browserOpen = false;
      }
      this.requestUpdate();
    }
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
