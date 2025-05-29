import { PlaygroundChat } from './chat';
import { PlaygroundContent } from './content';
import { PlaygroundModal } from './modal';

export function effects() {
  customElements.define('playground-chat', PlaygroundChat);
  customElements.define('playground-content', PlaygroundContent);
  customElements.define('playground-modal', PlaygroundModal);
}
