import { EmbedLinkedDocBlockComponent } from './embed-linked-doc-block';
import { EmbedEdgelessLinkedDocBlockComponent } from './embed-linked-doc-block/embed-edgeless-linked-doc-block';
import { EmbedSyncedDocBlockComponent } from './embed-synced-doc-block';
import { EmbedSyncedDocCard } from './embed-synced-doc-block/components/embed-synced-doc-card';
import { EmbedEdgelessSyncedDocBlockComponent } from './embed-synced-doc-block/embed-edgeless-synced-doc-block';

export function effects() {
  customElements.define('affine-embed-synced-doc-card', EmbedSyncedDocCard);

  customElements.define(
    'affine-embed-edgeless-linked-doc-block',
    EmbedEdgelessLinkedDocBlockComponent
  );
  customElements.define(
    'affine-embed-linked-doc-block',
    EmbedLinkedDocBlockComponent
  );

  customElements.define(
    'affine-embed-edgeless-synced-doc-block',
    EmbedEdgelessSyncedDocBlockComponent
  );
  customElements.define(
    'affine-embed-synced-doc-block',
    EmbedSyncedDocBlockComponent
  );
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-embed-synced-doc-card': EmbedSyncedDocCard;
    'affine-embed-synced-doc-block': EmbedSyncedDocBlockComponent;
    'affine-embed-edgeless-synced-doc-block': EmbedEdgelessSyncedDocBlockComponent;
    'affine-embed-linked-doc-block': EmbedLinkedDocBlockComponent;
    'affine-embed-edgeless-linked-doc-block': EmbedEdgelessLinkedDocBlockComponent;
  }
}
