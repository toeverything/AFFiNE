import { HelloBlockComponent } from './hello-block';

export class HelloPreviewBlockComponent extends HelloBlockComponent {
  override renderBlock() {
    return this.renderContent(true);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wb-hello-preview': HelloPreviewBlockComponent;
  }
}
