import { OverlayIdentifier } from '@blocksuite/affine-block-surface';
import {
  DefaultTheme,
  type FrameBlockModel,
  FrameBlockSchema,
  isTransparent,
} from '@blocksuite/affine-model';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { Bound } from '@blocksuite/global/gfx';
import { GfxBlockComponent } from '@blocksuite/std';
import {
  type BoxSelectionContext,
  getTopElements,
  GfxViewInteractionExtension,
} from '@blocksuite/std/gfx';
import { cssVarV2 } from '@toeverything/theme/v2';
import { html } from 'lit';
import { state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import {
  EdgelessFrameManagerIdentifier,
  type FrameOverlay,
} from './frame-manager';

export class FrameBlockComponent extends GfxBlockComponent<FrameBlockModel> {
  override connectedCallback() {
    super.connectedCallback();

    this._disposables.add(
      this.store.slots.blockUpdated.subscribe(({ type, id }) => {
        if (id === this.model.id && type === 'update') {
          this.requestUpdate();
        }
      })
    );
    this._disposables.add(
      this.gfx.viewport.viewportUpdated.subscribe(() => {
        this.requestUpdate();
      })
    );
  }

  /**
   * Due to potentially very large frame sizes, CSS scaling can cause iOS Safari to crash.
   * To mitigate this issue, we combine size calculations within the rendering rect.
   */
  override getCSSTransform(): string {
    return '';
  }

  override getRenderingRect() {
    const viewport = this.gfx.viewport;
    const { translateX, translateY, zoom } = viewport;
    const { xywh, rotate } = this.model;
    const bound = Bound.deserialize(xywh);

    const scaledX = bound.x * zoom + translateX;
    const scaledY = bound.y * zoom + translateY;

    return {
      x: scaledX,
      y: scaledY,
      w: bound.w * zoom,
      h: bound.h * zoom,
      rotate,
      zIndex: this.toZIndex(),
    };
  }

  override onBoxSelected(context: BoxSelectionContext) {
    const { box } = context;
    const bound = new Bound(box.x, box.y, box.w, box.h);
    const elementBound = this.model.elementBound;

    return (
      this.model.childElements.length === 0 || bound.contains(elementBound)
    );
  }

  override renderGfxBlock() {
    const { model, showBorder, std } = this;
    const backgroundColor = std
      .get(ThemeProvider)
      .generateColorProperty(model.props.background, DefaultTheme.transparent);
    const _isNavigator =
      this.gfx.tool.currentToolName$.value === 'frameNavigator';
    const frameIndex = this.gfx.layer.getZIndex(model);

    const widgets = html`${repeat(
      Object.entries(this.widgets),
      ([id]) => id,
      ([_, widget]) => widget
    )}`;

    return html`
      <div
        class="affine-frame-container"
        style=${styleMap({
          zIndex: `${frameIndex}`,
          backgroundColor,
          height: '100%',
          width: '100%',
          borderRadius: '2px',
          border:
            _isNavigator || !showBorder
              ? 'none'
              : `1px solid ${cssVarV2('edgeless/frame/border/default')}`,
        })}
      ></div>
      ${widgets}
    `;
  }

  @state()
  accessor showBorder = true;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-frame': FrameBlockComponent;
  }
}

export const FrameBlockInteraction =
  GfxViewInteractionExtension<FrameBlockComponent>(
    FrameBlockSchema.model.flavour,
    {
      handleResize: context => {
        const { model, std } = context;

        return {
          onResizeStart(context): void {
            context.default(context);
            model.stash('childElementIds');
          },

          onResizeMove(context): void {
            const { newBound } = context;
            const frameManager = std.getOptional(
              EdgelessFrameManagerIdentifier
            );
            const overlay = std.getOptional(
              OverlayIdentifier('frame')
            ) as FrameOverlay;

            model.xywh = newBound.serialize();

            if (!frameManager) {
              return;
            }

            const oldChildren = frameManager.getChildElementsInFrame(model);

            const newChildren = getTopElements(
              frameManager.getElementsInFrameBound(model)
            ).concat(
              oldChildren.filter(oldChild => {
                return model.intersectsBound(oldChild.elementBound);
              })
            );

            frameManager.removeAllChildrenFromFrame(model);
            frameManager.addElementsToFrame(model, newChildren);

            overlay?.highlight(model, true, false);
          },
          onResizeEnd(context): void {
            context.default(context);
            model.pop('childElementIds');
          },
        };
      },
      handleRotate: () => {
        return {
          beforeRotate(context): void {
            context.set({
              rotatable: false,
            });
          },
        };
      },
      handleSelection: () => {
        return {
          selectable(context) {
            const { model } = context;

            const onTitle =
              model.externalBound?.containsPoint([
                context.position.x,
                context.position.y,
              ]) ?? false;

            return (
              context.default(context) &&
              (model.isLocked() ||
                !isTransparent(model.props.background) ||
                onTitle)
            );
          },
          onSelect(context) {
            return context.default(context);
          },
        };
      },
    }
  );
