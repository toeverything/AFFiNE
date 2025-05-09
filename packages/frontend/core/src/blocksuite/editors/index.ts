import { createReactComponentFromLit } from '@affine/component';
import { DocTitle } from '@blocksuite/affine/fragments/doc-title';
import React from 'react';

import { EdgelessEditor } from './edgeless-editor';
import { PageEditor } from './page-editor';

export * from './edgeless-editor';
export * from './page-editor';

export const LitDocEditor = createReactComponentFromLit({
  react: React,
  elementClass: PageEditor,
});

export const LitDocTitle = createReactComponentFromLit({
  react: React,
  elementClass: DocTitle,
});

export const LitEdgelessEditor = createReactComponentFromLit({
  react: React,
  elementClass: EdgelessEditor,
});

export function editorEffects() {
  customElements.define('page-editor', PageEditor);
  customElements.define('edgeless-editor', EdgelessEditor);
}
