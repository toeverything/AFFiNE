import * as Y from 'yjs';

const TREE_DIFF_LIMIT = 12;

type ComparableTree =
  | null
  | boolean
  | number
  | string
  | ComparableTree[]
  | { [key: string]: ComparableTree };

export type CodecCompareResult = {
  matches: boolean;
  treeDiff?: string[];
};

function loadAndReencodeWithYjs(binary: Buffer): Buffer {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, binary);

  return Buffer.from(Y.encodeStateAsUpdate(doc));
}

function sortObjectEntries(
  object: Record<string, unknown>
): Array<[string, ComparableTree]> {
  return Object.entries(object)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, serializeYValue(value)]);
}

function isPlainObject(value: object): value is Record<string, unknown> {
  return Object.getPrototypeOf(value) === Object.prototype;
}

function getConstructorName(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  return value.constructor?.name;
}

function serializeItemContent(content: {
  arr?: unknown[];
  embed?: unknown;
  str?: string;
  type?: unknown;
}): ComparableTree {
  if (content.type !== undefined) {
    return serializeYValue(content.type);
  }

  if (Array.isArray(content.arr)) {
    if (content.arr.length === 1) {
      return serializeYValue(content.arr[0]);
    }

    return content.arr.map(item => serializeYValue(item));
  }

  if (typeof content.str === 'string') {
    return content.str;
  }

  if (content.embed !== undefined) {
    return serializeYValue(content.embed);
  }

  return null;
}

function serializeMapItems(items: Map<string, { content: unknown }>) {
  return Object.fromEntries(
    Array.from(items.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [
        key,
        serializeItemContent(
          item.content as Parameters<typeof serializeItemContent>[0]
        ),
      ])
  );
}

function serializeSequenceItems(
  start: {
    content: unknown;
    deleted?: boolean;
    right: unknown;
  } | null
): ComparableTree[] {
  const result: ComparableTree[] = [];
  let current = start;

  while (current) {
    if (!current.deleted) {
      const content = current.content as Parameters<
        typeof serializeItemContent
      >[0];
      const serialized = serializeItemContent(content);

      if (Array.isArray(serialized) && Array.isArray(content.arr)) {
        result.push(...serialized);
      } else {
        result.push(serialized);
      }
    }
    current = current.right as typeof current;
  }

  return result;
}

function serializeAbstractType(value: {
  _map?: Map<string, { content: unknown }>;
  _start?: {
    content: unknown;
    deleted?: boolean;
    right: unknown;
  } | null;
  nodeName?: string;
}) {
  const map = value._map ? serializeMapItems(value._map) : {};
  const children = serializeSequenceItems(value._start ?? null);
  const constructorName = getConstructorName(value);

  if (value.nodeName || constructorName === 'YXmlElement') {
    return {
      nodeName: value.nodeName ?? 'xml',
      ...(Object.keys(map).length ? { attrs: map } : null),
      ...(children.length ? { children } : null),
    };
  }

  if (Object.keys(map).length && !children.length) {
    return map;
  }

  if (!Object.keys(map).length) {
    if (constructorName === 'YArray') {
      return children;
    }

    if (constructorName === 'YText' || constructorName === 'YXmlText') {
      return children.join('');
    }

    if (children.every(child => typeof child === 'string')) {
      return children.join('');
    }

    if (children.length === 1) {
      return children[0] ?? null;
    }

    return children;
  }

  return {
    ...map,
    children,
  };
}

function serializeYValue(value: unknown): ComparableTree {
  if (value == null) {
    return null;
  }

  if (
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return value;
  }

  if (value instanceof Uint8Array) {
    return `Uint8Array(${value.length})`;
  }

  const constructorName = getConstructorName(value);

  // Ignore map field storage order. Compare sorted keys only.
  if (
    value instanceof Y.Map ||
    constructorName === 'YMap' ||
    value instanceof Y.Array ||
    constructorName === 'YArray' ||
    value instanceof Y.Text ||
    constructorName === 'YText' ||
    value instanceof Y.XmlText ||
    constructorName === 'YXmlText' ||
    value instanceof Y.XmlElement ||
    constructorName === 'YXmlElement' ||
    value instanceof Y.XmlFragment ||
    constructorName === 'YXmlFragment' ||
    (typeof value === 'object' &&
      value !== null &&
      ('_map' in value || '_start' in value))
  ) {
    return serializeAbstractType(
      value as Parameters<typeof serializeAbstractType>[0]
    );
  }

  if (Array.isArray(value)) {
    return value.map(item => serializeYValue(item));
  }

  if (typeof value === 'object' && isPlainObject(value)) {
    return Object.fromEntries(sortObjectEntries(value));
  }

  if (typeof value === 'object') {
    return Object.prototype.toString.call(value);
  }

  return String(value);
}

