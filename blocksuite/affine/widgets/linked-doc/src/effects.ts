import { AFFINE_LINKED_DOC_WIDGET } from './config.js';
import { ImportDoc } from './import-doc/import-doc.js';
import { Loader } from './import-doc/loader.js';
import { AffineLinkedDocWidget } from './index.js';
import { LinkedDocPopover } from './linked-doc-popover.js';
import { AffineMobileLinkedDocMenu } from './mobile-linked-doc-menu.js';

export function effects() {
  customElements.define('affine-linked-doc-popover', LinkedDocPopover);
  customElements.define(AFFINE_LINKED_DOC_WIDGET, AffineLinkedDocWidget);
  customElements.define('import-doc', ImportDoc);
  customElements.define(
    'affine-mobile-linked-doc-menu',
    AffineMobileLinkedDocMenu
  );
  customElements.define('loader-element', Loader);
}
