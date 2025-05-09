import { ColorScheme } from '@blocksuite/affine-model';
import { html } from 'lit';

const LoadingIcon = (color: string) =>
  html`<svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    xmlns="http://www.w3.org/2000/svg"
  >
    <style xmlns="http://www.w3.org/2000/svg">
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
    <path
      d="M14.6666 8.00004C14.6666 11.6819 11.6818 14.6667 7.99992 14.6667C4.31802 14.6667 1.33325 11.6819 1.33325 8.00004C1.33325 4.31814 4.31802 1.33337 7.99992 1.33337C11.6818 1.33337 14.6666 4.31814 14.6666 8.00004ZM3.30003 8.00004C3.30003 10.5957 5.40424 12.6999 7.99992 12.6999C10.5956 12.6999 12.6998 10.5957 12.6998 8.00004C12.6998 5.40436 10.5956 3.30015 7.99992 3.30015C5.40424 3.30015 3.30003 5.40436 3.30003 8.00004Z"
      fill="${color}"
      fill-opacity="0.1"
    />
    <path
      d="M13.6833 8.00004C14.2263 8.00004 14.674 7.55745 14.5942 7.02026C14.5142 6.48183 14.3684 5.954 14.1591 5.44882C13.8241 4.63998 13.333 3.90505 12.714 3.286C12.0949 2.66694 11.36 2.17588 10.5511 1.84084C10.046 1.63159 9.51812 1.48576 8.9797 1.40576C8.44251 1.32595 7.99992 1.77363 7.99992 2.31671C7.99992 2.85979 8.44486 3.28974 8.9761 3.40253C9.25681 3.46214 9.53214 3.54746 9.79853 3.65781C10.3688 3.894 10.8869 4.2402 11.3233 4.67664C11.7598 5.11307 12.106 5.6312 12.3422 6.20143C12.4525 6.46782 12.5378 6.74315 12.5974 7.02386C12.7102 7.5551 13.1402 8.00004 13.6833 8.00004Z"
      fill="#1C9EE4"
      class="spinner"
    />
  </svg>`;

export const LightLoadingIcon = LoadingIcon('black');

export const DarkLoadingIcon = LoadingIcon('white');

export const getLoadingIconWith = (theme: ColorScheme = ColorScheme.Light) =>
  theme === ColorScheme.Light ? LightLoadingIcon : DarkLoadingIcon;
