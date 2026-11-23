import { EdgelessLegacySlotIdentifier } from '@blocksuite/affine-block-surface';
import type { FrameBlockModel, RootBlockModel } from '@blocksuite/affine-model';
import { EditPropsStore } from '@blocksuite/affine-shared/services';
import { Bound } from '@blocksuite/global/gfx';
import { WidgetComponent, WidgetViewExtension } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { effect } from '@preact/signals-core';
import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { literal, unsafeStatic } from 'lit/static-html.js';

import { PresentTool } from '../present-tool';

export const EDGELESS_NAVIGATOR_BLACK_BACKGROUND_WIDGET =
  'edgeless-navigator-black-background';
export class EdgelessNavigatorBlackBackgroundWidget extends WidgetComponent<RootBlockModel> {
  static override styles = css`
    .edgeless-navigator-black-background {
      background-color: black;
      position: absolute;
      z-index: 1;
      background-color: transparent;
      box-shadow: 0 0 0 5000px black;
      pointer-events: none;
    }
  `;

  private _blackBackground = false;

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  private get _slots() {
    return this.std.get(EdgelessLegacySlotIdentifier);
  }

  private _tryLoadBlackBackground() {
    const value = this.std
      .get(EditPropsStore)
      .getStorage('presentBlackBackground');
    this._blackBackground = value ?? true;
  }

  override firstUpdated() {
    const { _disposables, gfx } = this;
    _disposables.add(
      this._slots.navigatorFrameChanged.subscribe(frame => {
        this.frame = frame;
      })
    );

    _disposables.add(
      this._slots.navigatorSettingUpdated.subscribe(({ blackBackground }) => {
        if (blackBackground !== undefined) {
          this.std
            .get(EditPropsStore)
            .setStorage('presentBlackBackground', blackBackground);

          this._blackBackground = blackBackground;

          this.show =
            blackBackground &&
            this.gfx.tool.currentToolOption$.peek().toolType === PresentTool;
        }
      })
    );

    _disposables.add(
      effect(() => {
        const tool = gfx.tool.currentToolName$.value;

        if (tool !== 'frameNavigator') {
          this.show = false;
        } else {
          this.show = this._blackBackground;
        }
      })
    );

    _disposables.add(
      this._slots.fullScreenToggled.subscribe(
        () =>
          setTimeout(() => {
            this.requestUpdate();
          }, 500) // wait for full screen animation
      )
    );

    this._tryLoadBlackBackground();
  }

  override render() {
    const { frame, show, gfx } = this;

    if (!show || !frame) return nothing;

    const bound = Bound.deserialize(frame.xywh);
    const zoom = gfx.viewport.zoom;
    const width = bound.w * zoom;
    const height = bound.h * zoom;
    const [x, y] = gfx.viewport.toViewCoord(bound.x, bound.y);

    return html` <style>
        .edgeless-navigator-black-background {
          width: ${width}px;
          height: ${height}px;
          top: ${y}px;
          left: ${x}px;
        }
      </style>
      <div class="edgeless-navigator-black-background"></div>`;
  }

  @state()
  private accessor frame: FrameBlockModel | undefined = undefined;

  @state()
  private accessor show = false;
}

export const edgelessNavigatorBgWidget = WidgetViewExtension(
  'affine:page',
  EDGELESS_NAVIGATOR_BLACK_BACKGROUND_WIDGET,
  literal`${unsafeStatic(EDGELESS_NAVIGATOR_BLACK_BACKGROUND_WIDGET)}`
);
