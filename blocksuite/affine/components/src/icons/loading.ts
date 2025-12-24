import { cssVarV2 } from '@toeverything/theme/v2';
import { html } from 'lit';

export const LoadingIcon = ({
  size = '1em',
  progress = 0.2,
  ringColor = cssVarV2('loading/background'),
  strokeColor = cssVarV2('loading/foreground'),
}: {
  size?: string;
  progress?: number;
  ringColor?: string;
  strokeColor?: string;
} = {}) =>
  html`<svg
    width="${size}"
    height="${size}"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    style="fill: none;"
  >
    <style>
      .spinner {
        transform-origin: center;
        animation: spinner_animate 0.75s infinite linear;
      }
      @keyframes spinner_animate {
        100% {
          transform: rotate(360deg);
        }
      }
    </style>
    <circle cx="12" cy="12" r="8" stroke="${ringColor}" stroke-width="4" />
    <circle
      class="spinner"
      cx="12"
      cy="12"
      r="8"
      stroke="${strokeColor}"
      stroke-width="4"
      stroke-linecap="round"
      stroke-dasharray="${2 * Math.PI * 8 * progress} ${2 *
      Math.PI *
      8 *
      (1 - progress)}"
    />
  </svg>`;
