import type { PageMeta } from '@blocksuite/store';

export function findPath(metas: PageMeta[], meta: PageMeta): PageMeta[] {
  function helper(group: PageMeta[]): PageMeta[] {
    const last = group[group.length - 1];
    const parent = metas.find(m => m.subpageIds.includes(last.id));
    if (parent) {
      return helper([...group, parent]);
    }
    return group;
  }

  return helper([meta]).reverse();
}

function getPathItemWidth(content: string) {
  // padding is 8px, arrow is 16px, and each char is 10px
  // the max width is 160px
  const charWidth = 10;
  const w = content.length * charWidth + 8 + 16;
  return w > 160 ? 160 : w;
}

// XXX: this is a static way to calculate the path width, not get the real width
export function calcHowManyPathShouldBeShown(path: PageMeta[]): PageMeta[] {
  if (path.length === 0) {
    return [];
  }
  const first = path[0];
  const last = path[path.length - 1];
  // 20 is the ellipsis icon width
  const maxWidth = 550 - 20;
  if (first.id === last.id) {
    return [first];
  }

  function getMiddlePath(restWidth: number, restPath: PageMeta[]): PageMeta[] {
    if (restPath.length === 0) {
      return [];
    }
    const last = restPath[restPath.length - 1];
    const w = getPathItemWidth(last.title);
    if (restWidth - w > 80) {
      return [
        ...getMiddlePath(restWidth - w, restPath.slice(0, restPath.length - 1)),
        last,
      ];
    }
    return [];
  }

  return [
    first,
    ...getMiddlePath(
      maxWidth - getPathItemWidth(first.title),
      path.slice(1, -1)
    ),
    last,
  ];
}
