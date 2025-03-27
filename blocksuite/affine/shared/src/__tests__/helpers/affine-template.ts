import {
  DatabaseBlockSchemaExtension,
  ImageBlockSchemaExtension,
  ListBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
} from '@blocksuite/affine-model';
import { type Block, type Store } from '@blocksuite/store';
import { Text } from '@blocksuite/store';
import { TestWorkspace } from '@blocksuite/store/test';

import { createTestHost } from './create-test-host';

// Extensions array
const extensions = [
  RootBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  ListBlockSchemaExtension,
  ImageBlockSchemaExtension,
  DatabaseBlockSchemaExtension,
];

// Mapping from tag names to flavours
const tagToFlavour: Record<string, string> = {
  'affine-page': 'affine:page',
  'affine-note': 'affine:note',
  'affine-paragraph': 'affine:paragraph',
  'affine-list': 'affine:list',
  'affine-image': 'affine:image',
  'affine-database': 'affine:database',
};

/**
 * Parse template strings and build BlockSuite document structure,
 * then create a host object with the document
 *
 * Example:
 * ```
 * const host = affine`
 *   <affine-page id="page">
 *     <affine-note id="note">
 *       <affine-paragraph id="paragraph-1">Hello, world</affine-paragraph>
 *     </affine-note>
 *   </affine-page>
 * `;
 * ```
 */
export function affine(strings: TemplateStringsArray, ...values: any[]) {
  // Merge template strings and values
  let htmlString = '';
  strings.forEach((str, i) => {
    htmlString += str;
    if (i < values.length) {
      htmlString += values[i];
    }
  });

  // Create a new doc
  const workspace = new TestWorkspace({});
  workspace.meta.initialize();
  const doc = workspace.createDoc('test-doc');
  const store = doc.getStore({ extensions });

  // Use DOMParser to parse HTML string
  doc.load(() => {
    const parser = new DOMParser();
    const dom = parser.parseFromString(htmlString.trim(), 'text/html');
    const root = dom.body.firstElementChild;

    if (!root) {
      throw new Error('Template must contain a root element');
    }

    buildDocFromElement(store, root, null);
  });

  // Create and return a host object with the document
  return createTestHost(store);
}

/**
 * Create a single block from template string
 *
 * Example:
 * ```
 * const block = block`<affine-note />`
 * ```
 */
export function block(
  strings: TemplateStringsArray,
  ...values: any[]
): Block | null {
  // Merge template strings and values
  let htmlString = '';
  strings.forEach((str, i) => {
    htmlString += str;
    if (i < values.length) {
      htmlString += values[i];
    }
  });

  // Create a temporary doc to hold the block
  const workspace = new TestWorkspace({});
  workspace.meta.initialize();
  const doc = workspace.createDoc('temp-doc');
  const store = doc.getStore({ extensions });

  let blockId: string | null = null;

  // Use DOMParser to parse HTML string
  doc.load(() => {
    const parser = new DOMParser();
    const dom = parser.parseFromString(htmlString.trim(), 'text/html');
    const root = dom.body.firstElementChild;

    if (!root) {
      throw new Error('Template must contain a root element');
    }

    blockId = buildDocFromElement(store, root, null);
  });

  // Return the created block
  return blockId ? (store.getBlock(blockId) ?? null) : null;
}

/**
 * Recursively build document structure
 * @param doc
 * @param element
 * @param parentId
 * @returns
 */
function buildDocFromElement(
  doc: Store,
  element: Element,
  parentId: string | null
): string {
  const tagName = element.tagName.toLowerCase();
  const flavour = tagToFlavour[tagName];

  if (!flavour) {
    throw new Error(`Unknown tag name: ${tagName}`);
  }

  const props: Record<string, any> = {};

  const customId = element.getAttribute('id');

  // If ID is specified, add it to props
  if (customId) {
    props.id = customId;
  }

  // Process element attributes
  Array.from(element.attributes).forEach(attr => {
    if (attr.name !== 'id') {
      // Skip id attribute, we already handled it
      props[attr.name] = attr.value;
    }
  });

  // Special handling for different block types based on their flavours
  switch (flavour) {
    case 'affine:paragraph':
    case 'affine:list':
      if (element.textContent) {
        props.text = new Text(element.textContent);
      }
      break;
  }

  // Create block
  const blockId = doc.addBlock(flavour, props, parentId);

  // Recursively process child elements
  Array.from(element.children).forEach(child => {
    buildDocFromElement(doc, child, blockId);
  });

  return blockId;
}
