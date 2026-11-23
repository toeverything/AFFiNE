import { SizeDropdownMenu } from './dropdown-menu';

export * from './dropdown-menu';

export function effects() {
  customElements.define('affine-size-dropdown-menu', SizeDropdownMenu);
}
