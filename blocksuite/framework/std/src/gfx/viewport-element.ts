import { WithDisposable } from '@blocksuite/global/lit';
import { batch } from '@preact/signals-core';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';

import {
  type EditorHost,
  isGfxBlockComponent,
  ShadowlessElement,
} from '../view';
import { PropTypes, requiredProperties } from '../view/decorators/required';
import { GfxControllerIdentifier } from './identifiers';
import { GfxBlockElementModel } from './model/gfx-block-model';
import { Viewport } from './viewport';

/**
 * A wrapper around `requestConnectedFrame` that only calls at most once in one frame
 */
export function requestThrottledConnectedFrame<
  T extends (...args: unknown[]) => void,
>(func: T, element?: HTMLElement): T {
  let raqId: number | undefined = undefined;
  let latestArgs: unknown[] = [];

  return ((...args: unknown[]) => {
    latestArgs = args;

    if (raqId === undefined) {
      raqId = requestAnimationFrame(() => {
        raqId = undefined;

        if (!element || element.isConnected) {
          func(...latestArgs);
        }
      });
    }
  }) as T;
}

@requiredProperties({
  viewport: PropTypes.instanceOf(Viewport),
})
export class GfxViewportElement extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    gfx-viewport {
      position: absolute;
      left: 0;
      top: 0;
      contain: size layout style;
      display: block;
      transform: none;
    }

    /* CSS for idle blocks that are hidden but maintain layout */
    .block-idle {
      visibility: hidden;
      pointer-events: none;
      will-change: transform;
      contain: size layout style;
    }

    /* CSS for active blocks participating in viewport transformations */
    .block-active {
      visibility: visible;
      pointer-events: auto;
    }
  `;

  private readonly _hideOutsideAndNoSelectedBlock = () => {
    if (!this.host) return;

    const gfx = this.host.std.get(GfxControllerIdentifier);
    const currentViewportModels = this.getModelsInViewport();
    const currentSelectedModels = this._getSelectedModels();
    const shouldBeVisible = new Set([
      ...currentViewportModels,
      ...currentSelectedModels,
    ]);

    const previousVisible = this._lastVisibleModels
      ? new Set(this._lastVisibleModels)
      : new Set<GfxBlockElementModel>();

    batch(() => {
      // Step 1: Activate all the blocks that should be visible
      shouldBeVisible.forEach(model => {
        const view = gfx.view.get(model);
        if (!isGfxBlockComponent(view)) return;
        view.transformState$.value = 'active';
      });

      // Step 2: Hide all the blocks that should not be visible
      previousVisible.forEach(model => {
        if (shouldBeVisible.has(model)) return;

        const view = gfx.view.get(model);
        if (!isGfxBlockComponent(view)) return;
        view.transformState$.value = 'idle';
      });
    });

    this._lastVisibleModels = shouldBeVisible;
  };

  private _lastVisibleModels?: Set<GfxBlockElementModel>;

  private readonly _pendingChildrenUpdates: {
    id: string;
    resolve: () => void;
  }[] = [];

  private readonly _refreshViewport = requestThrottledConnectedFrame(() => {
    this._hideOutsideAndNoSelectedBlock();
  }, this);

  private _updatingChildrenFlag = false;

  override connectedCallback(): void {
    super.connectedCallback();

    const viewportUpdateCallback = () => {
      this._refreshViewport();
    };

    if (!this.enableChildrenSchedule) {
      delete this.scheduleUpdateChildren;
    }

    this._hideOutsideAndNoSelectedBlock();
    this.disposables.add(
      this.viewport.viewportUpdated.subscribe(() => viewportUpdateCallback())
    );
    this.disposables.add(
      this.viewport.sizeUpdated.subscribe(() => viewportUpdateCallback())
    );
  }

  override render() {
    return html``;
  }

  scheduleUpdateChildren? = (id: string) => {
    const { promise, resolve } = Promise.withResolvers<void>();

    this._pendingChildrenUpdates.push({ id, resolve });

    if (!this._updatingChildrenFlag) {
      this._updatingChildrenFlag = true;
      const schedule = () => {
        if (this._pendingChildrenUpdates.length) {
          const childToUpdates = this._pendingChildrenUpdates.splice(
            0,
            this.maxConcurrentRenders
          );

          childToUpdates.forEach(({ resolve }) => resolve());

          if (this._pendingChildrenUpdates.length) {
            requestAnimationFrame(() => {
              this.isConnected && schedule();
            });
          } else {
            this._updatingChildrenFlag = false;
          }
        }
      };

      requestAnimationFrame(() => {
        this.isConnected && schedule();
      });
    }

    return promise;
  };

  private _getSelectedModels(): Set<GfxBlockElementModel> {
    if (!this.host) return new Set();
    const gfx = this.host.std.get(GfxControllerIdentifier);
    return new Set(
      gfx.selection.surfaceSelections
        .flatMap(({ elements }) => elements)
        .map(id => gfx.getElementById(id))
        .filter(e => e instanceof GfxBlockElementModel)
    );
  }

  @property({ attribute: false })
  accessor getModelsInViewport: () => Set<GfxBlockElementModel> = () =>
    new Set();

  @property({ attribute: false })
  accessor host: undefined | EditorHost;

  @property({ type: Number })
  accessor maxConcurrentRenders: number = 2;

  @property({ attribute: false })
  accessor enableChildrenSchedule: boolean = true;

  @property({ attribute: false })
  accessor viewport!: Viewport;

  setBlocksActive(blockIds: string[]): void {
    if (!this.host) return;
    const gfx = this.host.std.get(GfxControllerIdentifier);

    batch(() => {
      blockIds.forEach(id => {
        const view = gfx.view.get(id);
        if (isGfxBlockComponent(view)) {
          view.transformState$.value = 'active';
        }
      });
    });
  }

  setBlocksIdle(blockIds: string[]): void {
    if (!this.host) return;
    const gfx = this.host.std.get(GfxControllerIdentifier);

    batch(() => {
      blockIds.forEach(id => {
        const view = gfx.view.get(id);
        if (isGfxBlockComponent(view)) {
          view.transformState$.value = 'idle';
        }
      });
    });
  }
}
