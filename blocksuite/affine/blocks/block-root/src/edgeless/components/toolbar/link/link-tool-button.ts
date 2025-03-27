import { insertLinkByQuickSearchCommand } from '@blocksuite/affine-block-bookmark';
import { LinkIcon } from '@blocksuite/affine-components/icons';
import { TelemetryProvider } from '@blocksuite/affine-shared/services';
import { QuickToolMixin } from '@blocksuite/affine-widget-edgeless-toolbar';
import { css, html, LitElement } from 'lit';

export class EdgelessLinkToolButton extends QuickToolMixin(LitElement) {
  static override styles = css`
    .link-icon,
    .link-icon > svg {
      width: 24px;
      height: 24px;
    }
  `;

  override type = 'default' as const;

  private _onClick() {
    const [_, { insertedLinkType }] = this.edgeless.std.command.exec(
      insertLinkByQuickSearchCommand
    );
    insertedLinkType
      ?.then(type => {
        const flavour = type?.flavour;
        if (!flavour) return;

        this.edgeless.std
          .getOptional(TelemetryProvider)
          ?.track('CanvasElementAdded', {
            control: 'toolbar:general',
            page: 'whiteboard editor',
            module: 'toolbar',
            segment: 'toolbar',
            type: flavour.split(':')[1],
          });

        this.edgeless.std
          .getOptional(TelemetryProvider)
          ?.track('LinkedDocCreated', {
            control: 'links',
            page: 'whiteboard editor',
            module: 'edgeless toolbar',
            segment: 'whiteboard',
            type: flavour.split(':')[1],
            other: 'existing doc',
          });
      })
      .catch(console.error);
  }

  override render() {
    return html`<edgeless-tool-icon-button
      .iconContainerPadding="${6}"
      .tooltip="${html`<affine-tooltip-content-with-shortcut
        data-tip="${'Link'}"
        data-shortcut="${'@'}"
      ></affine-tooltip-content-with-shortcut>`}"
      .tooltipOffset=${17}
      class="edgeless-link-tool-button"
      @click=${this._onClick}
    >
      <span class="link-icon">${LinkIcon}</span>
    </edgeless-tool-icon-button>`;
  }
}
