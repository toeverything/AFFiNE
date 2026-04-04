import test from 'ava';
import * as Y from 'yjs';

import { compareCodecResult } from '../codec-compare';

type DocScalar = null | boolean | number | string | Uint8Array;

type DocTextValue = {
  $text: string;
};

type DocXmlTextValue = {
  $xmlText: string;
};

type DocXmlElementValue = {
  $xmlElement: string;
  attrs?: Record<string, boolean | number | string>;
  children?: DocValue[];
};

type DocXmlFragmentValue = {
  $xmlFragment: DocValue[];
};

type DocMapValue = {
  [key: string]: DocValue;
};

type DocArrayValue = DocValue[];

type DocValue =
  | DocScalar
  | DocTextValue
  | DocXmlTextValue
  | DocXmlElementValue
  | DocXmlFragmentValue
  | DocMapValue
  | DocArrayValue;

type DocShape = Record<string, DocValue>;

type CodecCompareCase = {
  expectedMatches: boolean;
  left: DocShape;
  right: DocShape;
  title: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array)
  );
}

function isTextValue(value: DocValue): value is DocTextValue {
  return isPlainObject(value) && '$text' in value;
}

function isXmlTextValue(value: DocValue): value is DocXmlTextValue {
  return isPlainObject(value) && '$xmlText' in value;
}

function isXmlElementValue(value: DocValue): value is DocXmlElementValue {
  return isPlainObject(value) && '$xmlElement' in value;
}

function isXmlFragmentValue(value: DocValue): value is DocXmlFragmentValue {
  return isPlainObject(value) && '$xmlFragment' in value;
}

function buildText(text: string) {
  const yText = new Y.Text();
  yText.insert(0, text);
  return yText;
}

function appendXmlNode(
  parent: Y.XmlElement | Y.XmlFragment,
  value: DocValue
): void {
  if (isXmlTextValue(value)) {
    parent.push([new Y.XmlText(value.$xmlText)]);
    return;
  }

  if (!isXmlElementValue(value)) {
    throw new Error(`Expected xml node, got ${JSON.stringify(value)}`);
  }

  const element = new Y.XmlElement(value.$xmlElement);
  parent.push([element]);
  for (const [key, attr] of Object.entries(value.attrs ?? {})) {
    element.setAttribute(key, String(attr));
  }
  for (const child of value.children ?? []) {
    appendXmlNode(element, child);
  }
}

function buildArray(values: DocArrayValue) {
  const yArray = new Y.Array<unknown>();
  yArray.push(values.map(value => buildSharedValue(value)));
  return yArray;
}

function buildMap(shape: DocMapValue) {
  const yMap = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(shape)) {
    yMap.set(key, buildSharedValue(value));
  }
  return yMap;
}

function buildSharedValue(value: DocValue): unknown {
  if (
    value == null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string' ||
    value instanceof Uint8Array
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return buildArray(value);
  }

  if (isTextValue(value)) {
    return buildText(value.$text);
  }

  if (
    isXmlFragmentValue(value) ||
    isXmlElementValue(value) ||
    isXmlTextValue(value)
  ) {
    throw new Error('XML values are only supported at root xmlFragment fields');
  }

  return buildMap(value);
}

function applyRootValue(doc: Y.Doc, key: string, value: DocValue) {
  if (isTextValue(value)) {
    doc.getText(key).insert(0, value.$text);
    return;
  }

  if (isXmlFragmentValue(value)) {
    const fragment = doc.getXmlFragment(key);
    for (const child of value.$xmlFragment) {
      appendXmlNode(fragment, child);
    }
    return;
  }

  if (Array.isArray(value)) {
    doc.getArray(key).push(value.map(item => buildSharedValue(item)));
    return;
  }

  if (isPlainObject(value)) {
    const yMap = doc.getMap(key);
    for (const [childKey, childValue] of Object.entries(value)) {
      yMap.set(childKey, buildSharedValue(childValue as DocValue));
    }
    return;
  }

  throw new Error(
    `Unsupported root value for "${key}": ${JSON.stringify(value)}`
  );
}

function encodeDocFromShape(shape: DocShape): Buffer {
  const doc = new Y.Doc();
  for (const [key, value] of Object.entries(shape)) {
    applyRootValue(doc, key, value);
  }
  return Buffer.from(Y.encodeStateAsUpdate(doc));
}

