import { CitationCard } from './citation';

export * from './citation';

export function effects() {
  customElements.define('affine-citation-card', CitationCard);
}
