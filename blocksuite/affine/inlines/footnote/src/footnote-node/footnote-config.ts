import type { FootNote } from '@blocksuite/affine-model';
import { createIdentifier } from '@blocksuite/global/di';
import { type BlockStdScope, StdIdentifier } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import type { TemplateResult } from 'lit';

type FootNoteNodeRenderer = (
  footnote: FootNote,
  std: BlockStdScope
) => TemplateResult<1>;

type FootNotePopupRenderer = (
  footnote: FootNote,
  std: BlockStdScope,
  abortController: AbortController
) => TemplateResult<1>;

export type FootNotePopupClickHandler = (
  footnote: FootNote,
  abortController: AbortController
) => void;

export interface FootNoteNodeConfig {
  customNodeRenderer?: FootNoteNodeRenderer;
  customPopupRenderer?: FootNotePopupRenderer;
  interactive?: boolean;
  hidePopup?: boolean;
  disableHoverEffect?: boolean;
  onPopupClick?: FootNotePopupClickHandler;
}

export class FootNoteNodeConfigProvider {
  private _customNodeRenderer?: FootNoteNodeRenderer;
  private _customPopupRenderer?: FootNotePopupRenderer;
  private _hidePopup: boolean;
  private _interactive: boolean;
  private _disableHoverEffect: boolean;
  private _onPopupClick?: FootNotePopupClickHandler;

  get customNodeRenderer() {
    return this._customNodeRenderer;
  }

  get customPopupRenderer() {
    return this._customPopupRenderer;
  }

  get onPopupClick() {
    return this._onPopupClick;
  }

  get doc() {
    return this.std.store;
  }

  get hidePopup() {
    return this._hidePopup;
  }

  get interactive() {
    return this._interactive;
  }

  get disableHoverEffect() {
    return this._disableHoverEffect;
  }

  constructor(
    config: FootNoteNodeConfig,
    readonly std: BlockStdScope
  ) {
    this._customNodeRenderer = config.customNodeRenderer;
    this._customPopupRenderer = config.customPopupRenderer;
    this._hidePopup = config.hidePopup ?? false;
    this._interactive = config.interactive ?? true;
    this._disableHoverEffect = config.disableHoverEffect ?? false;
    this._onPopupClick = config.onPopupClick;
  }

  setCustomNodeRenderer(renderer: FootNoteNodeRenderer) {
    this._customNodeRenderer = renderer;
  }

  setCustomPopupRenderer(renderer: FootNotePopupRenderer) {
    this._customPopupRenderer = renderer;
  }

  setHidePopup(hidePopup: boolean) {
    this._hidePopup = hidePopup;
  }

  setInteractive(interactive: boolean) {
    this._interactive = interactive;
  }

  setDisableHoverEffect(disableHoverEffect: boolean) {
    this._disableHoverEffect = disableHoverEffect;
  }

  setPopupClick(onPopupClick: FootNotePopupClickHandler) {
    this._onPopupClick = onPopupClick;
  }
}

export const FootNoteNodeConfigIdentifier =
  createIdentifier<FootNoteNodeConfigProvider>('AffineFootNoteNodeConfig');

export function FootNoteNodeConfigExtension(
  config: FootNoteNodeConfig
): ExtensionType {
  return {
    setup: di => {
      di.addImpl(
        FootNoteNodeConfigIdentifier,
        provider =>
          new FootNoteNodeConfigProvider(config, provider.get(StdIdentifier))
      );
    },
  };
}
