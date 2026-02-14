import { html, LitElement, css } from 'lit';

export interface EdgelessExportOptions {
  area: 'canvas' | 'frame' | 'selection';
  format: 'png' | 'svg';
  background: 'transparent' | 'white';
  resolution: number; // multiplier for high-res
}

export class EdgelessExportDialog extends LitElement {
  static styles = css`
    .dialog {
      padding: 24px;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.12);
      min-width: 320px;
    }
    .actions {
      margin-top: 16px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `;

  options: EdgelessExportOptions = {
    area: 'canvas',
    format: 'png',
    background: 'transparent',
    resolution: 2,
  };

  render() {
    return html`
      <div class="dialog">
        <h3>Export as Image</h3>
        <label>Area:
          <select @change=${this._onAreaChange}>
            <option value="canvas">Entire Canvas</option>
            <option value="frame">Frame</option>
            <option value="selection">Selection</option>
          </select>
        </label>
        <label>Format:
          <select @change=${this._onFormatChange}>
            <option value="png">PNG</option>
            <option value="svg">SVG</option>
          </select>
        </label>
        <label>Background:
          <select @change=${this._onBackgroundChange}>
            <option value="transparent">Transparent</option>
            <option value="white">White</option>
          </select>
        </label>
        <label>Resolution:
          <input type="number" min="1" max="4" value="2" @input=${this._onResolutionChange} />
        </label>
        <div class="actions">
          <button @click=${this._onExport}>Export</button>
          <button @click=${this._onCancel}>Cancel</button>
        </div>
      </div>
    `;
  }

  _onAreaChange(e: Event) {
    this.options.area = (e.target as HTMLSelectElement).value as any;
  }
  _onFormatChange(e: Event) {
    this.options.format = (e.target as HTMLSelectElement).value as any;
  }
  _onBackgroundChange(e: Event) {
    this.options.background = (e.target as HTMLSelectElement).value as any;
  }
  _onResolutionChange(e: Event) {
    this.options.resolution = Number((e.target as HTMLInputElement).value);
  }
  _onExport() {
    this.dispatchEvent(new CustomEvent('export', { detail: this.options }));
  }
  _onCancel() {
    this.dispatchEvent(new CustomEvent('cancel'));
  }
}

customElements.define('edgeless-export-dialog', EdgelessExportDialog);
