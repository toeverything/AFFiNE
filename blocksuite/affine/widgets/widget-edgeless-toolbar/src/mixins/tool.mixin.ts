import type { ColorScheme } from '@blocksuite/affine-model';
import type { BlockComponent } from '@blocksuite/block-std';
import {
  type GfxController,
  GfxControllerIdentifier,
  type GfxToolsFullOption,
  type GfxToolsFullOptionValue,
  type ToolController,
} from '@blocksuite/block-std/gfx';
import {
  // oxlint-disable-next-line no-unused-vars
  type DisposableClass,
  WithDisposable,
} from '@blocksuite/global/lit';
import type { Constructor } from '@blocksuite/global/utils';
import { consume } from '@lit/context';
import { effect } from '@preact/signals-core';
import { cssVar } from '@toeverything/theme';
import type { LitElement } from 'lit';
import { property, state } from 'lit/decorators.js';

import {
  edgelessToolbarContext,
  type EdgelessToolbarSlots,
  edgelessToolbarSlotsContext,
  edgelessToolbarThemeContext,
} from '../context';
import { createPopper, type MenuPopper } from '../create-popper';
import type { EdgelessToolbarWidget } from '../edgeless-toolbar';

type ValueOf<T> = T[keyof T];

export declare abstract class EdgelessToolbarToolClass extends DisposableClass {
  active: boolean;

  createPopper: typeof createPopper;

  edgeless: BlockComponent;

  edgelessTool: GfxToolsFullOptionValue;

  enableActiveBackground?: boolean;

  popper: MenuPopper<HTMLElement> | null;

  setEdgelessTool: ToolController['setTool'];

  gfx: GfxController;

  theme: ColorScheme;

  toolbarContainer: HTMLElement | null;

  toolbarSlots: EdgelessToolbarSlots;

  /**
   * @return true if operation was successful
   */
  tryDisposePopper: () => boolean;

  abstract type:
    | GfxToolsFullOptionValue['type']
    | GfxToolsFullOptionValue['type'][];

  accessor toolbar: EdgelessToolbarWidget;
}

export const EdgelessToolbarToolMixin = <T extends Constructor<LitElement>>(
  SuperClass: T
) => {
  abstract class DerivedClass extends WithDisposable(SuperClass) {
    enableActiveBackground = false;

    abstract type:
      | GfxToolsFullOptionValue['type']
      | GfxToolsFullOptionValue['type'][];

    get active() {
      const { type } = this;
      // @ts-expect-error FIXME: we need to fix the type of edgelessTool
      const activeType = this.edgelessTool?.type;

      return activeType
        ? Array.isArray(type)
          ? // @ts-expect-error FIXME: we need to fix the type of edgelessTool
            type.includes(activeType)
          : activeType === type
        : false;
    }

    get gfx() {
      return this.edgeless.std.get(GfxControllerIdentifier);
    }

    get setEdgelessTool() {
      return (...args: Parameters<ToolController['setTool']>) => {
        this.gfx.tool.setTool(
          // @ts-expect-error FIXME: ts error
          ...args
        );
      };
    }

    private _applyActiveStyle() {
      if (!this.enableActiveBackground) return;
      this.style.background = this.active
        ? cssVar('hoverColor')
        : 'transparent';
    }

    private _updateActiveEdgelessTool() {
      this.edgelessTool = this.gfx.tool.currentToolOption$.value;
      this._applyActiveStyle();
    }

    override connectedCallback() {
      super.connectedCallback();
      if (!this.edgeless) return;
      this._updateActiveEdgelessTool();
      this._applyActiveStyle();

      this._disposables.add(
        effect(() => {
          this._updateActiveEdgelessTool();
        })
      );
    }

    // TODO: move to toolbar-tool-with-menu.mixin
    createPopper(...args: Parameters<typeof createPopper>) {
      if (this.toolbar.activePopper) {
        this.toolbar.activePopper.dispose();
        this.toolbar.activePopper = null;
      }
      this.popper = createPopper(args[0], args[1], {
        ...args[2],
        onDispose: () => {
          args[2]?.onDispose?.();
          this.popper = null;
        },
      }) as MenuPopper<HTMLElement>;
      this.toolbar.activePopper = this.popper;
      return this.popper;
    }

    override disconnectedCallback() {
      super.disconnectedCallback();
      this.popper?.dispose();
    }

    tryDisposePopper() {
      if (!this.active) return false;
      if (this.popper) {
        this.popper.dispose();
        this.popper = null;
        return true;
      }
      return false;
    }

    @property({ attribute: false })
    accessor edgeless!: BlockComponent;

    @state()
    accessor edgelessTool!: ValueOf<GfxToolsFullOption> | null;

    @state()
    public accessor popper: MenuPopper<HTMLElement> | null = null;

    @consume({ context: edgelessToolbarThemeContext, subscribe: true })
    accessor theme!: ColorScheme;

    @consume({ context: edgelessToolbarContext })
    accessor toolbar!: EdgelessToolbarWidget;

    @property({ attribute: false })
    accessor toolbarContainer: HTMLElement | null = null;

    @consume({ context: edgelessToolbarSlotsContext })
    accessor toolbarSlots!: EdgelessToolbarSlots;
  }

  return DerivedClass as unknown as T & Constructor<EdgelessToolbarToolClass>;
};
