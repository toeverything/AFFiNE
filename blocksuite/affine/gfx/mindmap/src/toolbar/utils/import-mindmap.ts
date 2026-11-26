import { openSingleFileWith } from '@blocksuite/affine-shared/utils';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import type { Bound } from '@blocksuite/global/gfx';
import { strFromU8, unzipSync } from 'fflate';
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
  } else if (file.name.endsWith('.xmind')) {
    result = await parseXmindFile(file);
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

type RawXmindTopic = {
  title?: string;
  children?: {
    attached?: RawXmindTopic[];
  };
};

type RawXmindSheet = {
  rootTopic?: RawXmindTopic;
};

export async function parseXmindFile(file: File): Promise<MindMapNode> {
  try {
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: entry =>
        entry.name === 'content.json' || entry.name === 'content.xml',
    });

    // XMind 2020 and later store the map in content.json. XMind 8 and
    // earlier only have content.xml.
    const result = entries['content.json']
      ? parseXmindJson(strFromU8(entries['content.json']))
      : entries['content.xml']
        ? parseXmindXml(strFromU8(entries['content.xml']))
        : null;

    if (!result) {
      throw new BlockSuiteError(
        ErrorCode.ParsingError,
        'Failed to parse XMind file'
      );
    }

    return result;
  } catch (e) {
    console.error(e);
    throw new BlockSuiteError(
      ErrorCode.ParsingError,
      'Failed to parse XMind file'
    );
  }
}

function parseXmindJson(content: string): MindMapNode | null {
  const sheets = JSON.parse(content) as RawXmindSheet[];
  const rootTopic = sheets[0]?.rootTopic;

  const traverse = (topic: RawXmindTopic): MindMapNode => ({
    text: topic.title ?? '',
    children: topic.children?.attached?.map(traverse) ?? [],
  });

  return rootTopic ? traverse(rootTopic) : null;
}

function parseXmindXml(content: string): MindMapNode | null {
  const doc = new DOMParser().parseFromString(content, 'application/xml');
  const sheet = childElements(doc.documentElement, 'sheet')[0];
  const rootTopic = sheet ? childElements(sheet, 'topic')[0] : undefined;

  const traverse = (topic: Element): MindMapNode => ({
    text: childElements(topic, 'title')[0]?.textContent ?? '',
    children: childElements(topic, 'children')
      .flatMap(children => childElements(children, 'topics'))
      .filter(topics => topics.getAttribute('type') === 'attached')
      .flatMap(topics => childElements(topics, 'topic'))
      .map(traverse),
  });

  return rootTopic ? traverse(rootTopic) : null;
}

function childElements(parent: Element, localName: string) {
  return Array.from(parent.children).filter(
    child => child.localName === localName
  );
}