const baseDoc: DocShape = {
  blocks: [
    {
      id: 'block-1',
      meta: { checked: false, weight: 10 },
      type: 'todo',
    },
  ],
  content: {
    $xmlFragment: [
      {
        $xmlElement: 'paragraph',
        attrs: { kind: 'intro' },
        children: [{ $xmlText: 'hello world' }],
      },
    ],
  },
  meta: {
    info: {
      flags: { archived: false, priority: 3 },
      owner: 'alice',
      tags: ['alpha', 'beta'],
    },
    version: 1,
  },
  titles: {
    main: { $text: 'Complex document' },
  },
};

const compareCases: CodecCompareCase[] = [
  {
    expectedMatches: true,
    title: 'ignores map ordering differences',
    left: baseDoc,
    right: {
      titles: { main: { $text: 'Complex document' } },
      content: {
        $xmlFragment: [
          {
            $xmlElement: 'paragraph',
            attrs: { kind: 'intro' },
            children: [{ $xmlText: 'hello world' }],
          },
        ],
      },
      blocks: [
        {
          type: 'todo',
          meta: { weight: 10, checked: false },
          id: 'block-1',
        },
      ],
      meta: {
        version: 1,
        info: {
          tags: ['alpha', 'beta'],
          owner: 'alice',
          flags: { priority: 3, archived: false },
        },
      },
    },
  },
  {
    expectedMatches: false,
    title: 'reports nested map text and xml changes',
    left: baseDoc,
    right: {
      ...baseDoc,
      blocks: [
        { id: 'block-1', meta: { checked: true, weight: 10 }, type: 'todo' },
      ],
      content: {
        $xmlFragment: [
          {
            $xmlElement: 'paragraph',
            attrs: { kind: 'summary' },
            children: [{ $xmlText: 'hello world' }],
          },
        ],
      },
      meta: {
        info: {
          flags: { archived: false, priority: 7 },
          owner: 'alice',
          tags: ['alpha', 'gamma'],
        },
        version: 1,
      },
      titles: { main: { $text: 'Complex document updated' } },
    },
  },
  {
    expectedMatches: false,
    title: 'reports weird mixed arrays nulls binary and nested text changes',
    left: {
      attachments: [
        {
          blob: new Uint8Array([1, 2, 3]),
          filename: 'a.bin',
          notes: { $text: 'first file' },
        },
        null,
        true,
        42,
      ],
      meta: { nested: [{ labels: ['x', 'y'] }, { labels: ['z'] }] },
      rich: {
        $xmlFragment: [
          {
            $xmlElement: 'card',
            attrs: { mood: 'calm' },
            children: [
              { $xmlElement: 'title', children: [{ $xmlText: 'hello' }] },
            ],
          },
        ],
      },
    },
    right: {
      attachments: [
        {
          blob: new Uint8Array([1, 2, 4]),
          filename: 'a.bin',
          notes: { $text: 'first file updated' },
        },
        null,
        false,
        42,
        'tail',
      ],
      meta: { nested: [{ labels: ['x', 'changed'] }, { labels: ['z'] }] },
      rich: {
        $xmlFragment: [
          {
            $xmlElement: 'card',
            attrs: { mood: 'loud' },
            children: [
              { $xmlElement: 'title', children: [{ $xmlText: 'hello there' }] },
            ],
          },
        ],
      },
    },
  },
  {
    expectedMatches: false,
    title: 'reports root text and reordered array content changes',
    left: {
      logline: { $text: 'affine' },
      queue: ['a', 'b', 'c'],
      settings: { enabled: true, retries: 2 },
    },
    right: {
      logline: { $text: 'affine cloud' },
      queue: ['a', 'c', 'b'],
      settings: { enabled: false, retries: 2 },
    },
  },
];

for (const testCase of compareCases) {
  test(`compareCodecResult ${testCase.title}`, t => {
    const leftBinary = encodeDocFromShape(testCase.left);
    const rightBinary = encodeDocFromShape(testCase.right);
    const result = compareCodecResult(leftBinary, rightBinary);

    t.is(result.matches, testCase.expectedMatches);
    t.snapshot(result, testCase.title);
  });
}
