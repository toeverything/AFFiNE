import {
  CodeBlockSchemaExtension,
  DatabaseBlockSchemaExtension,
  ImageBlockSchemaExtension,
  ListBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
} from '@blocksuite/affine-model';
import { Container } from '@blocksuite/global/di';
import { TextSelection } from '@blocksuite/std';
import {
  type Block,
  type ExtensionType,
  type Store,
  Text,
} from '@blocksuite/store';
import { TestWorkspace } from '@blocksuite/store/test';

import { createTestHost } from './create-test-host';

const DEFAULT_EXTENSIONS = [
  RootBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  ListBlockSchemaExtension,
  ImageBlockSchemaExtension,
  DatabaseBlockSchemaExtension,
  CodeBlockSchemaExtension,
];

// Mapping from tag names to flavours
const tagToFlavour: Record<string, string> = {
  'affine-page': 'affine:page',
  'affine-note': 'affine:note',
  'affine-paragraph': 'affine:paragraph',
  'affine-list': 'affine:list',
  'affine-image': 'affine:image',
  'affine-database': 'affine:database',
  'affine-code': 'affine:code',
};

interface SelectionInfo {
  anchorBlockId?: string;
  anchorOffset?: number;
  focusBlockId?: string;
  focusOffset?: number;
  cursorBlockId?: string;
  cursorOffset?: number;
}

export function createAffineTemplate(
  extensions: ExtensionType[] = DEFAULT_EXTENSIONS
) {
  /**
   * Parse template strings and build BlockSuite document structure,
   * then create a host object with the document
   *
   * Example:
   * ```
   * const host = affine`
   *   <affine-page id="page">
   *     <affine-note id="note">
   *       <affine-paragraph id="paragraph-1">Hello, world<anchor /></affine-paragraph>
   *       <affine-paragraph id="paragraph-2">Hello, world<focus /></affine-paragraph>
   *     </affine-note>
   *   </affine-page>
   * `;
   * ```
   */
  function affine(strings: TemplateStringsArray, ...values: any[]) {
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
    const container = new Container();
    extensions.forEach(extension => {
      extension.setup(container);
    });
    const store = doc.getStore({ extensions, provider: container.provider() });
    let selectionInfo: SelectionInfo = {};

    // Use DOMParser to parse HTML string
    doc.load(() => {
      const parser = new DOMParser();
      const dom = parser.parseFromString(htmlString.trim(), 'text/html');
      const root = dom.body.firstElementChild;

      if (!root) {
        throw new Error('Template must contain a root element');
      }

      buildDocFromElement(store, root, null, selectionInfo);
    });

    // Create host object
    const host = createTestHost(store);

    // Set selection if needed
    if (selectionInfo.anchorBlockId && selectionInfo.focusBlockId) {
      const anchorBlock = store.getBlock(selectionInfo.anchorBlockId);
      const anchorTextLength = anchorBlock?.model?.text?.length ?? 0;
      const focusOffset = selectionInfo.focusOffset ?? 0;
      const anchorOffset = selectionInfo.anchorOffset ?? 0;

      if (selectionInfo.anchorBlockId === selectionInfo.focusBlockId) {
        const selection = host.selection.create(TextSelection, {
          from: {
            blockId: selectionInfo.anchorBlockId,
            index: anchorOffset,
            length: focusOffset,
          },
          to: null,
        });
        host.selection.setGroup('note', [selection]);
      } else {
        const selection = host.selection.create(TextSelection, {
          from: {
            blockId: selectionInfo.anchorBlockId,
            index: anchorOffset,
            length: anchorTextLength - anchorOffset,
          },
          to: {
            blockId: selectionInfo.focusBlockId,
            index: 0,
            length: focusOffset,
          },
        });
        host.selection.setGroup('note', [selection]);
      }
    } else if (selectionInfo.cursorBlockId) {
      const selection = host.selection.create(TextSelection, {
        from: {
          blockId: selectionInfo.cursorBlockId,
          index: selectionInfo.cursorOffset ?? 0,
          length: 0,
        },
        to: null,
      });
      host.selection.setGroup('note', [selection]);
    }

    return host;
  }

  /**
   * Create a single block from template string
   *
   * Example:
   * ```
   * const block = block`<affine-note />`
   * ```
   */
  function block(
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
    const selectionInfo: SelectionInfo = {};

    // Use DOMParser to parse HTML string
    doc.load(() => {
      const parser = new DOMParser();
      const dom = parser.parseFromString(htmlString.trim(), 'text/html');
      const root = dom.body.firstElementChild;

      if (!root) {
        throw new Error('Template must contain a root element');
      }

      // Create a root block if needed
      const flavour = tagToFlavour[root.tagName.toLowerCase()];
      if (
        flavour === 'affine:paragraph' ||
        flavour === 'affine:list' ||
        flavour === 'affine:code'
      ) {
        const pageId = store.addBlock('affine:page', {});
        const noteId = store.addBlock('affine:note', {}, pageId);
        blockId = buildDocFromElement(store, root, noteId, selectionInfo);
      } else {
        blockId = buildDocFromElement(store, root, null, selectionInfo);
      }
    });

    // Return the created block
    return blockId ? (store.getBlock(blockId) ?? null) : null;
  }

  return {
    affine,
    block,
  };
}

export const { affine, block } = createAffineTemplate();

/**
 * Recursively build document structure
 * @param doc
 * @param element
 * @param parentId
 * @param selectionInfo
 * @returns
 */
function buildDocFromElement(
  doc: Store,
  element: Element,
  parentId: string | null,
  selectionInfo: SelectionInfo
): string {
  const tagName = element.tagName.toLowerCase();

  // Handle selection tags
  if (tagName === 'anchor') {
    if (!parentId) return '';
    const parentBlock = doc.getBlock(parentId);
    if (parentBlock) {
      const textBeforeCursor = element.previousSibling?.textContent ?? '';
      selectionInfo.anchorBlockId = parentId;
      selectionInfo.anchorOffset = textBeforeCursor.length;
    }
    return parentId;
  } else if (tagName === 'focus') {
    if (!parentId) return '';
    const parentBlock = doc.getBlock(parentId);
    if (parentBlock) {
      const textBeforeCursor = element.previousSibling?.textContent ?? '';
      selectionInfo.focusBlockId = parentId;
      selectionInfo.focusOffset = textBeforeCursor.length;
    }
    return parentId;
  } else if (tagName === 'cursor') {
    if (!parentId) return '';
    const parentBlock = doc.getBlock(parentId);
    if (parentBlock) {
      const textBeforeCursor = element.previousSibling?.textContent ?? '';
      selectionInfo.cursorBlockId = parentId;
      selectionInfo.cursorOffset = textBeforeCursor.length;
    }
    return parentId;
  }

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

  // Process all child nodes, including text nodes
  Array.from(element.children).forEach(child => {
    if (child.nodeType === Node.ELEMENT_NODE) {
      // Handle element nodes
      buildDocFromElement(doc, child as Element, blockId, selectionInfo);
    } else if (child.nodeType === Node.TEXT_NODE) {
      // Handle text nodes
      console.log('buildDocFromElement text node:', child.textContent);
    }
  });

  return blockId;
}