function serializeYDoc(binary: Buffer): ComparableTree {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, binary);

  // Ignore top-level share/map ordering too.
  return Object.fromEntries(
    Array.from(doc.share.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, serializeYValue(value)])
  );
}

export function serializeCodecBinaryForDebug(binary: Buffer): ComparableTree {
  return serializeYDoc(binary);
}

function formatTreeValue(value: ComparableTree): string {
  const text = JSON.stringify(value);
  if (!text) return String(value);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function diffTrees(
  yjsTree: ComparableTree,
  yoctoTree: ComparableTree,
  path = '$',
  diffs: string[] = []
): string[] {
  if (diffs.length >= TREE_DIFF_LIMIT) {
    return diffs;
  }

  if (Object.is(yjsTree, yoctoTree)) {
    return diffs;
  }

  if (Array.isArray(yjsTree) && Array.isArray(yoctoTree)) {
    const maxLength = Math.max(yjsTree.length, yoctoTree.length);
    for (let index = 0; index < maxLength; index += 1) {
      if (diffs.length >= TREE_DIFF_LIMIT) {
        break;
      }
      const yjsValue = yjsTree[index];
      const yoctoValue = yoctoTree[index];
      if (index >= yjsTree.length) {
        diffs.push(
          `${path}[${index}] only exists in yocto: ${formatTreeValue(yoctoValue ?? null)}`
        );
        continue;
      }
      if (index >= yoctoTree.length) {
        diffs.push(
          `${path}[${index}] only exists in yjs: ${formatTreeValue(yjsValue ?? null)}`
        );
        continue;
      }
      diffTrees(
        yjsValue ?? null,
        yoctoValue ?? null,
        `${path}[${index}]`,
        diffs
      );
    }

    return diffs;
  }

  if (
    yjsTree &&
    yoctoTree &&
    typeof yjsTree === 'object' &&
    typeof yoctoTree === 'object' &&
    !Array.isArray(yjsTree) &&
    !Array.isArray(yoctoTree)
  ) {
    const keys = Array.from(
      new Set([...Object.keys(yjsTree), ...Object.keys(yoctoTree)])
    ).sort((left, right) => left.localeCompare(right));

    for (const key of keys) {
      if (diffs.length >= TREE_DIFF_LIMIT) {
        break;
      }
      const yjsValue = yjsTree[key];
      const yoctoValue = yoctoTree[key];
      if (!(key in yjsTree)) {
        diffs.push(
          `${path}.${key} only exists in yocto: ${formatTreeValue(yoctoValue ?? null)}`
        );
        continue;
      }
      if (!(key in yoctoTree)) {
        diffs.push(
          `${path}.${key} only exists in yjs: ${formatTreeValue(yjsValue ?? null)}`
        );
        continue;
      }
      diffTrees(yjsValue ?? null, yoctoValue ?? null, `${path}.${key}`, diffs);
    }

    return diffs;
  }

  diffs.push(
    `${path}: yjs=${formatTreeValue(yjsTree)} yocto=${formatTreeValue(yoctoTree)}`
  );

  return diffs;
}

export function compareCodecResult(
  yBinary: Buffer,
  yoctoBinary: Buffer
): CodecCompareResult {
  if (yBinary.equals(yoctoBinary)) {
    return { matches: true };
  }

  const normalizedYBinary = loadAndReencodeWithYjs(yBinary);
  const normalizedYoctoBinary = loadAndReencodeWithYjs(yoctoBinary);

  if (normalizedYBinary.equals(normalizedYoctoBinary)) {
    return { matches: true };
  }

  const treeDiff = diffTrees(
    serializeYDoc(normalizedYBinary),
    serializeYDoc(normalizedYoctoBinary)
  );

  if (treeDiff.length === 0) {
    return { matches: true };
  }

  return {
    matches: false,
    treeDiff,
  };
}
