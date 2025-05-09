import { css } from 'lit';

export const embedNoteContentStyles = css`
  .affine-embed-doc-content-note-blocks affine-divider,
  .affine-embed-doc-content-note-blocks affine-divider > * {
    margin-top: 0px !important;
    margin-bottom: 0px !important;
    padding-top: 8px;
    padding-bottom: 8px;
  }
  .affine-embed-doc-content-note-blocks affine-paragraph,
  .affine-embed-doc-content-note-blocks affine-list {
    margin-top: 4px !important;
    margin-bottom: 4px !important;
    padding: 0 2px;
  }
  .affine-embed-doc-content-note-blocks affine-paragraph *,
  .affine-embed-doc-content-note-blocks affine-list * {
    margin-top: 0px !important;
    margin-bottom: 0px !important;
    padding-top: 0;
    padding-bottom: 0;
    line-height: 20px;
    font-size: var(--affine-font-xs);
    font-weight: 400;
  }
  .affine-embed-doc-content-note-blocks affine-list .affine-list-block__prefix {
    height: 20px;
  }
  .affine-embed-doc-content-note-blocks affine-paragraph .quote {
    padding-left: 15px;
    padding-top: 8px;
    padding-bottom: 8px;
  }
  .affine-embed-doc-content-note-blocks affine-paragraph:has(.h1),
  .affine-embed-doc-content-note-blocks affine-paragraph:has(.h2),
  .affine-embed-doc-content-note-blocks affine-paragraph:has(.h3),
  .affine-embed-doc-content-note-blocks affine-paragraph:has(.h4),
  .affine-embed-doc-content-note-blocks affine-paragraph:has(.h5),
  .affine-embed-doc-content-note-blocks affine-paragraph:has(.h6) {
    margin-top: 6px !important;
    margin-bottom: 4px !important;
    padding: 0 2px;
  }
  .affine-embed-doc-content-note-blocks affine-paragraph:has(.h1) *,
  .affine-embed-doc-content-note-blocks affine-paragraph:has(.h2) *,
  .affine-embed-doc-content-note-blocks affine-paragraph:has(.h3) *,
  .affine-embed-doc-content-note-blocks affine-paragraph:has(.h4) *,
  .affine-embed-doc-content-note-blocks affine-paragraph:has(.h5) *,
  .affine-embed-doc-content-note-blocks affine-paragraph:has(.h6) * {
    margin-top: 0px !important;
    margin-bottom: 0px !important;
    padding-top: 0;
    padding-bottom: 0;
    line-height: 20px;
    font-size: var(--affine-font-xs);
    font-weight: 600;
  }

  .affine-embed-linked-doc-block.horizontal {
    affine-paragraph,
    affine-list {
      margin-top: 0 !important;
      margin-bottom: 0 !important;
      max-height: 40px;
      overflow: hidden;
      display: flex;
    }
    affine-paragraph .quote {
      padding-top: 4px;
      padding-bottom: 4px;
      height: 28px;
    }
    affine-paragraph .quote::after {
      height: 20px;
      margin-top: 4px !important;
      margin-bottom: 4px !important;
    }
  }
`;
