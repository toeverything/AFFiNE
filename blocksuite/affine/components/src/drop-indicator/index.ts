import { DropIndicator } from './drop-indicator';
export {
  type DropProps,
  FileDropConfigExtension,
  FileDropExtension,
  type FileDropOptions,
} from './file-drop-manager';

export { DropIndicator };

export function effects() {
  customElements.define('affine-drop-indicator', DropIndicator);
}
