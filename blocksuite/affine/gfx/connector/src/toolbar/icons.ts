import { html } from 'lit';

/**
 * Rounded connector icon - shows an orthogonal connector with rounded corners
 */
export const ConnectorRIcon = ({
  width = '1em',
  height = '1em',
  style = '',
} = {}) => html`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width=${width}
    height=${height}
    fill="none"
    style=${'user-select:none;flex-shrink:0;' + style}
  >
    <path
      fill="currentColor"
      d="M17.03 2.02a.75.75 0 1 0-1.06 1.06l3.67 3.67H14a2.75 2.75 0 0 0-2.75 2.75v5.75a4 4 0 0 1-4 4H3a.75.75 0 0 0 0 1.5h4.25a5.5 5.5 0 0 0 5.5-5.5V9.5c0-.69.56-1.25 1.25-1.25h5.64l-3.67 3.67a.75.75 0 1 0 1.06 1.06l4.88-4.879a.85.85 0 0 0 0-1.202z"
    />
  </svg>
`;
