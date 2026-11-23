import {
  DocModeProvider,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { css, html, LitElement, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import type { CodeBlockComponent } from '../../code-block';
import { CodeBlockPreviewIdentifier } from '../../code-preview-extension';

export class PreviewButton extends WithDisposable(SignalWatcher(LitElement)) {
  static override styles = css`
    :host {
      margin-right: auto;
    }

    .preview-toggle-container {
      display: flex;
      padding: 2px;
      align-items: flex-start;
      gap: 4px;
      border-radius: 4px;
      background: ${unsafeCSSVarV2('segment/background')};
    }

    .toggle-button {
      display: flex;
      padding: 0px 4px;
      justify-content: center;
      align-items: center;
      gap: 4px;
      border-radius: 4px;
      color: ${unsafeCSSVarV2('text/primary')};
      font-family: Inter;
      font-size: 12px;
      font-style: normal;
      font-weight: 500;
      line-height: 20px;
    }

    .toggle-button:hover {
      background: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
    }

    .toggle-button.active {
      background: ${unsafeCSSVarV2('segment/button')};
      box-shadow:
        var(--Shadow-buttonShadow-1-x, 0px) var(--Shadow-buttonShadow-1-y, 0px)
          var(--Shadow-buttonShadow-1-blur, 1px) 0px
          var(--Shadow-buttonShadow-1-color, rgba(0, 0, 0, 0.12)),
        var(--Shadow-buttonShadow-2-x, 0px) var(--Shadow-buttonShadow-2-y, 1px)
          var(--Shadow-buttonShadow-2-blur, 5px) 0px
          var(--Shadow-buttonShadow-2-color, rgba(0, 0, 0, 0.12));
    }
  `;

  private readonly _toggle = (value: boolean) => {
    this.blockComponent.setPreviewState(value);

    const std = this.blockComponent.std;
    const mode = std.getOptional(DocModeProvider)?.getEditorMode() ?? 'page';
    const telemetryService = std.getOptional(TelemetryProvider);
    if (!telemetryService) return;
    telemetryService.track('htmlBlockTogglePreview', {
      page: mode,
      segment: 'code block',
      module: 'code toolbar container',
      control: 'preview toggle button',
    });
  };

  get preview() {
    return this.blockComponent.preview$.value;
  }

  override render() {
    const lang = this.blockComponent.model.props.language$.value ?? '';
    const previewContext = this.blockComponent.std.getOptional(
      CodeBlockPreviewIdentifier(lang)
    );
    if (!previewContext) return nothing;

    return html`
      <div class="preview-toggle-container">
        <div
          class=${classMap({
            'toggle-button': true,
            active: !this.preview,
          })}
          @click=${() => this._toggle(false)}
        >
          Code
        </div>
        <div
          class=${classMap({
            'toggle-button': true,
            active: this.preview,
          })}
          @click=${() => this._toggle(true)}
        >
          Preview
        </div>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor blockComponent!: CodeBlockComponent;
}
