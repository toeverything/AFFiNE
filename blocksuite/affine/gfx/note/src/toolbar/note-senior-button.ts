import {
  Heading1Icon,
  LinkIcon,
  TextIcon,
} from '@blocksuite/affine-components/icons';
import {
  EditPropsStore,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import { EdgelessToolbarToolMixin } from '@blocksuite/affine-widget-edgeless-toolbar';
import { SignalWatcher } from '@blocksuite/global/lit';
import { computed } from '@preact/signals-core';
import { css, html, LitElement } from 'lit';
import { state } from 'lit/decorators.js';

import { NoteTool, type NoteToolOption } from '../note-tool.js';
import { toShapeNotToAdapt } from './icon.js';

export class EdgelessNoteSeniorButton extends EdgelessToolbarToolMixin(
  SignalWatcher(LitElement)
) {
  static override styles = css`
    :host,
    .edgeless-note-button {
      display: block;
      width: 100%;
      height: 100%;
    }
    :host * {
      box-sizing: border-box;
    }

    .note-root[data-app-theme='light'] {
      --paper-border-color: var(--affine-pure-white);
      --paper-foriegn-color: rgba(0, 0, 0, 0.1);
      --paper-shadow: 0px 2px 4px rgba(0, 0, 0, 0.25);
      --icon-card-bg: #fff;
      --icon-card-shadow:
        0px 2px 4px rgba(0, 0, 0, 0.22), inset 0px -2px 1px rgba(0, 0, 0, 0.14);
    }
    .note-root[data-app-theme='dark'] {
      --paper-border-color: var(--affine-divider-color);
      --paper-foriegn-color: rgba(255, 255, 255, 0.12);
      --paper-shadow: 0px 2px 6px rgba(0, 0, 0, 0.8);
      --icon-card-bg: #343434;
      --icon-card-shadow:
        0px 2px 4px rgba(0, 0, 0, 0.6),
        inset 0px -2px 1px rgba(255, 255, 255, 0.06);
    }

    .note-root {
      width: 100%;
      height: 64px;
      background: transparent;
      position: relative;
      overflow: hidden;
      cursor: pointer;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    .paper {
      --y: 20px;
      --r: 4.42deg;
      width: 60px;
      height: 72px;
      background: var(--paper-bg);
      border: 1px solid var(--paper-border-color);
      position: absolute;
      transform: translateY(var(--y)) rotate(var(--r));
      color: var(--paper-foriegn-color);
      box-shadow: var(--paper-shadow);
      padding-top: 32px;
      padding-left: 3px;
      transition: transform 0.4s ease;
    }
    .edgeless-toolbar-note-icon {
      position: absolute;
      width: 26px;
      height: 26px;
      border-radius: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--affine-icon-secondary);
      background: var(--icon-card-bg);
      box-shadow: var(--icon-card-shadow);
      bottom: 12px;
      transition: transform 0.4s ease;
      transform: translateX(var(--x)) translateY(var(--y)) rotate(var(--r));
    }
    .edgeless-toolbar-note-icon.link {
      --x: -22px;
      --y: -5px;
      --r: -6deg;
      transform-origin: 0% 100%;
    }
    .edgeless-toolbar-note-icon.text {
      --r: 4deg;
      --x: 0px;
      --y: 0px;
    }
    .edgeless-toolbar-note-icon.heading {
      --x: 21px;
      --y: -7px;
      --r: 8deg;
      transform-origin: 0% 100%;
    }

    .note-root:hover .paper {
      --y: 15px;
    }
    .note-root:hover .link {
      --x: -25px;
      --y: -5px;
      --r: -9.5deg;
    }
    .note-root:hover .text {
      --y: -10px;
    }
    .note-root:hover .heading {
      --x: 23px;
      --y: -8px;
      --r: 15deg;
    }
  `;

  private readonly _noteBg$ = computed(() => {
    return this.edgeless.std
      .get(ThemeProvider)
      .generateColorProperty(
        this.edgeless.std.get(EditPropsStore).lastProps$.value['affine:note']
          .background
      );
  });

  private readonly _states = ['childFlavour', 'childType', 'tip'] as const;

  override enableActiveBackground = true;

  override type = NoteTool;

  private _toggleNoteMenu() {
    if (this.tryDisposePopper()) return;

    const { edgeless, childFlavour, childType, tip } = this;

    this.setEdgelessTool(NoteTool, {
      childFlavour,
      childType,
      tip,
    });
    const menu = this.createPopper('edgeless-note-menu', this);

    Object.assign(menu.element, {
      edgeless,
      childFlavour,
      childType,
      tip,
      onChange: (
        props: Partial<{
          childFlavour: NoteToolOption['childFlavour'];
          childType: string | null;
          tip: string;
        }>
      ) => {
        this._states.forEach(key => {
          // oxlint-disable-next-line eqeqeq
          if (props[key] != undefined) {
            Object.assign(this, { [key]: props[key] });
          }
        });
        this.setEdgelessTool(NoteTool, {
          childFlavour: this.childFlavour,
          childType: this.childType,
          tip: this.tip,
        });
      },
    });
  }

  override render() {
    const appTheme = this.edgeless.std.get(ThemeProvider).app$.value;

    return html`<edgeless-toolbar-button
      class="edgeless-note-button"
      .tooltip=${this.popper
        ? ''
        : html`<affine-tooltip-content-with-shortcut
            data-tip="${'Note'}"
            data-shortcut="${'N'}"
          ></affine-tooltip-content-with-shortcut>`}
      .tooltipOffset=${5}
    >
      <div
        class="note-root"
        data-app-theme=${appTheme}
        @click=${this._toggleNoteMenu}
        style="--paper-bg: ${this._noteBg$.value}"
      >
        <div class="paper">${toShapeNotToAdapt}</div>
        <div class="edgeless-toolbar-note-icon link">${LinkIcon}</div>
        <div class="edgeless-toolbar-note-icon heading">${Heading1Icon}</div>
        <div class="edgeless-toolbar-note-icon text">${TextIcon}</div>
      </div>
    </edgeless-toolbar-button>`;
  }

  // TODO: better to extract these states outside of component?
  @state()
  accessor childFlavour: NoteToolOption['childFlavour'] = 'affine:paragraph';

  @state()
  accessor childType = 'text';

  @state()
  accessor tip = 'Note';
}
