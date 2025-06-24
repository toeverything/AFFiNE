import { DefaultTool } from '@blocksuite/affine-block-surface';
import { QuickToolMixin } from '@blocksuite/affine-widget-edgeless-toolbar';
import { HandIcon, SelectIcon } from '@blocksuite/icons/lit';
import { effect } from '@preact/signals-core';
import { css, html, LitElement } from 'lit';
import { query } from 'lit/decorators.js';

import { PanTool } from '../tools';

export class EdgelessDefaultToolButton extends QuickToolMixin(LitElement) {
  static override styles = css`
    .current-icon {
      transition: 100ms;
    }
    .current-icon > svg {
      display: block;
      width: 24px;
      height: 24px;
    }
  `;

  override type = [DefaultTool, PanTool];

  private _changeTool() {
    if (this.toolbar.activePopper) {
      // click manually always closes the popper
      this.toolbar.activePopper.dispose();
    }
    const type = this.edgelessTool?.toolType?.toolName;
    if (type !== 'default' && type !== 'pan') {
      if (localStorage.defaultTool === 'default') {
        this.setEdgelessTool(DefaultTool);
      } else if (localStorage.defaultTool === 'pan') {
        this.setEdgelessTool(PanTool, { panning: false });
      }
      return;
    }
    this._fadeOut();
    // wait for animation to finish
    setTimeout(() => {
      if (type === 'default') {
        this.setEdgelessTool(PanTool, { panning: false });
      } else if (type === 'pan') {
        this.setEdgelessTool(DefaultTool);
      }
      this._fadeIn();
    }, 100);
  }

  private _fadeIn() {
    this.currentIcon.style.opacity = '1';
    this.currentIcon.style.transform = `translateY(0px)`;
  }

  private _fadeOut() {
    this.currentIcon.style.opacity = '0';
    this.currentIcon.style.transform = `translateY(-5px)`;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (!localStorage.defaultTool) {
      localStorage.defaultTool = 'default';
    }
    this.disposables.add(
      effect(() => {
        const tool = this.gfx.tool.currentToolName$.value;
        if (tool === 'default' || tool === 'pan') {
          localStorage.defaultTool = tool;
        }
      })
    );
  }

  override render() {
    const type = this.edgelessTool?.toolType?.toolName;
    const { active } = this;
    const tipInfo =
      type === 'pan'
        ? { tip: 'Hand', shortcut: 'H' }
        : { tip: 'Select', shortcut: 'V' };
    return html`
      <edgeless-tool-icon-button
        class="edgeless-default-button ${type}"
        .tooltip=${html`<affine-tooltip-content-with-shortcut
          data-tip="${tipInfo.tip}"
          data-shortcut="${tipInfo.shortcut}"
        ></affine-tooltip-content-with-shortcut>`}
        .tooltipOffset=${17}
        .active=${active}
        .iconContainerPadding=${6}
        .iconSize=${'24px'}
        @click=${this._changeTool}
      >
        <div class="current-icon">
          ${localStorage.defaultTool === 'default' ? SelectIcon() : HandIcon()}
        </div>
        <toolbar-arrow-up-icon></toolbar-arrow-up-icon>
      </edgeless-tool-icon-button>
    `;
  }

  @query('.current-icon')
  accessor currentIcon!: HTMLInputElement;
}
