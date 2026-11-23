import { openSingleFileWith } from '@blocksuite/affine-shared/utils';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import type { Bound } from '@blocksuite/global/gfx';
import c from 'simple-xml-to-json';

type MindMapNode = {
  children: MindMapNode[];
  text: string;
  xywh?: string;
  title?: string;
  layoutType?: 'left' | 'right';
};

export async function importMindmap(bound: Bound): Promise<MindMapNode> {
  const file = await openSingleFileWith('MindMap');

  if (!file) {
    throw new BlockSuiteError(ErrorCode.UserAbortError, 'Aborted by user');
  }

  let result;

  if (file.name.endsWith('.mm')) {
    result = await parseMmFile(file);
  } else if (file.name.endsWith('.opml') || file.name.endsWith('.xml')) {
    result = await parseOPMLFile(file);
  } else {
    throw new BlockSuiteError(ErrorCode.ParsingError, 'Unsupported file type');
  }

  if (result) {
    result.xywh = bound.serialize();
  }

  return result;
}

function readAsText(file: File) {
  return file.text();
}

type RawMmNode = {
  node?: {
    TEXT: string;
    POSITION: 'left' | 'right';
    children?: RawMmNode[];
  };
};

async function parseMmFile(file: File): Promise<MindMapNode> {
  const content = await readAsText(file);

  try {
    const parsed = c.convertXML(content);
    const map = parsed.map.children[0];

    const traverse = (node: RawMmNode): MindMapNode | null => {
      if (!node.node) {
        return null;
      }

      return node.node.POSITION
        ? {
            layoutType: node.node.POSITION,
            text: node.node.TEXT ?? 'MINDMAP',
            children:
              (node.node.children
                ?.map(traverse)
                .filter(node => node) as MindMapNode[]) ?? [],
          }
        : {
            text: node.node.TEXT ?? 'MINDMAP',
            children:
              (node.node.children
                ?.map(traverse)
                .filter(node => node) as MindMapNode[]) ?? [],
          };
    };

    const result = traverse(map);

    if (!result) {
      throw new BlockSuiteError(
        ErrorCode.ParsingError,
        'Failed to parse mm file'
      );
    }

    return result;
  } catch (e) {
    console.error(e);
    throw new BlockSuiteError(
      ErrorCode.ParsingError,
      'Failed to parse mm file'
    );
  }
}

type RawOPMLOutline = {
  outline: {
    text: string;
    children: RawOPMLOutline[];
  };
};

async function parseOPMLFile(file: File): Promise<MindMapNode> {
  const content = await readAsText(file);

  try {
    const parsed = c.convertXML(content);
    const outline = parsed.opml?.children[1].body?.children?.[0];

    const traverse = (node: RawOPMLOutline): MindMapNode | null => {
      if (!node.outline?.text && !node.outline?.children) {
        return null;
      }

      return {
        text: node.outline?.text ?? 'MINDMAP',
        children: node.outline.children
          ? (node.outline.children.map(traverse) as MindMapNode[])
          : [],
      };
    };

    const result = traverse(outline);

    if (!result) {
      throw new BlockSuiteError(
        ErrorCode.ParsingError,
        'Failed to parse OPML file'
      );
    }

    return result;
  } catch (e) {
    console.error(e);
    throw new BlockSuiteError(
      ErrorCode.ParsingError,
      'Failed to parse OPML file'
    );
  }
}
