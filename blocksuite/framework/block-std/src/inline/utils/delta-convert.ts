import type { BaseTextAttributes, DeltaInsert } from '@blocksuite/store';

export function transformDelta<TextAttributes extends BaseTextAttributes>(
  delta: DeltaInsert<TextAttributes>
): (DeltaInsert<TextAttributes> | '\n')[] {
  const result: (DeltaInsert<TextAttributes> | '\n')[] = [];

  let tmpString = delta.insert;
  while (tmpString.length > 0) {
    const index = tmpString.indexOf('\n');
    if (index === -1) {
      result.push({
        insert: tmpString,
        attributes: delta.attributes,
      });
      break;
    }

    if (tmpString.slice(0, index).length > 0) {
      result.push({
        insert: tmpString.slice(0, index),
        attributes: delta.attributes,
      });
    }

    result.push('\n');
    tmpString = tmpString.slice(index + 1);
  }

  return result;
}

/**
 * convert a delta insert array to chunks, each chunk is a line
 */
export function deltaInsertsToChunks<TextAttributes extends BaseTextAttributes>(
  delta: DeltaInsert<TextAttributes>[]
): DeltaInsert<TextAttributes>[][] {
  if (delta.length === 0) {
    return [[]];
  }

  const transformedDelta = delta.flatMap(transformDelta);

  function* chunksGenerator(arr: (DeltaInsert<TextAttributes> | '\n')[]) {
    let start = 0;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === '\n') {
        const chunk = arr.slice(start, i);
        start = i + 1;
        yield chunk as DeltaInsert<TextAttributes>[];
      } else if (i === arr.length - 1) {
        yield arr.slice(start) as DeltaInsert<TextAttributes>[];
      }
    }

    if (arr.at(-1) === '\n') {
      yield [];
    }
  }

  return Array.from(chunksGenerator(transformedDelta));
}
