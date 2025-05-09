import { ViewDropdownMenu } from './dropdown-menu';

export * from './dropdown-menu';

export function effects() {
  customElements.define('affine-view-dropdown-menu', ViewDropdownMenu);
}
