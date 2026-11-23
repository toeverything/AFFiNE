import { EmbedCardCreateModal } from './embed-card-create-modal';
import { EmbedCardEditModal } from './embed-card-edit-modal';

export * from './embed-card-create-modal';
export * from './embed-card-edit-modal';

export function effects() {
  customElements.define('embed-card-create-modal', EmbedCardCreateModal);
  customElements.define('embed-card-edit-modal', EmbedCardEditModal);
}
