import { html } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

export const EmbedGap = html`<span
  data-v-embed-gap="true"
  style=${styleMap({
    userSelect: 'text',
    padding: '0 0.5px',
    outline: 'none',
  })}
  ><v-text></v-text
></span>`;
