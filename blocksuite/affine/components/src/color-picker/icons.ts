import { isTransparent } from '@blocksuite/affine-model';
import { cssVarV2 } from '@blocksuite/affine-shared/theme';
import { html, svg, type TemplateResult } from 'lit';

export function TransparentIcon(hollowCircle = false) {
  const CircleIcon: TemplateResult | null = hollowCircle
    ? svg`<circle cx="10" cy="10" r="8" fill="white" />`
    : null;

  return html`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
    >
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M-1.17405 5.17857C-1.2241 5.5285 -1.25 5.88623 -1.25 6.25V8.39286H1.96429V11.6071H-1.25V13.75C-1.25 14.1138 -1.2241 14.4715 -1.17405 14.8214H1.96429V18.0357H0.0943102C0.602244 18.7639 1.23609 19.3978 1.96429 19.9057V18.0357L5.17857 18.0357V21.174C5.5285 21.2241 5.88623 21.25 6.25 21.25H8.39286V18.0357H11.6071V21.25H13.75C14.1138 21.25 14.4715 21.2241 14.8214 21.174V18.0357H18.0357L18.0357 19.9057C18.7639 19.3978 19.3978 18.7639 19.9057 18.0357L18.0357 18.0357V14.8214H21.174C21.2241 14.4715 21.25 14.1138 21.25 13.75V11.6071H18.0357V8.39286H21.25V6.25C21.25 5.88623 21.2241 5.5285 21.174 5.17857H18.0357V1.96429H19.9057C19.3978 1.23609 18.7639 0.602244 18.0357 0.09431L18.0357 1.96429H14.8214V-1.17405C14.4715 -1.2241 14.1138 -1.25 13.75 -1.25H11.6071V1.96429H8.39286V-1.25H6.25C5.88623 -1.25 5.5285 -1.2241 5.17857 -1.17405V1.96429H1.96429V0.0943099C1.23609 0.602244 0.602244 1.23609 0.0943099 1.96429H1.96429V5.17857H-1.17405ZM5.17857 5.17857V1.96429H8.39286V5.17857H5.17857ZM5.17857 8.39286H1.96429V5.17857H5.17857V8.39286ZM8.39286 8.39286V5.17857H11.6071V8.39286H8.39286ZM8.39286 11.6071V8.39286H5.17857V11.6071H1.96429V14.8214H5.17857V18.0357H8.39286V14.8214H11.6071V18.0357H14.8214V14.8214H18.0357V11.6071H14.8214V8.39286H18.0357V5.17857H14.8214V1.96429H11.6071V5.17857H14.8214V8.39286H11.6071V11.6071H8.39286ZM8.39286 11.6071V14.8214H5.17857V11.6071H8.39286ZM11.6071 11.6071H14.8214V14.8214H11.6071V11.6071Z"
        fill="${cssVarV2('icon/tertiary')}"
      />
      ${CircleIcon}
    </svg>
  `;
}

export function CircleIcon(color: string) {
  return html`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="${color}"
    >
      <circle cx="10" cy="10" r="10" />
    </svg>
  `;
}

export function HollowCircleIcon(color: string) {
  return html`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="${color}"
    >
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M10 17C13.866 17 17 13.866 17 10C17 6.13401 13.866 3 10 3C6.13401 3 3 6.13401 3 10C3 13.866 6.13401 17 10 17ZM10 20C15.5228 20 20 15.5228 20 10C20 4.47715 15.5228 0 10 0C4.47715 0 0 4.47715 0 10C0 15.5228 4.47715 20 10 20Z"
      />
    </svg>
  `;
}

export function AdditionIcon(color: string, hollowCircle: boolean) {
  if (isTransparent(color)) {
    return TransparentIcon(hollowCircle);
  }

  if (hollowCircle) {
    return HollowCircleIcon(color);
  }

  return CircleIcon(color);
}
